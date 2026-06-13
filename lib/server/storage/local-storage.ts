import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Asset } from "@/lib/schemas/project";
import { getRuntimeConfig } from "@/lib/server/config";
import type { ObjectStorage, UploadObjectInput } from "@/lib/server/storage/types";
import { nowIso } from "@/lib/server/utils/dates";
import { makeId } from "@/lib/server/utils/ids";

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string;

  constructor(localDataDir = getRuntimeConfig().localDataDir) {
    const root = path.isAbsolute(localDataDir)
      ? localDataDir
      : path.join(process.cwd(), localDataDir);
    this.root = path.join(root, "uploads");
  }

  async saveScreenshot(input: UploadObjectInput): Promise<Asset> {
    const id = makeId("asset");
    const fileName = `${id}_${safeFileName(input.fileName)}`;
    const relativePath = path.join(
      "users",
      safePathSegment(input.ownerUid),
      "projects",
      input.projectId,
      "screenshots",
      fileName
    );
    const absolutePath = path.join(this.root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.bytes);

    return {
      id,
      projectId: input.projectId,
      ownerUid: input.ownerUid,
      kind: "screenshot",
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      storageUri: `local://${relativePath}`,
      createdAt: nowIso()
    };
  }

  async readAsset(asset: Asset): Promise<Buffer | null> {
    if (!asset.storageUri.startsWith("local://")) {
      return null;
    }
    const relativePath = asset.storageUri.slice("local://".length);
    return readFile(path.join(this.root, relativePath));
  }
}
