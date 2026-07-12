import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { JudgeScore } from "@/lib/schemas/agent";
import type { Run, RunEvent } from "@/lib/schemas/project";

const baselineCategories: JudgeScore["categories"] = [
  {
    key: "agent_centrality",
    label: "AI中核価値",
    score: 62,
    evidence: ["顧客の声を分類し、改善候補を提示できます。"],
    reason: "AIが分析を担っていますが、判断過程がまだ見えにくい状態です。",
    improvement: "優先順位の選択理由と再評価結果を明示します。"
  },
  {
    key: "problem_approach",
    label: "課題適合",
    score: 55,
    evidence: ["問い合わせとレビューを一か所に集約します。"],
    reason: "対象課題は明確ですが、導入後の変化が十分に伝わっていません。",
    improvement: "改善前後の判断時間と成果物を具体化します。"
  },
  {
    key: "usability",
    label: "使いやすさ",
    score: 58,
    evidence: ["分析結果を一つの画面で確認できます。"],
    reason: "基本操作はまとまっていますが、次の行動が分かりにくい状態です。",
    improvement: "重要な改善候補と次の操作を同じ画面に置きます。"
  },
  {
    key: "experience_value",
    label: "体験価値",
    score: 60,
    evidence: ["顧客の声から改善候補を短時間で把握できます。"],
    reason: "価値はありますが、成果の見せ方が抽象的です。",
    improvement: "FAQ案とIssue案まで一続きで見せます。"
  },
  {
    key: "implementation",
    label: "実装・運用準備",
    score: 55,
    evidence: ["Google Cloud上でWeb、AI、履歴、素材を分担しています。"],
    reason: "構成は成立していますが、運用上の説明が不足しています。",
    improvement: "サービスごとの責務と失敗時の扱いを整理します。"
  }
];

const finalCategories: JudgeScore["categories"] = baselineCategories.map((category, index) => ({
  ...category,
  score: [90, 84, 88, 86, 82][index],
  evidence: [
    ["AIが影響度と緊急度を比較し、選んだ改善と再評価結果を記録します。"],
    ["入力からFAQ案・Issue案まで、課題に直結する成果を確認できます。"],
    ["重要な改善候補と次の行動が一つのワークスペースにまとまっています。"],
    ["改善前後のスコアと生成物を短い流れで比較できます。"],
    ["Cloud Run、Gemini、Cloud SQL、Cloud Storageの責務を明示しています。"]
  ][index],
  reason: [
    "観察、判断、実行、再評価の流れが成果物に結び付いています。",
    "ユーザー課題と生成物の対応が具体的です。",
    "利用者が次に確認すべき情報を迷わず追えます。",
    "評価だけでなく、実際に使える資料まで得られます。",
    "公開、AI実行、履歴、素材管理の役割分担が明確です。"
  ][index]
}));

export const publicDemoBaselineScore: JudgeScore = {
  totalScore: 58,
  categories: baselineCategories,
  topStrengths: ["顧客の声を一か所で整理できる", "AI分析と改善提案を同じ流れで扱える"],
  criticalWeaknesses: ["AIの判断理由と成果物のつながりが見えにくい"],
  oneLineVerdict: "価値は明確ですが、判断過程と改善後の成果をさらに見せられます。"
};

export const publicDemoFinalScore: JudgeScore = {
  totalScore: 86,
  categories: finalCategories,
  topStrengths: [
    "AIの判断から成果物生成まで一続きで確認できる",
    "改善前後の差が5観点で比較できる",
    "レビューや公開に使える資料まで整う"
  ],
  criticalWeaknesses: ["実運用では入力データの品質確認が必要です。"],
  oneLineVerdict: "評価から改善資料まで一貫し、次の判断につながる状態です。"
};

export const publicDemoRun: Run = {
  id: "public-demo-run",
  projectId: "public-demo-project",
  status: "completed",
  currentStep: "改善と再評価が完了しました",
  progress: 100,
  baselineScore: publicDemoBaselineScore,
  finalScore: publicDemoFinalScore,
  startedAt: "2026-07-12T00:00:00.000Z",
  completedAt: "2026-07-12T00:02:10.000Z",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:02:10.000Z"
};

export const publicDemoEvents: RunEvent[] = [
  {
    id: "demo-event-1",
    runId: publicDemoRun.id,
    projectId: publicDemoRun.projectId,
    agentName: "プロダクト分析",
    type: "completed",
    message: "顧客の声を整理し、改善判断に必要な課題と利用者像をまとめました。",
    createdAt: "2026-07-12T00:00:20.000Z"
  },
  {
    id: "demo-event-2",
    runId: publicDemoRun.id,
    projectId: publicDemoRun.projectId,
    agentName: "品質レビュー",
    type: "completed",
    message: "初期評価は58点。AIの判断理由と成果物のつながりを改善できます。",
    createdAt: "2026-07-12T00:00:45.000Z"
  },
  {
    id: "demo-event-3",
    runId: publicDemoRun.id,
    projectId: publicDemoRun.projectId,
    agentName: "改善計画",
    type: "message",
    message: "改善ラウンド1 対象: AI中核価値、使いやすさ。判断ログと成果物導線を優先します。",
    createdAt: "2026-07-12T00:01:05.000Z"
  },
  {
    id: "demo-event-4",
    runId: publicDemoRun.id,
    projectId: publicDemoRun.projectId,
    agentName: "改善実行",
    type: "completed",
    message: "デモ台本、紹介文、公開前チェックを選択した方針に沿って更新しました。",
    createdAt: "2026-07-12T00:01:40.000Z"
  },
  {
    id: "demo-event-5",
    runId: publicDemoRun.id,
    projectId: publicDemoRun.projectId,
    agentName: "品質レビュー",
    type: "completed",
    message: "改善ラウンド1 再採点: 86点。選択した改善が評価差分と成果物に反映されました。",
    createdAt: "2026-07-12T00:02:10.000Z"
  }
];

const demoScenes = [
  {
    startSec: 0,
    endSec: 10,
    visual: "顧客の声と初期評価を表示",
    narration: "散らばった顧客の声から、いま直すべき課題を見つけます。",
    onScreenText: "Before: 判断材料が分散",
    purpose: "課題を共有する"
  },
  {
    startSec: 10,
    endSec: 55,
    visual: "AIが評価、改善対象の選択、成果物更新を実行",
    narration: "AIが5観点で評価し、必要な改善だけを選んで資料へ反映します。",
    onScreenText: "理解 → 評価 → 選択 → 改訂 → 再評価",
    purpose: "判断ループを見せる"
  },
  {
    startSec: 55,
    endSec: 90,
    visual: "改善後スコアとFAQ案・Issue案を比較",
    narration: "改善後の変化と、そのまま使える成果物を一つの画面で確認できます。",
    onScreenText: "After: 58 → 86",
    purpose: "成果を示す"
  }
];

export const publicDemoArtifacts: ArtifactBundle = {
  brief: {
    productName: "UserSignal Lake Agent",
    oneSentencePitch: "顧客の声から改善優先度と実行案をまとめるインサイト監督エージェント。",
    problem: "問い合わせやレビューが分散し、開発チームが何から直すべきか判断しにくい。",
    targetUsers: ["SaaSのプロダクトマネージャー", "カスタマーサクセス", "開発チーム"],
    coreValue: "顧客の声を、次の改善判断と実行可能な成果物へ変えること。",
    agenticBehavior: ["声を分類する", "影響度と緊急度を比較する", "改善対象を選ぶ", "成果物を再評価する"],
    gcpValue: ["Cloud Runで公開", "Geminiで理解と生成", "Cloud SQLで履歴管理", "Cloud Storageで素材管理"],
    demoMoments: ["5観点評価", "改善対象の選択", "FAQ案とIssue案", "改善前後の比較"],
    unclearPoints: []
  },
  directorStrategy: {
    coreMessage: "顧客の声を、次に直すべきプロダクト判断へ。",
    openingHook: "声は集まっている。難しいのは、どれを優先して何を作るかです。",
    mainDemoFlow: ["声を整理", "5観点評価", "改善対象を選択", "成果物を更新", "再評価"],
    whatToEmphasize: ["AIが改善対象を選ぶ判断過程", "評価と成果物が同じ画面でつながること"],
    whatToHideOrCompress: ["内部設定", "認証情報"],
    gcpStory: "Cloud RunがWeb体験、Geminiが理解と生成、Cloud SQLが履歴、Cloud Storageが素材を担います。",
    agentStory: "専門AIが理解、評価、改善設計、成果物更新、再評価を順番に進めます。",
    beforeAfterStory: "Beforeは分散した顧客の声、Afterは優先順位と実行可能なFAQ案・Issue案です。"
  },
  demoScripts: {
    script30s: { title: "30秒デモ", durationSec: 30, scenes: demoScenes.slice(0, 2).map((scene, index) => ({ ...scene, startSec: index * 15, endSec: (index + 1) * 15 })) },
    script90s: { title: "90秒デモ", durationSec: 90, scenes: demoScenes },
    script3m: { title: "3分デモ", durationSec: 180, scenes: demoScenes.map((scene) => ({ ...scene, startSec: scene.startSec * 2, endSec: scene.endSec * 2 })) }
  },
  protoPediaContent: {
    title: "UserSignal Lake Agent",
    overview: "問い合わせ、レビュー、Slackの声をまとめ、AIが改善優先度と実行案を整理します。",
    story: {
      problemBackground: "顧客の声が複数チャネルに分散し、改善判断までに時間がかかります。",
      targetUsers: "SaaSのPM、カスタマーサクセス、開発チーム。",
      productFeatures: "声の分類、優先順位づけ、FAQ案・GitHub Issue案の生成までを一つの流れで行います。"
    },
    systemArchitecture: "Cloud Run、Gemini、Cloud SQL、Cloud Storageで公開、AI処理、履歴、素材を分担します。",
    developmentMaterials: ["Next.js", "Cloud Run", "Gemini", "Cloud SQL", "Cloud Storage"],
    tags: ["product_review", "ai_agent", "google_cloud"],
    relatedUrls: []
  },
  visualConcepts: {
    thumbnailIdeas: [
      {
        title: "Signal to Decision",
        concept: "分散した顧客の声が一つの改善判断へ収束する構図。",
        layout: "左に入力、中央にAI判断、右にFAQ案とIssue案。",
        copy: "声を、次の改善へ。",
        imagePrompt: "Modern SaaS product review dashboard, signal to decision workflow, dark navy and blue interface",
        negativePrompt: "clutter, unreadable text, credentials"
      }
    ],
    keyVisualPrompt: "A modern AI product workspace turning customer signals into prioritized product decisions.",
    colorMood: "Dark navy, cloud blue, subtle indigo."
  },
  checklist: {
    requiredItems: [
      { label: "プロダクトの課題と対象ユーザー", status: "ready", note: "ブリーフに整理済みです。" },
      { label: "5観点評価と改善差分", status: "ready", note: "58点から86点の変化を確認できます。" },
      { label: "デモ台本", status: "ready", note: "30秒、90秒、3分の台本があります。" },
      { label: "公開URLの最終確認", status: "needs_review", note: "公開前に人が確認します。" }
    ],
    recommendedFixes: ["冒頭でBefore/Afterを見せる", "AIが選んだ改善理由を説明する"],
    finalSubmissionAdvice: "課題、AIの判断、成果物、改善差分の順に見せると短時間で価値が伝わります。"
  },
  markdownExport: "# UserSignal Lake Agent\n\n顧客の声から改善優先度と実行案をまとめるインサイト監督エージェント。\n\n## 評価差分\n\n58 → 86\n",
  jsonExport: { sample: true, scoreBefore: 58, scoreAfter: 86 },
  createdAt: "2026-07-12T00:02:10.000Z"
};

export const publicDemoProject = {
  title: "UserSignal Lake Agent",
  oneLiner: "顧客の声から改善優先度とFAQ・Issue案をまとめるインサイト監督エージェント。",
  problem: "問い合わせやレビューが分散し、開発チームが何から直すべきか判断しにくい。",
  aiAgentBehavior: "顧客の声を分類し、影響度と緊急度を比較して改善対象を選び、成果物を再評価します。",
  gcpUsage: "Cloud Run、Gemini、Cloud SQL、Cloud Storageが公開、AI処理、履歴、素材管理を分担します。"
} as const;
