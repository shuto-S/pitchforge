import { describe, expect, it } from "vitest";
import { generatedArtifactsSchema, type GeneratedArtifacts } from "@/lib/schemas/artifact";
import type { Project } from "@/lib/schemas/project";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import { adaptArtifactsForFindyHackathon } from "@/lib/server/submission/findy-hackathon";
import { finalizeSubmissionArtifacts } from "@/lib/server/submission/finalize";

const project: Project = {
  id: "project_findy_adapter_test",
  ownerUid: "owner_findy_adapter_test",
  ownerEmail: "owner@example.test",
  title: "PitchForge",
  oneLiner: "Evaluate products and create review materials",
  description: "A product fixture long enough to exercise the event publishing adapter.",
  problem: "Event requirements should not leak into the normal product workflow.",
  targetUsers: "Product teams",
  productUrl: "https://pitchforge.example.test",
  githubUrl: "https://github.com/example/pitchforge",
  gcpUsage: "Cloud Run and Vertex AI",
  aiAgentBehavior: "Generate, judge, revise, and stop.",
  techStack: ["Cloud Run", "Gemini", "Next.js"],
  status: "ready",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z"
};

async function mockArtifacts(): Promise<GeneratedArtifacts> {
  return new MockAIProvider().generateJson<GeneratedArtifacts>({
    system: "",
    prompt: "",
    schemaName: "GeneratedArtifacts",
    schema: generatedArtifactsSchema
  });
}

function statusMap(
  artifacts: ReturnType<typeof adaptArtifactsForFindyHackathon>
): Record<string, string> {
  return Object.fromEntries(
    artifacts.checklist.requiredItems.map((item) => [item.label, item.status])
  );
}

describe("adaptArtifactsForFindyHackathon", () => {
  it("adds exact event tags and checklist items only when explicitly called", async () => {
    const source = await mockArtifacts();
    const generic = finalizeSubmissionArtifacts({ project, artifacts: source });
    const adapted = adaptArtifactsForFindyHackathon({
      project,
      artifacts: source,
      evidence: {
        protoPediaUrl: "https://protopedia.net/prototype/example",
        demoVideoUrl: "https://www.youtube.com/watch?v=example",
        systemArchitectureImageUrl:
          "https://cdn.example.test/pitchforge-architecture.png",
        finalFormSubmitted: false
      }
    });

    expect(
      JSON.stringify({
        tags: generic.protoPediaContent.tags,
        checklist: generic.checklist
      })
    ).not.toMatch(/(?:ProtoPedia|Findy|findy_hackathon|最終提出フォーム)/iu);
    expect(adapted.protoPediaContent.tags[0]).toBe("findy_hackathon");
    expect(adapted.protoPediaContent.tags.filter((tag) => tag === "findy_hackathon"))
      .toHaveLength(1);
    expect(statusMap(adapted)).toMatchObject({
      "ProtoPedia作品URL": "needs_review",
      "デモ動画": "needs_review",
      "システム構成図画像": "needs_review",
      "Google Cloud実行サービス": "needs_review",
      "Google Cloud AI技術": "needs_review",
      "findy_hackathonタグ": "ready",
      "最終提出フォーム": "missing"
    });
    expect(adapted.checklist.requiredItems).toEqual(
      expect.arrayContaining(generic.checklist.requiredItems)
    );
  });

  it("is idempotent and accepts submission evidence without mutating its source", async () => {
    const source = await mockArtifacts();
    const original = structuredClone(source);
    const once = adaptArtifactsForFindyHackathon({
      project,
      artifacts: source,
      evidence: {
        systemArchitectureImageReady: true,
        finalFormSubmitted: true
      }
    });
    const twice = adaptArtifactsForFindyHackathon({
      project,
      artifacts: once,
      evidence: {
        systemArchitectureImageReady: true,
        finalFormSubmitted: true
      }
    });

    expect(twice).toEqual(once);
    expect(statusMap(once)["最終提出フォーム"]).toBe("ready");
    expect(statusMap(once)["システム構成図画像"]).toBe("needs_review");
    expect(source).toEqual(original);
  });

  it("requires explicit system architecture image evidence", async () => {
    const source = await mockArtifacts();

    const withoutEvidence = adaptArtifactsForFindyHackathon({
      project,
      artifacts: source
    });
    const withReadyEvidence = adaptArtifactsForFindyHackathon({
      project,
      artifacts: source,
      evidence: { systemArchitectureImageReady: true }
    });
    const withUnsafeUrl = adaptArtifactsForFindyHackathon({
      project,
      artifacts: source,
      evidence: {
        systemArchitectureImageUrl:
          "https://image-user:super-secret@cdn.example.test/architecture.png"
      }
    });

    expect(statusMap(withoutEvidence)["システム構成図画像"]).toBe("missing");
    expect(withoutEvidence.checklist.recommendedFixes).toContain(
      "ProtoPediaへ登録するシステム構成図画像を用意し、証跡を記録する"
    );
    expect(statusMap(withReadyEvidence)["システム構成図画像"]).toBe(
      "needs_review"
    );
    expect(withReadyEvidence.checklist.recommendedFixes).toContain(
      "準備したシステム構成図画像が最新の構成と一致することを確認する"
    );
    expect(statusMap(withUnsafeUrl)["システム構成図画像"]).toBe("missing");
    expect(JSON.stringify(withUnsafeUrl)).not.toContain("super-secret");
  });
});
