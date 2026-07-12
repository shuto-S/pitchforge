import { getRuntimeConfig } from "@/lib/server/config";
import { PostgresPitchForgeRepository } from "@/lib/server/db/postgres-db";
import type { PitchForgeRepository } from "@/lib/server/db/types";

let cachedRepository:
  | {
      databaseUrl: string;
      repository: PitchForgeRepository;
    }
  | null = null;

export function getRepository(): PitchForgeRepository {
  const config = getRuntimeConfig();
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (cachedRepository?.databaseUrl !== config.databaseUrl) {
    cachedRepository = {
      databaseUrl: config.databaseUrl,
      repository: new PostgresPitchForgeRepository(config.databaseUrl)
    };
  }
  return cachedRepository.repository;
}
