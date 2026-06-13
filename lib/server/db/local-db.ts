import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
import type {
  CreateProjectInput,
  LocalDbShape,
  PitchForgeRepository,
  UpsertUserInput
} from "@/lib/server/db/types";
import { nowIso } from "@/lib/server/utils/dates";
import { makeId } from "@/lib/server/utils/ids";

const emptyDb = (): LocalDbShape => ({
  projects: {},
  assets: {},
  runs: {},
  events: {},
  artifacts: {},
  users: {},
  invites: {}
});

function runKey(projectId: string, runId: string): string {
  return `${projectId}:${runId}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function inviteIdForEmail(email: string): string {
  return encodeURIComponent(normalizeEmail(email));
}

export class LocalPitchForgeRepository implements PitchForgeRepository {
  private readonly filePath: string;
  private writeQueue = Promise.resolve();

  constructor(localDataDir = getRuntimeConfig().localDataDir) {
    const root = path.isAbsolute(localDataDir)
      ? localDataDir
      : path.join(process.cwd(), localDataDir);
    this.filePath = path.join(root, "db.json");
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    return this.mutate((db) => {
      const createdAt = nowIso();
      const project: Project = projectSchema.parse({
        id: makeId("proj"),
        ...input,
        productUrl: input.productUrl || undefined,
        githubUrl: input.githubUrl || undefined,
        status: "ready",
        createdAt,
        updatedAt: createdAt
      });
      db.projects[project.id] = project;
      return project;
    });
  }

  async getProject(projectId: string): Promise<Project | null> {
    const db = await this.read();
    const project = db.projects[projectId];
    return project ? projectSchema.parse(project) : null;
  }

  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    return this.mutate((db) => {
      const existing = db.projects[projectId];
      if (!existing) {
        throw new Error("Project not found");
      }
      const updated = projectSchema.parse({
        ...existing,
        ...patch,
        id: projectId,
        updatedAt: nowIso()
      });
      db.projects[projectId] = updated;
      return updated;
    });
  }

  async listProjects(ownerUid: string): Promise<Project[]> {
    const db = await this.read();
    return Object.values(db.projects)
      .filter((project) => project.ownerUid === ownerUid)
      .map((project) => projectSchema.parse(project))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveAsset(asset: Asset): Promise<Asset> {
    return this.mutate((db) => {
      const parsed = assetSchema.parse(asset);
      db.assets[asset.projectId] = [...(db.assets[asset.projectId] ?? []), parsed];
      return parsed;
    });
  }

  async listAssets(projectId: string): Promise<Asset[]> {
    const db = await this.read();
    return (db.assets[projectId] ?? []).map((asset) => assetSchema.parse(asset));
  }

  async createRun(projectId: string): Promise<Run> {
    return this.mutate((db) => {
      const startedAt = nowIso();
      const run = runSchema.parse({
        id: makeId("run"),
        projectId,
        status: "queued",
        currentStep: "queued",
        progress: 0,
        startedAt,
        createdAt: startedAt,
        updatedAt: startedAt
      });
      db.runs[projectId] = [...(db.runs[projectId] ?? []), run];
      return run;
    });
  }

  async getRun(projectId: string, runId: string): Promise<Run | null> {
    const db = await this.read();
    const run = (db.runs[projectId] ?? []).find((candidate) => candidate.id === runId);
    return run ? runSchema.parse(run) : null;
  }

  async listRuns(projectId: string): Promise<Run[]> {
    const db = await this.read();
    return (db.runs[projectId] ?? []).map((run) => runSchema.parse(run));
  }

  async updateRun(projectId: string, runId: string, patch: Partial<Run>): Promise<Run> {
    return this.mutate((db) => {
      const runs = db.runs[projectId] ?? [];
      const index = runs.findIndex((run) => run.id === runId);
      if (index < 0) {
        throw new Error("Run not found");
      }
      const updated = runSchema.parse({
        ...runs[index],
        ...patch,
        id: runId,
        projectId,
        updatedAt: nowIso()
      });
      runs[index] = updated;
      db.runs[projectId] = runs;
      return updated;
    });
  }

  async addRunEvent(event: RunEvent): Promise<RunEvent> {
    return this.mutate((db) => {
      const parsed = runEventSchema.parse(event);
      const key = runKey(event.projectId, event.runId);
      db.events[key] = [...(db.events[key] ?? []), parsed];
      return parsed;
    });
  }

  async listRunEvents(projectId: string, runId: string): Promise<RunEvent[]> {
    const db = await this.read();
    return (db.events[runKey(projectId, runId)] ?? []).map((event) =>
      runEventSchema.parse(event)
    );
  }

  async saveArtifacts(
    projectId: string,
    runId: string,
    artifacts: ArtifactBundle
  ): Promise<void> {
    await this.mutate((db) => {
      db.artifacts[runKey(projectId, runId)] = artifactBundleSchema.parse(artifacts);
      return undefined;
    });
  }

  async getArtifacts(projectId: string, runId: string): Promise<ArtifactBundle | null> {
    const db = await this.read();
    const artifacts = db.artifacts[runKey(projectId, runId)];
    return artifacts ? artifactBundleSchema.parse(artifacts) : null;
  }

  async upsertUser(input: UpsertUserInput): Promise<UserProfile> {
    return this.mutate((db) => {
      const existing = db.users[input.uid];
      const now = nowIso();
      const user = userProfileSchema.parse({
        ...existing,
        ...input,
        email: normalizeEmail(input.email),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastLoginAt: now
      });
      db.users[user.uid] = user;
      return user;
    });
  }

  async getUser(uid: string): Promise<UserProfile | null> {
    const db = await this.read();
    const user = db.users[uid];
    return user ? userProfileSchema.parse(user) : null;
  }

  async createInvite(email: string, invitedByUid: string): Promise<Invite> {
    return this.mutate((db) => {
      const normalizedEmail = normalizeEmail(email);
      const id = inviteIdForEmail(normalizedEmail);
      const existing = db.invites[id];
      const now = nowIso();
      const invite = inviteSchema.parse({
        ...existing,
        id,
        email: normalizedEmail,
        status: existing?.status ?? "invited",
        invitedByUid: existing?.invitedByUid ?? invitedByUid,
        acceptedByUid: existing?.acceptedByUid,
        acceptedAt: existing?.acceptedAt,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      db.invites[id] = invite;
      return invite;
    });
  }

  async getInviteByEmail(email: string): Promise<Invite | null> {
    const db = await this.read();
    const invite = db.invites[inviteIdForEmail(email)];
    return invite ? inviteSchema.parse(invite) : null;
  }

  async acceptInvite(email: string, acceptedByUid: string): Promise<Invite> {
    return this.mutate((db) => {
      const id = inviteIdForEmail(email);
      const existing = db.invites[id];
      if (!existing) {
        throw new Error("Invite not found");
      }
      const now = nowIso();
      const invite = inviteSchema.parse({
        ...existing,
        status: "accepted",
        acceptedByUid,
        acceptedAt: existing.acceptedAt ?? now,
        updatedAt: now
      });
      db.invites[id] = invite;
      return invite;
    });
  }

  async listInvites(): Promise<Invite[]> {
    const db = await this.read();
    return Object.values(db.invites)
      .map((invite) => inviteSchema.parse(invite))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async read(): Promise<LocalDbShape> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<LocalDbShape>;
      return {
        ...emptyDb(),
        ...parsed,
        projects: parsed.projects ?? {},
        assets: parsed.assets ?? {},
        runs: parsed.runs ?? {},
        events: parsed.events ?? {},
        artifacts: parsed.artifacts ?? {},
        users: parsed.users ?? {},
        invites: parsed.invites ?? {}
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyDb();
      }
      throw error;
    }
  }

  private async mutate<T>(fn: (db: LocalDbShape) => T): Promise<T> {
    const run = async () => {
      const db = await this.read();
      const result = fn(db);
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(db, null, 2), "utf8");
      return result;
    };
    const next = this.writeQueue.then(run, run);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}
