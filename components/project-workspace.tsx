"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArtifactViewer } from "@/components/artifact-viewer";
import { DirectorRoom } from "@/components/director-room";
import { ExportPanel } from "@/components/export-panel";
import { GcpProof } from "@/components/gcp-proof";
import { ScoreBoard } from "@/components/score-board";
import {
  clearValueForRun,
  isRunSwitchConfirmed,
  retainValueForRun,
  valueForRun,
  visibleRunDuringSwitch,
  type PendingRunSwitch,
  type RunScopedValue
} from "@/lib/client/project-workspace-state";
import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { Asset, Project, Run, RunEvent } from "@/lib/schemas/project";
import type { JudgeScore } from "@/lib/schemas/agent";

type ProjectPayload = {
  project: Project;
  assets: Asset[];
  runs: Run[];
};

type ErrorPayload = {
  error?: string;
  code?: string;
};

type WorkspaceError = {
  message: string;
  status?: number;
};

class WorkspaceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "WorkspaceRequestError";
  }
}

const tabs = [
  { key: "overview", label: "概要" },
  { key: "director", label: "AI改善フロー" },
  { key: "score", label: "5観点評価" },
  { key: "artifacts", label: "成果物" },
  { key: "export", label: "エクスポート" }
] as const;
type WorkspaceTab = (typeof tabs)[number]["key"];

const activeRunStatuses = new Set<Run["status"]>(["queued", "running"]);

function runStatusLabel(run: Run | null, isAwaiting: boolean): string {
  if (isAwaiting) {
    return "同期中";
  }
  if (!run) {
    return "未実行";
  }
  if (run.status === "completed") {
    return "完了";
  }
  if (run.status === "queued") {
    return "実行待ち";
  }
  if (run.status === "running") {
    return "実行中";
  }
  return "失敗";
}

function runStatusDot(run: Run | null, isAwaiting: boolean): string {
  if (isAwaiting || run?.status === "queued" || run?.status === "running") {
    return "bg-blue-400";
  }
  if (run?.status === "completed") {
    return "bg-emerald-400";
  }
  if (run?.status === "failed") {
    return "bg-red-400";
  }
  return "bg-slate-500";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isUnauthenticatedError(error: unknown): boolean {
  return (
    error instanceof WorkspaceRequestError &&
    (error.status === 401 || error.code === "UNAUTHENTICATED")
  );
}

function toWorkspaceError(error: unknown, fallback: string): WorkspaceError {
  return {
    message: error instanceof Error ? error.message : fallback,
    status: error instanceof WorkspaceRequestError ? error.status : undefined
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

function requestError(
  response: Response,
  payload: ErrorPayload,
  fallback: string
): WorkspaceRequestError {
  return new WorkspaceRequestError(
    typeof payload.error === "string" && payload.error ? payload.error : fallback,
    response.status,
    payload.code
  );
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ProjectPayload | null>(null);
  const [scopedEvents, setScopedEvents] = useState<RunScopedValue<RunEvent[]>>(null);
  const [scopedArtifacts, setScopedArtifacts] =
    useState<RunScopedValue<ArtifactBundle>>(null);
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [isRunning, setIsRunning] = useState(false);
  const [hasRunRequestError, setHasRunRequestError] = useState(false);
  const [error, setError] = useState<WorkspaceError | null>(null);
  const [pendingRunSwitch, setPendingRunSwitch] =
    useState<PendingRunSwitch | null>(null);
  const isMountedRef = useRef(false);
  const refreshAbortControllerRef = useRef<AbortController | null>(null);
  const refreshInFlightRef = useRef<Promise<ProjectPayload | null> | null>(null);
  const pendingRunSwitchRef = useRef<PendingRunSwitch | null>(null);

  const latestRun = useMemo(() => payload?.runs[0] ?? null, [payload]);
  const currentRun = useMemo(
    () => visibleRunDuringSwitch(latestRun, pendingRunSwitch),
    [latestRun, pendingRunSwitch]
  );
  const isAwaitingNewRun = Boolean(
    pendingRunSwitch && !isRunSwitchConfirmed(pendingRunSwitch, latestRun?.id)
  );
  const events = useMemo(
    () => valueForRun(scopedEvents, currentRun?.id) ?? [],
    [currentRun?.id, scopedEvents]
  );
  const artifacts = useMemo(
    () => valueForRun(scopedArtifacts, currentRun?.id),
    [currentRun?.id, scopedArtifacts]
  );
  const hasActiveRun = currentRun ? activeRunStatuses.has(currentRun.status) : false;
  const shouldPoll =
    !hasRunRequestError && (isRunning || hasActiveRun || isAwaitingNewRun);
  const baselineScore = currentRun?.baselineScore as JudgeScore | undefined;
  const finalScore = currentRun?.finalScore as JudgeScore | undefined;
  const totalDelta =
    baselineScore && finalScore ? finalScore.totalScore - baselineScore.totalScore : null;
  const failedRunMessage =
    currentRun?.status === "failed"
      ? currentRun.errorMessage?.trim() || "実行中にエラーが発生しました。"
      : null;

  const refresh = useCallback(() => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const controller = new AbortController();
    refreshAbortControllerRef.current = controller;

    const request = (async () => {
      const response = await fetch(`/api/projects/${projectId}`, {
        cache: "no-store",
        signal: controller.signal
      });
      const nextPayload = await readJson<ProjectPayload & ErrorPayload>(response);
      if (!response.ok) {
        throw requestError(response, nextPayload, "ワークスペースを読み込めませんでした。");
      }
      nextPayload.runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (!isMountedRef.current || controller.signal.aborted) {
        return null;
      }
      setPayload(nextPayload);

      const run = nextPayload.runs[0];
      if (isRunSwitchConfirmed(pendingRunSwitchRef.current, run?.id)) {
        pendingRunSwitchRef.current = null;
        setPendingRunSwitch(null);
        setError(null);
      }
      setScopedEvents((current) => retainValueForRun(current, run?.id));
      setScopedArtifacts((current) => retainValueForRun(current, run?.id));
      if (!run) {
        return nextPayload;
      }
      const [eventsResponse, artifactsResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}/runs/${run.id}/events`, {
          cache: "no-store",
          signal: controller.signal
        }),
        fetch(`/api/projects/${projectId}/runs/${run.id}/artifacts`, {
          cache: "no-store",
          signal: controller.signal
        })
      ]);
      if (!isMountedRef.current || controller.signal.aborted) {
        return null;
      }
      const unauthenticatedResponse = [eventsResponse, artifactsResponse].find(
        (nextResponse) => nextResponse.status === 401
      );
      if (unauthenticatedResponse) {
        const errorPayload = await readJson<ErrorPayload>(unauthenticatedResponse);
        throw requestError(
          unauthenticatedResponse,
          errorPayload,
          "ログインの有効期限が切れました。"
        );
      }
      if (eventsResponse.ok) {
        const eventsPayload = await eventsResponse.json();
        if (isMountedRef.current && !controller.signal.aborted) {
          setScopedEvents({ runId: run.id, value: eventsPayload.events ?? [] });
        }
      } else if (eventsResponse.status === 404) {
        setScopedEvents((current) => clearValueForRun(current, run.id));
      }
      if (artifactsResponse.ok) {
        const nextArtifacts = await artifactsResponse.json();
        if (isMountedRef.current && !controller.signal.aborted) {
          setScopedArtifacts({ runId: run.id, value: nextArtifacts });
        }
      } else if (artifactsResponse.status === 404) {
        setScopedArtifacts((current) => clearValueForRun(current, run.id));
      }
      return nextPayload;
    })();

    const trackedRequest = request.finally(() => {
      if (refreshAbortControllerRef.current === controller) {
        refreshAbortControllerRef.current = null;
        refreshInFlightRef.current = null;
      }
    });
    refreshInFlightRef.current = trackedRequest;
    return trackedRequest;
  }, [projectId]);

  const redirectToLogin = useCallback(() => {
    const nextPath = `/projects/${encodeURIComponent(projectId)}`;
    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [projectId, router]);

  useEffect(() => {
    isMountedRef.current = true;
    setPayload(null);
    setScopedEvents(null);
    setScopedArtifacts(null);
    setError(null);
    setIsRunning(false);
    setHasRunRequestError(false);
    setPendingRunSwitch(null);
    pendingRunSwitchRef.current = null;
    return () => {
      isMountedRef.current = false;
      refreshAbortControllerRef.current?.abort();
      refreshAbortControllerRef.current = null;
      refreshInFlightRef.current = null;
    };
  }, [projectId]);

  const loadWorkspace = useCallback(async () => {
    setError(null);
    try {
      await refresh();
    } catch (caught) {
      if (!isMountedRef.current || isAbortError(caught)) {
        return;
      }
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(toWorkspaceError(caught, "ワークスペースを読み込めませんでした。"));
    }
  }, [redirectToLogin, refresh]);

  async function refreshAfterRunRequest(): Promise<ProjectPayload | null> {
    try {
      await refresh();
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        throw caught;
      }
      // A poll may already be in flight; the fresh request below is authoritative.
    }
    return isMountedRef.current ? refresh() : null;
  }

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!shouldPoll) {
      return undefined;
    }

    let cancelled = false;
    const poll = () => {
      if (!cancelled) {
        refresh().catch((caught) => {
          if (isUnauthenticatedError(caught)) {
            redirectToLogin();
          }
        });
      }
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [redirectToLogin, refresh, shouldPoll]);

  async function startRun() {
    const pendingSwitch: PendingRunSwitch = {
      previousRunId: latestRun?.id ?? null
    };
    setError(null);
    setHasRunRequestError(false);
    setIsRunning(true);
    pendingRunSwitchRef.current = pendingSwitch;
    setPendingRunSwitch(pendingSwitch);
    setTab("director");
    refreshAbortControllerRef.current?.abort();

    let requestAccepted = false;
    try {
      const response = await fetch(`/api/projects/${projectId}/runs`, { method: "POST" });
      const result = await readJson<ErrorPayload & { runId?: string; status?: string }>(
        response
      );
      if (!response.ok && response.status !== 409) {
        throw requestError(response, result, "AI改善を開始できませんでした。");
      }
      requestAccepted = true;
      await refreshAfterRunRequest();
    } catch (caught) {
      if (!isMountedRef.current || isAbortError(caught)) {
        return;
      }
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }

      let recoveredPayload: ProjectPayload | null = null;
      try {
        recoveredPayload = await refreshAfterRunRequest();
      } catch (recoveryError) {
        if (isUnauthenticatedError(recoveryError)) {
          redirectToLogin();
          return;
        }
        // The POST error remains the actionable message even if recovery also fails.
      }
      if (isMountedRef.current) {
        const recoveredRun = recoveredPayload?.runs[0];
        const recoveredNewRun = isRunSwitchConfirmed(
          pendingSwitch,
          recoveredRun?.id
        );

        if (recoveredNewRun) {
          pendingRunSwitchRef.current = null;
          setPendingRunSwitch(null);
          setHasRunRequestError(false);
          setError(null);
        } else if (!requestAccepted) {
          pendingRunSwitchRef.current = null;
          setPendingRunSwitch(null);
          setHasRunRequestError(true);
          setError(toWorkspaceError(caught, "AI改善を開始できませんでした。"));
        } else {
          setHasRunRequestError(false);
          setError(toWorkspaceError(caught, "新しい実行の状態を確認できませんでした。"));
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsRunning(false);
      }
    }
  }

  if (!payload) {
    if (error) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="cockpit-panel border-red-400/20 bg-red-500/[0.06] p-6 text-red-100"
        >
          <h1 className="text-lg font-semibold">ワークスペースを読み込めませんでした</h1>
          <p className="mt-2 text-sm">{error.message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {error.status !== 403 && error.status !== 404 ? (
              <button
                type="button"
                onClick={() => void loadWorkspace()}
                className="cockpit-button-primary"
              >
                再試行
              </button>
            ) : null}
            <Link
              href="/"
              className="cockpit-button-secondary"
            >
              ホームへ戻る
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div
        role="status"
        aria-live="polite"
        className="cockpit-panel p-6 text-sm text-slate-400"
      >
        ワークスペースを読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="cockpit-panel p-5 sm:p-7">
        <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="cockpit-kicker flex items-center gap-2">
              <Link href="/" className="hover:text-blue-300">
                PitchForge
              </Link>
              <span className="text-slate-700">/</span>
              評価ワークスペース
            </div>
            <h1 className="mt-4 truncate text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              {payload.project.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {payload.project.oneLiner}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="cockpit-chip">プロジェクトごとに安全に管理</span>
              <span className="cockpit-chip">参考画像 {payload.assets.length}件</span>
              <span className="cockpit-chip" aria-live="polite">
                <span className={`h-1.5 w-1.5 rounded-full ${runStatusDot(currentRun, isAwaitingNewRun)}`} />
                {runStatusLabel(currentRun, isAwaitingNewRun)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {baselineScore || finalScore ? (
              <div className="cockpit-card min-w-52 px-4 py-3">
                <div className="cockpit-kicker">評価差分</div>
                <div className="mt-2 flex items-baseline gap-2 font-semibold tabular-nums">
                  <span className="text-xl text-slate-500">
                    {baselineScore?.totalScore ?? "–"}
                  </span>
                  <span className="text-slate-700">→</span>
                  <span className="text-3xl text-blue-300">
                    {finalScore?.totalScore ?? "–"}
                  </span>
                  {totalDelta !== null ? (
                    <span className="ml-auto text-xs text-emerald-400">
                      {totalDelta >= 0 ? "+" : ""}
                      {totalDelta}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={startRun}
              disabled={isRunning || hasActiveRun || isAwaitingNewRun}
              aria-busy={isRunning || isAwaitingNewRun}
              className="cockpit-button-primary min-w-52"
            >
              {isAwaitingNewRun
                ? "実行を同期中…"
                : isRunning
                  ? "AI改善を開始中…"
                  : "AI改善を開始"}
            </button>
          </div>
        </div>
        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="mt-5 rounded-lg border border-red-400/20 bg-red-500/[0.08] p-3 text-sm text-red-200"
          >
            {error.message}
          </div>
        ) : null}
        {failedRunMessage ? (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-400/20 bg-red-500/[0.08] p-3 text-sm leading-6 text-red-200"
          >
            <div className="font-semibold">AI改善を完了できませんでした。</div>
            <div>{failedRunMessage}</div>
            <div>上の「AI改善を開始」から再実行できます。</div>
          </div>
        ) : null}
      </header>

      <nav
        role="tablist"
        aria-label="ワークスペース表示"
        aria-orientation="horizontal"
        className="cockpit-panel flex flex-wrap gap-1 p-1.5"
      >
        {tabs.map((item, index) => (
          <button
            key={item.key}
            id={`workspace-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls="workspace-tabpanel"
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === "ArrowRight") {
                nextIndex = (index + 1) % tabs.length;
              } else if (event.key === "ArrowLeft") {
                nextIndex = (index - 1 + tabs.length) % tabs.length;
              } else if (event.key === "Home") {
                nextIndex = 0;
              } else if (event.key === "End") {
                nextIndex = tabs.length - 1;
              }
              if (nextIndex === null) {
                return;
              }
              event.preventDefault();
              const nextTab = tabs[nextIndex];
              setTab(nextTab.key);
              document.getElementById(`workspace-tab-${nextTab.key}`)?.focus();
            }}
            data-active={tab === item.key}
            className="cockpit-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div
        id="workspace-tabpanel"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      >
        {tab === "overview" ? (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="cockpit-panel p-5 sm:p-6">
                <div className="cockpit-kicker">01 / 課題</div>
                <h2 className="mt-3 text-xl font-semibold text-white">解決する課題</h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  {payload.project.problem}
                </p>
              </section>
              <section className="cockpit-panel p-5 sm:p-6">
                <div className="cockpit-kicker">02 / AIの判断</div>
                <h2 className="mt-3 text-xl font-semibold text-white">観察 → 判断 → 実行</h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  {payload.project.aiAgentBehavior}
                </p>
              </section>
              <section className="cockpit-panel p-5 sm:p-6 lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="cockpit-kicker">03 / Google Cloud</div>
                    <h2 className="mt-3 text-xl font-semibold text-white">AIとクラウドの役割</h2>
                  </div>
                  <span className="cockpit-chip">参考画像 {payload.assets.length}件</span>
                </div>
                <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
                  {payload.project.gcpUsage}
                </p>
              </section>
            </div>
            <GcpProof />
          </div>
        ) : null}

        {tab === "director" ? (
          <DirectorRoom
            run={currentRun}
            events={events}
            isPending={isAwaitingNewRun}
          />
        ) : null}
        {tab === "score" ? (
          <ScoreBoard baselineScore={baselineScore} finalScore={finalScore} />
        ) : null}
        {tab === "artifacts" ? <ArtifactViewer artifacts={artifacts} /> : null}
        {tab === "export" ? (
          <ExportPanel projectId={projectId} runId={currentRun?.id} artifacts={artifacts} />
        ) : null}
      </div>
    </div>
  );
}
