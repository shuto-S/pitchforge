import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/schemas/project";
import { runPitchForge } from "@/lib/server/ai/orchestrator";
import { PostgresPitchForgeRepository } from "@/lib/server/db/postgres-db";
import type { ObjectStorage, UploadObjectInput } from "@/lib/server/storage/types";

const emptyStorage: ObjectStorage = {
  async saveScreenshot(input: UploadObjectInput): Promise<Asset> {
    throw new Error(`Unexpected upload in orchestrator test: ${input.fileName}`);
  },
  async readAsset(): Promise<Buffer | null> {
    return null;
  }
};

describe("orchestrator", () => {
  it("runs the mock workflow and stores artifacts", async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.DATABASE_MODE = "postgres";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? "postgres://pitchforge:pitchforge@localhost:5432/pitchforge";
    const suffix = randomUUID();
    const repo = new PostgresPitchForgeRepository();
    await repo.migrate();
    const project = await repo.createProject({
      ownerUid: `test-user-${suffix}`,
      ownerEmail: `test-user-${suffix}@example.test`,
      title: "PitchForge",
      oneLiner: "AI監督が提出物を磨く",
      description:
        "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
      problem: "提出直前に価値が伝わる形へ整理できない。",
      targetUsers: "ハッカソン参加者",
      gcpUsage: "Cloud Run, Gemini API, Cloud SQL, Cloud Storage",
      aiAgentBehavior: "作品理解、採点、改善、再採点を行う。",
      techStack: ["Cloud Run", "Gemini API"]
    });
    const run = await repo.createRun(project.id);

    const artifacts = await runPitchForge({
      projectId: project.id,
      runId: run.id,
      repo,
      storage: emptyStorage
    });

    const completedRun = await repo.getRun(project.id, run.id);
    const events = await repo.listRunEvents(project.id, run.id);
    const stored = await repo.getArtifacts(project.id, run.id);

    expect(completedRun?.status).toBe("completed");
    expect(completedRun?.finalScore).toBeTruthy();
    expect(events.length).toBeGreaterThan(3);
    expect(stored?.markdownExport).toContain("# PitchForge プロダクト評価・改善レポート");
    expect(artifacts.protoPediaContent.tags).not.toContain("findy_hackathon");
    expect(
      JSON.stringify({
        tags: artifacts.protoPediaContent.tags,
        checklist: artifacts.checklist,
        markdown: artifacts.markdownExport
      })
    ).not.toMatch(/(?:ProtoPedia|Findy|findy_hackathon|最終提出フォーム)/iu);
  });
});
