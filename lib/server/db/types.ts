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

export interface PitchForgeRepository {
  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(projectId: string): Promise<Project | null>;
  updateProject(projectId: string, patch: Partial<Project>): Promise<Project>;
  listProjects(ownerUid: string): Promise<Project[]>;

  saveAsset(asset: Asset): Promise<Asset>;
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

  createInvite(email: string, invitedByUid: string): Promise<Invite>;
  getInviteByEmail(email: string): Promise<Invite | null>;
  acceptInvite(email: string, acceptedByUid: string): Promise<Invite>;
  listInvites(): Promise<Invite[]>;
}

export type LocalDbShape = {
  projects: Record<string, Project>;
  assets: Record<string, Asset[]>;
  runs: Record<string, Run[]>;
  events: Record<string, RunEvent[]>;
  artifacts: Record<string, ArtifactBundle>;
  users: Record<string, UserProfile>;
  invites: Record<string, Invite>;
};
