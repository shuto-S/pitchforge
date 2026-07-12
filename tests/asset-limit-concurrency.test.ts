import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { Asset } from "@/lib/schemas/project";
import { PostgresPitchForgeRepository } from "@/lib/server/db/postgres-db";
import { AssetLimitExceededError } from "@/lib/server/db/types";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://pitchforge:pitchforge@localhost:5432/pitchforge";

describe("asset limit", () => {
  const repositories = [
    new PostgresPitchForgeRepository(databaseUrl),
    new PostgresPitchForgeRepository(databaseUrl)
  ];
  const sql = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true });

  it("atomically prevents concurrent requests from storing a sixth asset", async () => {
    await repositories[0].migrate();
    const suffix = randomUUID();
    const project = await repositories[0].createProject(projectInput(suffix));

    await expect(
      repositories[0].saveAssetsWithinLimit(
        project.id,
        Array.from({ length: 4 }, (_, index) => asset(project.id, suffix, index)),
        5
      )
    ).resolves.toHaveLength(4);

    const outcomes = await Promise.allSettled([
      repositories[0].saveAssetsWithinLimit(
        project.id,
        [asset(project.id, suffix, 4)],
        5
      ),
      repositories[1].saveAssetsWithinLimit(
        project.id,
        [asset(project.id, suffix, 5)],
        5
      )
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const failures = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected"
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBeInstanceOf(AssetLimitExceededError);

    const stored = await sql.query(
      "SELECT COUNT(*)::integer AS asset_count FROM assets WHERE project_id = $1",
      [project.id]
    );
    expect(Number(stored.rows[0].asset_count)).toBe(5);
  });

  afterAll(async () => {
    await Promise.all([...repositories.map((repository) => repository.close()), sql.end()]);
  });
});

function asset(projectId: string, suffix: string, index: number): Asset {
  return {
    id: `asset-${suffix}-${index}`,
    projectId,
    ownerUid: `owner-${suffix}`,
    kind: "screenshot",
    fileName: `screenshot-${index}.png`,
    mimeType: "image/png",
    sizeBytes: 4,
    storageUri: `gs://pitchforge-test/${projectId}/${index}.png`,
    createdAt: new Date().toISOString()
  };
}

function projectInput(suffix: string) {
  return {
    ownerUid: `owner-${suffix}`,
    ownerEmail: `owner-${suffix}@example.test`,
    title: `Concurrent assets ${suffix}`,
    oneLiner: "Atomically prevent too many assets",
    description:
      "This integration fixture verifies the PostgreSQL invariant for concurrent asset uploads.",
    problem: "Concurrent requests can otherwise store too many screenshots.",
    targetUsers: "PitchForge users",
    gcpUsage: "Cloud Run, Gemini, Cloud SQL, Cloud Storage",
    aiAgentBehavior: "Keep uploaded evidence within the configured project limit.",
    techStack: ["PostgreSQL", "Next.js"]
  };
}
