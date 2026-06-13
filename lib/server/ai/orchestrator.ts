import type { ArtifactBundle, GeneratedArtifacts } from "@/lib/schemas/artifact";
import type { JudgeScore } from "@/lib/schemas/agent";
import type { Project } from "@/lib/schemas/project";
import {
  runBriefAgent,
  runDirectorAgent,
  runJudgeAgent,
  runOptimizerAgent,
  runProducerAgent,
  runScriptAgent,
  runSubmissionAgent,
  runVisualAgent
} from "@/lib/server/ai/agents";
import { getAIProvider } from "@/lib/server/ai";
import type { AIImageInput } from "@/lib/server/ai/provider";
import type { PitchForgeRepository } from "@/lib/server/db/types";
import { renderMarkdownExport } from "@/lib/server/export/markdown";
import type { ObjectStorage } from "@/lib/server/storage/types";
import { safeErrorMessage } from "@/lib/server/security";
import { nowIso } from "@/lib/server/utils/dates";
import { makeId } from "@/lib/server/utils/ids";

const agentNames = {
  brief: "AIブリーフ担当",
  judge: "AI審査員",
  director: "AI監督",
  script: "AI脚本家",
  submission: "AI編集者",
  visual: "AIアートディレクター",
  producer: "AIプロデューサー",
  optimizer: "AI改善担当"
};

async function event(
  repo: PitchForgeRepository,
  projectId: string,
  runId: string,
  agentName: string,
  message: string,
  type: "started" | "message" | "completed" | "failed" = "message",
  payload?: unknown
) {
  await repo.addRunEvent({
    id: makeId("evt"),
    projectId,
    runId,
    agentName,
    type,
    message,
    payload,
    createdAt: nowIso()
  });
}

async function step(
  repo: PitchForgeRepository,
  projectId: string,
  runId: string,
  currentStep: string,
  progress: number,
  agentName: string,
  message: string
) {
  await repo.updateRun(projectId, runId, {
    status: "running",
    currentStep,
    progress
  });
  await event(repo, projectId, runId, agentName, message, "message");
}

async function imagesForProject(
  storage: ObjectStorage,
  project: Project,
  repo: PitchForgeRepository
): Promise<AIImageInput[]> {
  const assets = await repo.listAssets(project.id);
  const images = await Promise.all(
    assets.slice(0, 5).map(async (asset) => {
      const data = await storage.readAsset(asset).catch(() => null);
      return data ? { mimeType: asset.mimeType, data } : null;
    })
  );
  return images.filter((image): image is AIImageInput => Boolean(image));
}

export async function runPitchForge(input: {
  projectId: string;
  runId: string;
  repo: PitchForgeRepository;
  storage: ObjectStorage;
}): Promise<ArtifactBundle> {
  const { projectId, runId, repo, storage } = input;
  const provider = getAIProvider();

  try {
    const project = await repo.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const assets = await repo.listAssets(projectId);
    const images = await imagesForProject(storage, project, repo);
    const context = { project, assets, images };

    await event(
      repo,
      projectId,
      runId,
      agentNames.director,
      "AI監督室を開始します。",
      "started"
    );

    await step(
      repo,
      projectId,
      runId,
      "Brief Agent",
      8,
      agentNames.brief,
      "作品情報とスクリーンショットを整理しています。"
    );
    const brief = await runBriefAgent(provider, context);

    await step(
      repo,
      projectId,
      runId,
      "Judge Agent baseline",
      20,
      agentNames.judge,
      "審査基準に沿って改善前スコアを出しています。"
    );
    const baselineScore = await runJudgeAgent(provider, {
      context,
      brief,
      phase: "baseline"
    });
    await repo.updateRun(projectId, runId, { baselineScore });

    await step(
      repo,
      projectId,
      runId,
      "Director Agent",
      35,
      agentNames.director,
      "作品の勝ち筋とデモの見せ方を決めています。"
    );
    const directorStrategy = await runDirectorAgent(provider, {
      context,
      brief,
      baselineScore
    });

    await step(
      repo,
      projectId,
      runId,
      "Artifact Agents",
      56,
      agentNames.script,
      "台本、提出文、サムネイル案、チェックリストを生成しています。"
    );
    const [demoScripts, protoPediaContent, visualConcepts, checklist] = await Promise.all([
      runScriptAgent(provider, { context, brief, strategy: directorStrategy }),
      runSubmissionAgent(provider, { context, brief, strategy: directorStrategy }),
      runVisualAgent(provider, { context, brief, strategy: directorStrategy }),
      runProducerAgent(provider, { context, brief, strategy: directorStrategy })
    ]);

    const draftBundle: GeneratedArtifacts = {
      brief,
      directorStrategy,
      demoScripts,
      protoPediaContent,
      visualConcepts,
      checklist
    };

    await step(
      repo,
      projectId,
      runId,
      "Judge Agent review",
      74,
      agentNames.judge,
      "生成物を再採点しています。"
    );
    const draftScore: JudgeScore = await runJudgeAgent(provider, {
      context,
      brief,
      artifacts: draftBundle,
      phase: "draft"
    });

    await step(
      repo,
      projectId,
      runId,
      "Optimizer Agent",
      88,
      agentNames.optimizer,
      "弱い項目を補強して最終提出パッケージに整えています。"
    );
    const optimizedBundle = await runOptimizerAgent(provider, {
      context,
      baselineScore,
      draftScore,
      draftBundle
    });

    await step(
      repo,
      projectId,
      runId,
      "Final Judge",
      95,
      agentNames.judge,
      "改善後スコアを確定しています。"
    );
    const finalScore = await runJudgeAgent(provider, {
      context,
      brief,
      artifacts: optimizedBundle,
      phase: "final"
    });

    const markdownExport = renderMarkdownExport({
      project,
      baselineScore,
      finalScore,
      artifacts: optimizedBundle
    });

    const artifactBundle: ArtifactBundle = {
      ...optimizedBundle,
      markdownExport,
      jsonExport: optimizedBundle as unknown as Record<string, unknown>,
      createdAt: nowIso()
    };

    await repo.saveArtifacts(projectId, runId, artifactBundle);
    await repo.updateRun(projectId, runId, {
      status: "completed",
      currentStep: "completed",
      progress: 100,
      finalScore,
      completedAt: nowIso()
    });
    await event(
      repo,
      projectId,
      runId,
      agentNames.director,
      "提出パッケージが完成しました。",
      "completed"
    );

    return artifactBundle;
  } catch (error) {
    const message = safeErrorMessage(error);
    await repo.updateRun(projectId, runId, {
      status: "failed",
      currentStep: "failed",
      errorMessage: message,
      completedAt: nowIso()
    });
    await event(repo, projectId, runId, "System", message, "failed");
    throw error;
  }
}
