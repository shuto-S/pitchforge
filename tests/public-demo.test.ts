import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  resolveExportUrls,
  shouldLoadCurrentUser,
  shouldRequestRuntimeStatus
} from "@/lib/client/public-demo";
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

  it("reuses the full workspace flow with local-only overrides", async () => {
    const source = await readFile("components/public-demo-workspace.tsx", "utf8");
    const architecture = await readFile("public/demo/pitchforge-architecture.svg", "utf8");

    for (const label of ["概要", "AI改善フロー", "5観点評価", "成果物", "エクスポート"]) {
      expect(source).toContain(`label: "${label}"`);
    }
    expect(source).toContain("statusOverride={demoRuntimeStatus}");
    expect(source).toContain("markdownUrl={markdownUrl}");
    expect(source).toContain('architectureUrl={isCompleted ? "/demo/pitchforge-architecture.svg"');
    expect(architecture).toContain("<svg");
  });

  it("resolves demo data without authenticated API fallbacks", () => {
    const status = {
      runtimeMode: "cloud-run",
      aiMode: "sample-only",
      datastoreMode: "sample-data",
      storageMode: "none",
      authMode: "public-read-only",
      cloudRunService: "configured",
      googleCloudProject: "configured",
      gcsBucket: "not-used"
    };
    const urls = resolveExportUrls({
      projectId: "public-demo-project",
      runId: "public-demo-run",
      markdownUrl: "data:text/markdown,demo",
      architectureUrl: "/demo/pitchforge-architecture.svg"
    });

    expect(shouldRequestRuntimeStatus(status)).toBe(false);
    expect(urls).toEqual({
      markdown: "data:text/markdown,demo",
      architecture: "/demo/pitchforge-architecture.svg"
    });
    expect(Object.values(urls).join(" ")).not.toContain("/api/");
  });

  it("keeps reused components wired to the no-request demo overrides", async () => {
    const [proofSource, exportSource] = await Promise.all([
      readFile("components/gcp-proof.tsx", "utf8"),
      readFile("components/export-panel.tsx", "utf8")
    ]);

    expect(proofSource).toContain("shouldRequestRuntimeStatus(statusOverride)");
    expect(exportSource).toContain("resolveExportUrls({");
    expect(exportSource).toContain("markdownUrl: markdownUrlOverride");
    expect(exportSource).toContain("architectureUrl: architectureUrlOverride");
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
