import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SCREENSHOT_FILES,
  SCREENSHOT_UPLOAD_ERRORS
} from "@/lib/asset-upload-validation";
import type { Asset } from "@/lib/schemas/project";
import { AssetLimitExceededError } from "@/lib/server/db/types";

const mocks = vi.hoisted(() => ({
  getObjectStorage: vi.fn(),
  getRepository: vi.fn(),
  isAuthError: vi.fn(() => false),
  requireProjectOwner: vi.fn()
}));

vi.mock("@/lib/server/auth", () => ({
  isAuthError: mocks.isAuthError,
  requireProjectOwner: mocks.requireProjectOwner
}));

vi.mock("@/lib/server/db", () => ({
  getRepository: mocks.getRepository
}));

vi.mock("@/lib/server/storage", () => ({
  getObjectStorage: mocks.getObjectStorage
}));

import { POST } from "@/app/api/projects/[projectId]/assets/route";

const repo = {
  listAssets: vi.fn(),
  saveAssetsWithinLimit: vi.fn()
};
const storage = {
  saveScreenshot: vi.fn(),
  deleteAsset: vi.fn()
};

describe("asset upload route", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    repo.listAssets.mockReset();
    repo.saveAssetsWithinLimit.mockReset();
    storage.saveScreenshot.mockReset();
    storage.deleteAsset.mockReset();

    mocks.isAuthError.mockReturnValue(false);
    mocks.getRepository.mockReturnValue(repo);
    mocks.getObjectStorage.mockReturnValue(storage);
    mocks.requireProjectOwner.mockResolvedValue({ user: { uid: "owner-1" } });
    repo.listAssets.mockResolvedValue([]);
  });

  it("validates every file before saving the first one", async () => {
    const form = new FormData();
    form.append("files", new File(["valid"], "valid.png", { type: "image/png" }));
    form.append("files", new File(["invalid"], "invalid.gif", { type: "image/gif" }));

    const response = await POST(
      new Request("https://pitchforge.test/api/projects/project-1/assets", {
        method: "POST",
        body: form
      }),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: SCREENSHOT_UPLOAD_ERRORS.type });
    expect(storage.saveScreenshot).not.toHaveBeenCalled();
    expect(repo.saveAssetsWithinLimit).not.toHaveBeenCalled();
  });

  it("rejects an empty upload without writing storage or metadata", async () => {
    const response = await POST(
      new Request("https://pitchforge.test/api/projects/project-1/assets", {
        method: "POST",
        body: new FormData()
      }),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: SCREENSHOT_UPLOAD_ERRORS.empty });
    expect(storage.saveScreenshot).not.toHaveBeenCalled();
    expect(repo.saveAssetsWithinLimit).not.toHaveBeenCalled();
  });

  it("registers all uploaded objects in one limit-checked repository call", async () => {
    const savedAsset = asset("asset-1");
    storage.saveScreenshot.mockResolvedValue(savedAsset);
    repo.saveAssetsWithinLimit.mockResolvedValue([savedAsset]);
    const form = new FormData();
    form.append("files", new File(["valid"], "valid.png", { type: "image/png" }));

    const response = await POST(
      new Request("https://pitchforge.test/api/projects/project-1/assets", {
        method: "POST",
        body: form
      }),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ assets: [savedAsset] });
    expect(repo.saveAssetsWithinLimit).toHaveBeenCalledWith(
      "project-1",
      [savedAsset],
      MAX_SCREENSHOT_FILES
    );
    expect(storage.deleteAsset).not.toHaveBeenCalled();
  });

  it("deletes uploaded objects when a concurrent request fills the final slot", async () => {
    const uploadedAsset = asset("asset-raced");
    storage.saveScreenshot.mockResolvedValue(uploadedAsset);
    storage.deleteAsset.mockRejectedValue(new Error("cleanup failed"));
    repo.saveAssetsWithinLimit.mockRejectedValue(
      new AssetLimitExceededError(MAX_SCREENSHOT_FILES)
    );
    const form = new FormData();
    form.append("files", new File(["valid"], "valid.png", { type: "image/png" }));

    const response = await POST(
      new Request("https://pitchforge.test/api/projects/project-1/assets", {
        method: "POST",
        body: form
      }),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: SCREENSHOT_UPLOAD_ERRORS.count });
    expect(storage.deleteAsset).toHaveBeenCalledWith(uploadedAsset);
  });

  it("deletes earlier objects when a later GCS upload fails", async () => {
    const firstAsset = asset("asset-first");
    storage.saveScreenshot
      .mockResolvedValueOnce(firstAsset)
      .mockRejectedValueOnce(new Error("GCS upload failed"));
    const form = new FormData();
    form.append("files", new File(["first"], "first.png", { type: "image/png" }));
    form.append("files", new File(["second"], "second.png", { type: "image/png" }));

    const response = await POST(
      new Request("https://pitchforge.test/api/projects/project-1/assets", {
        method: "POST",
        body: form
      }),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(500);
    expect(storage.deleteAsset).toHaveBeenCalledWith(firstAsset);
    expect(repo.saveAssetsWithinLimit).not.toHaveBeenCalled();
  });
});

function asset(id: string): Asset {
  return {
    id,
    projectId: "project-1",
    ownerUid: "owner-1",
    kind: "screenshot",
    fileName: `${id}.png`,
    mimeType: "image/png",
    sizeBytes: 5,
    storageUri: `gs://pitchforge-test/${id}.png`,
    createdAt: "2026-07-12T00:00:00.000Z"
  };
}
