import { getRepository } from "@/lib/server/db";
import { getRuntimeConfig } from "@/lib/server/config";

process.env.DATABASE_MODE = process.env.DATABASE_MODE ?? "postgres";
process.env.STORAGE_MODE = process.env.STORAGE_MODE ?? "gcs";
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? "gemini";

const repo = getRepository();
const config = getRuntimeConfig();

const project = await repo.createProject({
  ownerUid: config.localAuthUid,
  ownerEmail: config.localAuthEmail,
  title: "UserSignal Lake Agent",
  oneLiner:
    "問い合わせ・レビュー・Slackの声から改善優先度を判断し、FAQとGitHub Issueまで起案するインサイト監督エージェント。",
  description:
    "問い合わせ、レビュー、Slackの声をまとめて、何から改善すべきかをAIが判断するプロトタイプです。入力から分類、改善提案、Issue起案までを短いデモで見せます。",
  problem: "問い合わせやレビューが多すぎて、開発チームが何から直すべきかを判断できない。",
  targetUsers: "SaaSのPM、カスタマーサクセス、開発チーム",
  productUrl: undefined,
  githubUrl: undefined,
  gcpUsage:
    "Cloud RunでWeb/APIを公開し、Gemini APIで分類・要約・改善案生成を行います。Cloud SQLに分析履歴を保存し、Cloud Storageにアップロード資料を保管します。",
  aiAgentBehavior:
    "ユーザーの声を分類し、影響度と緊急度から改善優先度を判断し、FAQ案とGitHub Issue案を自律的に生成する。",
  techStack: ["Cloud Run", "Gemini API", "Cloud SQL", "Cloud Storage"]
});

console.log(`Seeded demo project: ${project.id}`);
console.log(`Open demo workspace: http://localhost:3000/projects/${project.id}`);
