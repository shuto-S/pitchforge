import { normalizePublicGitHubRepositoryUrl } from "@/lib/github-repository-url";
import { isDraftValueNeedsReview } from "@/lib/project-draft-placeholder";

export type ProjectDraftFormState = {
  title: string;
  oneLiner: string;
  description: string;
  problem: string;
  targetUsers: string;
  productUrl: string;
  githubUrl: string;
  gcpUsage: string;
  aiAgentBehavior: string;
  techStack: string;
};

export type RequiredProjectDraftField =
  | "title"
  | "oneLiner"
  | "description"
  | "problem"
  | "targetUsers"
  | "gcpUsage"
  | "aiAgentBehavior";

export type GithubImportMode = "ai" | "mechanical";

export type GithubImportResponse = {
  draft: Omit<ProjectDraftFormState, "techStack"> & { techStack: string[] };
  analyzedFiles: string[];
  mode: GithubImportMode;
  warnings: string[];
};

export type GithubImportReview = {
  form: ProjectDraftFormState;
  analyzedFiles: string[];
  mode: GithubImportMode;
  warnings: string[];
  fieldsNeedingReview: RequiredProjectDraftField[];
  status: "success" | "partial";
};

export type ProjectDraftSubmitValidation = {
  field: RequiredProjectDraftField;
  message: string;
};

export const requiredProjectDraftFields: RequiredProjectDraftField[] = [
  "title",
  "oneLiner",
  "description",
  "problem",
  "targetUsers",
  "gcpUsage",
  "aiAgentBehavior"
];

export const projectDraftFieldLabels: Record<RequiredProjectDraftField, string> = {
  title: "プロダクト名",
  oneLiner: "一言で言うと",
  description: "プロダクト概要",
  problem: "解決する課題",
  targetUsers: "想定ユーザー",
  gcpUsage: "Google Cloudの使いどころ",
  aiAgentBehavior: "AIエージェントとしての自律動作"
};

const draftStringFields = [
  "title",
  "oneLiner",
  "description",
  "problem",
  "targetUsers",
  "productUrl",
  "githubUrl",
  "gcpUsage",
  "aiAgentBehavior"
] as const;

const requiredFieldLengths: Record<
  RequiredProjectDraftField,
  { min: number; max: number }
> = {
  title: { min: 1, max: 80 },
  oneLiner: { min: 1, max: 120 },
  description: { min: 20, max: 2000 },
  problem: { min: 1, max: 2000 },
  targetUsers: { min: 1, max: 2000 },
  gcpUsage: { min: 1, max: 2000 },
  aiAgentBehavior: { min: 1, max: 2000 }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

export function parseGithubImportResponse(value: unknown): GithubImportResponse {
  if (!isRecord(value) || !isRecord(value.draft)) {
    throw new Error("GitHub import response is invalid");
  }

  if (value.mode !== "ai" && value.mode !== "mechanical") {
    throw new Error("GitHub import response is invalid");
  }

  const rawDraft = value.draft;
  const draft = Object.fromEntries(
    draftStringFields.map((field) => [
      field,
      typeof rawDraft[field] === "string" ? rawDraft[field].trim() : ""
    ])
  ) as Omit<ProjectDraftFormState, "techStack">;

  return {
    draft: {
      ...draft,
      techStack: stringArray(rawDraft.techStack)
    },
    analyzedFiles: stringArray(value.analyzedFiles),
    mode: value.mode,
    warnings: stringArray(value.warnings)
  };
}

export function findProjectDraftFieldsNeedingReview(
  form: ProjectDraftFormState
): RequiredProjectDraftField[] {
  return requiredProjectDraftFields.filter((field) => {
    const value = form[field].trim();
    const length = value.length;
    const constraint = requiredFieldLengths[field];
    return (
      length < constraint.min ||
      length > constraint.max ||
      isDraftValueNeedsReview(value)
    );
  });
}

export function firstProjectDraftSubmitValidation(
  form: ProjectDraftFormState
): ProjectDraftSubmitValidation | null {
  const field = findProjectDraftFieldsNeedingReview(form)[0];
  if (!field) {
    return null;
  }

  const label = projectDraftFieldLabels[field];
  const message = isDraftValueNeedsReview(form[field])
    ? `「${label}」の「要確認:」を実際の内容に置き換えてください。`
    : `「${label}」の入力内容を確認してください。`;

  return { field, message };
}

export { isDraftValueNeedsReview };

export function buildGithubImportReview(value: unknown): GithubImportReview {
  const response = parseGithubImportResponse(value);
  const form: ProjectDraftFormState = {
    ...response.draft,
    techStack: response.draft.techStack.join(", ")
  };
  const fieldsNeedingReview = findProjectDraftFieldsNeedingReview(form);

  return {
    form,
    analyzedFiles: response.analyzedFiles,
    mode: response.mode,
    warnings: response.warnings,
    fieldsNeedingReview,
    status:
      fieldsNeedingReview.length > 0 || response.warnings.length > 0
        ? "partial"
        : "success"
  };
}

export function githubRepositoryUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "GitHubリポジトリ URLを入力してください。";
  }

  if (!normalizePublicGitHubRepositoryUrl(trimmed)) {
    return "https://github.com/owner/repository の形式で入力してください。";
  }

  return null;
}
