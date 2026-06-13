"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArtifactViewer } from "@/components/artifact-viewer";
import { DirectorRoom } from "@/components/director-room";
import { ExportPanel } from "@/components/export-panel";
import { GcpProof } from "@/components/gcp-proof";
import { ScoreBoard } from "@/components/score-board";
import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { Asset, Project, Run, RunEvent } from "@/lib/schemas/project";
import type { JudgeScore } from "@/lib/schemas/agent";

type ProjectPayload = {
  project: Project;
  assets: Asset[];
  runs: Run[];
};

const tabs = ["Overview", "Director Room", "Scoreboard", "Artifacts", "Export"] as const;
type WorkspaceTab = (typeof tabs)[number];

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [payload, setPayload] = useState<ProjectPayload | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactBundle | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("Overview");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRun = useMemo(() => payload?.runs[0] ?? null, [payload]);
  const baselineScore = currentRun?.baselineScore as JudgeScore | undefined;
  const finalScore = currentRun?.finalScore as JudgeScore | undefined;

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    const nextPayload = (await response.json()) as ProjectPayload;
    if (!response.ok) {
      throw new Error((nextPayload as unknown as { error?: string }).error ?? "Load failed");
    }
    nextPayload.runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setPayload(nextPayload);
    const run = nextPayload.runs[0];
    if (run) {
      const [eventsResponse, artifactsResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}/runs/${run.id}/events`, { cache: "no-store" }),
        fetch(`/api/projects/${projectId}/runs/${run.id}/artifacts`, { cache: "no-store" })
      ]);
      if (eventsResponse.ok) {
        const eventsPayload = await eventsResponse.json();
        setEvents(eventsPayload.events ?? []);
      }
      if (artifactsResponse.ok) {
        setArtifacts(await artifactsResponse.json());
      }
    }
  }, [projectId]);

  useEffect(() => {
    refresh().catch((caught) =>
      setError(caught instanceof Error ? caught.message : "Load failed")
    );
  }, [refresh]);

  useEffect(() => {
    if (!currentRun || !["queued", "running"].includes(currentRun.status)) {
      return undefined;
    }
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [currentRun, refresh]);

  async function startRun() {
    setError(null);
    setIsRunning(true);
    setTab("Director Room");
    try {
      const response = await fetch(`/api/projects/${projectId}/runs`, { method: "POST" });
      const result = await response.json();
      if (!response.ok && response.status !== 409) {
        throw new Error(result.error ?? "Run failed");
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Run failed");
    } finally {
      setIsRunning(false);
    }
  }

  if (!payload) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6 shadow-soft">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-line bg-panel p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-sm font-semibold text-muted hover:text-ink">
              PitchForge
            </Link>
            <h1 className="mt-3 text-4xl font-semibold">{payload.project.title}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-muted">{payload.project.oneLiner}</p>
          </div>
          <button
            type="button"
            onClick={startRun}
            disabled={isRunning || currentRun?.status === "running"}
            className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forge disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? "AI監督室を起動中..." : "AI監督に見せる"}
          </button>
        </div>
        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </header>

      <nav className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              tab === item ? "bg-ink text-white" : "border border-line bg-panel text-ink"
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      {tab === "Overview" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-lg border border-line bg-panel p-5 shadow-soft">
            <h2 className="text-xl font-semibold">Overview</h2>
            <dl className="mt-4 space-y-4 text-sm leading-6">
              <div>
                <dt className="font-semibold">Problem</dt>
                <dd className="text-muted">{payload.project.problem}</dd>
              </div>
              <div>
                <dt className="font-semibold">GCP Usage</dt>
                <dd className="text-muted">{payload.project.gcpUsage}</dd>
              </div>
              <div>
                <dt className="font-semibold">AI Agent Behavior</dt>
                <dd className="text-muted">{payload.project.aiAgentBehavior}</dd>
              </div>
              <div>
                <dt className="font-semibold">Assets</dt>
                <dd className="text-muted">{payload.assets.length} screenshots</dd>
              </div>
            </dl>
          </section>
          <GcpProof />
        </div>
      ) : null}

      {tab === "Director Room" ? <DirectorRoom run={currentRun} events={events} /> : null}
      {tab === "Scoreboard" ? (
        <ScoreBoard baselineScore={baselineScore} finalScore={finalScore} />
      ) : null}
      {tab === "Artifacts" ? <ArtifactViewer artifacts={artifacts} /> : null}
      {tab === "Export" ? (
        <ExportPanel projectId={projectId} runId={currentRun?.id} artifacts={artifacts} />
      ) : null}
    </div>
  );
}
