import type { Asset } from "@/lib/schemas/project";
import { getRuntimeConfig } from "@/lib/server/config";
import type { ObjectStorage, UploadObjectInput } from "@/lib/server/storage/types";
import { nowIso } from "@/lib/server/utils/dates";
import { makeId } from "@/lib/server/utils/ids";

type GcsFile = {
  save(
    bytes: Buffer,
    options: {
      contentType: string;
      resumable: boolean;
      metadata: { cacheControl: string };
    }
  ): Promise<void>;
  download(): Promise<[Buffer]>;
};
type GcsBucket = {
  file(name: string): GcsFile;
};
type GcsClient = {
  bucket(name: string): GcsBucket;
};

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export class GcsObjectStorage implements ObjectStorage {
  private storagePromise: Promise<GcsClient> | null = null;

  async saveScreenshot(input: UploadObjectInput): Promise<Asset> {
    const config = getRuntimeConfig();
    if (!config.gcsBucket) {
      throw new Error("GCS_BUCKET is required when STORAGE_MODE=gcs");
    }

    const storage = await this.storage();
    const id = makeId("asset");
    const objectName = `users/${safePathSegment(input.ownerUid)}/projects/${
      input.projectId
    }/screenshots/${id}_${safeFileName(input.fileName)}`;
    const bucket = storage.bucket(config.gcsBucket);
    const file = bucket.file(objectName);
    await file.save(input.bytes, {
      contentType: input.mimeType,
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0"
      }
    });

    return {
      id,
      projectId: input.projectId,
      ownerUid: input.ownerUid,
      kind: "screenshot",
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      storageUri: `gs://${config.gcsBucket}/${objectName}`,
      createdAt: nowIso()
    };
  }

  async readAsset(asset: Asset): Promise<Buffer | null> {
    if (!asset.storageUri.startsWith("gs://")) {
      return null;
    }
    const [, rest] = asset.storageUri.split("gs://");
    const [bucketName, ...objectParts] = rest.split("/");
    const storage = await this.storage();
    const [bytes] = await storage.bucket(bucketName).file(objectParts.join("/")).download();
    return bytes;
  }

  private async storage(): Promise<GcsClient> {
    if (!this.storagePromise) {
      this.storagePromise = import("@google-cloud/storage").then(({ Storage }) => {
        const config = getRuntimeConfig();
        return new Storage({ projectId: config.googleCloudProject });
      });
    }
    return this.storagePromise;
  }
}
