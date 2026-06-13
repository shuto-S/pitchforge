import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { Asset, Project, ProjectInput, Run, RunEvent } from "@/lib/schemas/project";

export type CreateProjectInput = Omit<ProjectInput, "productUrl" | "githubUrl"> & {
  productUrl?: string;
  githubUrl?: string;
};

export interface PitchForgeRepository {
  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(projectId: string): Promise<Project | null>;
  updateProject(projectId: string, patch: Partial<Project>): Promise<Project>;
  listProjects(): Promise<Project[]>;

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
}

export type LocalDbShape = {
  projects: Record<string, Project>;
  assets: Record<string, Asset[]>;
  runs: Record<string, Run[]>;
  events: Record<string, RunEvent[]>;
  artifacts: Record<string, ArtifactBundle>;
};
