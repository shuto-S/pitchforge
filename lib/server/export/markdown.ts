import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { JudgeScore } from "@/lib/schemas/agent";
import type { Project } from "@/lib/schemas/project";

function tableEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderScoreTable(before: JudgeScore, after: JudgeScore): string {
  const afterByKey = new Map(after.categories.map((category) => [category.key, category]));
  const rows = before.categories.map((category) => {
    const final = afterByKey.get(category.key);
    return `| ${tableEscape(category.label)} | ${category.score} | ${final?.score ?? "-"} |`;
  });
  return ["| Category | Before | After |", "|---|---:|---:|", ...rows].join("\n");
}

export function renderMarkdownExport(input: {
  project: Project;
  baselineScore: JudgeScore;
  finalScore: JudgeScore;
  artifacts: Omit<ArtifactBundle, "markdownExport" | "jsonExport" | "createdAt">;
}): string {
  const { project, baselineScore, finalScore, artifacts } = input;
  const script90 = artifacts.demoScripts.script90s;

  return `# PitchForge Output

## Project

- Title: ${project.title}
- One-liner: ${project.oneLiner}
- Product URL: ${project.productUrl ?? "TBD"}
- GitHub URL: ${project.githubUrl ?? "TBD"}

## Before / After Score

- Total: ${baselineScore.totalScore} -> ${finalScore.totalScore}

${renderScoreTable(baselineScore, finalScore)}

## Director Strategy

### Core Message

${artifacts.directorStrategy.coreMessage}

### Opening Hook

${artifacts.directorStrategy.openingHook}

### GCP Story

${artifacts.directorStrategy.gcpStory}

## 90-second Demo Script

| Time | Visual | Narration | On-screen Text |
|---|---|---|---|
${script90.scenes
  .map(
    (scene) =>
      `| ${scene.startSec}-${scene.endSec}s | ${tableEscape(scene.visual)} | ${tableEscape(
        scene.narration
      )} | ${tableEscape(scene.onScreenText)} |`
  )
  .join("\n")}

## Proto Pedia Content

### Overview

${artifacts.protoPediaContent.overview}

### Story

#### Problem and Background

${artifacts.protoPediaContent.story.problemBackground}

#### Target Users

${artifacts.protoPediaContent.story.targetUsers}

#### Product Features

${artifacts.protoPediaContent.story.productFeatures}

## System Architecture

${artifacts.protoPediaContent.systemArchitecture}

## Thumbnail Ideas

${artifacts.visualConcepts.thumbnailIdeas
  .map(
    (idea) =>
      `### ${idea.title}\n\n- Concept: ${idea.concept}\n- Layout: ${idea.layout}\n- Copy: ${idea.copy}\n- Prompt: ${idea.imagePrompt}`
  )
  .join("\n\n")}

## Submission Checklist

${artifacts.checklist.requiredItems
  .map((item) => `- [${item.status === "ready" ? "x" : " "}] ${item.label}: ${item.note}`)
  .join("\n")}

## Final Advice

${artifacts.checklist.finalSubmissionAdvice}
`;
}
