import { afterEach, describe, expect, it, vi } from "vitest";
import { generatedArtifactsSchema, type GeneratedArtifacts } from "@/lib/schemas/artifact";
import type { Project } from "@/lib/schemas/project";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import { finalizeSubmissionArtifacts } from "@/lib/server/submission/finalize";

const timestamp = "2026-07-12T00:00:00.000Z";

const project: Project = {
  id: "project_finalize_test",
  ownerUid: "owner_finalize_test",
  ownerEmail: "owner@example.test",
  title: "Product fact source",
  oneLiner: "Use project facts for public product fields",
  description: "A fixture long enough to represent a product reviewed by the finalizer.",
  problem: "AI output can contain unsupported claims and placeholder URLs.",
  targetUsers: "Product teams",
  productUrl: "https://product.example.test",
  githubUrl: "https://github.com/example/product-fact-source",
  gcpUsage: "Cloud Run and Vertex AI",
  aiAgentBehavior: "Generate, judge, revise, and stop.",
  techStack: [" Cloud Run ", "cloud run", "Gemini", "", " Next.js "],
  status: "ready",
  createdAt: timestamp,
  updatedAt: timestamp
};

async function mockArtifacts(): Promise<GeneratedArtifacts> {
  return new MockAIProvider().generateJson<GeneratedArtifacts>({
    system: "",
    prompt: "",
    schemaName: "GeneratedArtifacts",
    schema: generatedArtifactsSchema
  });
}

function statusMap(artifacts: GeneratedArtifacts): Record<string, string> {
  return Object.fromEntries(
    artifacts.checklist.requiredItems.map((item) => [item.label, item.status])
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finalizeSubmissionArtifacts", () => {
  it("rebuilds public product facts from the project and discards generated placeholders", async () => {
    const artifacts = await mockArtifacts();
    artifacts.protoPediaContent.title = "AI invented title";
    artifacts.protoPediaContent.developmentMaterials = [
      "Repository URL",
      "Deployed URL",
      "Demo video URL"
    ];
    artifacts.protoPediaContent.tags = [
      " Findy_Hackathon ",
      "ProtoPedia",
      "Gemini",
      "gemini",
      "",
      "AI Agent"
    ];
    artifacts.protoPediaContent.relatedUrls = [
      { label: "placeholder", url: "https://example.com/replace-me" },
      { label: "invented", url: "https://attacker.example/claim" }
    ];

    const result = finalizeSubmissionArtifacts({ project, artifacts });

    expect(result.protoPediaContent.title).toBe(project.title);
    expect(result.protoPediaContent.developmentMaterials).toEqual([
      "Cloud Run",
      "Gemini",
      "Next.js"
    ]);
    expect(result.protoPediaContent.tags).toEqual(["Gemini", "AI Agent"]);
    expect(result.protoPediaContent.relatedUrls).toEqual([
      { label: "関連リポジトリ", url: project.githubUrl },
      { label: "プロダクト", url: new URL(project.productUrl!).href }
    ]);
    expect(JSON.stringify(result)).not.toContain("example.com/replace-me");
    expect(JSON.stringify(result)).not.toContain("attacker.example");
    expect(
      JSON.stringify({
        tags: result.protoPediaContent.tags,
        checklist: result.checklist
      })
    ).not.toMatch(/(?:ProtoPedia|Findy|findy_hackathon|最終提出フォーム)/iu);
  });

  it("never marks project URLs ready and reports missing repository evidence", async () => {
    const artifacts = await mockArtifacts();

    const withUrls = finalizeSubmissionArtifacts({ project, artifacts });
    expect(statusMap(withUrls)).toMatchObject({
      "プロダクトURL": "needs_review",
      "関連リポジトリ": "needs_review"
    });

    const withoutUrls = finalizeSubmissionArtifacts({
      project: { ...project, githubUrl: undefined, productUrl: undefined },
      artifacts
    });
    expect(statusMap(withoutUrls)).toMatchObject({
      "プロダクトURL": "missing",
      "関連リポジトリ": "missing"
    });
    expect(withoutUrls.checklist.recommendedFixes).toContain(
      "レビューや共有に使う関連リポジトリURLを入力する"
    );
    expect(withoutUrls.protoPediaContent.relatedUrls).toEqual([]);
  });

  it("drops credential-bearing project URLs and redacts them from legacy artifacts", async () => {
    const rawUrl = "https://legacy-user:super-secret@example.test/private";
    const artifacts = await mockArtifacts();
    artifacts.protoPediaContent.overview = `Legacy output copied ${rawUrl}`;
    artifacts.protoPediaContent.relatedUrls = [{ label: "legacy", url: rawUrl }];

    const result = finalizeSubmissionArtifacts({
      project: { ...project, productUrl: rawUrl },
      artifacts
    });

    expect(JSON.stringify(result)).not.toContain(rawUrl);
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(result.protoPediaContent.overview).toContain("安全でないURLを非表示");
    expect(result.protoPediaContent.relatedUrls).toEqual([
      { label: "関連リポジトリ", url: project.githubUrl }
    ]);
    expect(statusMap(result)).toMatchObject({
      "プロダクトURL": "missing",
      "関連リポジトリ": "needs_review"
    });
  });

  it("replaces AI-ready claims with a general public-readiness checklist", async () => {
    const artifacts = await mockArtifacts();
    artifacts.checklist.requiredItems = [
      {
        label: "AI says every external task is complete",
        status: "ready",
        note: "This claim must not survive."
      }
    ];

    const result = finalizeSubmissionArtifacts({ project, artifacts });

    expect(statusMap(result)).toEqual({
      "プロダクトURL": "needs_review",
      "関連リポジトリ": "needs_review",
      "紹介ページ": "ready",
      "デモ台本": "ready",
      "アーキテクチャ図": "ready",
      "技術スタック": "needs_review",
      "公開範囲と認証": "needs_review",
      "機密情報": "needs_review"
    });
    expect(result.checklist.requiredItems).toHaveLength(8);
    expect(result.checklist.finalSubmissionAdvice).toContain("紹介文と実装の整合性");
  });

  it("deduplicates equal project URLs and recommended actions without mutating input", async () => {
    const artifacts = await mockArtifacts();
    artifacts.checklist.recommendedFixes = [" AI独自の改善 ", "ai独自の改善", ""];
    const originalArtifacts = structuredClone(artifacts);
    const sameUrlProject = { ...project, productUrl: project.githubUrl };

    const once = finalizeSubmissionArtifacts({ project: sameUrlProject, artifacts });
    const twice = finalizeSubmissionArtifacts({
      project: sameUrlProject,
      artifacts: once
    });

    expect(twice).toEqual(once);
    expect(once.protoPediaContent.relatedUrls).toEqual([
      { label: "関連リポジトリ", url: project.githubUrl }
    ]);
    expect(once.checklist.recommendedFixes.filter((fix) => fix === "AI独自の改善"))
      .toHaveLength(1);
    expect(artifacts).toEqual(originalArtifacts);
  });

  it("is synchronous and performs no fetch while finalizing URLs", async () => {
    const artifacts = await mockArtifacts();
    const fetchSpy = vi.fn(() => {
      throw new Error("Network access is forbidden in the finalizer");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = finalizeSubmissionArtifacts({ project, artifacts });

    expect(result).not.toBeInstanceOf(Promise);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
