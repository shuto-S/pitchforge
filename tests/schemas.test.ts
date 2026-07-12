import { describe, expect, it } from "vitest";
import {
  judgeScoreSchema,
  officialScoreCategoryKeys,
  projectImportDraftSchema,
  projectInputSchema,
  projectSchema,
  protoPediaContentSchema,
  revisionPlanSchema
} from "@/lib/schemas";

function validJudgeScore() {
  const scores = [60, 65, 70, 75, 80];
  return {
    totalScore: 70,
    categories: officialScoreCategoryKeys.map((key, index) => ({
      key,
      label: key,
      score: scores[index],
      evidence: [`${key}の根拠`],
      reason: `${key}の評価理由`,
      improvement: `${key}の改善案`
    })),
    topStrengths: ["強み"],
    criticalWeaknesses: ["弱み"],
    oneLineVerdict: "総評"
  };
}

describe("schemas", () => {
  it("accepts a valid project input", () => {
    const parsed = projectInputSchema.parse({
      title: "PitchForge",
      oneLiner: "AI監督が提出物を磨く",
      description:
        "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
      problem: "提出直前に価値が伝わる形へ整理できない。",
      targetUsers: "ハッカソン参加者",
      productUrl: "https://example.com",
      githubUrl: "https://github.com/example/pitchforge",
      gcpUsage: "Cloud Run, Gemini API, Cloud SQL, Cloud Storage",
      aiAgentBehavior: "作品理解、採点、改善、再採点を行う。",
      techStack: ["Cloud Run", "Gemini API"]
    });

    expect(parsed.title).toBe("PitchForge");
  });

  it("rejects unconfirmed placeholders when saving but keeps them valid as import drafts", () => {
    const input = {
      title: "PitchForge",
      oneLiner: "プロダクト評価と資料作成を支えるAIワークスペース",
      description:
        "プロダクトの価値と実装を評価し、改善案とレビュー向け資料を生成します。",
      problem: "要確認: 解決する課題を追記してください。",
      targetUsers: "プロダクトマネージャーと開発チーム",
      productUrl: "",
      githubUrl: "https://github.com/example/pitchforge",
      gcpUsage: "Cloud Runで提供し、Geminiで分析します。",
      aiAgentBehavior: "情報を観察し、改善対象を判断して再評価します。",
      techStack: ["Next.js", "Cloud Run"]
    };

    expect(projectImportDraftSchema.parse(input).problem).toMatch(/^要確認:/u);
    expect(() => projectInputSchema.parse(input)).toThrow(/実際の内容に置き換えてください/u);
  });

  it("keeps legacy persisted projects readable when they contain an old placeholder", () => {
    const parsed = projectSchema.parse({
      id: "project_legacy_placeholder",
      ownerUid: "owner_legacy_placeholder",
      ownerEmail: "owner@example.test",
      title: "Legacy project",
      oneLiner: "旧バージョンで保存されたプロジェクト",
      description:
        "確認ガード追加前に保存された下書きも、編集や移行のため引き続き読み込めます。",
      problem: "要確認: 解決する課題を追記してください。",
      targetUsers: "プロダクトチーム",
      gcpUsage: "Cloud Run",
      aiAgentBehavior: "情報を整理して評価する。",
      techStack: [],
      status: "draft",
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    });

    expect(parsed.problem).toMatch(/^要確認:/u);
  });

  it("rejects non-https urls", () => {
    expect(() =>
      projectInputSchema.parse({
        title: "PitchForge",
        oneLiner: "AI監督が提出物を磨く",
        description:
          "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
        problem: "提出直前に価値が伝わる形へ整理できない。",
        targetUsers: "ハッカソン参加者",
        productUrl: "http://example.com",
        gcpUsage: "Cloud Run",
        aiAgentBehavior: "レビューする",
        techStack: []
      })
    ).toThrow();
  });

  it.each([
    "https://user:password@example.com/private",
    "https://user@example.com/private"
  ])("rejects credential-bearing project urls: %s", (productUrl) => {
    expect(() =>
      projectInputSchema.parse({
        title: "PitchForge",
        oneLiner: "AI監督が提出物を磨く",
        description:
          "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
        problem: "提出直前に価値が伝わる形へ整理できない。",
        targetUsers: "ハッカソン参加者",
        productUrl,
        gcpUsage: "Cloud Run",
        aiAgentBehavior: "レビューする",
        techStack: []
      })
    ).toThrow(/must not contain credentials/u);
  });

  it("drops unsafe legacy URLs while canonicalizing safe persisted project URLs", () => {
    const parsed = projectSchema.parse({
      id: "project_legacy_url",
      ownerUid: "owner_legacy_url",
      ownerEmail: "owner@example.test",
      title: "PitchForge",
      oneLiner: "AI監督が提出物を磨く",
      description:
        "保存済みデータに旧形式のURLがあっても、プロジェクト本体を安全に読み込めることを確認します。",
      problem: "旧URLがproject parseを失敗させる。",
      targetUsers: "既存ユーザー",
      productUrl: "https://legacy-user:super-secret@example.com/private",
      githubUrl: " HTTPS://EXAMPLE.COM/Public ",
      gcpUsage: "Cloud Run",
      aiAgentBehavior: "レビューする",
      techStack: [],
      status: "ready",
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    });

    expect(parsed.productUrl).toBeUndefined();
    expect(parsed.githubUrl).toBe("https://example.com/Public");
  });

  it("accepts platform-neutral introduction-page tags", () => {
    const parsed = protoPediaContentSchema.parse({
      title: "PitchForge",
      overview: "overview",
      story: {
        problemBackground: "problem",
        targetUsers: "users",
        productFeatures: "features"
      },
      systemArchitecture: "architecture",
      developmentMaterials: [],
      tags: ["google_cloud"],
      relatedUrls: []
    });

    expect(parsed.tags).toEqual(["google_cloud"]);
  });

  it("requires exactly the five official evidence-backed score categories", () => {
    const parsed = judgeScoreSchema.parse(validJudgeScore());

    expect(parsed.categories.map((category) => category.key)).toEqual(officialScoreCategoryKeys);
    expect(parsed.categories.every((category) => category.evidence.length > 0)).toBe(true);

    const duplicated = validJudgeScore();
    duplicated.categories[4].key = "agent_centrality";
    expect(() => judgeScoreSchema.parse(duplicated)).toThrow();
  });

  it("requires totalScore to equal the rounded category average", () => {
    expect(() => judgeScoreSchema.parse({ ...validJudgeScore(), totalScore: 71 })).toThrow();
  });

  it("requires revision plans to select actions only when continuing", () => {
    expect(() =>
      revisionPlanSchema.parse({
        decision: "continue",
        focusCriteria: ["usability"],
        actions: [],
        targetScore: 85,
        target: "導線を明確にする",
        reason: "改善余地がある"
      })
    ).toThrow();
    expect(() =>
      revisionPlanSchema.parse({
        decision: "stop",
        focusCriteria: ["usability"],
        actions: ["scripts"],
        targetScore: 76,
        target: "現状を維持する",
        reason: "十分な品質"
      })
    ).toThrow();
  });
});
