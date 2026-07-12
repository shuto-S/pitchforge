import {
  demoScriptsSchema,
  directorStrategySchema,
  generatedArtifactsSchema,
  judgeScoreSchema,
  projectBriefSchema,
  protoPediaContentSchema,
  revisionPlanSchema,
  submissionChecklistSchema,
  visualConceptsSchema
} from "@/lib/schemas";
import type { GeneratedArtifacts } from "@/lib/schemas/artifact";
import type {
  DemoScripts,
  DirectorStrategy,
  JudgeScore,
  ProjectBrief,
  ProtoPediaContent,
  RevisionPlan,
  SubmissionChecklist,
  VisualConcepts
} from "@/lib/schemas/agent";
import type { Asset, Project } from "@/lib/schemas/project";
import {
  safeExternalHttpUrl,
  sanitizeCredentialBearingUrls
} from "@/lib/safe-external-url";
import type { AIImageInput, AIProvider } from "@/lib/server/ai/provider";
import { agentPrompts, buildProjectPrompt, commonSystemPrompt } from "@/lib/server/ai/prompts";

export type AgentContext = {
  project: Project;
  assets: Asset[];
  images: AIImageInput[];
};

function safeProjectUrl(value: string | undefined): string | undefined {
  return value ? safeExternalHttpUrl(value) ?? undefined : undefined;
}

function safePromptContext(context: AgentContext) {
  const { project } = context;
  return sanitizeCredentialBearingUrls({
    project: {
      title: project.title,
      oneLiner: project.oneLiner,
      description: project.description,
      problem: project.problem,
      targetUsers: project.targetUsers,
      productUrl: safeProjectUrl(project.productUrl),
      githubUrl: safeProjectUrl(project.githubUrl),
      gcpUsage: project.gcpUsage,
      aiAgentBehavior: project.aiAgentBehavior,
      techStack: project.techStack,
      status: project.status
    },
    assets: context.assets.map((asset) => ({
      kind: asset.kind,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes
    }))
  });
}

function withoutImageData<T extends { context: AgentContext }>(input: T) {
  const promptInput = { ...input } as Partial<T>;
  delete promptInput.context;
  return sanitizeCredentialBearingUrls({
    ...promptInput,
    context: safePromptContext(input.context)
  });
}

export async function runBriefAgent(
  provider: AIProvider,
  context: AgentContext
): Promise<ProjectBrief> {
  const result = await provider.generateJson<ProjectBrief>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.brief}\n\n${buildProjectPrompt(safePromptContext(context))}`,
    schemaName: "ProjectBrief",
    schema: projectBriefSchema,
    images: context.images.slice(0, 5)
  });
  return projectBriefSchema.parse(result);
}

export async function runJudgeAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    brief: ProjectBrief;
    artifacts?: unknown;
    phase: "baseline" | "draft" | "revision" | "final";
  }
): Promise<JudgeScore> {
  const result = await provider.generateJson<JudgeScore>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.judge}\n\n${buildProjectPrompt(withoutImageData(input))}`,
    schemaName: `JudgeScore${input.phase[0].toUpperCase()}${input.phase.slice(1)}`,
    schema: judgeScoreSchema
  });
  return judgeScoreSchema.parse(result);
}

export async function runDirectorAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    brief: ProjectBrief;
    baselineScore: JudgeScore;
  }
): Promise<DirectorStrategy> {
  const result = await provider.generateJson<DirectorStrategy>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.director}\n\n${buildProjectPrompt(withoutImageData(input))}`,
    schemaName: "DirectorStrategy",
    schema: directorStrategySchema
  });
  return directorStrategySchema.parse(result);
}

export async function runScriptAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    brief: ProjectBrief;
    strategy: DirectorStrategy;
  }
): Promise<DemoScripts> {
  const result = await provider.generateJson<DemoScripts>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.script}\n\n${buildProjectPrompt(withoutImageData(input))}`,
    schemaName: "DemoScripts",
    schema: demoScriptsSchema
  });
  return demoScriptsSchema.parse(result);
}

export async function runSubmissionAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    brief: ProjectBrief;
    strategy: DirectorStrategy;
  }
): Promise<ProtoPediaContent> {
  const result = await provider.generateJson<ProtoPediaContent>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.submission}\n\n${buildProjectPrompt(withoutImageData(input))}`,
    schemaName: "ProtoPediaContent",
    schema: protoPediaContentSchema
  });
  return protoPediaContentSchema.parse(result);
}

export async function runVisualAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    brief: ProjectBrief;
    strategy: DirectorStrategy;
  }
): Promise<VisualConcepts> {
  const result = await provider.generateJson<VisualConcepts>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.visual}\n\n${buildProjectPrompt(withoutImageData(input))}`,
    schemaName: "VisualConcepts",
    schema: visualConceptsSchema
  });
  return visualConceptsSchema.parse(result);
}

export async function runProducerAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    brief: ProjectBrief;
    strategy: DirectorStrategy;
  }
): Promise<SubmissionChecklist> {
  const result = await provider.generateJson<SubmissionChecklist>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.producer}\n\n${buildProjectPrompt(withoutImageData(input))}`,
    schemaName: "SubmissionChecklist",
    schema: submissionChecklistSchema
  });
  return submissionChecklistSchema.parse(result);
}

export async function runRevisionPlannerAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    brief: ProjectBrief;
    currentScore: JudgeScore;
    currentArtifacts: GeneratedArtifacts;
    round: number;
    maxRounds: number;
  }
): Promise<RevisionPlan> {
  const result = await provider.generateJson<RevisionPlan>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.planner}\n\n${buildProjectPrompt(withoutImageData(input))}`,
    schemaName: "RevisionPlan",
    schema: revisionPlanSchema
  });
  return revisionPlanSchema.parse(result);
}

export async function runOptimizerAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    baselineScore: JudgeScore;
    currentScore: JudgeScore;
    currentBundle: GeneratedArtifacts;
    revisionPlan: RevisionPlan;
    round: number;
  }
): Promise<GeneratedArtifacts> {
  const result = await provider.generateJson<GeneratedArtifacts>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.optimizer}\n\n${buildProjectPrompt(withoutImageData(input))}`,
    schemaName: "GeneratedArtifacts",
    schema: generatedArtifactsSchema
  });
  return generatedArtifactsSchema.parse(result);
}
