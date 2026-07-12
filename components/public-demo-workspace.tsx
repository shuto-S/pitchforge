"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArtifactViewer } from "@/components/artifact-viewer";
import { DirectorRoom } from "@/components/director-room";
import { ExportPanel } from "@/components/export-panel";
import { GcpProof, type RuntimeStatus } from "@/components/gcp-proof";
import { ScoreBoard } from "@/components/score-board";
import {
  publicDemoArtifacts,
  publicDemoBaselineScore,
  publicDemoEvents,
  publicDemoFinalScore,
  publicDemoProject,
  publicDemoRun
} from "@/lib/demo/public-demo";
import type { Run } from "@/lib/schemas/project";

const tabs = [
  { key: "overview", label: "概要" },
  { key: "director", label: "AI改善フロー" },
  { key: "score", label: "5観点評価" },
  { key: "artifacts", label: "成果物" },
  { key: "export", label: "エクスポート" }
] as const;

type DemoTab = (typeof tabs)[number]["key"];

const demoRuntimeStatus: RuntimeStatus = {
  runtimeMode: "cloud-run",
  aiMode: "sample-only",
  datastoreMode: "sample-data",
  storageMode: "none",
  authMode: "public-read-only",
  cloudRunService: "configured",
  googleCloudProject: "configured",
  gcsBucket: "not-used"
};

const progressSteps = [18, 38, 62, 82, 100] as const;
const stepLabels = [
  "プロダクトを理解しています",
  "5観点で評価しています",
  "改善対象を選んでいます",
  "成果物を更新しています",
  "改善結果を再評価しています"
] as const;

const markdownUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(
  publicDemoArtifacts.markdownExport
)}`;

export function PublicDemoWorkspace() {
  const [tab, setTab] = useState<DemoTab>("overview");
  const [run, setRun] = useState<Run>(publicDemoRun);
  const [visibleEventCount, setVisibleEventCount] = useState(publicDemoEvents.length);
  const [isRunning, setIsRunning] = useState(false);
  const runSequenceRef = useRef(0);
  const isCompleted = run.status === "completed";
  const visibleEvents = publicDemoEvents.slice(0, visibleEventCount);

  useEffect(
    () => () => {
      runSequenceRef.current += 1;
    },
    []
  );

  function startDemoRun() {
    if (isRunning) return;

    const sequence = runSequenceRef.current + 1;
    runSequenceRef.current = sequence;
    setIsRunning(true);
    setVisibleEventCount(0);
    setTab("director");
    setRun({
      ...publicDemoRun,
      status: "running",
      currentStep: stepLabels[0],
      progress: progressSteps[0],
      finalScore: undefined,
      completedAt: undefined
    });

    progressSteps.forEach((progress, index) => {
      window.setTimeout(() => {
        if (runSequenceRef.current !== sequence) return;
        const completed = index === progressSteps.length - 1;
        setVisibleEventCount(index + 1);
        setRun({
          ...publicDemoRun,
          status: completed ? "completed" : "running",
          currentStep: completed ? "改善と再評価が完了しました" : stepLabels[index],
          progress,
          finalScore: completed ? publicDemoFinalScore : undefined,
          completedAt: completed ? publicDemoRun.completedAt : undefined
        });
        if (completed) setIsRunning(false);
      }, 650 * (index + 1));
    });
  }

  return (
    <div className="space-y-5">
      <header className="cockpit-panel p-5 sm:p-7">
        <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="cockpit-kicker flex items-center gap-2">
              <Link href="/" className="hover:text-blue-300">PitchForge</Link>
              <span className="text-slate-700">/</span>
              評価ワークスペース
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              {publicDemoProject.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {publicDemoProject.oneLiner}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="cockpit-chip">サンプルデータをブラウザ内で再生</span>
              <span className="cockpit-chip">保存されません</span>
              <span className="cockpit-chip">
                <span className="cockpit-dot" /> {isRunning ? "実行中" : "完了"}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="cockpit-card min-w-52 px-4 py-3">
              <div className="cockpit-kicker">評価差分</div>
              <div className="mt-2 flex items-baseline gap-2 font-semibold tabular-nums">
                <span className="text-xl text-slate-500">58</span>
                <span className="text-slate-700">→</span>
                <span className="text-3xl text-blue-300">
                  {isCompleted ? publicDemoFinalScore.totalScore : "–"}
                </span>
                {isCompleted ? (
                  <span className="ml-auto text-xs text-emerald-400">+28</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={startDemoRun}
              disabled={isRunning}
              aria-busy={isRunning}
              className="cockpit-button-primary min-w-52"
            >
              {isRunning ? "AI改善を開始中…" : "AI改善を開始"}
            </button>
          </div>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="サンプルワークスペース表示"
        aria-orientation="horizontal"
        className="cockpit-panel flex flex-wrap gap-1 p-1.5"
      >
        {tabs.map((item, index) => (
          <button
            key={item.key}
            id={`demo-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls="demo-tabpanel"
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
              if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
              if (event.key === "Home") nextIndex = 0;
              if (event.key === "End") nextIndex = tabs.length - 1;
              if (nextIndex === null) return;
              event.preventDefault();
              const nextTab = tabs[nextIndex];
              setTab(nextTab.key);
              document.getElementById(`demo-tab-${nextTab.key}`)?.focus();
            }}
            data-active={tab === item.key}
            className="cockpit-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div
        id="demo-tabpanel"
        role="tabpanel"
        aria-labelledby={`demo-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {tab === "overview" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="cockpit-panel p-5 sm:p-6">
              <div className="cockpit-kicker">01 / 課題</div>
              <h2 className="mt-3 text-xl font-semibold text-white">解決する課題</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">{publicDemoProject.problem}</p>
            </section>
            <section className="cockpit-panel p-5 sm:p-6">
              <div className="cockpit-kicker">02 / AIの判断</div>
              <h2 className="mt-3 text-xl font-semibold text-white">観察 → 判断 → 実行</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">{publicDemoProject.aiAgentBehavior}</p>
            </section>
            <section className="cockpit-panel p-5 sm:p-6 lg:col-span-2">
              <div className="cockpit-kicker">03 / Google Cloud</div>
              <h2 className="mt-3 text-xl font-semibold text-white">AIとクラウドの役割</h2>
              <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">{publicDemoProject.gcpUsage}</p>
            </section>
            <div className="lg:col-span-2">
              <GcpProof statusOverride={demoRuntimeStatus} />
            </div>
          </div>
        ) : null}
        {tab === "director" ? <DirectorRoom run={run} events={visibleEvents} /> : null}
        {tab === "score" ? (
          <ScoreBoard
            baselineScore={publicDemoBaselineScore}
            finalScore={isCompleted ? publicDemoFinalScore : undefined}
          />
        ) : null}
        {tab === "artifacts" ? (
          <ArtifactViewer artifacts={isCompleted ? publicDemoArtifacts : null} />
        ) : null}
        {tab === "export" ? (
          <ExportPanel
            projectId="public-demo-project"
            runId={isCompleted ? publicDemoRun.id : undefined}
            artifacts={isCompleted ? publicDemoArtifacts : null}
            markdownUrl={markdownUrl}
            architectureUrl={isCompleted ? "/demo/pitchforge-architecture.svg" : undefined}
          />
        ) : null}
      </div>

    </div>
  );
}
