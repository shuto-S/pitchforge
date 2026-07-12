import { z } from "zod";
import { isDraftValueNeedsReview } from "@/lib/project-draft-placeholder";
import { normalizePublicGitHubRepositoryUrl } from "@/lib/github-repository-url";

export const httpsUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "URL must use https:// and must not contain credentials");

export const publicGitHubRepositoryUrlSchema = z
  .string()
  .transform((value, context) => {
    const normalizedUrl = normalizePublicGitHubRepositoryUrl(value);

    if (!normalizedUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a public GitHub repository URL such as https://github.com/owner/repository"
      });
      return z.NEVER;
    }

    return normalizedUrl;
  });

export const githubProjectImportRequestSchema = z
  .object({
    githubUrl: publicGitHubRepositoryUrlSchema
  })
  .strict();

const persistedHttpsUrlSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const parsed = httpsUrlSchema.safeParse(value);
  return parsed.success ? new URL(parsed.data).href : undefined;
}, httpsUrlSchema.optional());

const projectDraftInputShape = {
  title: z.string().trim().min(1).max(80),
  oneLiner: z.string().trim().min(1).max(120),
  description: z.string().trim().min(20).max(2000),
  problem: z.string().trim().min(1).max(2000),
  targetUsers: z.string().trim().min(1).max(2000),
  productUrl: z.union([httpsUrlSchema, z.literal("")]).optional(),
  githubUrl: z.union([httpsUrlSchema, z.literal("")]).optional(),
  gcpUsage: z.string().trim().min(1).max(2000),
  aiAgentBehavior: z.string().trim().min(1).max(2000),
  techStack: z.array(z.string().trim().min(1).max(60)).max(20).default([])
};

function confirmedProjectText<T extends z.ZodType<string>>(schema: T, label: string) {
  return schema.refine((value) => !isDraftValueNeedsReview(value), {
    message: `「${label}」に未確認の下書きが残っています。「要確認:」を実際の内容に置き換えてください。`
  });
}

const confirmedProjectInputShape = {
  ...projectDraftInputShape,
  title: confirmedProjectText(projectDraftInputShape.title, "プロダクト名"),
  oneLiner: confirmedProjectText(projectDraftInputShape.oneLiner, "一言で言うと"),
  description: confirmedProjectText(projectDraftInputShape.description, "プロダクト概要"),
  problem: confirmedProjectText(projectDraftInputShape.problem, "解決する課題"),
  targetUsers: confirmedProjectText(projectDraftInputShape.targetUsers, "想定ユーザー"),
  gcpUsage: confirmedProjectText(
    projectDraftInputShape.gcpUsage,
    "Google Cloudの使いどころ"
  ),
  aiAgentBehavior: confirmedProjectText(
    projectDraftInputShape.aiAgentBehavior,
    "AIエージェントとしての自律動作"
  )
};

export const projectInputSchema = z.object(confirmedProjectInputShape);

export const projectImportDraftSchema = z.object({
  ...projectDraftInputShape,
  productUrl: z.union([httpsUrlSchema, z.literal("")]),
  githubUrl: publicGitHubRepositoryUrlSchema
});

export const projectSchema = z.object({
  // Persisted rows may predate the GitHub-import confirmation guard. Keep the
  // read schema backward-compatible; only new project creation is rejected by
  // projectInputSchema while an unconfirmed placeholder remains.
  ...projectDraftInputShape,
  id: z.string(),
  ownerUid: z.string().min(1),
  ownerEmail: z.string().email(),
  productUrl: persistedHttpsUrlSchema,
  githubUrl: persistedHttpsUrlSchema,
  status: z.enum(["draft", "ready", "running", "completed", "failed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const assetSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  ownerUid: z.string().min(1),
  kind: z.enum(["screenshot", "export", "generated_image"]),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  storageUri: z.string(),
  publicUrl: z.string().optional(),
  createdAt: z.string().datetime()
});

export const runSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  currentStep: z.string(),
  progress: z.number().int().min(0).max(100),
  baselineScore: z.unknown().optional(),
  finalScore: z.unknown().optional(),
  errorMessage: z.string().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const runEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  projectId: z.string(),
  agentName: z.string(),
  type: z.enum(["started", "message", "completed", "failed"]),
  message: z.string(),
  payload: z.unknown().optional(),
  createdAt: z.string().datetime()
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ProjectImportDraft = z.infer<typeof projectImportDraftSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Run = z.infer<typeof runSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;
