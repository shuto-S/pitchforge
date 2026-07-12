import type { Asset } from "@/lib/schemas/project";

export type UploadObjectInput = {
  projectId: string;
  ownerUid: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export interface ObjectStorage {
  checkReadiness?(): Promise<void>;
  saveScreenshot(input: UploadObjectInput): Promise<Asset>;
  deleteAsset?(asset: Asset): Promise<void>;
  readAsset(asset: Asset): Promise<Buffer | null>;
}
