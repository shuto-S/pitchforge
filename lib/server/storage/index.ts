import { getRuntimeConfig } from "@/lib/server/config";
import { GcsObjectStorage } from "@/lib/server/storage/gcs-storage";
import type { ObjectStorage } from "@/lib/server/storage/types";

export function getObjectStorage(): ObjectStorage {
  const config = getRuntimeConfig();
  if (config.storageMode !== "gcs") {
    throw new Error("STORAGE_MODE must be gcs");
  }
  return new GcsObjectStorage();
}
