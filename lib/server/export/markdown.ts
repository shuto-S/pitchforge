import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { JudgeScore } from "@/lib/schemas/agent";
import type { Project } from "@/lib/schemas/project";
import {
  HIDDEN_EXTERNAL_URL_TEXT,
  redactCredentialBearingHttpUrls,
  safeExternalHttpUrl
} from "@/lib/safe-external-url";

function tableEscape(value: string): string {
  return markdownTextEscape(value).replaceAll("\n", " ");
}

function markdownTextEscape(value: string): string {
  const escaped = redactCredentialBearingHttpUrls(value)
    .replace(/\r\n?/gu, "\n")
    .replace(/([\\`*_[\]<>#!|~])/gu, "\\$1");

  return escaped
    .split("\n")
    .map((line) =>
      line
        .replace(/^(?: {4,}|\t+)/u, "")
        .replace(/^(\s{0,3})([-+=])/u, (_match, space, marker) => {
          return `${space}\\${marker}`;
        })
        .replace(/^(\s{0,3})(\d{1,9})([.)])(?=\s)/u, (_match, space, number, marker) => {
          return `${space}${number}\\${marker}`;
        })
    )
    .join("\n");
}

function renderProjectUrl(value: string | undefined): string {
  if (!value) {
    return "未設定";
  }
  return safeExternalHttpUrl(value) ?? HIDDEN_EXTERNAL_URL_TEXT;
}

function renderBulletList(values: readonly string[], emptyLabel = "未設定"): string {
  if (values.length === 0) {
    return `- ${emptyLabel}`;
  }
  return values.map((value) => `- ${markdownTextEscape(value)}`).join("\n");
}

function renderRelatedUrls(
  relatedUrls: ArtifactBundle["protoPediaContent"]["relatedUrls"]
): string {
  if (relatedUrls.length === 0) {
    return "- 未設定";
  }

  return relatedUrls
    .map((relatedUrl) => {
      const label = markdownTextEscape(relatedUrl.label);
      const safeUrl = safeExternalHttpUrl(relatedUrl.url);
      if (safeUrl) {
        return `- ${label}: <${safeUrl}>`;
      }
      return `- ${label}: ${HIDDEN_EXTERNAL_URL_TEXT}（安全基準外のためリンク無効）`;
    })
    .join("\n");
}

function renderChecklistItem(
  item: ArtifactBundle["checklist"]["requiredItems"][number]
): string {
  const checked = item.status === "ready" ? "x" : " ";
  const status =
    item.status === "ready"
      ? "ready / システム判定の準備済み（外部状態は要確認）"
      : item.status === "missing"
        ? "missing / 不足"
        : "needs_review / 要確認";
  return `- [${checked}] ${markdownTextEscape(item.label)}: ${markdownTextEscape(
    item.note
  )} （状態: ${status}）`;
}

function renderScoreTable(before: JudgeScore, after: JudgeScore): string {
  const afterByKey = new Map(after.categories.map((category) => [category.key, category]));
  const rows = before.categories.map((category) => {
    const final = afterByKey.get(category.key);
    return `| ${tableEscape(category.label)} | ${category.score} | ${final?.score ?? "-"} |`;
  });
  return ["| 評価項目 | 改善前 | 改善後 |", "|---|---:|---:|", ...rows].join("\n");
}

export function renderMarkdownExport(input: {
  project: Project;
  baselineScore: JudgeScore;
  finalScore: JudgeScore;
  artifacts: Omit<ArtifactBundle, "markdownExport" | "jsonExport" | "createdAt">;
}): string {
  const { project, baselineScore, finalScore, artifacts } = input;
  const script90 = artifacts.demoScripts.script90s;

  return `# ${markdownTextEscape(project.title)} プロダクト評価・改善レポート

## プロダクト概要

- プロダクト名: ${markdownTextEscape(project.title)}
- 一言説明: ${markdownTextEscape(project.oneLiner)}
- プロダクトURL: ${renderProjectUrl(project.productUrl)}
- GitHub URL: ${renderProjectUrl(project.githubUrl)}

## 改善前後の評価スコア

- 総合スコア: ${baselineScore.totalScore} -> ${finalScore.totalScore}

${renderScoreTable(baselineScore, finalScore)}

## 改善方針

### コアメッセージ

${markdownTextEscape(artifacts.directorStrategy.coreMessage)}

### 冒頭フック

${markdownTextEscape(artifacts.directorStrategy.openingHook)}

### Google Cloudの価値

${markdownTextEscape(artifacts.directorStrategy.gcpStory)}

## 90秒デモ台本

| 時間 | 画面 | ナレーション | 画面テキスト |
|---|---|---|---|
${script90.scenes
  .map(
    (scene) =>
      `| ${scene.startSec}-${scene.endSec}s | ${tableEscape(scene.visual)} | ${tableEscape(
        scene.narration
      )} | ${tableEscape(scene.onScreenText)} |`
  )
  .join("\n")}

## 紹介ページ

### タイトル

${markdownTextEscape(artifacts.protoPediaContent.title)}

### 概要

${markdownTextEscape(artifacts.protoPediaContent.overview)}

### ストーリー

#### 課題と背景

${markdownTextEscape(artifacts.protoPediaContent.story.problemBackground)}

#### 想定ユーザー

${markdownTextEscape(artifacts.protoPediaContent.story.targetUsers)}

#### 主な機能

${markdownTextEscape(artifacts.protoPediaContent.story.productFeatures)}

## システム構成

${markdownTextEscape(artifacts.protoPediaContent.systemArchitecture)}

### 構成図

ワークスペースから構成図をPNGまたはSVGで保存し、審査・レビュー資料や公開ページに利用できます。

## 開発素材・使用技術

${renderBulletList(artifacts.protoPediaContent.developmentMaterials)}

## タグ

${renderBulletList(artifacts.protoPediaContent.tags)}

## 関連URL

${renderRelatedUrls(artifacts.protoPediaContent.relatedUrls)}

## サムネイル案

${artifacts.visualConcepts.thumbnailIdeas
  .map(
    (idea) =>
      `### ${markdownTextEscape(idea.title)}\n\n- コンセプト: ${markdownTextEscape(
        idea.concept
      )}\n- レイアウト: ${markdownTextEscape(idea.layout)}\n- コピー: ${markdownTextEscape(
        idea.copy
      )}\n- 画像生成プロンプト: ${markdownTextEscape(idea.imagePrompt)}`
  )
  .join("\n\n")}

## 公開準備チェック

readyは現在の入力と生成物に基づくシステム判定です。公開URLなどアプリ外の状態は、公開や共有の前に人が再確認してください。

${artifacts.checklist.requiredItems.map(renderChecklistItem).join("\n")}

## 推奨修正

${renderBulletList(artifacts.checklist.recommendedFixes, "なし")}

## 次のアクション

${markdownTextEscape(artifacts.checklist.finalSubmissionAdvice)}
`;
}
