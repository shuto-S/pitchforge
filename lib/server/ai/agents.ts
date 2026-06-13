import {
  demoScriptsSchema,
  directorStrategySchema,
  generatedArtifactsSchema,
  judgeScoreSchema,
  projectBriefSchema,
  protoPediaContentSchema,
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
  SubmissionChecklist,
  VisualConcepts
} from "@/lib/schemas/agent";
import type { Asset, Project } from "@/lib/schemas/project";
import type { AIImageInput, AIProvider } from "@/lib/server/ai/provider";
import { agentPrompts, buildProjectPrompt, commonSystemPrompt } from "@/lib/server/ai/prompts";

export type AgentContext = {
  project: Project;
  assets: Asset[];
  images: AIImageInput[];
};

export async function runBriefAgent(
  provider: AIProvider,
  context: AgentContext
): Promise<ProjectBrief> {
  const result = await provider.generateJson<ProjectBrief>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.brief}\n\n${buildProjectPrompt({
      project: context.project,
      assets: context.assets.map((asset) => ({
        id: asset.id,
        projectId: asset.projectId,
        kind: asset.kind,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        createdAt: asset.createdAt
      }))
    })}`,
    schemaName: "ProjectBrief",
    schema: projectBriefSchema,
    images: context.images
  });
  return projectBriefSchema.parse(result);
}

export async function runJudgeAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    brief: ProjectBrief;
    artifacts?: unknown;
    phase: "baseline" | "draft" | "final";
  }
): Promise<JudgeScore> {
  const result = await provider.generateJson<JudgeScore>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.judge}\n\n${buildProjectPrompt(input)}`,
    schemaName:
      input.phase === "baseline"
        ? "JudgeScoreBaseline"
        : input.phase === "draft"
          ? "JudgeScoreDraft"
          : "JudgeScoreFinal",
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
    prompt: `${agentPrompts.director}\n\n${buildProjectPrompt(input)}`,
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
    prompt: `${agentPrompts.script}\n\n${buildProjectPrompt(input)}`,
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
    prompt: `${agentPrompts.submission}\n\n${buildProjectPrompt(input)}`,
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
    prompt: `${agentPrompts.visual}\n\n${buildProjectPrompt(input)}`,
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
    prompt: `${agentPrompts.producer}\n\n${buildProjectPrompt(input)}`,
    schemaName: "SubmissionChecklist",
    schema: submissionChecklistSchema
  });
  return submissionChecklistSchema.parse(result);
}

export async function runOptimizerAgent(
  provider: AIProvider,
  input: {
    context: AgentContext;
    baselineScore: JudgeScore;
    draftScore: JudgeScore;
    draftBundle: GeneratedArtifacts;
  }
): Promise<GeneratedArtifacts> {
  const result = await provider.generateJson<GeneratedArtifacts>({
    system: commonSystemPrompt,
    prompt: `${agentPrompts.optimizer}\n\n${buildProjectPrompt(input)}`,
    schemaName: "GeneratedArtifacts",
    schema: generatedArtifactsSchema
  });
  return generatedArtifactsSchema.parse(result);
}
