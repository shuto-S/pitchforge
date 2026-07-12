import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { shouldLoadCurrentUser } from "@/lib/client/public-demo";
import {
  publicDemoArtifacts,
  publicDemoBaselineScore,
  publicDemoEvents,
  publicDemoFinalScore,
  publicDemoProject,
  publicDemoRun
} from "@/lib/demo/public-demo";
import { artifactBundleSchema } from "@/lib/schemas/artifact";
import { judgeScoreSchema } from "@/lib/schemas/agent";
import { runEventSchema, runSchema } from "@/lib/schemas/project";

describe("public demo", () => {
  const publicDemoProjectSchema = z.object({
    title: z.string().min(1),
    oneLiner: z.string().min(1),
    problem: z.string().min(1),
    aiAgentBehavior: z.string().min(1),
    gcpUsage: z.string().min(1)
  });

  it("keeps the committed fixture schema-valid", () => {
    expect(runSchema.parse(publicDemoRun)).toEqual(publicDemoRun);
    expect(publicDemoEvents.map((event) => runEventSchema.parse(event))).toEqual(
      publicDemoEvents
    );
    expect(judgeScoreSchema.parse(publicDemoBaselineScore)).toEqual(publicDemoBaselineScore);
    expect(judgeScoreSchema.parse(publicDemoFinalScore)).toEqual(publicDemoFinalScore);
    expect(artifactBundleSchema.parse(publicDemoArtifacts)).toEqual(publicDemoArtifacts);
    expect(publicDemoProjectSchema.parse(publicDemoProject)).toEqual(publicDemoProject);
    expect(JSON.stringify(publicDemoArtifacts)).not.toMatch(
      /(?:api[_-]?key|password|access[_-]?token|private[_-]?key)/i
    );
  });

  it("does not load the current-user API on public demo routes", () => {
    expect(shouldLoadCurrentUser("/demo")).toBe(false);
    expect(shouldLoadCurrentUser("/demo/preview")).toBe(false);
    expect(shouldLoadCurrentUser("/")).toBe(true);
    expect(shouldLoadCurrentUser("/projects/new")).toBe(true);
  });

  it("contains no API or fetch calls in the demo workspace", async () => {
    const demoFiles = [
      "components/public-demo-workspace.tsx",
      "components/artifact-viewer.tsx",
      "components/director-room.tsx",
      "components/score-board.tsx"
    ];
    const sources = await Promise.all(demoFiles.map((file) => readFile(file, "utf8")));
    for (const source of sources) {
      expect(source).not.toContain("/api/");
      expect(source).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it("uses the public demo CTA instead of the authenticated sample form", async () => {
    const source = await readFile("app/page.tsx", "utf8");
    expect(source).toContain('href="/demo"');
    expect(source).not.toContain("/projects/new?sample=1");
  });

  it("forces the demo route to be statically rendered", async () => {
    const source = await readFile("app/demo/page.tsx", "utf8");
    expect(source).toContain('dynamic = "force-static"');
  });

  it("keeps Cloud Run scaled to zero when idle", async () => {
    const source = await readFile("cloudbuild.yaml", "utf8");
    expect(source).toContain("--min-instances=0");
  });
});
