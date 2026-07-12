import { describe, expect, it } from "vitest";
import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { Asset, Project, Run, RunEvent } from "@/lib/schemas/project";
import {
  NO_USABLE_BRIEF_IMAGE_ERROR,
  runPitchForge
} from "@/lib/server/ai/orchestrator";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import type { PitchForgeRepository } from "@/lib/server/db/types";
import type { ObjectStorage, UploadObjectInput } from "@/lib/server/storage/types";

const timestamp = "2026-07-12T00:00:00.000Z";

describe("orchestrator image diagnostics", () => {
  it("emits a secret-free warning and continues when some images are unreadable", async () => {
    const assets = [asset("unreadable"), asset("usable")];
    const secret = "gs://private-bucket-name/users/secret-object.png";
    const harness = createHarness(assets, async (input) => {
      if (input.id === "unreadable") {
        throw new Error(`Access denied for ${secret}`);
      }
      return Buffer.from("usable image");
    });

    await runPitchForge({
      projectId: harness.project.id,
      runId: harness.run.id,
      repo: harness.repo,
      storage: harness.storage,
      provider: new MockAIProvider()
    });

    expect(harness.run.status).toBe("completed");
    const warning = harness.events.find((entry) => entry.message.startsWith("警告:"));
    expect(warning).toMatchObject({
      agentName: "プロダクト分析",
      type: "message",
      payload: { level: "warning", unreadableCount: 1 }
    });
    expect(JSON.stringify(harness.events)).not.toContain(secret);
    expect(JSON.stringify(harness.events)).not.toContain("private-bucket-name");
  });

  it("fails with a fixed secret-free error when assets exist but none are usable", async () => {
    const assets = [asset("failure"), asset("null")];
    const secret = "postgres://user:password@private-host/image-metadata";
    const harness = createHarness(assets, async (input) => {
      if (input.id === "failure") {
        throw new Error(secret);
      }
      return null;
    });

    await expect(
      runPitchForge({
        projectId: harness.project.id,
        runId: harness.run.id,
        repo: harness.repo,
        storage: harness.storage,
        provider: new MockAIProvider()
      })
    ).rejects.toThrow(NO_USABLE_BRIEF_IMAGE_ERROR);

    expect(harness.run).toMatchObject({
      status: "failed",
      currentStep: "failed",
      errorMessage: NO_USABLE_BRIEF_IMAGE_ERROR
    });
    expect(harness.events.at(-1)).toMatchObject({
      type: "failed",
      message: NO_USABLE_BRIEF_IMAGE_ERROR
    });
    expect(JSON.stringify(harness.events)).not.toContain(secret);
    expect(JSON.stringify(harness.events)).not.toContain("private-host");
  });
});

function asset(id: string): Asset {
  return {
    id,
    projectId: "project_image_diagnostics",
    ownerUid: "owner_image_diagnostics",
    kind: "screenshot",
    fileName: `${id}.png`,
    mimeType: "image/png",
    sizeBytes: 16,
    storageUri: `gs://fixture/${id}.png`,
    createdAt: timestamp
  };
}

function createHarness(
  assets: Asset[],
  readAsset: (asset: Asset) => Promise<Buffer | null>
) {
  const project: Project = {
    id: "project_image_diagnostics",
    ownerUid: "owner_image_diagnostics",
    ownerEmail: "owner@example.test",
    title: "Image diagnostics",
    oneLiner: "Continue safely when only part of the image evidence is readable",
    description:
      "A project fixture that verifies secret-free image diagnostics in the agent workflow.",
    problem: "Storage failures can otherwise be silently ignored.",
    targetUsers: "Hackathon teams",
    productUrl: "https://product.example.test",
    githubUrl: "https://github.com/example/image-diagnostics",
    gcpUsage: "Cloud Run, Gemini, Cloud SQL, Cloud Storage",
    aiAgentBehavior: "Load evidence, generate artifacts, judge, and revise.",
    techStack: ["Next.js", "Gemini"],
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const run: Run = {
    id: "run_image_diagnostics",
    projectId: project.id,
    status: "queued",
    currentStep: "queued",
    progress: 0,
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const events: RunEvent[] = [];
  let artifacts: ArtifactBundle | null = null;

  const repo = {
    async getProject() {
      return project;
    },
    async listAssets() {
      return assets;
    },
    async updateRun(_projectId: string, _runId: string, patch: Partial<Run>) {
      Object.assign(run, patch);
      return { ...run };
    },
    async addRunEvent(entry: RunEvent) {
      events.push(entry);
      return entry;
    },
    async saveArtifacts(
      _projectId: string,
      _runId: string,
      nextArtifacts: ArtifactBundle
    ) {
      artifacts = nextArtifacts;
    }
  } as unknown as PitchForgeRepository;

  const storage: ObjectStorage = {
    async saveScreenshot(input: UploadObjectInput): Promise<Asset> {
      throw new Error(`Unexpected upload: ${input.fileName}`);
    },
    readAsset
  };

  return { project, run, events, repo, storage, getArtifacts: () => artifacts };
}
