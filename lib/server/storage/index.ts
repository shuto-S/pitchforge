import { getRuntimeConfig } from "@/lib/server/config";
import { GcsObjectStorage } from "@/lib/server/storage/gcs-storage";
import { LocalObjectStorage } from "@/lib/server/storage/local-storage";
import type { ObjectStorage } from "@/lib/server/storage/types";

export function getObjectStorage(): ObjectStorage {
  const config = getRuntimeConfig();
  if (config.storageMode === "gcs") {
    return new GcsObjectStorage();
  }
  return new LocalObjectStorage(config.localDataDir);
}
