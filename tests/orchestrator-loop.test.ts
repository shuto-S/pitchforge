import { describe, expect, it } from "vitest";
import { generatedArtifactsSchema, type ArtifactBundle, type GeneratedArtifacts } from "@/lib/schemas/artifact";
import {
  officialScoreCategoryKeys,
  type JudgeScore,
  type RevisionAction,
  type RevisionPlan,
  type ScoreCategory
} from "@/lib/schemas/agent";
import type { Asset, Project, Run, RunEvent } from "@/lib/schemas/project";
import {
  MAX_REVISION_ROUNDS,
  runPitchForge
} from "@/lib/server/ai/orchestrator";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import type { AIProvider, GenerateJsonParams } from "@/lib/server/ai/provider";
import type { PitchForgeRepository } from "@/lib/server/db/types";
import { finalizeSubmissionArtifacts } from "@/lib/server/submission/finalize";
import type { ObjectStorage, UploadObjectInput } from "@/lib/server/storage/types";

const timestamp = "2026-07-11T00:00:00.000Z";

function makeScore(totalScore: number): JudgeScore {
  return {
    totalScore,
    categories: officialScoreCategoryKeys.map((key) => ({
      key,
      label: key,
      score: totalScore,
      evidence: [`${key} evidence`],
      reason: `${key} reason`,
      improvement: `${key} improvement`
    })),
    topStrengths: ["strength"],
    criticalWeaknesses: ["weakness"],
    oneLineVerdict: `score ${totalScore}`
  };
}

function makeCategoryScore(scores: Record<ScoreCategory, number>): JudgeScore {
  const categories = officialScoreCategoryKeys.map((key) => ({
    key,
    label: key,
    score: scores[key],
    evidence: [`${key} evidence`],
    reason: `${key} reason`,
    improvement: `${key} improvement`
  }));

  return {
    totalScore: Math.round(
      categories.reduce((total, category) => total + category.score, 0) /
        categories.length
    ),
    categories,
    topStrengths: ["strength"],
    criticalWeaknesses: ["weakness"],
    oneLineVerdict: "category score"
  };
}

function continuePlan(actions: RevisionAction[], targetScore = 100): RevisionPlan {
  return {
    decision: "continue",
    focusCriteria: ["usability"],
    actions,
    targetScore,
    target: "selected artifacts become clearer",
    reason: "the current score still has an actionable weakness"
  };
}

function stopPlan(): RevisionPlan {
  return {
    decision: "stop",
    focusCriteria: ["usability"],
    actions: [],
    targetScore: 76,
    target: "preserve the current quality",
    reason: "further revision is not justified"
  };
}

async function mockArtifacts(): Promise<GeneratedArtifacts> {
  return new MockAIProvider().generateJson<GeneratedArtifacts>({
    system: "",
    prompt: "",
    schemaName: "GeneratedArtifacts",
    schema: generatedArtifactsSchema
  });
}

function candidateArtifacts(base: GeneratedArtifacts): GeneratedArtifacts {
  return {
    brief: { ...base.brief, coreValue: "candidate brief must never be adopted" },
    directorStrategy: {
      ...base.directorStrategy,
      coreMessage: "candidate strategy"
    },
    demoScripts: {
      ...base.demoScripts,
      script30s: { ...base.demoScripts.script30s, title: "candidate scripts" }
    },
    protoPediaContent: {
      ...base.protoPediaContent,
      overview: "candidate submission"
    },
    visualConcepts: {
      ...base.visualConcepts,
      colorMood: "candidate visuals"
    },
    checklist: {
      ...base.checklist,
      finalSubmissionAdvice: "candidate checklist"
    }
  };
}

class ScriptedLoopProvider implements AIProvider {
  readonly schemaNames: string[] = [];
  private readonly fallback = new MockAIProvider();

  constructor(
    private readonly plans: RevisionPlan[],
    private readonly revisionScores: JudgeScore[],
    private readonly candidate: GeneratedArtifacts,
    private readonly draftScore?: JudgeScore
  ) {}

  async generateJson<T>(params: GenerateJsonParams): Promise<T> {
    this.schemaNames.push(params.schemaName);
    if (params.schemaName === "RevisionPlan") {
      const plan = this.plans.shift();
      if (!plan) {
        throw new Error("Unexpected extra revision plan request");
      }
      return plan as T;
    }
    if (params.schemaName === "JudgeScoreRevision") {
      const score = this.revisionScores.shift();
      if (!score) {
        throw new Error("Unexpected extra revision score request");
      }
      return score as T;
    }
    if (params.schemaName === "JudgeScoreDraft" && this.draftScore) {
      return this.draftScore as T;
    }
    if (params.schemaName === "GeneratedArtifacts") {
      return this.candidate as T;
    }
    return this.fallback.generateJson<T>(params);
  }

  count(schemaName: string): number {
    return this.schemaNames.filter((name) => name === schemaName).length;
  }
}

function createHarness() {
  const project: Project = {
    id: "project_loop_test",
    ownerUid: "owner_loop_test",
    ownerEmail: "owner@example.test",
    title: "Loop test project",
    oneLiner: "Test a bounded plan-act-observe loop",
    description: "A project fixture used to verify dynamic artifact revision behavior.",
    problem: "Fixed pipelines cannot choose the most useful revision.",
    targetUsers: "Hackathon teams",
    productUrl: "https://loop.example.test",
    githubUrl: "https://github.com/example/loop-test-project",
    gcpUsage: "Cloud Run and Gemini",
    aiAgentBehavior: "Plan, act, observe, and stop.",
    techStack: ["Next.js", "Gemini"],
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const run: Run = {
    id: "run_loop_test",
    projectId: project.id,
    status: "queued",
    currentStep: "queued",
    progress: 0,
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const events: RunEvent[] = [];
  let savedArtifacts: ArtifactBundle | null = null;

  const repo = {
    async getProject(projectId: string) {
      return projectId === project.id ? project : null;
    },
    async listAssets() {
      return [];
    },
    async updateRun(_projectId: string, _runId: string, patch: Partial<Run>) {
      Object.assign(run, patch);
      return { ...run };
    },
    async addRunEvent(runEvent: RunEvent) {
      events.push(runEvent);
      return runEvent;
    },
    async saveArtifacts(_projectId: string, _runId: string, artifacts: ArtifactBundle) {
      savedArtifacts = artifacts;
    }
  } as unknown as PitchForgeRepository;

  const storage: ObjectStorage = {
    async saveScreenshot(input: UploadObjectInput): Promise<Asset> {
      throw new Error(`Unexpected upload: ${input.fileName}`);
    },
    async readAsset(): Promise<Buffer | null> {
      return null;
    }
  };

  return {
    project,
    run,
    events,
    repo,
    storage,
    getSavedArtifacts: () => savedArtifacts
  };
}

async function runHarness(provider: AIProvider, harness = createHarness()) {
  const result = await runPitchForge({
    projectId: harness.project.id,
    runId: harness.run.id,
    repo: harness.repo,
    storage: harness.storage,
    provider
  });
  return { result, harness };
}

describe("orchestrator revision loop", () => {
  it("adopts only artifacts selected by the revision plan", async () => {
    const base = await mockArtifacts();
    const candidate = candidateArtifacts(base);
    const provider = new ScriptedLoopProvider(
      [continuePlan(["scripts", "checklist"], 90), stopPlan()],
      [makeScore(80)],
      candidate
    );

    const { result, harness } = await runHarness(provider);
    const finalizedBase = finalizeSubmissionArtifacts({
      project: harness.project,
      artifacts: base
    });
    const finalizedCandidate = finalizeSubmissionArtifacts({
      project: harness.project,
      artifacts: candidate
    });

    expect(result.brief).toEqual(base.brief);
    expect(result.directorStrategy).toEqual(base.directorStrategy);
    expect(result.demoScripts).toEqual(candidate.demoScripts);
    expect(result.protoPediaContent).toEqual(finalizedBase.protoPediaContent);
    expect(result.visualConcepts).toEqual(base.visualConcepts);
    expect(result.checklist).toEqual(finalizedCandidate.checklist);
    expect(provider.count("GeneratedArtifacts")).toBe(1);
    expect(provider.count("JudgeScoreRevision")).toBe(1);
    expect((harness.run.finalScore as JudgeScore).totalScore).toBe(80);
    expect(harness.getSavedArtifacts()).toEqual(result);
    expect(harness.events.some((event) => event.message.includes("デモ台本、公開準備チェック"))).toBe(
      true
    );
  });

  it("stops before acting when the planner chooses stop", async () => {
    const base = await mockArtifacts();
    const provider = new ScriptedLoopProvider([stopPlan()], [], candidateArtifacts(base));

    const { result, harness } = await runHarness(provider);

    expect(provider.count("RevisionPlan")).toBe(1);
    expect(provider.count("GeneratedArtifacts")).toBe(0);
    expect(provider.count("JudgeScoreRevision")).toBe(0);
    expect(result.demoScripts).toEqual(base.demoScripts);
    expect((harness.run.finalScore as JudgeScore).totalScore).toBe(76);
    expect(harness.events.some((event) => event.message.includes("プランナーが停止"))).toBe(true);
  });

  it("judges and stores project submission facts instead of mock placeholders", async () => {
    const base = await mockArtifacts();
    expect(base.protoPediaContent.title).toBe("PitchForge");
    expect(JSON.stringify(base.protoPediaContent.relatedUrls)).toContain("example.com");
    const provider = new ScriptedLoopProvider([stopPlan()], [], candidateArtifacts(base));

    const { result, harness } = await runHarness(provider);

    expect(result.protoPediaContent.title).toBe(harness.project.title);
    expect(result.protoPediaContent.developmentMaterials).toEqual(
      harness.project.techStack
    );
    expect(result.protoPediaContent.relatedUrls).toEqual([
      {
        label: "関連リポジトリ",
        url: harness.project.githubUrl
      },
      {
        label: "プロダクト",
        url: new URL(harness.project.productUrl!).href
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("replace-with-public-repo");
    expect(JSON.stringify(result)).not.toContain("replace-with-demo-url");
    expect(harness.getSavedArtifacts()?.protoPediaContent).toEqual(
      result.protoPediaContent
    );
  });

  it("rejects a non-improving candidate and stops", async () => {
    const base = await mockArtifacts();
    const provider = new ScriptedLoopProvider(
      [continuePlan(["strategy"], 90)],
      [makeScore(75)],
      candidateArtifacts(base)
    );

    const { result, harness } = await runHarness(provider);

    expect(result.directorStrategy).toEqual(base.directorStrategy);
    expect((harness.run.finalScore as JudgeScore).totalScore).toBe(76);
    expect(harness.events.some((event) => event.message.includes("候補を採用せず停止"))).toBe(true);
  });

  it("stops when an observed revision reaches the planner target", async () => {
    const base = await mockArtifacts();
    const provider = new ScriptedLoopProvider(
      [continuePlan(["submission"], 80)],
      [makeScore(80)],
      candidateArtifacts(base)
    );

    const { result, harness } = await runHarness(provider);

    expect(provider.count("RevisionPlan")).toBe(1);
    expect(result.protoPediaContent.overview).toBe("candidate submission");
    expect((harness.run.finalScore as JudgeScore).totalScore).toBe(80);
    expect(harness.events.some((event) => event.message.includes("目標80点に到達"))).toBe(true);
  });

  it("keeps revising until every focused criterion reaches the planner target", async () => {
    const base = await mockArtifacts();
    const currentScore = makeCategoryScore({
      agent_centrality: 88,
      problem_approach: 88,
      usability: 40,
      experience_value: 87,
      implementation: 87
    });
    const observedScore = makeCategoryScore({
      agent_centrality: 88,
      problem_approach: 88,
      usability: 70,
      experience_value: 87,
      implementation: 87
    });
    const provider = new ScriptedLoopProvider(
      [continuePlan(["strategy"], 70)],
      [observedScore],
      candidateArtifacts(base),
      currentScore
    );

    const { harness } = await runHarness(provider);
    const finalScore = harness.run.finalScore as JudgeScore;

    expect(currentScore.totalScore).toBe(78);
    expect(provider.count("GeneratedArtifacts")).toBe(1);
    expect(provider.count("JudgeScoreRevision")).toBe(1);
    expect(provider.count("RevisionPlan")).toBe(1);
    expect(finalScore.categories.find((category) => category.key === "usability")?.score).toBe(70);
    expect(harness.events.some((event) => event.message.includes("対象項目が目標70点に到達"))).toBe(
      true
    );
  });

  it("never exceeds the maximum revision round bound", async () => {
    const base = await mockArtifacts();
    const provider = new ScriptedLoopProvider(
      Array.from({ length: MAX_REVISION_ROUNDS }, () => continuePlan(["scripts"])),
      [makeScore(78), makeScore(80)],
      candidateArtifacts(base)
    );

    const { harness } = await runHarness(provider);

    expect(provider.count("RevisionPlan")).toBe(MAX_REVISION_ROUNDS);
    expect(provider.count("GeneratedArtifacts")).toBe(MAX_REVISION_ROUNDS);
    expect(provider.count("JudgeScoreRevision")).toBe(MAX_REVISION_ROUNDS);
    expect((harness.run.finalScore as JudgeScore).totalScore).toBe(80);
    expect(
      harness.events.some((event) => event.message.includes(`最大${MAX_REVISION_ROUNDS}ラウンド`))
    ).toBe(true);
  });
});
