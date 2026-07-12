import { DatabaseError, Pool, type QueryResultRow } from "pg";
import {
  artifactBundleSchema,
  assetSchema,
  inviteSchema,
  projectSchema,
  runEventSchema,
  runSchema,
  userProfileSchema
} from "@/lib/schemas";
import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { Invite, UserProfile } from "@/lib/schemas/auth";
import type { Asset, Project, Run, RunEvent } from "@/lib/schemas/project";
import { getRuntimeConfig } from "@/lib/server/config";
import {
  ActiveRunConflictError,
  AssetLimitExceededError,
  GITHUB_IMPORT_GLOBAL_LIMIT,
  GITHUB_IMPORT_GLOBAL_WINDOW_SECONDS,
  GITHUB_IMPORT_REPOSITORY_COOLDOWN_SECONDS,
  GITHUB_IMPORT_USER_LIMIT,
  GITHUB_IMPORT_USER_WINDOW_SECONDS,
  type CreateProjectInput,
  type GitHubImportRateLimitReservation,
  type PasswordAuthUser,
  type PasswordLoginThrottle,
  type PitchForgeRepository,
  type UpsertPasswordAuthUserInput,
  type UpsertUserInput
} from "@/lib/server/db/types";
import { nowIso } from "@/lib/server/utils/dates";
import { makeId } from "@/lib/server/utils/ids";
import { RetryableSingleFlight } from "@/lib/server/utils/retryable-single-flight";

const activeRunUniqueIndexName = "runs_project_active_unique_idx";
export const GITHUB_IMPORT_RATE_LOCK_ID = 7122026;
export const ASSET_LIMIT_LOCK_NAMESPACE = 7122027;
export const ACTIVE_RUN_LEASE_MINUTES = 20;
export const STALE_ACTIVE_RUN_ERROR_MESSAGE =
  "Run exceeded its 20-minute execution lease and was marked as failed.";

const schemaSql = `
CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  owner_email text NOT NULL,
  title text NOT NULL,
  one_liner text NOT NULL,
  description text NOT NULL,
  problem text NOT NULL,
  target_users text NOT NULL,
  product_url text,
  github_url text,
  gcp_usage text NOT NULL,
  ai_agent_behavior text NOT NULL,
  tech_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_owner_created_idx ON projects (owner_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_uid text NOT NULL,
  kind text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  storage_uri text NOT NULL,
  public_url text,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS assets_project_created_idx ON assets (project_id, created_at ASC);

CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status text NOT NULL,
  current_step text NOT NULL,
  progress integer NOT NULL,
  baseline_score jsonb,
  final_score jsonb,
  error_message text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS runs_project_created_idx ON runs (project_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ${activeRunUniqueIndexName}
  ON runs (project_id)
  WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS run_events (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS run_events_run_created_idx ON run_events (run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS artifacts (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  bundle jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, run_id)
);

CREATE TABLE IF NOT EXISTS users (
  uid text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text,
  photo_url text,
  is_admin boolean NOT NULL,
  is_invited boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  last_login_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_users (
  uid text PRIMARY KEY,
  login_id text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  display_name text,
  password_hash text NOT NULL,
  is_admin boolean NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  attempt_key text PRIMARY KEY,
  failed_count integer NOT NULL,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS github_import_attempts (
  id bigserial PRIMARY KEY,
  user_uid text NOT NULL,
  repository_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS github_import_attempts_created_idx
  ON github_import_attempts (created_at ASC);
CREATE INDEX IF NOT EXISTS github_import_attempts_user_created_idx
  ON github_import_attempts (user_uid, created_at ASC);
CREATE INDEX IF NOT EXISTS github_import_attempts_repository_created_idx
  ON github_import_attempts (repository_key, created_at ASC);

CREATE TABLE IF NOT EXISTS invites (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  status text NOT NULL,
  invited_by_uid text NOT NULL,
  accepted_by_uid text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS invites_created_idx ON invites (created_at DESC);
`;

export class PostgresPitchForgeRepository implements PitchForgeRepository {
  private readonly pool: Pool;
  private readonly schemaReady = new RetryableSingleFlight();

  constructor(databaseUrl = getRuntimeConfig().databaseUrl) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: true
    });
  }

  async migrate(): Promise<void> {
    await this.ensureSchema();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async checkReadiness(): Promise<void> {
    await this.ensureSchema();
    await this.pool.query("SELECT 1");
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    await this.ensureSchema();
    const createdAt = nowIso();
    const project = projectSchema.parse({
      id: makeId("proj"),
      ...input,
      productUrl: input.productUrl || undefined,
      githubUrl: input.githubUrl || undefined,
      status: "ready",
      createdAt,
      updatedAt: createdAt
    });
    const result = await this.pool.query(
      `INSERT INTO projects (
        id, owner_uid, owner_email, title, one_liner, description, problem,
        target_users, product_url, github_url, gcp_usage, ai_agent_behavior,
        tech_stack, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *`,
      [
        project.id,
        project.ownerUid,
        project.ownerEmail,
        project.title,
        project.oneLiner,
        project.description,
        project.problem,
        project.targetUsers,
        project.productUrl ?? null,
        project.githubUrl ?? null,
        project.gcpUsage,
        project.aiAgentBehavior,
        JSON.stringify(project.techStack),
        project.status,
        project.createdAt,
        project.updatedAt
      ]
    );
    return projectFromRow(result.rows[0]);
  }

  async getProject(projectId: string): Promise<Project | null> {
    await this.ensureSchema();
    const result = await this.pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
    return result.rows[0] ? projectFromRow(result.rows[0]) : null;
  }

  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    await this.ensureSchema();
    const updates: string[] = [];
    const values: unknown[] = [];
    const fields: [keyof Project, string, unknown][] = [
      ["title", "title", patch.title],
      ["oneLiner", "one_liner", patch.oneLiner],
      ["description", "description", patch.description],
      ["problem", "problem", patch.problem],
      ["targetUsers", "target_users", patch.targetUsers],
      ["productUrl", "product_url", patch.productUrl ?? null],
      ["githubUrl", "github_url", patch.githubUrl ?? null],
      ["gcpUsage", "gcp_usage", patch.gcpUsage],
      ["aiAgentBehavior", "ai_agent_behavior", patch.aiAgentBehavior],
      ["techStack", "tech_stack", patch.techStack ? JSON.stringify(patch.techStack) : undefined],
      ["status", "status", patch.status]
    ];
    for (const [key, column, value] of fields) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      }
    }
    values.push(nowIso());
    updates.push(`updated_at = $${values.length}`);
    values.push(projectId);
    const result = await this.pool.query(
      `UPDATE projects SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      throw new Error("Project not found");
    }
    return projectFromRow(result.rows[0]);
  }

  async listProjects(ownerUid: string): Promise<Project[]> {
    await this.ensureSchema();
    const result = await this.pool.query(
      "SELECT * FROM projects WHERE owner_uid = $1 ORDER BY created_at DESC",
      [ownerUid]
    );
    return result.rows.map(projectFromRow);
  }

  async saveAssetsWithinLimit(
    projectId: string,
    assets: Asset[],
    maxAssets: number
  ): Promise<Asset[]> {
    await this.ensureSchema();
    if (!Number.isSafeInteger(maxAssets) || maxAssets < 1) {
      throw new Error("maxAssets must be a positive integer");
    }
    const parsedAssets = assets.map((asset) => assetSchema.parse(asset));
    if (parsedAssets.some((asset) => asset.projectId !== projectId)) {
      throw new Error("Every asset must belong to the requested project");
    }
    if (parsedAssets.length === 0) {
      return [];
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock($1::integer, hashtext($2))",
        [ASSET_LIMIT_LOCK_NAMESPACE, projectId]
      );
      const countResult = await client.query(
        "SELECT COUNT(*)::integer AS asset_count FROM assets WHERE project_id = $1",
        [projectId]
      );
      const assetCount = Number(countResult.rows[0]?.asset_count ?? 0);
      if (assetCount + parsedAssets.length > maxAssets) {
        throw new AssetLimitExceededError(maxAssets);
      }

      const savedAssets: Asset[] = [];
      for (const parsed of parsedAssets) {
        const result = await client.query(
          `INSERT INTO assets (
            id, project_id, owner_uid, kind, file_name, mime_type, size_bytes,
            storage_uri, public_url, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            parsed.id,
            parsed.projectId,
            parsed.ownerUid,
            parsed.kind,
            parsed.fileName,
            parsed.mimeType,
            parsed.sizeBytes,
            parsed.storageUri,
            parsed.publicUrl ?? null,
            parsed.createdAt
          ]
        );
        savedAssets.push(assetFromRow(result.rows[0]));
      }
      await client.query("COMMIT");
      return savedAssets;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listAssets(projectId: string): Promise<Asset[]> {
    await this.ensureSchema();
    const result = await this.pool.query(
      "SELECT * FROM assets WHERE project_id = $1 ORDER BY created_at ASC",
      [projectId]
    );
    return result.rows.map(assetFromRow);
  }

  async createRun(projectId: string): Promise<Run> {
    await this.ensureSchema();
    await this.recoverStaleRuns(projectId);
    let lastConflict: DatabaseError | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const now = nowIso();
      const run = runSchema.parse({
        id: makeId("run"),
        projectId,
        status: "queued",
        currentStep: "queued",
        progress: 0,
        startedAt: now,
        createdAt: now,
        updatedAt: now
      });

      try {
        const result = await this.pool.query(
          `INSERT INTO runs (
            id, project_id, status, current_step, progress, started_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            run.id,
            run.projectId,
            run.status,
            run.currentStep,
            run.progress,
            run.startedAt,
            run.createdAt,
            run.updatedAt
          ]
        );
        return runFromRow(result.rows[0]);
      } catch (error) {
        if (!isActiveRunUniqueViolation(error)) {
          throw error;
        }
        lastConflict = error;

        const active = await this.pool.query(
          `SELECT * FROM runs
           WHERE project_id = $1 AND status IN ('queued', 'running')
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [projectId]
        );
        if (active.rows[0]) {
          throw new ActiveRunConflictError(runFromRow(active.rows[0]));
        }
        if (attempt === 0) {
          // The conflicting run can finish before the lookup; retry once with a fresh run ID.
          continue;
        }
      }
    }

    throw lastConflict ?? new Error("Failed to create run");
  }

  async getRun(projectId: string, runId: string): Promise<Run | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      "SELECT * FROM runs WHERE project_id = $1 AND id = $2",
      [projectId, runId]
    );
    return result.rows[0] ? runFromRow(result.rows[0]) : null;
  }

  async listRuns(projectId: string): Promise<Run[]> {
    await this.ensureSchema();
    await this.recoverStaleRuns(projectId);
    const result = await this.pool.query(
      "SELECT * FROM runs WHERE project_id = $1 ORDER BY created_at DESC",
      [projectId]
    );
    return result.rows.map(runFromRow);
  }

  async updateRun(projectId: string, runId: string, patch: Partial<Run>): Promise<Run> {
    await this.ensureSchema();
    const updates: string[] = [];
    const values: unknown[] = [];
    const fields: [keyof Run, string, unknown][] = [
      ["status", "status", patch.status],
      ["currentStep", "current_step", patch.currentStep],
      ["progress", "progress", patch.progress],
      ["baselineScore", "baseline_score", patch.baselineScore ?? null],
      ["finalScore", "final_score", patch.finalScore ?? null],
      ["errorMessage", "error_message", patch.errorMessage ?? null],
      ["startedAt", "started_at", patch.startedAt],
      ["completedAt", "completed_at", patch.completedAt ?? null]
    ];
    for (const [key, column, value] of fields) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      }
    }
    values.push(nowIso());
    updates.push(`updated_at = $${values.length}`);
    values.push(projectId, runId);
    const result = await this.pool.query(
      `UPDATE runs SET ${updates.join(", ")}
       WHERE project_id = $${values.length - 1} AND id = $${values.length}
       RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      throw new Error("Run not found");
    }
    return runFromRow(result.rows[0]);
  }

  async addRunEvent(event: RunEvent): Promise<RunEvent> {
    await this.ensureSchema();
    const parsed = runEventSchema.parse(event);
    const result = await this.pool.query(
      `INSERT INTO run_events (
        id, run_id, project_id, agent_name, type, message, payload, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        parsed.id,
        parsed.runId,
        parsed.projectId,
        parsed.agentName,
        parsed.type,
        parsed.message,
        parsed.payload ?? null,
        parsed.createdAt
      ]
    );
    return runEventFromRow(result.rows[0]);
  }

  async listRunEvents(projectId: string, runId: string): Promise<RunEvent[]> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT * FROM run_events
       WHERE project_id = $1 AND run_id = $2
       ORDER BY created_at ASC`,
      [projectId, runId]
    );
    return result.rows.map(runEventFromRow);
  }

  async saveArtifacts(
    projectId: string,
    runId: string,
    artifacts: ArtifactBundle
  ): Promise<void> {
    await this.ensureSchema();
    const parsed = artifactBundleSchema.parse(artifacts);
    await this.pool.query(
      `INSERT INTO artifacts (project_id, run_id, bundle, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, run_id)
       DO UPDATE SET bundle = EXCLUDED.bundle, updated_at = EXCLUDED.updated_at`,
      [projectId, runId, parsed, nowIso()]
    );
  }

  async getArtifacts(projectId: string, runId: string): Promise<ArtifactBundle | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      "SELECT bundle FROM artifacts WHERE project_id = $1 AND run_id = $2",
      [projectId, runId]
    );
    return result.rows[0] ? artifactBundleSchema.parse(result.rows[0].bundle) : null;
  }

  async upsertUser(input: UpsertUserInput): Promise<UserProfile> {
    await this.ensureSchema();
    const now = nowIso();
    const existing = await this.getUser(input.uid);
    const user = userProfileSchema.parse({
      ...existing,
      ...input,
      email: normalizeEmail(input.email),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastLoginAt: now
    });
    const result = await this.pool.query(
      `INSERT INTO users (
        uid, email, display_name, photo_url, is_admin, is_invited,
        created_at, updated_at, last_login_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (uid)
      DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        photo_url = EXCLUDED.photo_url,
        is_admin = EXCLUDED.is_admin,
        is_invited = EXCLUDED.is_invited,
        updated_at = EXCLUDED.updated_at,
        last_login_at = EXCLUDED.last_login_at
      RETURNING *`,
      [
        user.uid,
        user.email,
        user.displayName ?? null,
        user.photoURL ?? null,
        user.isAdmin,
        user.isInvited,
        user.createdAt,
        user.updatedAt,
        user.lastLoginAt
      ]
    );
    return userFromRow(result.rows[0]);
  }

  async getUser(uid: string): Promise<UserProfile | null> {
    await this.ensureSchema();
    const result = await this.pool.query("SELECT * FROM users WHERE uid = $1", [uid]);
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async upsertPasswordAuthUser(
    input: UpsertPasswordAuthUserInput
  ): Promise<PasswordAuthUser> {
    await this.ensureSchema();
    const now = nowIso();
    const result = await this.pool.query(
      `INSERT INTO auth_users (
        uid, login_id, email, display_name, password_hash, is_admin, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      ON CONFLICT (uid)
      DO UPDATE SET
        login_id = EXCLUDED.login_id,
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        password_hash = EXCLUDED.password_hash,
        is_admin = EXCLUDED.is_admin,
        is_active = EXCLUDED.is_active,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        input.uid,
        normalizeLoginId(input.loginId),
        normalizeEmail(input.email),
        input.displayName ?? null,
        input.passwordHash,
        input.isAdmin,
        input.isActive,
        now
      ]
    );
    return passwordAuthUserFromRow(result.rows[0]);
  }

  async findPasswordAuthUser(loginId: string): Promise<PasswordAuthUser | null> {
    await this.ensureSchema();
    const result = await this.pool.query("SELECT * FROM auth_users WHERE login_id = $1", [
      normalizeLoginId(loginId)
    ]);
    return result.rows[0] ? passwordAuthUserFromRow(result.rows[0]) : null;
  }

  async findPasswordAuthUserByUid(uid: string): Promise<PasswordAuthUser | null> {
    await this.ensureSchema();
    const result = await this.pool.query("SELECT * FROM auth_users WHERE uid = $1", [uid]);
    return result.rows[0] ? passwordAuthUserFromRow(result.rows[0]) : null;
  }

  async getPasswordLoginThrottle(
    attemptKey: string
  ): Promise<PasswordLoginThrottle | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      "SELECT failed_count, locked_until FROM auth_login_attempts WHERE attempt_key = $1",
      [attemptKey]
    );
    return result.rows[0] ? passwordLoginThrottleFromRow(result.rows[0]) : null;
  }

  async recordPasswordLoginFailure(
    attemptKey: string,
    maxFailures: number,
    lockSeconds: number
  ): Promise<PasswordLoginThrottle> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `INSERT INTO auth_login_attempts (attempt_key, failed_count, locked_until, updated_at)
       VALUES (
         $1,
         1,
         CASE WHEN 1 >= $2::integer
           THEN NOW() + ($3::integer * INTERVAL '1 second')
           ELSE NULL
         END,
         NOW()
       )
       ON CONFLICT (attempt_key)
       DO UPDATE SET
         failed_count = CASE
           WHEN auth_login_attempts.locked_until IS NOT NULL
             AND auth_login_attempts.locked_until > NOW()
             THEN auth_login_attempts.failed_count
           WHEN auth_login_attempts.locked_until IS NOT NULL
             AND auth_login_attempts.locked_until <= NOW()
             THEN 1
           ELSE auth_login_attempts.failed_count + 1
         END,
         locked_until = CASE
           WHEN auth_login_attempts.locked_until IS NOT NULL
             AND auth_login_attempts.locked_until > NOW()
             THEN auth_login_attempts.locked_until
           WHEN (
             CASE
               WHEN auth_login_attempts.locked_until IS NOT NULL
                 AND auth_login_attempts.locked_until <= NOW()
                 THEN 1
               ELSE auth_login_attempts.failed_count + 1
             END
           ) >= $2::integer
             THEN NOW() + ($3::integer * INTERVAL '1 second')
           ELSE NULL
         END,
         updated_at = NOW()
       RETURNING failed_count, locked_until`,
      [attemptKey, maxFailures, lockSeconds]
    );
    return passwordLoginThrottleFromRow(result.rows[0]);
  }

  async clearPasswordLoginFailures(attemptKey: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query("DELETE FROM auth_login_attempts WHERE attempt_key = $1", [attemptKey]);
  }

  async reserveGitHubImport(
    userUid: string,
    repositoryKey: string
  ): Promise<GitHubImportRateLimitReservation> {
    await this.ensureSchema();
    const normalizedUserUid = userUid.trim();
    const normalizedRepositoryKey = repositoryKey.trim().toLowerCase();
    if (!normalizedUserUid || normalizedUserUid.length > 256) {
      throw new Error("Invalid GitHub import user identifier");
    }
    if (!normalizedRepositoryKey || normalizedRepositoryKey.length > 256) {
      throw new Error("Invalid GitHub import repository identifier");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // All reservations share this short transaction lock so the three limits are atomic.
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [
        GITHUB_IMPORT_RATE_LOCK_ID
      ]);
      await client.query(
        `DELETE FROM github_import_attempts
         WHERE created_at <= statement_timestamp() - ($1::integer * INTERVAL '1 second')`,
        [GITHUB_IMPORT_GLOBAL_WINDOW_SECONDS]
      );
      const limits = await client.query(
        `WITH stats AS (
           SELECT
             statement_timestamp() AS now_at,
             (COUNT(id) FILTER (
               WHERE user_uid = $1
                 AND created_at > statement_timestamp() - ($3::integer * INTERVAL '1 second')
             ))::integer AS user_count,
             COUNT(id)::integer AS global_count,
             MIN(created_at) FILTER (
               WHERE user_uid = $1
                 AND created_at > statement_timestamp() - ($3::integer * INTERVAL '1 second')
             ) AS user_oldest,
             MIN(created_at) AS global_oldest,
             MAX(created_at) FILTER (WHERE repository_key = $2) AS repository_latest
           FROM github_import_attempts
           WHERE created_at > statement_timestamp() - ($4::integer * INTERVAL '1 second')
         )
         SELECT
           user_count,
           global_count,
           CASE WHEN user_count >= $5::integer THEN
             GREATEST(
               1,
               CEIL(EXTRACT(EPOCH FROM (
                 user_oldest + ($3::integer * INTERVAL '1 second') - now_at
               )))::integer
             )
           ELSE 0 END AS user_retry_seconds,
           CASE WHEN global_count >= $6::integer THEN
             GREATEST(
               1,
               CEIL(EXTRACT(EPOCH FROM (
                 global_oldest + ($4::integer * INTERVAL '1 second') - now_at
               )))::integer
             )
           ELSE 0 END AS global_retry_seconds,
           CASE WHEN repository_latest IS NOT NULL
             AND repository_latest > now_at - ($7::integer * INTERVAL '1 second') THEN
             GREATEST(
               1,
               CEIL(EXTRACT(EPOCH FROM (
                 repository_latest + ($7::integer * INTERVAL '1 second') - now_at
               )))::integer
             )
           ELSE 0 END AS repository_retry_seconds
         FROM stats`,
        [
          normalizedUserUid,
          normalizedRepositoryKey,
          GITHUB_IMPORT_USER_WINDOW_SECONDS,
          GITHUB_IMPORT_GLOBAL_WINDOW_SECONDS,
          GITHUB_IMPORT_USER_LIMIT,
          GITHUB_IMPORT_GLOBAL_LIMIT,
          GITHUB_IMPORT_REPOSITORY_COOLDOWN_SECONDS
        ]
      );
      const row = limits.rows[0] as QueryResultRow;
      const candidates: Array<{
        reason: "user" | "global" | "repository";
        retryAfterSeconds: number;
      }> = [];
      if (Number(row.user_count) >= GITHUB_IMPORT_USER_LIMIT) {
        candidates.push({
          reason: "user",
          retryAfterSeconds: Math.max(1, Number(row.user_retry_seconds) || 1)
        });
      }
      if (Number(row.global_count) >= GITHUB_IMPORT_GLOBAL_LIMIT) {
        candidates.push({
          reason: "global",
          retryAfterSeconds: Math.max(1, Number(row.global_retry_seconds) || 1)
        });
      }
      if (Number(row.repository_retry_seconds) > 0) {
        candidates.push({
          reason: "repository",
          retryAfterSeconds: Math.max(1, Number(row.repository_retry_seconds) || 1)
        });
      }

      if (candidates.length > 0) {
        const limited = candidates.sort(
          (left, right) => right.retryAfterSeconds - left.retryAfterSeconds
        )[0];
        await client.query("COMMIT");
        return { allowed: false, ...limited };
      }

      await client.query(
        `INSERT INTO github_import_attempts (user_uid, repository_key, created_at)
         VALUES ($1, $2, statement_timestamp())`,
        [normalizedUserUid, normalizedRepositoryKey]
      );
      await client.query("COMMIT");
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createInvite(email: string, invitedByUid: string): Promise<Invite> {
    await this.ensureSchema();
    const normalizedEmail = normalizeEmail(email);
    const existing = await this.getInviteByEmail(normalizedEmail);
    const now = nowIso();
    const invite = inviteSchema.parse({
      ...existing,
      id: inviteIdForEmail(normalizedEmail),
      email: normalizedEmail,
      status: existing?.status ?? "invited",
      invitedByUid: existing?.invitedByUid ?? invitedByUid,
      acceptedByUid: existing?.acceptedByUid,
      acceptedAt: existing?.acceptedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    const result = await this.pool.query(
      `INSERT INTO invites (
        id, email, status, invited_by_uid, accepted_by_uid, accepted_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id)
      DO UPDATE SET
        email = EXCLUDED.email,
        status = EXCLUDED.status,
        invited_by_uid = EXCLUDED.invited_by_uid,
        accepted_by_uid = EXCLUDED.accepted_by_uid,
        accepted_at = EXCLUDED.accepted_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        invite.id,
        invite.email,
        invite.status,
        invite.invitedByUid,
        invite.acceptedByUid ?? null,
        invite.acceptedAt ?? null,
        invite.createdAt,
        invite.updatedAt
      ]
    );
    return inviteFromRow(result.rows[0]);
  }

  async getInviteByEmail(email: string): Promise<Invite | null> {
    await this.ensureSchema();
    const result = await this.pool.query("SELECT * FROM invites WHERE email = $1", [
      normalizeEmail(email)
    ]);
    return result.rows[0] ? inviteFromRow(result.rows[0]) : null;
  }

  async acceptInvite(email: string, acceptedByUid: string): Promise<Invite> {
    await this.ensureSchema();
    const existing = await this.getInviteByEmail(email);
    if (!existing) {
      throw new Error("Invite not found");
    }
    const now = nowIso();
    const result = await this.pool.query(
      `UPDATE invites
       SET status = $1, accepted_by_uid = $2, accepted_at = COALESCE(accepted_at, $3), updated_at = $4
       WHERE email = $5
       RETURNING *`,
      ["accepted", acceptedByUid, now, now, normalizeEmail(email)]
    );
    return inviteFromRow(result.rows[0]);
  }

  async listInvites(): Promise<Invite[]> {
    await this.ensureSchema();
    const result = await this.pool.query("SELECT * FROM invites ORDER BY created_at DESC");
    return result.rows.map(inviteFromRow);
  }

  private async recoverStaleRuns(projectId: string): Promise<void> {
    await this.pool.query(
      `UPDATE runs
       SET status = 'failed',
           current_step = 'failed',
           error_message = $2,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE project_id = $1
         AND status IN ('queued', 'running')
         AND updated_at < NOW() - ($3::integer * INTERVAL '1 minute')`,
      [projectId, STALE_ACTIVE_RUN_ERROR_MESSAGE, ACTIVE_RUN_LEASE_MINUTES]
    );
  }

  private async ensureSchema(): Promise<void> {
    await this.schemaReady.run(() => this.pool.query(schemaSql).then(() => undefined));
  }
}

export async function migratePostgres(databaseUrl = getRuntimeConfig().databaseUrl) {
  const repo = new PostgresPitchForgeRepository(databaseUrl);
  try {
    await repo.migrate();
  } finally {
    await repo.close();
  }
}

function projectFromRow(row: QueryResultRow): Project {
  return projectSchema.parse({
    id: row.id,
    ownerUid: row.owner_uid,
    ownerEmail: row.owner_email,
    title: row.title,
    oneLiner: row.one_liner,
    description: row.description,
    problem: row.problem,
    targetUsers: row.target_users,
    productUrl: optionalString(row.product_url),
    githubUrl: optionalString(row.github_url),
    gcpUsage: row.gcp_usage,
    aiAgentBehavior: row.ai_agent_behavior,
    techStack: row.tech_stack ?? [],
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  });
}

function assetFromRow(row: QueryResultRow): Asset {
  return assetSchema.parse({
    id: row.id,
    projectId: row.project_id,
    ownerUid: row.owner_uid,
    kind: row.kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storageUri: row.storage_uri,
    publicUrl: optionalString(row.public_url),
    createdAt: iso(row.created_at)
  });
}

function runFromRow(row: QueryResultRow): Run {
  return runSchema.parse({
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    currentStep: row.current_step,
    progress: row.progress,
    baselineScore: row.baseline_score ?? undefined,
    finalScore: row.final_score ?? undefined,
    errorMessage: optionalString(row.error_message),
    startedAt: iso(row.started_at),
    completedAt: optionalIso(row.completed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  });
}

function runEventFromRow(row: QueryResultRow): RunEvent {
  return runEventSchema.parse({
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    agentName: row.agent_name,
    type: row.type,
    message: row.message,
    payload: row.payload ?? undefined,
    createdAt: iso(row.created_at)
  });
}

function userFromRow(row: QueryResultRow): UserProfile {
  return userProfileSchema.parse({
    uid: row.uid,
    email: row.email,
    displayName: optionalString(row.display_name),
    photoURL: optionalString(row.photo_url),
    isAdmin: row.is_admin,
    isInvited: row.is_invited,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastLoginAt: iso(row.last_login_at)
  });
}

function passwordAuthUserFromRow(row: QueryResultRow): PasswordAuthUser {
  return {
    uid: row.uid,
    loginId: row.login_id,
    email: row.email,
    displayName: optionalString(row.display_name),
    passwordHash: row.password_hash,
    isAdmin: row.is_admin,
    isActive: row.is_active,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function passwordLoginThrottleFromRow(row: QueryResultRow): PasswordLoginThrottle {
  return {
    failedCount: row.failed_count,
    lockedUntil: optionalIso(row.locked_until)
  };
}

function inviteFromRow(row: QueryResultRow): Invite {
  return inviteSchema.parse({
    id: row.id,
    email: row.email,
    status: row.status,
    invitedByUid: row.invited_by_uid,
    acceptedByUid: optionalString(row.accepted_by_uid),
    acceptedAt: optionalIso(row.accepted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeLoginId(loginId: string): string {
  return loginId.trim().toLowerCase();
}

function inviteIdForEmail(email: string): string {
  return encodeURIComponent(normalizeEmail(email));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalIso(value: unknown): string | undefined {
  return value ? iso(value) : undefined;
}

function iso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  throw new Error("Expected timestamp value");
}

function isActiveRunUniqueViolation(error: unknown): error is DatabaseError {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === activeRunUniqueIndexName
  );
}
