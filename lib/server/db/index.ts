import { getRuntimeConfig } from "@/lib/server/config";
import { FirestorePitchForgeRepository } from "@/lib/server/db/firestore-db";
import { LocalPitchForgeRepository } from "@/lib/server/db/local-db";
import type { PitchForgeRepository } from "@/lib/server/db/types";

export function getRepository(): PitchForgeRepository {
  const config = getRuntimeConfig();
  if (config.datastoreMode === "firestore") {
    return new FirestorePitchForgeRepository();
  }
  return new LocalPitchForgeRepository(config.localDataDir);
}
