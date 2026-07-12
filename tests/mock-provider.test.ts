import { describe, expect, it } from "vitest";
import { generatedArtifactsSchema, type GeneratedArtifacts } from "@/lib/schemas/artifact";
import {
  judgeScoreSchema,
  revisionPlanSchema,
  type JudgeScore,
  type RevisionAction,
  type RevisionPlan
} from "@/lib/schemas/agent";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import { mergeRevisionCandidate } from "@/lib/server/ai/orchestrator";
import { buildProjectPrompt } from "@/lib/server/ai/prompts";

const context = {
  project: {
    title: "Mock causal scoring test",
    problem: "成果物と無関係な呼び出し回数でスコアが上がってしまう。"
  },
  assets: []
};

async function baseArtifacts(provider = new MockAIProvider()): Promise<GeneratedArtifacts> {
  return provider.generateJson<GeneratedArtifacts>({
    system: "",
    prompt: "",
    schemaName: "GeneratedArtifacts",
    schema: generatedArtifactsSchema
  });
}

function judgePrompt(input: {
  brief: GeneratedArtifacts["brief"];
  artifacts?: GeneratedArtifacts;
  phase: "baseline" | "draft" | "revision";
}): string {
  return `Mock judge\n\n${buildProjectPrompt({ context, ...input })}`;
}

async function judge(
  provider: MockAIProvider,
  schemaName: "JudgeScoreBaseline" | "JudgeScoreDraft" | "JudgeScoreRevision",
  prompt: string
): Promise<JudgeScore> {
  return provider.generateJson<JudgeScore>({
    system: "",
    prompt,
    schemaName,
    schema: judgeScoreSchema
  });
}

function plan(actions: RevisionAction[]): RevisionPlan {
  return revisionPlanSchema.parse({
    decision: "continue",
    focusCriteria: ["agent_centrality", "usability"],
    actions,
    targetScore: 85,
    target: "選択した成果物に改善根拠を追加する",
    reason: "再採点で成果物の差を確認するため"
  });
}

function optimizerPrompt(
  currentBundle: GeneratedArtifacts,
  revisionPlan: RevisionPlan
): string {
  return `Mock optimizer\n\n${buildProjectPrompt({
    context,
    currentBundle,
    revisionPlan,
    round: 1
  })}`;
}

describe("MockAIProvider causal revision behavior", () => {
  it("describes the production password-auth architecture without signup or Identity Platform", async () => {
    const artifacts = await baseArtifacts();
    const serialized = JSON.stringify(artifacts);

    expect(artifacts.protoPediaContent.systemArchitecture).toContain("auth_users");
    expect(artifacts.protoPediaContent.systemArchitecture).toContain("httpOnly");
    expect(serialized).toContain("事前登録");
    expect(serialized).not.toContain("Identity Platform");
    expect(serialized).not.toContain("招待制ログイン");
  });

  it("returns identical results for the same prompt without provider state", async () => {
    const artifacts = await baseArtifacts();
    const prompt = judgePrompt({
      brief: artifacts.brief,
      artifacts,
      phase: "draft"
    });
    const provider = new MockAIProvider();

    const first = await judge(provider, "JudgeScoreDraft", prompt);
    const second = await judge(provider, "JudgeScoreDraft", prompt);
    const recreated = await judge(new MockAIProvider(), "JudgeScoreDraft", prompt);
    const baseline = await judge(
      provider,
      "JudgeScoreBaseline",
      judgePrompt({ brief: artifacts.brief, phase: "baseline" })
    );

    expect(second).toEqual(first);
    expect(recreated).toEqual(first);
    expect(baseline.totalScore).toBe(58);
    expect(first.totalScore).toBe(76);
    expect(first.totalScore).toBeGreaterThan(baseline.totalScore);
  });

  it("gives the same score to the same artifacts regardless of judge phase", async () => {
    const artifacts = await baseArtifacts();
    const provider = new MockAIProvider();
    const draftScore = await judge(
      provider,
      "JudgeScoreDraft",
      judgePrompt({ brief: artifacts.brief, artifacts, phase: "draft" })
    );
    const revisionScore = await judge(
      provider,
      "JudgeScoreRevision",
      judgePrompt({ brief: artifacts.brief, artifacts, phase: "revision" })
    );

    expect(revisionScore).toEqual(draftScore);
  });

  it("changes only selected artifacts and raises the score from their content", async () => {
    const provider = new MockAIProvider();
    const current = await baseArtifacts(provider);
    const revisionPlan = plan(["strategy"]);
    const prompt = optimizerPrompt(current, revisionPlan);

    const candidate = await provider.generateJson<GeneratedArtifacts>({
      system: "",
      prompt,
      schemaName: "GeneratedArtifacts",
      schema: generatedArtifactsSchema
    });
    const sameCandidate = await new MockAIProvider().generateJson<GeneratedArtifacts>({
      system: "",
      prompt,
      schemaName: "GeneratedArtifacts",
      schema: generatedArtifactsSchema
    });

    expect(candidate).toEqual(sameCandidate);
    expect(candidate.directorStrategy).not.toEqual(current.directorStrategy);
    expect(candidate.demoScripts).toEqual(current.demoScripts);
    expect(candidate.protoPediaContent).toEqual(current.protoPediaContent);
    expect(candidate.visualConcepts).toEqual(current.visualConcepts);
    expect(candidate.checklist).toEqual(current.checklist);

    const merged = mergeRevisionCandidate(current, candidate, revisionPlan.actions);
    expect(merged.demoScripts).toEqual(current.demoScripts);
    expect(merged.protoPediaContent).toEqual(current.protoPediaContent);
    expect(merged.visualConcepts).toEqual(current.visualConcepts);
    expect(merged.checklist).toEqual(current.checklist);

    const before = await judge(
      provider,
      "JudgeScoreDraft",
      judgePrompt({ brief: current.brief, artifacts: current, phase: "draft" })
    );
    const after = await judge(
      provider,
      "JudgeScoreRevision",
      judgePrompt({ brief: current.brief, artifacts: merged, phase: "revision" })
    );
    expect(after.totalScore).toBeGreaterThan(before.totalScore);
  });

  it("keeps the demo's selected three-action revision above its target", async () => {
    const provider = new MockAIProvider();
    const current = await baseArtifacts(provider);
    const revisionPlan = plan(["strategy", "scripts", "submission"]);
    const candidate = await provider.generateJson<GeneratedArtifacts>({
      system: "",
      prompt: optimizerPrompt(current, revisionPlan),
      schemaName: "GeneratedArtifacts",
      schema: generatedArtifactsSchema
    });
    const merged = mergeRevisionCandidate(current, candidate, revisionPlan.actions);

    const before = await judge(
      provider,
      "JudgeScoreDraft",
      judgePrompt({ brief: current.brief, artifacts: current, phase: "draft" })
    );
    const after = await judge(
      provider,
      "JudgeScoreRevision",
      judgePrompt({ brief: current.brief, artifacts: merged, phase: "revision" })
    );

    expect(before.totalScore).toBe(76);
    expect(after.totalScore).toBe(86);
    expect(after.totalScore).toBeGreaterThanOrEqual(revisionPlan.targetScore);
  });
});
