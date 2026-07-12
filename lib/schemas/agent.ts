import { z } from "zod";

export const officialScoreCategoryKeys = [
  "agent_centrality",
  "problem_approach",
  "usability",
  "experience_value",
  "implementation"
] as const;

export type OfficialScoreCategoryKey = (typeof officialScoreCategoryKeys)[number];

export const officialScoreCategoryLabels: Record<OfficialScoreCategoryKey, string> = {
  agent_centrality: "AI中核価値",
  problem_approach: "課題適合",
  usability: "使いやすさ",
  experience_value: "体験価値",
  implementation: "実装・運用準備"
};

export const scoreCategorySchema = z.enum(officialScoreCategoryKeys);

export const revisionActionSchema = z.enum([
  "strategy",
  "scripts",
  "submission",
  "visuals",
  "checklist"
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

export const judgeScoreCategorySchema = z.object({
  key: scoreCategorySchema,
  label: z.string().min(1),
  score: z.number().int().min(0).max(100),
  evidence: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
  improvement: z.string().min(1)
});

export function calculateJudgeTotalScore(categories: Array<{ score: number }>): number {
  if (categories.length === 0) {
    return 0;
  }
  return Math.round(
    categories.reduce((total, category) => total + category.score, 0) / categories.length
  );
}

export const judgeScoreSchema = z
  .object({
    totalScore: z.number().int().min(0).max(100),
    categories: z.array(judgeScoreCategorySchema).length(officialScoreCategoryKeys.length),
    topStrengths: z.array(z.string()),
    criticalWeaknesses: z.array(z.string()),
    oneLineVerdict: z.string()
  })
  .superRefine((value, ctx) => {
    const keys = value.categories.map((category) => category.key);
    if (new Set(keys).size !== officialScoreCategoryKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categories"],
        message: "categories must contain each official judging criterion exactly once"
      });
    }

    const calculatedTotal = calculateJudgeTotalScore(value.categories);
    if (value.totalScore !== calculatedTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalScore"],
        message: `totalScore must equal the rounded category average (${calculatedTotal})`
      });
    }
  });

export const revisionPlanSchema = z
  .object({
    decision: z.enum(["continue", "stop"]),
    focusCriteria: z.array(scoreCategorySchema).max(officialScoreCategoryKeys.length),
    actions: z.array(revisionActionSchema).max(5),
    targetScore: z.number().int().min(0).max(100),
    target: z.string().min(1),
    reason: z.string().min(1)
  })
  .superRefine((value, ctx) => {
    if (new Set(value.focusCriteria).size !== value.focusCriteria.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["focusCriteria"],
        message: "focusCriteria must not contain duplicates"
      });
    }
    if (new Set(value.actions).size !== value.actions.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions"],
        message: "actions must not contain duplicates"
      });
    }
    if (value.decision === "continue" && value.focusCriteria.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["focusCriteria"],
        message: "continue requires at least one focus criterion"
      });
    }
    if (value.decision === "continue" && value.actions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions"],
        message: "continue requires at least one action"
      });
    }
    if (value.decision === "stop" && value.actions.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions"],
        message: "stop must not include actions"
      });
    }
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
  tags: z.array(z.string()),
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
export type RevisionAction = z.infer<typeof revisionActionSchema>;
export type ProjectBrief = z.infer<typeof projectBriefSchema>;
export type JudgeScore = z.infer<typeof judgeScoreSchema>;
export type RevisionPlan = z.infer<typeof revisionPlanSchema>;
export type DirectorStrategy = z.infer<typeof directorStrategySchema>;
export type DemoScript = z.infer<typeof demoScriptSchema>;
export type DemoScripts = z.infer<typeof demoScriptsSchema>;
export type ProtoPediaContent = z.infer<typeof protoPediaContentSchema>;
export type VisualConcepts = z.infer<typeof visualConceptsSchema>;
export type SubmissionChecklist = z.infer<typeof submissionChecklistSchema>;
