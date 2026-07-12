import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import type { Run } from "@/lib/schemas/project";
import {
  ACTIVE_RUN_LEASE_MINUTES,
  PostgresPitchForgeRepository,
  STALE_ACTIVE_RUN_ERROR_MESSAGE
} from "@/lib/server/db/postgres-db";
import { ActiveRunConflictError } from "@/lib/server/db/types";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://pitchforge:pitchforge@localhost:5432/pitchforge";

describe("active run uniqueness", () => {
  it("atomically allows one active run per project without affecting other projects", async () => {
    const repo = new PostgresPitchForgeRepository(databaseUrl);

    try {
      await repo.migrate();
      const suffix = randomUUID();
      const [firstProject, otherProject] = await Promise.all([
        repo.createProject(projectInput(`Concurrent run ${suffix}`)),
        repo.createProject(projectInput(`Other project ${suffix}`))
      ]);

      const outcomes = await Promise.allSettled([
        repo.createRun(firstProject.id),
        repo.createRun(firstProject.id)
      ]);
      const successes = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<Run> => outcome.status === "fulfilled"
      );
      const failures = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected"
      );

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toBeInstanceOf(ActiveRunConflictError);

      const conflict = failures[0].reason as ActiveRunConflictError;
      expect(conflict.run.id).toBe(successes[0].value.id);
      expect(conflict.run.status).toBe("queued");

      const activeRuns = (await repo.listRuns(firstProject.id)).filter((run) =>
        ["queued", "running"].includes(run.status)
      );
      expect(activeRuns).toHaveLength(1);
      expect(activeRuns[0].id).toBe(successes[0].value.id);

      await expect(repo.createRun(otherProject.id)).resolves.toMatchObject({
        projectId: otherProject.id,
        status: "queued"
      });
    } finally {
      await repo.close();
    }
  });

  it("recovers stale active runs per project before listing and creating", async () => {
    const repo = new PostgresPitchForgeRepository(databaseUrl);
    const sql = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true });

    try {
      await repo.migrate();
      const suffix = randomUUID();
      const [project, otherProject] = await Promise.all([
        repo.createProject(projectInput(`Stale runs ${suffix}`)),
        repo.createProject(projectInput(`Unrelated stale run ${suffix}`))
      ]);

      const [staleQueuedRun, unrelatedStaleRun] = await Promise.all([
        repo.createRun(project.id),
        repo.createRun(otherProject.id)
      ]);
      await Promise.all([
        ageActiveRun(sql, project.id, staleQueuedRun.id, "queued"),
        ageActiveRun(sql, otherProject.id, unrelatedStaleRun.id, "running")
      ]);

      const listedRuns = await repo.listRuns(project.id);
      expect(listedRuns).toContainEqual(
        expect.objectContaining({
          id: staleQueuedRun.id,
          status: "failed",
          currentStep: "failed",
          errorMessage: STALE_ACTIVE_RUN_ERROR_MESSAGE,
          completedAt: expect.any(String)
        })
      );
      await expect(repo.getRun(otherProject.id, unrelatedStaleRun.id)).resolves.toMatchObject({
        status: "running",
        currentStep: "running"
      });

      const staleRunningRun = await repo.createRun(project.id);
      await ageActiveRun(sql, project.id, staleRunningRun.id, "running");

      const outcomes = await Promise.allSettled([
        repo.createRun(project.id),
        repo.createRun(project.id)
      ]);
      const successes = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<Run> => outcome.status === "fulfilled"
      );
      const failures = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected"
      );

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toBeInstanceOf(ActiveRunConflictError);
      await expect(repo.getRun(project.id, staleRunningRun.id)).resolves.toMatchObject({
        status: "failed",
        currentStep: "failed",
        errorMessage: STALE_ACTIVE_RUN_ERROR_MESSAGE,
        completedAt: expect.any(String)
      });

      await expect(repo.createRun(project.id)).rejects.toBeInstanceOf(ActiveRunConflictError);
    } finally {
      await Promise.all([sql.end(), repo.close()]);
    }
  });
});

async function ageActiveRun(
  pool: Pool,
  projectId: string,
  runId: string,
  status: "queued" | "running"
): Promise<void> {
  const result = await pool.query(
    `UPDATE runs
     SET status = $3,
         current_step = $3,
         updated_at = NOW() - (($4::integer + 1) * INTERVAL '1 minute')
     WHERE project_id = $1 AND id = $2`,
    [projectId, runId, status, ACTIVE_RUN_LEASE_MINUTES]
  );
  expect(result.rowCount).toBe(1);
}

function projectInput(title: string) {
  const ownerId = randomUUID();
  return {
    ownerUid: `owner-${ownerId}`,
    ownerEmail: `owner-${ownerId}@example.test`,
    title,
    oneLiner: "Atomically prevent duplicate active runs",
    description:
      "This integration fixture verifies the PostgreSQL invariant for concurrent active run creation.",
    problem: "Concurrent requests can otherwise create duplicate active runs.",
    targetUsers: "PitchForge users",
    gcpUsage: "Cloud Run, Gemini, Cloud SQL, Cloud Storage",
    aiAgentBehavior: "Create one active agent workflow per project.",
    techStack: ["PostgreSQL", "Next.js"]
  };
}
