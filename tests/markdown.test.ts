import { describe, expect, it } from "vitest";
import type { GeneratedArtifacts } from "@/lib/schemas/artifact";
import type { JudgeScore } from "@/lib/schemas/agent";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import { renderMarkdownExport } from "@/lib/server/export/markdown";

describe("markdown export", () => {
  it("renders before and after score plus GCP story", async () => {
    const provider = new MockAIProvider();
    const artifacts = await provider.generateJson<GeneratedArtifacts>({
      system: "",
      prompt: "",
      schemaName: "GeneratedArtifacts",
      schema: {}
    });
    const baselineScore = await provider.generateJson<JudgeScore>({
      system: "",
      prompt: "",
      schemaName: "JudgeScoreBaseline",
      schema: {}
    });
    const finalScore = await provider.generateJson<JudgeScore>({
      system: "",
      prompt: "",
      schemaName: "JudgeScoreFinal",
      schema: {}
    });

    const markdown = renderMarkdownExport({
      project: {
        id: "proj_test",
        ownerUid: "test-user",
        ownerEmail: "test-user@example.test",
        title: "PitchForge",
        oneLiner: "AI監督",
        description: "description",
        problem: "problem",
        targetUsers: "users",
        gcpUsage: "Cloud Run",
        aiAgentBehavior: "agent",
        techStack: ["Cloud Run"],
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      baselineScore,
      finalScore,
      artifacts
    });

    expect(markdown).toContain("Total: 58 -> 86");
    expect(markdown).toContain("Cloud Run");
    expect(markdown).toContain("findy_hackathon");
  });
});
