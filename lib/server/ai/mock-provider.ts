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
import type { AIProvider, GenerateJsonParams } from "@/lib/server/ai/provider";

const categories: JudgeScore["categories"] = [
  ["agent_centrality", "AIエージェント性", 84],
  ["problem_approach", "課題設定", 82],
  ["usability", "ユーザビリティ", 78],
  ["experience_value", "体験価値", 86],
  ["implementation", "実装力", 80],
  ["gcp_necessity", "GCP活用の必然性", 88],
  ["demo_impact", "デモ映え", 91],
  ["submission_readiness", "提出物完成度", 87]
].map(([key, label, score]) => ({
  key: key as JudgeScore["categories"][number]["key"],
  label: label as string,
  score: score as number,
  reason: `${label}は審査員に伝わる形で整理されています。`,
  improvement: `${label}をデモ冒頭でさらに具体化すると強くなります。`
}));

function score(totalScore: number): JudgeScore {
  const delta = totalScore >= 80 ? 0 : -28;
  return {
    totalScore,
    categories: categories.map((category) => ({
      ...category,
      score: Math.max(35, Math.min(100, category.score + delta))
    })),
    topStrengths: [
      "AI監督、審査、改善、再採点のループがエージェント性として伝わる",
      "Cloud RunとGeminiを軸にしたGCP利用価値を説明しやすい",
      "提出物生成がハッカソン直前の実課題に直結している"
    ],
    criticalWeaknesses:
      totalScore >= 80
        ? ["実デモでは生成前後の差分を短時間で見せる必要があります。"]
        : [
            "冒頭の価値説明が弱く、誰の何を改善するかがぼやけています。",
            "GCPを使う必然性が機能説明に埋もれています。"
          ],
    oneLineVerdict:
      totalScore >= 80
        ? "提出物を鍛えるAI監督スタジオとして、審査員に伝わる状態です。"
        : "素材は良いが、勝ち筋とGCP価値をまだ言い切れていません。"
  };
}

const brief: ProjectBrief = {
  productName: "PitchForge",
  oneSentencePitch:
    "雑なハッカソンプロトタイプを、審査員に伝わる提出物へ鍛えるAI監督エージェント。",
  problem:
    "実装に時間を使い切った参加者は、価値・デモ・技術説明を短時間で磨き込めない。",
  targetUsers: ["ハッカソン参加者", "短時間で提出物を整えたい開発チーム"],
  coreValue: "作品理解、辛口採点、改善、提出物生成、再採点を一気通貫で行うこと。",
  agenticBehavior: [
    "作品情報をブリーフ化する",
    "審査基準で弱点を採点する",
    "勝ち筋に沿って提出物を生成する",
    "改善後スコアを再評価する"
  ],
  gcpValue: [
    "Cloud Runで公開デモとして安定稼働する",
    "Geminiでテキストとスクリーンショットを含む作品理解を行う",
    "FirestoreとCloud Storageで履歴と成果物を保存する"
  ],
  demoMoments: [
    "雑な説明を入力する",
    "AI審査員が辛口に弱点を指摘する",
    "スコアが改善し、Proto Pedia文と台本が出る"
  ],
  unclearPoints: ["動画URLとProto Pedia URLは提出直前に補完が必要です。"]
};

const strategy: DirectorStrategy = {
  coreMessage: "作ったものを、勝てる伝え方に鍛える。",
  openingHook: "実装はできた。でも、このままでは審査員に刺さらない。",
  mainDemoFlow: [
    "粗い作品説明を入力",
    "AI審査員が弱点を可視化",
    "AI監督が勝ち筋を提示",
    "台本、提出文、サムネ案、チェックリストを生成",
    "改善後スコアを比較"
  ],
  whatToEmphasize: [
    "AIエージェントが複数役割で自律的に提出物を改善する点",
    "GCPを使うことで公開実行、AI処理、履歴保存が一つの流れになる点"
  ],
  whatToHideOrCompress: ["単なる文章生成に見える説明", "細かすぎる実装詳細"],
  gcpStory:
    "Cloud Runが提出URLを支え、Geminiが作品理解と生成を担い、Firestore/Storageが改善履歴と成果物を残します。",
  agentStory:
    "AI監督、審査員、脚本家、編集者、アートディレクター、プロデューサーが順番に作品を磨きます。",
  beforeAfterStory:
    "Beforeは雑な説明、Afterは審査観点に沿った台本と提出文、そして改善スコアです。"
};

function scripts(): DemoScripts {
  const scene = (durationSec: number) => [
    {
      startSec: 0,
      endSec: Math.min(5, durationSec),
      visual: "粗い作品説明が入力され、低いbaseline scoreが表示される",
      narration: "ハッカソンの最後、実装はできたのに伝え方がまだ弱い。",
      onScreenText: "Before: 伝わらない提出物",
      purpose: "課題を一瞬で共有する"
    },
    {
      startSec: Math.min(5, durationSec),
      endSec: Math.floor(durationSec * 0.55),
      visual: "AI監督室で複数エージェントが順番にコメントする",
      narration: "PitchForgeは審査員視点で弱点を見つけ、勝ち筋を組み立てます。",
      onScreenText: "AI監督 -> AI審査員 -> AI脚本家",
      purpose: "エージェント性を見せる"
    },
    {
      startSec: Math.floor(durationSec * 0.55),
      endSec: durationSec,
      visual: "デモ台本、Proto Pedia文、サムネ案、改善後スコアが並ぶ",
      narration: "提出に必要な素材がまとまり、GCP価値まで伝わる形になります。",
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
    "PitchForgeは、ハッカソン作品を審査員に伝わる提出物へ磨き込むAI監督エージェントです。",
  story: {
    problemBackground:
      "ハッカソンでは実装だけでなく、課題、価値、技術構成、デモの見せ場を短時間で伝える必要があります。",
    targetUsers: "提出直前にデモ動画、Proto Pedia文章、サムネイル、技術説明を整えたい開発者。",
    productFeatures:
      "AI監督室が作品理解、採点、改善方針策定、提出物生成、再採点を順番に実行します。"
  },
  systemArchitecture:
    "Next.jsアプリをCloud Runで実行し、Geminiで作品理解と生成、Firestoreでプロジェクト/履歴、Cloud Storageでスクリーンショットを保存します。",
  developmentMaterials: ["GitHub repository URL", "Cloud Run deployed URL", "Demo video URL"],
  tags: ["findy_hackathon", "google_cloud", "ai_agent", "gemini"],
  relatedUrls: [
    { label: "GitHub", url: "https://example.com/replace-with-public-repo" },
    { label: "Demo", url: "https://example.com/replace-with-demo-url" }
  ]
};

const visuals: VisualConcepts = {
  thumbnailIdeas: [
    {
      title: "Before After Director Room",
      concept: "左に弱い提出物、右にAI監督室で磨かれた提出物を対比する。",
      layout: "中央にScore 58 -> 86、背景にCloud RunとGeminiの小さな構成図。",
      copy: "その提出物、AI監督が鍛えます",
      imagePrompt:
        "Clean hackathon product thumbnail, AI director studio, before after score improvement, Cloud Run and Gemini visual motifs, high contrast, readable Japanese title",
      negativePrompt: "clutter, unreadable text, fake logos, secret keys, credentials"
    }
  ],
  keyVisualPrompt:
    "A polished AI director room for hackathon submissions, multiple agents reviewing a prototype, Cloud Run and Gemini represented as infrastructure lights.",
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
      note: "Cloud Runの公開URLを提出欄に貼ります。"
    },
    {
      label: "Proto Pedia URL",
      status: "missing",
      note: "提出ページ作成後にURLを補完してください。"
    },
    {
      label: "動画URL",
      status: "missing",
      note: "90秒台本をもとに録画して追加してください。"
    },
    {
      label: "GCP実行基盤の説明",
      status: "ready",
      note: "Cloud Runで実行している価値を説明できます。"
    },
    {
      label: "Google Cloud AI技術の説明",
      status: "ready",
      note: "Geminiによる作品理解と生成を説明できます。"
    },
    {
      label: "findy_hackathon タグ",
      status: "ready",
      note: "Proto Pedia tagsに含めています。"
    }
  ],
  recommendedFixes: [
    "冒頭5秒でBefore/Afterを見せる",
    "Cloud Run、Gemini、Firestore、Storageの役割を一文で説明する",
    "公開リポジトリのsecret scanを提出前に行う"
  ],
  finalSubmissionAdvice:
    "デモでは入力、辛口採点、監督戦略、生成物、改善後スコアの順に見せてください。"
};

const generated: GeneratedArtifacts = {
  brief,
  directorStrategy: strategy,
  demoScripts: scripts(),
  protoPediaContent: proto,
  visualConcepts: visuals,
  checklist
};

export class MockAIProvider implements AIProvider {
  async generateJson<T>(params: GenerateJsonParams): Promise<T> {
    switch (params.schemaName) {
      case "ProjectBrief":
        return brief as T;
      case "JudgeScoreBaseline":
        return score(58) as T;
      case "JudgeScoreDraft":
        return score(76) as T;
      case "JudgeScoreFinal":
      case "JudgeScore":
        return score(86) as T;
      case "DirectorStrategy":
        return strategy as T;
      case "DemoScripts":
        return scripts() as T;
      case "ProtoPediaContent":
        return proto as T;
      case "VisualConcepts":
        return visuals as T;
      case "SubmissionChecklist":
        return checklist as T;
      case "GeneratedArtifacts":
        return generated as T;
      default:
        return generated as T;
    }
  }
}
