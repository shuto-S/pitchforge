import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/schemas/project";
import {
  loadBriefImages,
  loadBriefImagesWithDiagnostics,
  MAX_BRIEF_IMAGE_BYTES,
  MAX_BRIEF_IMAGE_COUNT
} from "@/lib/server/ai/orchestrator";
import type { ObjectStorage, UploadObjectInput } from "@/lib/server/storage/types";

const MIB = 1024 * 1024;
const timestamp = "2026-07-12T00:00:00.000Z";

function asset(id: string, sizeBytes = 0): Asset {
  return {
    id,
    projectId: "project_image_budget",
    ownerUid: "owner_image_budget",
    kind: "screenshot",
    fileName: `${id}.png`,
    mimeType: "image/png",
    sizeBytes,
    storageUri: `gs://pitchforge-test/${id}.png`,
    createdAt: timestamp
  };
}

function storageWith(
  read: (asset: Asset) => Promise<Buffer | null> | Buffer | null
): ObjectStorage {
  return {
    async saveScreenshot(input: UploadObjectInput): Promise<Asset> {
      throw new Error(`Unexpected upload in image budget test: ${input.fileName}`);
    },
    async readAsset(input: Asset): Promise<Buffer | null> {
      return read(input);
    }
  };
}

function totalBytes(images: Awaited<ReturnType<typeof loadBriefImages>>): number {
  return images.reduce((total, image) => total + image.data.length, 0);
}

describe("brief image request budget", () => {
  it("selects only two of five 5 MiB images", async () => {
    const assets = Array.from({ length: 5 }, (_, index) =>
      asset(`five-mib-${index + 1}`, 5 * MIB)
    );
    const buffers = new Map(
      assets.map((input, index) => [input.id, Buffer.alloc(5 * MIB, index + 1)])
    );

    const images = await loadBriefImages(
      storageWith((input) => buffers.get(input.id) ?? null),
      assets
    );

    expect(images).toHaveLength(2);
    expect(images[0].data).toBe(buffers.get(assets[0].id));
    expect(images[1].data).toBe(buffers.get(assets[1].id));
    expect(totalBytes(images)).toBe(10 * MIB);
    expect(totalBytes(images)).toBeLessThanOrEqual(MAX_BRIEF_IMAGE_BYTES);
  });

  it("accepts images whose real buffer lengths exactly fill 12 MiB", async () => {
    const first = Buffer.alloc(7 * MIB, 1);
    const second = Buffer.alloc(5 * MIB, 2);
    const extra = Buffer.alloc(1, 3);
    const assets = [asset("seven"), asset("five"), asset("extra")];
    const buffers = new Map([
      [assets[0].id, first],
      [assets[1].id, second],
      [assets[2].id, extra]
    ]);

    const images = await loadBriefImages(
      storageWith((input) => buffers.get(input.id) ?? null),
      assets
    );

    expect(images).toHaveLength(2);
    expect(images[0].data).toBe(first);
    expect(images[1].data).toBe(second);
    expect(totalBytes(images)).toBe(MAX_BRIEF_IMAGE_BYTES);
  });

  it("keeps scanning after an over-budget image and adopts a later smaller image", async () => {
    const first = Buffer.alloc(8 * MIB, 1);
    const skipped = Buffer.alloc(5 * MIB, 2);
    const later = Buffer.alloc(4 * MIB, 3);
    const assets = [asset("first"), asset("skipped"), asset("later")];
    const buffers = new Map([
      [assets[0].id, first],
      [assets[1].id, skipped],
      [assets[2].id, later]
    ]);

    const images = await loadBriefImages(
      storageWith((input) => buffers.get(input.id) ?? null),
      assets
    );

    expect(images).toHaveLength(2);
    expect(images[0].data).toBe(first);
    expect(images[1].data).toBe(later);
    expect(totalBytes(images)).toBe(MAX_BRIEF_IMAGE_BYTES);
  });

  it("skips read failures and nulls while preserving asset order", async () => {
    const first = Buffer.from("first");
    const last = Buffer.from("last");
    const assets = [asset("first"), asset("failure"), asset("null"), asset("last")];
    const readIds: string[] = [];

    const images = await loadBriefImages(
      storageWith((input) => {
        readIds.push(input.id);
        if (input.id === "failure") {
          throw new Error("simulated storage failure");
        }
        if (input.id === "null") {
          return null;
        }
        return input.id === "first" ? first : last;
      }),
      assets
    );

    expect(readIds).toEqual(assets.map((input) => input.id));
    expect(images.map((image) => image.data)).toEqual([first, last]);
  });

  it("stops at five selected images in project asset order", async () => {
    const assets = Array.from({ length: 7 }, (_, index) => asset(`asset-${index + 1}`, 1));
    const readIds: string[] = [];

    const images = await loadBriefImages(
      storageWith((input) => {
        readIds.push(input.id);
        return Buffer.from(input.id);
      }),
      assets
    );

    expect(images).toHaveLength(MAX_BRIEF_IMAGE_COUNT);
    expect(images.map((image) => image.data.toString())).toEqual(
      assets.slice(0, MAX_BRIEF_IMAGE_COUNT).map((input) => input.id)
    );
    expect(readIds).toEqual(assets.slice(0, MAX_BRIEF_IMAGE_COUNT).map((input) => input.id));
  });

  it("allows a run context with no readable images", async () => {
    const images = await loadBriefImages(
      storageWith(() => null),
      [asset("missing-1"), asset("missing-2")]
    );

    expect(images).toEqual([]);
  });

  it("reports unreadable assets separately from budget skips", async () => {
    const first = Buffer.alloc(8 * MIB, 1);
    const overBudget = Buffer.alloc(5 * MIB, 2);
    const later = Buffer.alloc(4 * MIB, 3);
    const assets = [
      asset("first"),
      asset("over-budget"),
      asset("failure"),
      asset("null"),
      asset("later")
    ];

    const result = await loadBriefImagesWithDiagnostics(
      storageWith((input) => {
        if (input.id === "first") {
          return first;
        }
        if (input.id === "over-budget") {
          return overBudget;
        }
        if (input.id === "failure") {
          throw new Error("simulated read failure");
        }
        if (input.id === "null") {
          return null;
        }
        return later;
      }),
      assets
    );

    expect(result.images).toHaveLength(2);
    expect(result.images[0].data).toBe(first);
    expect(result.images[1].data).toBe(later);
    expect(result.unreadableCount).toBe(2);
    expect(result.budgetSkippedCount).toBe(1);
  });
});
