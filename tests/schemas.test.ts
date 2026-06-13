import { describe, expect, it } from "vitest";
import { projectInputSchema, protoPediaContentSchema } from "@/lib/schemas";

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
      gcpUsage: "Cloud Run, Gemini API, Firestore, Cloud Storage",
      aiAgentBehavior: "作品理解、採点、改善、再採点を行う。",
      techStack: ["Cloud Run", "Gemini API"]
    });

    expect(parsed.title).toBe("PitchForge");
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

  it("requires findy_hackathon tag", () => {
    expect(() =>
      protoPediaContentSchema.parse({
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
      })
    ).toThrow();
  });
});
