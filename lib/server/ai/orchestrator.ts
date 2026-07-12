import type { ArtifactBundle, GeneratedArtifacts } from "@/lib/schemas/artifact";
import type {
  JudgeScore,
  RevisionAction,
  RevisionPlan,
  ScoreCategory
} from "@/lib/schemas/agent";
import type { Asset } from "@/lib/schemas/project";
import {
  runBriefAgent,
  runDirectorAgent,
  runJudgeAgent,
  runOptimizerAgent,
  runProducerAgent,
  runRevisionPlannerAgent,
  runScriptAgent,
  runSubmissionAgent,
  runVisualAgent
} from "@/lib/server/ai/agents";
import { getAIProvider } from "@/lib/server/ai";
import type { AIImageInput, AIProvider } from "@/lib/server/ai/provider";
import type { PitchForgeRepository } from "@/lib/server/db/types";
import { renderMarkdownExport } from "@/lib/server/export/markdown";
import { finalizeSubmissionArtifacts } from "@/lib/server/submission/finalize";
import type { ObjectStorage } from "@/lib/server/storage/types";
import { safeErrorMessage } from "@/lib/server/security";
import { nowIso } from "@/lib/server/utils/dates";
import { makeId } from "@/lib/server/utils/ids";

const agentNames = {
  brief: "プロダクト分析",
  judge: "品質レビュー",
  director: "改善設計",
  script: "デモ設計",
  submission: "公開文編集",
  visual: "ビジュアル設計",
  producer: "公開準備",
  planner: "改善計画",
  optimizer: "改善実行"
};

export const MAX_REVISION_ROUNDS = 2;
export const MAX_BRIEF_IMAGE_COUNT = 5;
export const MAX_BRIEF_IMAGE_BYTES = 12 * 1024 * 1024;
export const NO_USABLE_BRIEF_IMAGE_ERROR =
  "アップロード済み画像をAI解析用に読み込めませんでした。";

export type BriefImageLoadResult = {
  images: AIImageInput[];
  unreadableCount: number;
  budgetSkippedCount: number;
};

const actionLabels: Record<RevisionAction, string> = {
  strategy: "改善方針",
  scripts: "デモ台本",
  submission: "紹介ページ",
  visuals: "ビジュアル案",
  checklist: "公開準備チェック"
};

const criterionLabels: Record<ScoreCategory, string> = {
  agent_centrality: "AI中核価値",
  problem_approach: "課題適合",
  usability: "使いやすさ",
  experience_value: "体験価値",
  implementation: "実装・運用準備"
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

export async function loadBriefImagesWithDiagnostics(
  storage: ObjectStorage,
  assets: Asset[]
): Promise<BriefImageLoadResult> {
  const images: AIImageInput[] = [];
  let totalBytes = 0;
  let unreadableCount = 0;
  let budgetSkippedCount = 0;

  for (const asset of assets) {
    if (images.length >= MAX_BRIEF_IMAGE_COUNT) {
      break;
    }

    let data: Buffer | null;
    try {
      data = await storage.readAsset(asset);
    } catch {
      unreadableCount += 1;
      continue;
    }
    if (!data) {
      unreadableCount += 1;
      continue;
    }
    if (data.length > MAX_BRIEF_IMAGE_BYTES - totalBytes) {
      budgetSkippedCount += 1;
      continue;
    }

    images.push({ mimeType: asset.mimeType, data });
    totalBytes += data.length;
  }

  return { images, unreadableCount, budgetSkippedCount };
}

export async function loadBriefImages(
  storage: ObjectStorage,
  assets: Asset[]
): Promise<AIImageInput[]> {
  return (await loadBriefImagesWithDiagnostics(storage, assets)).images;
}

export function mergeRevisionCandidate(
  current: GeneratedArtifacts,
  candidate: GeneratedArtifacts,
  actions: RevisionAction[]
): GeneratedArtifacts {
  const selected = new Set(actions);
  return {
    brief: current.brief,
    directorStrategy: selected.has("strategy")
      ? candidate.directorStrategy
      : current.directorStrategy,
    demoScripts: selected.has("scripts") ? candidate.demoScripts : current.demoScripts,
    protoPediaContent: selected.has("submission")
      ? candidate.protoPediaContent
      : current.protoPediaContent,
    visualConcepts: selected.has("visuals")
      ? candidate.visualConcepts
      : current.visualConcepts,
    checklist: selected.has("checklist") ? candidate.checklist : current.checklist
  };
}

export function hasMetRevisionTarget(
  score: JudgeScore,
  plan: Pick<RevisionPlan, "focusCriteria" | "targetScore">
): boolean {
  return (
    plan.focusCriteria.length > 0 &&
    plan.focusCriteria.every((criterion) =>
      score.categories.some(
        (category) => category.key === criterion && category.score >= plan.targetScore
      )
    )
  );
}

function planEventMessage(round: number, plan: RevisionPlan): string {
  const focus = plan.focusCriteria.map((criterion) => criterionLabels[criterion]).join("、") || "なし";
  const actions = plan.actions.map((action) => actionLabels[action]).join("、") || "なし";
  const decision = plan.decision === "continue" ? "継続" : "停止";
  return `改善ラウンド${round}: ${decision}。対象: ${focus}。操作: ${actions}。目標: ${plan.targetScore}点 / ${plan.target}。理由: ${plan.reason}`;
}

export async function runPitchForge(input: {
  projectId: string;
  runId: string;
  repo: PitchForgeRepository;
  storage: ObjectStorage;
  provider?: AIProvider;
}): Promise<ArtifactBundle> {
  const { projectId, runId, repo, storage } = input;
  const provider = input.provider ?? getAIProvider();

  try {
    const project = await repo.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const assets = await repo.listAssets(projectId);

    await event(
      repo,
      projectId,
      runId,
      agentNames.director,
      "プロダクトの評価と改善を開始します。",
      "started"
    );

    const imageLoad = await loadBriefImagesWithDiagnostics(storage, assets);
    if (assets.length > 0 && imageLoad.images.length === 0) {
      throw new Error(NO_USABLE_BRIEF_IMAGE_ERROR);
    }
    if (imageLoad.unreadableCount > 0) {
      await event(
        repo,
        projectId,
        runId,
        agentNames.brief,
        `警告: 画像素材${imageLoad.unreadableCount}件を読み込めなかったため除外し、残りの画像で続行します。`,
        "message",
        { level: "warning", unreadableCount: imageLoad.unreadableCount }
      );
    }
    if (imageLoad.budgetSkippedCount > 0) {
      await event(
        repo,
        projectId,
        runId,
        agentNames.brief,
        `画像リクエストの容量上限に合わせて${imageLoad.budgetSkippedCount}件を除外しました。`,
        "message",
        { budgetSkippedCount: imageLoad.budgetSkippedCount }
      );
    }
    const context = { project, assets, images: imageLoad.images };

    await step(
      repo,
      projectId,
      runId,
      "素材をブリーフ化",
      8,
      agentNames.brief,
      "プロダクト情報、Google Cloud構成、スクリーンショットを分析ブリーフに整理しています。"
    );
    const brief = await runBriefAgent(provider, context);

    await step(
      repo,
      projectId,
      runId,
      "改善前スコアを採点",
      20,
      agentNames.judge,
      "5つの評価観点ごとに、根拠付きの改善前スコアを採点しています。"
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
      "改善方針を設計",
      35,
      agentNames.director,
      "レビュアーに最初に伝える価値とデモの見せ場を決めています。"
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
      "レビュー資料を生成",
      56,
      agentNames.script,
      "デモ台本、公開用紹介文、ビジュアル案、公開準備チェックを生成しています。"
    );
    const [demoScripts, protoPediaContent, visualConcepts, checklist] = await Promise.all([
      runScriptAgent(provider, { context, brief, strategy: directorStrategy }),
      runSubmissionAgent(provider, { context, brief, strategy: directorStrategy }),
      runVisualAgent(provider, { context, brief, strategy: directorStrategy }),
      runProducerAgent(provider, { context, brief, strategy: directorStrategy })
    ]);

    const draftBundle = finalizeSubmissionArtifacts({
      project,
      artifacts: {
        brief,
        directorStrategy,
        demoScripts,
        protoPediaContent,
        visualConcepts,
        checklist
      }
    });

    await step(
      repo,
      projectId,
      runId,
      "生成物を再採点",
      62,
      agentNames.judge,
      "初期成果物を5つの評価観点で再採点しています。"
    );
    const draftScore: JudgeScore = await runJudgeAgent(provider, {
      context,
      brief,
      artifacts: draftBundle,
      phase: "draft"
    });

    let currentBundle = draftBundle;
    let currentScore = draftScore;
    let stopReason = `最大${MAX_REVISION_ROUNDS}ラウンドに到達しました。`;
    let stopRound = 0;

    for (let round = 1; round <= MAX_REVISION_ROUNDS; round += 1) {
      await step(
        repo,
        projectId,
        runId,
        `改善ラウンド${round}を計画`,
        62 + round * 10,
        agentNames.planner,
        `現在の${currentScore.totalScore}点と成果物から、変更対象を選んでいます。`
      );
      const revisionPlan = await runRevisionPlannerAgent(provider, {
        context,
        brief,
        currentScore,
        currentArtifacts: currentBundle,
        round,
        maxRounds: MAX_REVISION_ROUNDS
      });
      await event(
        repo,
        projectId,
        runId,
        agentNames.planner,
        planEventMessage(round, revisionPlan),
        "message",
        { round, revisionPlan }
      );

      if (revisionPlan.decision === "stop") {
        stopReason = `プランナーが停止を選択しました: ${revisionPlan.reason}`;
        stopRound = round;
        break;
      }
      if (hasMetRevisionTarget(currentScore, revisionPlan)) {
        stopReason = `対象項目が目標${revisionPlan.targetScore}点に到達済みのため、追加変更を行いません。`;
        stopRound = round;
        break;
      }

      const actionText = revisionPlan.actions.map((action) => actionLabels[action]).join("、");
      await step(
        repo,
        projectId,
        runId,
        `改善ラウンド${round}を実行`,
        67 + round * 10,
        agentNames.optimizer,
        `選択した変更だけを実行します: ${actionText}`
      );
      const candidateBundle = await runOptimizerAgent(provider, {
        context,
        baselineScore,
        currentScore,
        currentBundle,
        revisionPlan,
        round
      });
      const revisedBundle = finalizeSubmissionArtifacts({
        project,
        artifacts: mergeRevisionCandidate(
          currentBundle,
          candidateBundle,
          revisionPlan.actions
        )
      });
      await event(
        repo,
        projectId,
        runId,
        agentNames.optimizer,
        `改善ラウンド${round}: ${actionText}の候補を反映し、未選択の成果物は維持しました。`,
        "message",
        { round, actions: revisionPlan.actions }
      );

      await step(
        repo,
        projectId,
        runId,
        `改善ラウンド${round}を再採点`,
        72 + round * 10,
        agentNames.judge,
        "変更候補が5つの評価観点を改善したか確認しています。"
      );
      const observedScore = await runJudgeAgent(provider, {
        context,
        brief,
        artifacts: revisedBundle,
        phase: "revision"
      });
      const improvement = observedScore.totalScore - currentScore.totalScore;
      await event(
        repo,
        projectId,
        runId,
        agentNames.judge,
        `改善ラウンド${round}の再採点: ${currentScore.totalScore}点 → ${observedScore.totalScore}点（${improvement >= 0 ? "+" : ""}${improvement}点）。`,
        "message",
        { round, before: currentScore, after: observedScore, improvement }
      );

      if (improvement <= 0) {
        stopReason = `ラウンド${round}でスコアが改善しなかったため、候補を採用せず停止しました。`;
        stopRound = round;
        break;
      }

      currentBundle = revisedBundle;
      currentScore = observedScore;
      stopRound = round;

      if (hasMetRevisionTarget(currentScore, revisionPlan)) {
        stopReason = `ラウンド${round}で対象項目が目標${revisionPlan.targetScore}点に到達しました。`;
        break;
      }
      if (round === MAX_REVISION_ROUNDS) {
        stopReason = `最大${MAX_REVISION_ROUNDS}ラウンドに到達したため停止しました。`;
      }
    }

    await event(
      repo,
      projectId,
      runId,
      agentNames.planner,
      `改善ループを終了します。${stopReason}`,
      "message",
      { stopRound, stopReason, finalScore: currentScore.totalScore }
    );
    await step(
      repo,
      projectId,
      runId,
      "最終結果を確定",
      95,
      agentNames.director,
      `採用した成果物と最終${currentScore.totalScore}点を確定しています。`
    );

    const optimizedBundle = finalizeSubmissionArtifacts({
      project,
      artifacts: currentBundle
    });
    const finalScore = currentScore;

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
      "評価と改善資料が完成しました。必要な形式でエクスポートできます。",
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
