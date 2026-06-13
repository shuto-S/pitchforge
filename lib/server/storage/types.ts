import type { Asset } from "@/lib/schemas/project";

export type UploadObjectInput = {
  projectId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export interface ObjectStorage {
  saveScreenshot(input: UploadObjectInput): Promise<Asset>;
  readAsset(asset: Asset): Promise<Buffer | null>;
}
