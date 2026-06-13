import { z } from "zod";
import {
  demoScriptsSchema,
  directorStrategySchema,
  projectBriefSchema,
  protoPediaContentSchema,
  submissionChecklistSchema,
  visualConceptsSchema
} from "@/lib/schemas/agent";

export const generatedArtifactsSchema = z.object({
  brief: projectBriefSchema,
  directorStrategy: directorStrategySchema,
  demoScripts: demoScriptsSchema,
  protoPediaContent: protoPediaContentSchema,
  visualConcepts: visualConceptsSchema,
  checklist: submissionChecklistSchema
});

export const artifactBundleSchema = generatedArtifactsSchema.extend({
  markdownExport: z.string(),
  jsonExport: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});

export type GeneratedArtifacts = z.infer<typeof generatedArtifactsSchema>;
export type ArtifactBundle = z.infer<typeof artifactBundleSchema>;
