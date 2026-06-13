import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPitchForge } from "@/lib/server/ai/orchestrator";
import { LocalPitchForgeRepository } from "@/lib/server/db/local-db";
import { LocalObjectStorage } from "@/lib/server/storage/local-storage";

describe("orchestrator", () => {
  it("runs the mock workflow and stores artifacts", async () => {
    process.env.AI_PROVIDER = "mock";
    const localDir = await mkdtemp(path.join(tmpdir(), "pitchforge-test-"));
    const repo = new LocalPitchForgeRepository(localDir);
    const storage = new LocalObjectStorage(localDir);
    const project = await repo.createProject({
      ownerUid: "test-user",
      ownerEmail: "test-user@example.test",
      title: "PitchForge",
      oneLiner: "AI監督が提出物を磨く",
      description:
        "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
      problem: "提出直前に価値が伝わる形へ整理できない。",
      targetUsers: "ハッカソン参加者",
      gcpUsage: "Cloud Run, Gemini API, Firestore, Cloud Storage",
      aiAgentBehavior: "作品理解、採点、改善、再採点を行う。",
      techStack: ["Cloud Run", "Gemini API"]
    });
    const run = await repo.createRun(project.id);

    const artifacts = await runPitchForge({
      projectId: project.id,
      runId: run.id,
      repo,
      storage
    });

    const completedRun = await repo.getRun(project.id, run.id);
    const events = await repo.listRunEvents(project.id, run.id);
    const stored = await repo.getArtifacts(project.id, run.id);

    expect(completedRun?.status).toBe("completed");
    expect(completedRun?.finalScore).toBeTruthy();
    expect(events.length).toBeGreaterThan(3);
    expect(stored?.markdownExport).toContain("# PitchForge Output");
    expect(artifacts.protoPediaContent.tags).toContain("findy_hackathon");
  });
});
