import { getRepository } from "@/lib/server/db";

process.env.DATASTORE_MODE = process.env.DATASTORE_MODE ?? "local";
process.env.STORAGE_MODE = process.env.STORAGE_MODE ?? "local";
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? "mock";

const repo = getRepository();

const project = await repo.createProject({
  ownerUid: "seed-user",
  ownerEmail: "seed-user@example.test",
  title: "UserSignal Lake Agent",
  oneLiner: "ユーザーの声をAIで分類するやつ。GCPを使っています。",
  description:
    "問い合わせ、レビュー、Slackの声をまとめて、何から改善すべきかをAIが判断するプロトタイプです。まだ提出文やデモ台本が弱く、価値が伝わりにくい状態です。",
  problem: "問い合わせやレビューが多すぎて、開発チームが何から直すべきかわからない。",
  targetUsers: "SaaSのPM、カスタマーサクセス、開発チーム",
  productUrl: undefined,
  githubUrl: undefined,
  gcpUsage: "Cloud RunでWebアプリを実行し、Gemini APIで分類と要約、BigQueryで分析します。",
  aiAgentBehavior:
    "ユーザーの声を分類し、改善優先度を判断し、FAQ案とGitHub Issue案を生成する。",
  techStack: ["Cloud Run", "Gemini API", "BigQuery", "Firestore"]
});

console.log(`Seeded demo project: ${project.id}`);
