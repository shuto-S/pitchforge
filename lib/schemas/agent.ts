import { z } from "zod";

export const scoreCategorySchema = z.enum([
  "agent_centrality",
  "problem_approach",
  "usability",
  "experience_value",
  "implementation",
  "gcp_necessity",
  "demo_impact",
  "submission_readiness"
]);

export const projectBriefSchema = z.object({
  productName: z.string(),
  oneSentencePitch: z.string(),
  problem: z.string(),
  targetUsers: z.array(z.string()),
  coreValue: z.string(),
  agenticBehavior: z.array(z.string()),
  gcpValue: z.array(z.string()),
  demoMoments: z.array(z.string()),
  unclearPoints: z.array(z.string())
});

export const judgeScoreSchema = z.object({
  totalScore: z.number().int().min(0).max(100),
  categories: z.array(
    z.object({
      key: scoreCategorySchema,
      label: z.string(),
      score: z.number().int().min(0).max(100),
      reason: z.string(),
      improvement: z.string()
    })
  ),
  topStrengths: z.array(z.string()),
  criticalWeaknesses: z.array(z.string()),
  oneLineVerdict: z.string()
});

export const directorStrategySchema = z.object({
  coreMessage: z.string(),
  openingHook: z.string(),
  mainDemoFlow: z.array(z.string()),
  whatToEmphasize: z.array(z.string()),
  whatToHideOrCompress: z.array(z.string()),
  gcpStory: z.string(),
  agentStory: z.string(),
  beforeAfterStory: z.string()
});

export const demoScriptSceneSchema = z.object({
  startSec: z.number().int().nonnegative(),
  endSec: z.number().int().positive(),
  visual: z.string(),
  narration: z.string(),
  onScreenText: z.string(),
  purpose: z.string()
});

export const demoScriptSchema = z.object({
  title: z.string(),
  durationSec: z.number().int().positive(),
  scenes: z.array(demoScriptSceneSchema)
});

export const demoScriptsSchema = z.object({
  script30s: demoScriptSchema,
  script90s: demoScriptSchema,
  script3m: demoScriptSchema
});

export const protoPediaContentSchema = z.object({
  title: z.string(),
  overview: z.string(),
  story: z.object({
    problemBackground: z.string(),
    targetUsers: z.string(),
    productFeatures: z.string()
  }),
  systemArchitecture: z.string(),
  developmentMaterials: z.array(z.string()),
  tags: z.array(z.string()).refine((tags) => tags.includes("findy_hackathon"), {
    message: "tags must include findy_hackathon"
  }),
  relatedUrls: z.array(
    z.object({
      label: z.string(),
      url: z.string()
    })
  )
});

export const visualConceptsSchema = z.object({
  thumbnailIdeas: z.array(
    z.object({
      title: z.string(),
      concept: z.string(),
      layout: z.string(),
      copy: z.string(),
      imagePrompt: z.string(),
      negativePrompt: z.string()
    })
  ),
  keyVisualPrompt: z.string(),
  colorMood: z.string()
});

export const submissionChecklistSchema = z.object({
  requiredItems: z.array(
    z.object({
      label: z.string(),
      status: z.enum(["ready", "missing", "needs_review"]),
      note: z.string()
    })
  ),
  recommendedFixes: z.array(z.string()),
  finalSubmissionAdvice: z.string()
});

export type ScoreCategory = z.infer<typeof scoreCategorySchema>;
export type ProjectBrief = z.infer<typeof projectBriefSchema>;
export type JudgeScore = z.infer<typeof judgeScoreSchema>;
export type DirectorStrategy = z.infer<typeof directorStrategySchema>;
export type DemoScript = z.infer<typeof demoScriptSchema>;
export type DemoScripts = z.infer<typeof demoScriptsSchema>;
export type ProtoPediaContent = z.infer<typeof protoPediaContentSchema>;
export type VisualConcepts = z.infer<typeof visualConceptsSchema>;
export type SubmissionChecklist = z.infer<typeof submissionChecklistSchema>;
