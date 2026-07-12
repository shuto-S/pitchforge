import type { GeneratedArtifacts } from "@/lib/schemas/artifact";
import type {
  DemoScripts,
  DirectorStrategy,
  JudgeScore,
  ProjectBrief,
  ProtoPediaContent,
  RevisionAction,
  RevisionPlan,
  SubmissionChecklist,
  VisualConcepts
} from "@/lib/schemas/agent";
import type { AIProvider, GenerateJsonParams } from "@/lib/server/ai/provider";

const categoryDefinitions: Array<
  Pick<JudgeScore["categories"][number], "key" | "label" | "evidence" | "reason" | "improvement">
> = [
  {
    key: "agent_centrality",
    label: "AI中核価値",
    evidence: ["複数のAIエージェントが評価、計画、成果物改訂、再評価を順番に実行します。"],
    reason: "判断とタスク実行を伴う改善ループが中核体験になっています。",
    improvement: "各ラウンドの選択理由と停止理由をデモで明示します。"
  },
  {
    key: "problem_approach",
    label: "課題適合",
    evidence: ["プロダクトチーム向けに評価、デモ台本、公開文、チェックリストを生成します。"],
    reason: "対象ユーザーとレビュー準備の課題に生成物が直接対応しています。",
    improvement: "Before/Afterで準備時間と品質差を具体化します。"
  },
  {
    key: "usability",
    label: "使いやすさ",
    evidence: ["プロダクト情報と画像を入力すると、一度の実行で評価と改善資料を確認できます。"],
    reason: "入力から評価、改善、成果物確認までが一つのワークスペースにまとまっています。",
    improvement: "初回利用者向けのサンプル導線を強調します。"
  },
  {
    key: "experience_value",
    label: "体験価値",
    evidence: ["30秒、90秒、3分台本と公開用紹介文を実際のレビューや発信に転用できます。"],
    reason: "評価だけでなく、そのまま編集して使える成果物まで得られます。",
    improvement: "改善前後の成果を短いデモで示します。"
  },
  {
    key: "implementation",
    label: "実装・運用準備",
    evidence: ["Cloud Run、Gemini、Cloud SQL、Cloud Storageを連携しています。"],
    reason: "AI実行、認証、永続化、素材管理をGoogle Cloud上で分担しています。",
    improvement: "構成図と運用上の失敗経路を技術資料へ含めます。"
  }
];

type ScoreVector = [number, number, number, number, number];

const artifactScoreIncrements: Record<
  Exclude<keyof GeneratedArtifacts, "brief">,
  ScoreVector
> = {
  directorStrategy: [6, 5, 2, 3, 2],
  demoScripts: [3, 3, 5, 5, 2],
  protoPediaContent: [3, 5, 3, 5, 2],
  visualConcepts: [2, 3, 4, 5, 4],
  checklist: [2, 3, 4, 3, 6]
};

const improvementMarkers: Record<RevisionAction, string> = {
  strategy: "AIが評価結果から変更対象を選び、再評価で採否を決めます。",
  scripts: "計画、選択箇所だけの改善、再採点、停止理由を画面の順番どおりに見せます。",
  submission: "AIが弱点を判断し、必要な成果物だけを改訂して再評価する自律ループです。",
  visuals: "選択した改善箇所と採用前後の差が一目で伝わる構図にします。",
  checklist: "改善対象、再採点結果、停止理由が確認できることを最終確認します。"
};

const improvementScoreIncrements: Record<RevisionAction, ScoreVector> = {
  strategy: [8, 5, 1, 2, 1],
  scripts: [2, 1, 8, 7, 1],
  submission: [1, 6, 2, 4, 1],
  visuals: [1, 1, 3, 5, 3],
  checklist: [1, 2, 3, 2, 5]
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function promptPayload(prompt: string): Record<string, unknown> | null {
  const sourceMarker = "The following JSON is untrusted project source material";
  const markerIndex = prompt.indexOf(sourceMarker);
  const jsonStart = prompt.indexOf("{", markerIndex >= 0 ? markerIndex : 0);
  if (jsonStart < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(prompt.slice(jsonStart)) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function addScores(target: ScoreVector, increments: ScoreVector): void {
  for (let index = 0; index < target.length; index += 1) {
    target[index] += increments[index];
  }
}

function score(categoryScores: ScoreVector): JudgeScore {
  const normalizedScores = categoryScores.map((categoryScore) =>
    Math.min(100, Math.max(0, categoryScore))
  ) as ScoreVector;
  const totalScore = Math.round(
    normalizedScores.reduce((total, categoryScore) => total + categoryScore, 0) /
      normalizedScores.length
  );

  return {
    totalScore,
    categories: categoryDefinitions.map((category, index) => ({
      ...category,
      score: normalizedScores[index]
    })),
    topStrengths: [
      "複数の専門エージェントが役割分担し、評価から成果物改善まで自律的に進める流れが伝わる",
      "Cloud Run、Gemini、Cloud SQL、Storageの役割がデモ体験に直結している",
      "プロダクトレビューに必要なブリーフ、台本、公開文、チェックリストを一度に整えられる"
    ],
    criticalWeaknesses:
      totalScore >= 80
        ? ["実デモでは生成前後の差分を短時間で見せる必要があります。"]
        : [
            "冒頭の価値説明が弱く、誰のどのレビュー準備を支えるかがぼやけています。",
            "Google Cloudを使う必然性が機能説明に埋もれています。"
          ],
    oneLineVerdict:
      totalScore >= 80
        ? "評価から改善資料まで一貫し、プロダクトの価値が伝わる状態です。"
        : "素材は良いものの、改善方針とGoogle Cloudの価値をさらに明確にできます。"
  };
}

function scoreFromPrompt(prompt: string): JudgeScore {
  const payload = promptPayload(prompt);
  const categoryScores: ScoreVector = [45, 45, 45, 45, 45];

  if (isRecord(payload?.context) && isRecord(payload.context.project)) {
    addScores(categoryScores, [5, 5, 5, 5, 5]);
  }
  if (isRecord(payload?.brief)) {
    addScores(categoryScores, [8, 8, 8, 8, 8]);
  }

  const artifacts = isRecord(payload?.artifacts) ? payload.artifacts : null;
  if (artifacts) {
    for (const [artifactKey, increments] of Object.entries(artifactScoreIncrements)) {
      if (isRecord(artifacts[artifactKey])) {
        addScores(categoryScores, increments);
      }
    }

    const artifactText = JSON.stringify(artifacts);
    for (const action of Object.keys(improvementMarkers) as RevisionAction[]) {
      if (artifactText.includes(improvementMarkers[action])) {
        addScores(categoryScores, improvementScoreIncrements[action]);
      }
    }
  }

  return score(categoryScores);
}

function appendSentence(value: string, sentence: string): string {
  if (value.includes(sentence)) {
    return value;
  }
  const separator = /[。！？]$/.test(value) ? "" : "。";
  return `${value}${separator}${sentence}`;
}

const revisionPlan: RevisionPlan = {
  decision: "continue",
  focusCriteria: ["agent_centrality", "usability"],
  actions: ["strategy", "scripts", "submission"],
  targetScore: 85,
  target: "AIの判断過程とレビュアーが追いやすいデモ導線を具体化する",
  reason: "現在の成果物は強いものの、自律的な選択と利用導線をさらに明示できます。"
};

const brief: ProjectBrief = {
  productName: "PitchForge",
  oneSentencePitch:
    "プロダクトを5つの観点で評価し、改善から審査・レビュー向け資料作成まで支えるAIワークスペース。",
  problem:
    "プロダクト開発に集中したチームは、価値、UX、デモ、技術説明、公開文を客観的に磨く時間を確保しにくい。",
  targetUsers: ["プロダクトチーム", "審査・レビューや公開前に説明資料を整えたい開発チーム"],
  coreValue: "プロダクト理解、5観点評価、改善設計、資料生成、再評価を一気通貫で行うこと。",
  agenticBehavior: [
    "プロダクト情報をブリーフ化する",
    "5つの評価観点で弱点を採点する",
    "改善方針に沿って審査・レビュー向け資料を生成する",
    "改善後スコアを再評価し、不足項目を補強する"
  ],
  gcpValue: [
    "Cloud Runでチームとレビュアーが利用できるWebサービスとして稼働する",
    "Cloud SQLのauth_usersで事前登録アカウントとユーザー分離を管理する",
    "Geminiでテキストとスクリーンショットを含む作品理解を行う",
    "Cloud SQLとCloud Storageで履歴、素材、成果物を保存する"
  ],
  demoMoments: [
    "プロダクト情報と画面素材を入力する",
    "AIレビューが5観点で弱点を示す",
    "スコアが改善し、デモ台本と公開用紹介文が生成される"
  ],
  unclearPoints: ["プロダクトURLの共有範囲とデモ内容は公開前に確認が必要です。"]
};

const strategy: DirectorStrategy = {
  coreMessage: "プロダクトの価値を評価し、次に直すべき点と伝え方を一つにする。",
  openingHook: "動くプロダクトも、価値と改善点が伝わらなければ次の判断につながりません。",
  mainDemoFlow: [
    "プロダクト情報と画面素材を入力",
    "AIレビューが5観点で弱点を可視化",
    "AIストラテジストが改善方針を提示",
    "デモ台本、公開文、ビジュアル案、チェックリストを生成",
    "改善後スコアを比較"
  ],
  whatToEmphasize: [
    "AIエージェントが複数役割で自律的にプロダクト資料を改善する点",
    "Google Cloudを使うことで公開実行、認証、AI処理、履歴保存、素材管理が一つの流れになる点"
  ],
  whatToHideOrCompress: ["単なる文章生成に見える説明", "細かすぎる実装詳細", "認証情報や内部設定値"],
  gcpStory:
    "Cloud RunがWebサービスを支え、Cloud SQLが事前登録アカウントと改善履歴を管理し、Geminiがプロダクト理解と生成、Cloud Storageが素材保存を担います。",
  agentStory:
    "分析、レビュー、改善設計、デモ設計、編集、ビジュアル設計の専門エージェントが順番にプロダクトを磨きます。",
  beforeAfterStory:
    "Beforeは整理前の情報、Afterは5つの評価観点に沿った台本、公開文、見せ方、そして改善スコアです。"
};

function scripts(): DemoScripts {
  const scene = (durationSec: number) => [
    {
      startSec: 0,
      endSec: Math.min(5, durationSec),
      visual: "プロダクト情報が入力され、改善前スコアが表示される",
      narration: "プロダクトは動いている。次は、価値と改善点を客観的に捉えます。",
      onScreenText: "Before: 整理前のプロダクト情報",
      purpose: "課題を一瞬で共有する"
    },
    {
      startSec: Math.min(5, durationSec),
      endSec: Math.floor(durationSec * 0.55),
      visual: "複数の専門AIが評価、改善設計、資料生成を順番に進める",
      narration: "PitchForgeは5つの観点で弱点を見つけ、必要な成果物だけを改善します。",
      onScreenText: "評価 -> 改善計画 -> 資料生成 -> 再評価",
      purpose: "エージェント性を見せる"
    },
    {
      startSec: Math.floor(durationSec * 0.55),
      endSec: durationSec,
      visual: "デモ台本、公開用紹介文、ビジュアル案、改善後スコアが並ぶ",
      narration: "レビューと公開に使える資料がまとまり、次のアクションが明確になります。",
      onScreenText: "After: Score 58 -> 86",
      purpose: "成果を示す"
    }
  ];

  return {
    script30s: { title: "30秒デモ", durationSec: 30, scenes: scene(30) },
    script90s: { title: "90秒デモ", durationSec: 90, scenes: scene(90) },
    script3m: { title: "3分デモ", durationSec: 180, scenes: scene(180) }
  };
}

const proto: ProtoPediaContent = {
  title: "PitchForge",
  overview:
    "PitchForgeは、プロダクトを5つの観点で評価し、改善から審査・レビュー向け資料作成まで支えるAIワークスペースです。",
  story: {
    problemBackground:
      "開発チームは実装を進めながら、課題、価値、UX、技術構成、デモの見せ場を客観的に評価し、関係者へ伝わる形へ整える必要があります。複数の資料を個別に作ると、評価と説明が分断されます。",
    targetUsers:
      "審査、レビュー、公開、営業デモの前にプロダクトの評価と説明資料を整えたい開発・プロダクトチーム。",
    productFeatures:
      "複数のAIエージェントがプロダクト理解、5観点評価、改善方針策定、資料生成、再評価を順番に実行します。"
  },
  systemArchitecture:
    "Next.jsアプリをCloud Runで実行し、Cloud SQLのauth_usersに事前登録したIDとパスワードハッシュで認証します。署名付きhttpOnlyセッションでAPIを保護し、Geminiで作品理解と生成、Cloud SQLで履歴、Cloud Storageでスクリーンショットを保存します。",
  developmentMaterials: ["Next.js", "Cloud Run", "Cloud SQL", "Gemini", "Cloud Storage"],
  tags: ["product_review", "google_cloud", "ai_agent", "gemini"],
  relatedUrls: [
    { label: "GitHub", url: "https://example.com/replace-with-public-repo" },
    { label: "Demo", url: "https://example.com/replace-with-demo-url" }
  ]
};

const visuals: VisualConcepts = {
  thumbnailIdeas: [
    {
      title: "Product Before / After",
      concept: "左に整理前のプロダクト情報、右にAIが改善したレビュー資料を対比する。",
      layout: "中央にScore 58 -> 86、背景にCloud Run、Gemini、Cloud SQLの小さな構成図。",
      copy: "評価から改善まで、プロダクトの次を明確に。",
      imagePrompt:
        "Clean SaaS product thumbnail, AI product readiness workspace, before and after score improvement, Cloud Run Gemini Cloud SQL visual motifs, high contrast, readable Japanese title",
      negativePrompt: "clutter, unreadable text, fake logos, secret keys, credentials"
    }
  ],
  keyVisualPrompt:
    "A polished AI product readiness workspace, multiple specialist agents reviewing and improving a product, with Cloud Run, Gemini, Cloud SQL, and Cloud Storage represented as infrastructure panels.",
  colorMood: "Warm paper base, black editorial typography, orange forge accent, Google Cloud blue."
};

const checklist: SubmissionChecklist = {
  requiredItems: [
    {
      label: "GitHub公開リポジトリURL",
      status: "needs_review",
      note: "public repoに秘密情報が含まれていないことを確認してください。"
    },
    {
      label: "デプロイ済みプロジェクトURL",
      status: "needs_review",
      note: "Cloud Runの公開URLがレビュー環境で利用できることを確認してください。"
    },
    {
      label: "紹介ページ",
      status: "ready",
      note: "プロダクト概要、課題、機能、技術構成を生成しています。"
    },
    {
      label: "デモ台本",
      status: "ready",
      note: "90秒台本を含む3種類の台本を生成しています。"
    },
    {
      label: "GCP実行基盤の説明",
      status: "ready",
      note: "Cloud Runで公開URLとして実行している価値を説明できます。"
    },
    {
      label: "事前登録ログインとユーザー別データ分離",
      status: "ready",
      note: "Cloud SQLのauth_usersとownerUid分離でレビュー用アカウントを安全に限定できます。"
    },
    {
      label: "Google Cloud AI技術の説明",
      status: "ready",
      note: "Geminiによるプロダクト理解と生成を説明できます。"
    },
    {
      label: "機密情報の確認",
      status: "needs_review",
      note: "公開前に画面、URL、資料へ認証情報が含まれていないことを確認してください。"
    }
  ],
  recommendedFixes: [
    "冒頭5秒でBefore/Afterを見せる",
    "Cloud Run、Gemini、Cloud SQL、Storageの役割を一文で説明する",
    "公開リポジトリのsecret scanを公開前に行う"
  ],
  finalSubmissionAdvice:
    "デモでは入力、5観点評価、改善方針、生成物、改善後スコアの順に見せてください。"
};

const generated: GeneratedArtifacts = {
  brief,
  directorStrategy: strategy,
  demoScripts: scripts(),
  protoPediaContent: proto,
  visualConcepts: visuals,
  checklist
};

function artifactsFromPrompt(prompt: string): GeneratedArtifacts {
  const payload = promptPayload(prompt);
  const currentBundle = payload?.currentBundle;
  if (
    !isRecord(currentBundle) ||
    !isRecord(currentBundle.brief) ||
    !isRecord(currentBundle.directorStrategy) ||
    !isRecord(currentBundle.demoScripts) ||
    !isRecord(currentBundle.protoPediaContent) ||
    !isRecord(currentBundle.visualConcepts) ||
    !isRecord(currentBundle.checklist)
  ) {
    return clone(generated);
  }
  return clone(currentBundle as GeneratedArtifacts);
}

function revisionActionsFromPrompt(prompt: string): RevisionAction[] {
  const payload = promptPayload(prompt);
  const plan = payload?.revisionPlan;
  if (!isRecord(plan) || !Array.isArray(plan.actions)) {
    return [];
  }

  const allowedActions = new Set<RevisionAction>([
    "strategy",
    "scripts",
    "submission",
    "visuals",
    "checklist"
  ]);
  return plan.actions.filter(
    (action): action is RevisionAction =>
      typeof action === "string" && allowedActions.has(action as RevisionAction)
  );
}

function optimizedArtifacts(prompt: string): GeneratedArtifacts {
  const candidate = artifactsFromPrompt(prompt);
  const actions = revisionActionsFromPrompt(prompt);

  for (const action of actions) {
    const marker = improvementMarkers[action];
    switch (action) {
      case "strategy":
        candidate.directorStrategy.agentStory = appendSentence(
          candidate.directorStrategy.agentStory,
          marker
        );
        break;
      case "scripts": {
        const scene = candidate.demoScripts.script90s.scenes[0];
        if (scene) {
          scene.purpose = appendSentence(scene.purpose, marker);
        } else {
          candidate.demoScripts.script90s.title = appendSentence(
            candidate.demoScripts.script90s.title,
            marker
          );
        }
        break;
      }
      case "submission":
        candidate.protoPediaContent.story.productFeatures = appendSentence(
          candidate.protoPediaContent.story.productFeatures,
          marker
        );
        break;
      case "visuals":
        candidate.visualConcepts.keyVisualPrompt = appendSentence(
          candidate.visualConcepts.keyVisualPrompt,
          marker
        );
        break;
      case "checklist":
        candidate.checklist.finalSubmissionAdvice = appendSentence(
          candidate.checklist.finalSubmissionAdvice,
          marker
        );
        break;
    }
  }

  return candidate;
}

function projectImportDraftFromPrompt(prompt: string) {
  const payload = promptPayload(prompt);
  const fallback = isRecord(payload?.fallbackDraft) ? payload.fallbackDraft : null;
  if (!fallback) {
    throw new Error("Mock ProjectImportDraft requires fallbackDraft");
  }
  return {
    title: fallback.title,
    oneLiner: fallback.oneLiner,
    description: fallback.description,
    problem: fallback.problem,
    targetUsers: fallback.targetUsers,
    gcpUsage: fallback.gcpUsage,
    aiAgentBehavior: fallback.aiAgentBehavior,
    techStack: fallback.techStack
  };
}

export class MockAIProvider implements AIProvider {
  async generateJson<T>(params: GenerateJsonParams): Promise<T> {
    switch (params.schemaName) {
      case "ProjectBrief":
        return clone(brief) as T;
      case "JudgeScoreBaseline":
      case "JudgeScoreDraft":
      case "JudgeScoreRevision":
      case "JudgeScoreFinal":
      case "JudgeScore":
        return scoreFromPrompt(params.prompt) as T;
      case "DirectorStrategy":
        return clone(strategy) as T;
      case "DemoScripts":
        return clone(scripts()) as T;
      case "ProtoPediaContent":
        return clone(proto) as T;
      case "VisualConcepts":
        return clone(visuals) as T;
      case "SubmissionChecklist":
        return clone(checklist) as T;
      case "RevisionPlan":
        return clone(revisionPlan) as T;
      case "GeneratedArtifacts":
        return optimizedArtifacts(params.prompt) as T;
      case "ProjectImportDraft":
        return clone(projectImportDraftFromPrompt(params.prompt)) as T;
      default:
        throw new Error(`Unsupported mock schema: ${params.schemaName}`);
    }
  }
}
