import { z } from "zod";

export const httpsUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith("https://"), "URL must start with https://");

export const projectInputSchema = z.object({
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
});

export const projectSchema = projectInputSchema.extend({
  id: z.string(),
  ownerUid: z.string().min(1),
  ownerEmail: z.string().email(),
  productUrl: httpsUrlSchema.optional(),
  githubUrl: httpsUrlSchema.optional(),
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
export type Project = z.infer<typeof projectSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Run = z.infer<typeof runSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;
