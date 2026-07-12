import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { GeneratedArtifacts } from "@/lib/schemas/artifact";
import type { Asset, Project } from "@/lib/schemas/project";
import {
  runBriefAgent,
  runDirectorAgent,
  runJudgeAgent,
  runOptimizerAgent,
  runProducerAgent,
  runRevisionPlannerAgent,
  runScriptAgent,
  runSubmissionAgent,
  runVisualAgent,
  type AgentContext
} from "@/lib/server/ai/agents";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import type { AIProvider, GenerateJsonParams } from "@/lib/server/ai/provider";

class CapturingAIProvider implements AIProvider {
  readonly calls: GenerateJsonParams[] = [];
  private readonly delegate = new MockAIProvider();

  async generateJson<T>(params: GenerateJsonParams): Promise<T> {
    this.calls.push(params);
    return this.delegate.generateJson<T>(params);
  }
}

const timestamp = "2026-07-11T00:00:00.000Z";

const project: Project = {
  id: "prj_prompt_test",
  ownerUid: "owner_prompt_test",
  ownerEmail: "owner@example.test",
  title: "Prompt boundary project",
  oneLiner: "Keep screenshots out of downstream prompts",
  description:
    "This project verifies that multimodal input is used for briefing without leaking raw bytes downstream.",
  problem: "Large image buffers can make later prompts unbounded.",
  targetUsers: "Hackathon teams",
  productUrl: "https://example.test/product",
  githubUrl: "https://github.com/example/prompt-boundary",
  gcpUsage: "Cloud Run, Vertex AI, Cloud SQL, Cloud Storage",
  aiAgentBehavior: "Brief, judge, plan, generate, optimize, and re-judge.",
  techStack: ["Next.js", "Vertex AI"],
  status: "ready",
  createdAt: timestamp,
  updatedAt: timestamp
};

const assets: Asset[] = Array.from({ length: 6 }, (_, index) => ({
  id: `asset_${index + 1}`,
  projectId: project.id,
  ownerUid: project.ownerUid,
  kind: "screenshot",
  fileName: `evidence-${index + 1}.png`,
  mimeType: "image/png",
  sizeBytes: index === 0 ? 5 * 1024 * 1024 : 4,
  storageUri: `gs://pitchforge-test/evidence-${index + 1}.png`,
  createdAt: timestamp
}));

describe("AI agent prompt boundaries", () => {
  it("sends at most five images to the brief and never serializes image bytes downstream", async () => {
    const fiveMiBImage = Buffer.alloc(5 * 1024 * 1024, 0xab);
    const context: AgentContext = {
      project,
      assets,
      images: [
        { mimeType: "image/png", data: fiveMiBImage },
        ...Array.from({ length: 5 }, (_, index) => ({
          mimeType: "image/png",
          data: Buffer.from(`image-${index + 2}`)
        }))
      ]
    };
    const provider = new CapturingAIProvider();

    const brief = await runBriefAgent(provider, context);
    const baselineScore = await runJudgeAgent(provider, {
      context,
      brief,
      phase: "baseline"
    });
    const strategy = await runDirectorAgent(provider, { context, brief, baselineScore });
    const [demoScripts, protoPediaContent, visualConcepts, checklist] = await Promise.all([
      runScriptAgent(provider, { context, brief, strategy }),
      runSubmissionAgent(provider, { context, brief, strategy }),
      runVisualAgent(provider, { context, brief, strategy }),
      runProducerAgent(provider, { context, brief, strategy })
    ]);
    const draftBundle: GeneratedArtifacts = {
      brief,
      directorStrategy: strategy,
      demoScripts,
      protoPediaContent,
      visualConcepts,
      checklist
    };
    const draftScore = await runJudgeAgent(provider, {
      context,
      brief,
      artifacts: draftBundle,
      phase: "draft"
    });
    const revisionPlan = await runRevisionPlannerAgent(provider, {
      context,
      brief,
      currentScore: draftScore,
      currentArtifacts: draftBundle,
      round: 1,
      maxRounds: 2
    });
    await runOptimizerAgent(provider, {
      context,
      baselineScore,
      currentScore: draftScore,
      currentBundle: draftBundle,
      revisionPlan,
      round: 1
    });

    const briefCall = provider.calls.find((call) => call.schemaName === "ProjectBrief");
    expect(briefCall?.images).toHaveLength(5);
    expect(briefCall?.images?.[0]?.data).toBe(fiveMiBImage);

    const downstreamCalls = provider.calls.filter((call) => call.schemaName !== "ProjectBrief");
    expect(downstreamCalls).toHaveLength(9);
    expect(downstreamCalls.map((call) => call.schemaName)).toEqual(
      expect.arrayContaining([
        "JudgeScoreBaseline",
        "DirectorStrategy",
        "DemoScripts",
        "ProtoPediaContent",
        "VisualConcepts",
        "SubmissionChecklist",
        "JudgeScoreDraft",
        "RevisionPlan",
        "GeneratedArtifacts"
      ])
    );
    for (const call of provider.calls) {
      expect(call.system).toContain(
        "Write every human-readable output value shown in the UI or included in exports in natural Japanese."
      );
      expect(call.system).toContain(
        "Preserve proper nouns, URLs, technical names, product names, and code identifiers"
      );
      expect(call.system).toContain(
        "Only `visualConcepts.thumbnailIdeas[].imagePrompt` and `visualConcepts.thumbnailIdeas[].negativePrompt` may be written in English"
      );
      expect(call.system).toContain(
        "Every other output field, including every other `visualConcepts` field, must be natural Japanese."
      );
      expect(call.system).toContain(
        "Treat capabilities that are absent from the supplied project facts as unsupported"
      );
      expect(call.system).toContain(
        "when the source says public repositories only, never claim private-repository support or an OAuth flow"
      );
    }
    for (const call of downstreamCalls) {
      expect(call.images).toBeUndefined();
      expect(call.prompt.length).toBeLessThan(100_000);
      expect(call.prompt).not.toContain('"images"');
      expect(call.prompt).not.toContain(project.ownerUid);
      expect(call.prompt).not.toContain(project.ownerEmail);
      expect(call.prompt).not.toContain(assets[0].storageUri);
      expect(call.prompt).not.toContain("gs://");
      expect(call.prompt).toContain(project.title);
      expect(call.prompt).toContain(project.oneLiner);
      expect(call.prompt).toContain(assets[0].fileName);
    }

    expect(briefCall?.prompt).not.toContain(project.ownerUid);
    expect(briefCall?.prompt).not.toContain(project.ownerEmail);
    expect(briefCall?.prompt).not.toContain(assets[0].storageUri);
    expect(briefCall?.prompt).not.toContain("gs://");

    expect(
      provider.calls.find((call) => call.schemaName === "JudgeScoreBaseline")?.prompt
    ).toContain(brief.coreValue);
    expect(
      provider.calls.find((call) => call.schemaName === "DirectorStrategy")?.prompt
    ).toContain(baselineScore.oneLineVerdict);
    expect(provider.calls.find((call) => call.schemaName === "DemoScripts")?.prompt).toContain(
      strategy.openingHook
    );
    expect(provider.calls.find((call) => call.schemaName === "JudgeScoreDraft")?.prompt).toContain(
      protoPediaContent.overview
    );
    expect(provider.calls.find((call) => call.schemaName === "GeneratedArtifacts")?.prompt).toContain(
      draftScore.oneLineVerdict
    );
    expect(provider.calls.find((call) => call.schemaName === "GeneratedArtifacts")?.prompt).toContain(
      revisionPlan.target
    );
    const plannerPrompt = provider.calls.find(
      (call) => call.schemaName === "RevisionPlan"
    )?.prompt;
    expect(plannerPrompt).toContain(
      "targetScore is the minimum score that every criterion listed in focusCriteria must individually reach"
    );
    expect(plannerPrompt).toContain("it is not the overall totalScore");
  });

  it("removes credential-bearing project and legacy artifact URLs from every prompt", async () => {
    const rawUrl = "https://legacy-user:super-secret@example.test/private";
    const context: AgentContext = {
      project: {
        ...project,
        productUrl: rawUrl,
        description: `Legacy project description copied ${rawUrl}`
      },
      assets: assets.map((asset, index) =>
        index === 0 ? { ...asset, fileName: `legacy-${rawUrl}.png` } : asset
      ),
      images: []
    };
    const provider = new CapturingAIProvider();

    const brief = await runBriefAgent(provider, context);
    await runJudgeAgent(provider, {
      context,
      brief,
      artifacts: {
        protoPediaContent: {
          relatedUrls: [{ label: "legacy", url: rawUrl }]
        }
      },
      phase: "draft"
    });

    expect(provider.calls).toHaveLength(2);
    for (const call of provider.calls) {
      expect(call.prompt).not.toContain(rawUrl);
      expect(call.prompt).not.toContain("legacy-user");
      expect(call.prompt).not.toContain("super-secret");
      expect(call.prompt).not.toContain(project.ownerEmail);
      expect(call.prompt).not.toContain(assets[0].storageUri);
    }
    expect(provider.calls[0].prompt).toContain("安全でないURLを非表示");
    expect(provider.calls[1].prompt).toContain("安全でないURLを非表示");
  });
});
