import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GITHUB_IMPORT_RATE_LOCK_ID,
  PostgresPitchForgeRepository
} from "@/lib/server/db/postgres-db";
import {
  GITHUB_IMPORT_GLOBAL_LIMIT,
  GITHUB_IMPORT_USER_LIMIT
} from "@/lib/server/db/types";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://pitchforge:pitchforge@localhost:5432/pitchforge";

describe("GitHub import rate-limit reservations", () => {
  const repositories = [
    new PostgresPitchForgeRepository(databaseUrl),
    new PostgresPitchForgeRepository(databaseUrl)
  ];
  const sql = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true });

  beforeEach(async () => {
    await repositories[0].migrate();
    await sql.query("DELETE FROM github_import_attempts");
  });

  afterEach(async () => {
    await sql.query("DELETE FROM github_import_attempts");
  });

  it("atomically enforces user, global, and same-repository limits", async () => {
    const suffix = randomUUID();
    const userResults = await Promise.all(
      Array.from({ length: GITHUB_IMPORT_USER_LIMIT + 4 }, (_, index) =>
        repositories[index % repositories.length].reserveGitHubImport(
          `github-import-user-${suffix}`,
          `https://github.com/example/user-${suffix}-${index}`
        )
      )
    );
    expect(userResults.filter((result) => result.allowed)).toHaveLength(
      GITHUB_IMPORT_USER_LIMIT
    );
    expect(userResults.filter((result) => !result.allowed)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "user", retryAfterSeconds: expect.any(Number) })
      ])
    );

    await sql.query("DELETE FROM github_import_attempts");
    const globalResults = await Promise.all(
      Array.from({ length: GITHUB_IMPORT_GLOBAL_LIMIT + 4 }, (_, index) =>
        repositories[index % repositories.length].reserveGitHubImport(
          `github-import-global-${suffix}-${index}`,
          `https://github.com/example/global-${suffix}-${index}`
        )
      )
    );
    expect(globalResults.filter((result) => result.allowed)).toHaveLength(
      GITHUB_IMPORT_GLOBAL_LIMIT
    );
    expect(globalResults.filter((result) => !result.allowed)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "global", retryAfterSeconds: expect.any(Number) })
      ])
    );

    await sql.query("DELETE FROM github_import_attempts");
    const repositoryResults = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        repositories[index % repositories.length].reserveGitHubImport(
          `github-import-repository-${suffix}-${index}`,
          index % 2 === 0
            ? `https://github.com/Example/Same-${suffix}`
            : `https://github.com/example/same-${suffix}`
        )
      )
    );
    expect(repositoryResults.filter((result) => result.allowed)).toHaveLength(1);
    expect(repositoryResults.filter((result) => !result.allowed)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "repository",
          retryAfterSeconds: expect.any(Number)
        })
      ])
    );
  });

  it("allows an expired cooldown and uses the post-lock statement time", async () => {
    const suffix = randomUUID();
    const repositoryKey = `https://github.com/example/cooldown-${suffix}`;
    await expect(
      repositories[0].reserveGitHubImport(`cooldown-user-${suffix}`, repositoryKey)
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    await sql.query(
      `UPDATE github_import_attempts
       SET created_at = statement_timestamp() - INTERVAL '61 seconds'`
    );
    await expect(
      repositories[1].reserveGitHubImport(`cooldown-other-${suffix}`, repositoryKey)
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    await sql.query("DELETE FROM github_import_attempts");
    const blocker = await sql.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock($1::bigint)", [
        GITHUB_IMPORT_RATE_LOCK_ID
      ]);
      const pending = repositories[0].reserveGitHubImport(
        `lock-wait-user-${suffix}`,
        `https://github.com/example/lock-wait-${suffix}`
      );
      await waitForAdvisoryLockWaiter(sql);
      const timestamp = await blocker.query(
        "SELECT statement_timestamp() AS released_at"
      );
      const releasedAt = timestamp.rows[0].released_at as Date;
      await blocker.query("COMMIT");

      await expect(pending).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
      const stored = await sql.query(
        "SELECT created_at FROM github_import_attempts WHERE user_uid = $1",
        [`lock-wait-user-${suffix}`]
      );
      expect((stored.rows[0].created_at as Date).getTime()).toBeGreaterThanOrEqual(
        releasedAt.getTime()
      );
    } finally {
      await rollbackIfNeeded(blocker);
      blocker.release();
    }
  });

  afterAll(async () => {
    await Promise.all([...repositories.map((repository) => repository.close()), sql.end()]);
  });
});

async function waitForAdvisoryLockWaiter(pool: Pool): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      `SELECT COUNT(*)::integer AS waiting
       FROM pg_locks
       WHERE locktype = 'advisory'
         AND objid = $1::oid
         AND NOT granted`,
      [GITHUB_IMPORT_RATE_LOCK_ID]
    );
    if (Number(result.rows[0].waiting) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the GitHub import advisory lock");
}

async function rollbackIfNeeded(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}
