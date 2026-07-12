import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { Invite, UserProfile } from "@/lib/schemas/auth";
import type { Asset, Project, ProjectInput, Run, RunEvent } from "@/lib/schemas/project";

export type CreateProjectInput = Omit<ProjectInput, "productUrl" | "githubUrl"> & {
  productUrl?: string;
  githubUrl?: string;
  ownerUid: string;
  ownerEmail: string;
};

export type UpsertUserInput = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isAdmin: boolean;
  isInvited: boolean;
};

export type PasswordAuthUser = {
  uid: string;
  loginId: string;
  email: string;
  displayName?: string;
  passwordHash: string;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertPasswordAuthUserInput = Omit<
  PasswordAuthUser,
  "createdAt" | "updatedAt"
>;

export type PasswordLoginThrottle = {
  failedCount: number;
  lockedUntil?: string;
};

export const GITHUB_IMPORT_USER_LIMIT = 5;
export const GITHUB_IMPORT_USER_WINDOW_SECONDS = 10 * 60;
export const GITHUB_IMPORT_GLOBAL_LIMIT = 8;
export const GITHUB_IMPORT_GLOBAL_WINDOW_SECONDS = 60 * 60;
export const GITHUB_IMPORT_REPOSITORY_COOLDOWN_SECONDS = 60;

export type GitHubImportRateLimitReservation =
  | { allowed: true; retryAfterSeconds: 0 }
  | {
      allowed: false;
      retryAfterSeconds: number;
      reason: "user" | "global" | "repository";
    };

export class ActiveRunConflictError extends Error {
  constructor(readonly run: Run) {
    super("A run is already active");
    this.name = "ActiveRunConflictError";
  }
}

export class AssetLimitExceededError extends Error {
  constructor(readonly maxAssets: number) {
    super(`Assets are limited to ${maxAssets} files per project`);
    this.name = "AssetLimitExceededError";
  }
}

export interface PitchForgeRepository {
  checkReadiness?(): Promise<void>;

  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(projectId: string): Promise<Project | null>;
  updateProject(projectId: string, patch: Partial<Project>): Promise<Project>;
  listProjects(ownerUid: string): Promise<Project[]>;

  saveAssetsWithinLimit(
    projectId: string,
    assets: Asset[],
    maxAssets: number
  ): Promise<Asset[]>;
  listAssets(projectId: string): Promise<Asset[]>;

  createRun(projectId: string): Promise<Run>;
  getRun(projectId: string, runId: string): Promise<Run | null>;
  listRuns(projectId: string): Promise<Run[]>;
  updateRun(projectId: string, runId: string, patch: Partial<Run>): Promise<Run>;

  addRunEvent(event: RunEvent): Promise<RunEvent>;
  listRunEvents(projectId: string, runId: string): Promise<RunEvent[]>;

  saveArtifacts(projectId: string, runId: string, artifacts: ArtifactBundle): Promise<void>;
  getArtifacts(projectId: string, runId: string): Promise<ArtifactBundle | null>;

  upsertUser(input: UpsertUserInput): Promise<UserProfile>;
  getUser(uid: string): Promise<UserProfile | null>;

  upsertPasswordAuthUser(input: UpsertPasswordAuthUserInput): Promise<PasswordAuthUser>;
  findPasswordAuthUser(loginId: string): Promise<PasswordAuthUser | null>;
  findPasswordAuthUserByUid(uid: string): Promise<PasswordAuthUser | null>;
  getPasswordLoginThrottle(attemptKey: string): Promise<PasswordLoginThrottle | null>;
  recordPasswordLoginFailure(
    attemptKey: string,
    maxFailures: number,
    lockSeconds: number
  ): Promise<PasswordLoginThrottle>;
  clearPasswordLoginFailures(attemptKey: string): Promise<void>;

  reserveGitHubImport(
    userUid: string,
    repositoryKey: string
  ): Promise<GitHubImportRateLimitReservation>;

  createInvite(email: string, invitedByUid: string): Promise<Invite>;
  getInviteByEmail(email: string): Promise<Invite | null>;
  acceptInvite(email: string, acceptedByUid: string): Promise<Invite>;
  listInvites(): Promise<Invite[]>;
}
