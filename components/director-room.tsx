import type { Run, RunEvent } from "@/lib/schemas/project";
import { selectLatestDecisionEvidence } from "@/lib/client/decision-evidence";

const agentTone: Record<string, string> = {
  プロダクト分析: "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-200",
  品質レビュー: "border-amber-400/20 bg-amber-400/[0.08] text-amber-200",
  改善設計: "border-blue-400/20 bg-blue-400/[0.1] text-blue-200",
  デモ設計: "border-sky-400/20 bg-sky-400/[0.08] text-sky-200",
  公開文編集: "border-violet-400/20 bg-violet-400/[0.08] text-violet-200",
  ビジュアル設計: "border-fuchsia-400/20 bg-fuchsia-400/[0.08] text-fuchsia-200",
  公開準備: "border-orange-400/20 bg-orange-400/[0.08] text-orange-200",
  改善計画: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200",
  改善実行: "border-indigo-400/20 bg-indigo-400/[0.08] text-indigo-200",
  AIブリーフ担当: "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-200",
  AI監督: "border-blue-400/20 bg-blue-400/[0.1] text-blue-200",
  AI審査員: "border-amber-400/20 bg-amber-400/[0.08] text-amber-200",
  AI脚本家: "border-sky-400/20 bg-sky-400/[0.08] text-sky-200",
  AI編集者: "border-violet-400/20 bg-violet-400/[0.08] text-violet-200",
  AIアートディレクター: "border-fuchsia-400/20 bg-fuchsia-400/[0.08] text-fuchsia-200",
  AIプロデューサー: "border-orange-400/20 bg-orange-400/[0.08] text-orange-200",
  AI改善担当: "border-indigo-400/20 bg-indigo-400/[0.08] text-indigo-200",
  AI改善プランナー: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200"
};

const loopStages = [
  ["01", "理解", "プロダクト理解"],
  ["02", "評価", "5観点評価"],
  ["03", "選択", "改善対象"],
  ["04", "改訂", "成果物更新"],
  ["05", "再評価", "変化を確認"]
];

function agentDisplayName(agentName: string): string {
  return agentName === "AI審査員" ? "AI評価者" : agentName;
}

export function DirectorRoom({
  run,
  events,
  isPending = false
}: {
  run: Run | null;
  events: RunEvent[];
  isPending?: boolean;
}) {
  const progress =
    typeof run?.progress === "number" && Number.isFinite(run.progress)
      ? Math.min(100, Math.max(0, run.progress))
      : 0;
  const { decisionEvent, observedEvent } = selectLatestDecisionEvidence(events);

  return (
    <section className="cockpit-panel p-5 sm:p-7">
      <div className="flex flex-col gap-6 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="cockpit-kicker">AI改善フロー</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">判断のログ</h2>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-2 text-sm text-slate-400"
          >
            {isPending
              ? "新しい実行を同期中…"
              : run
                ? run.currentStep
                : "AI改善を開始すると判断過程がここに残ります。"}
          </p>
        </div>
        <div className="min-w-64">
          <div className="flex items-end justify-between">
            <span className="text-xs font-semibold text-slate-500">実行状況</span>
            <span className="text-3xl font-semibold tabular-nums text-blue-300">
              {progress}
              <span className="ml-0.5 text-sm text-slate-500">%</span>
            </span>
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label="AI改善の進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={
              isPending ? "新しい実行を確認中" : `${run?.currentStep ?? "未開始"}、${progress}%`
            }
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {decisionEvent || observedEvent ? (
        <div
          className="mt-6 grid gap-3 lg:grid-cols-[1.45fr_0.55fr]"
          aria-label="AIが選んだ改善と観察結果"
        >
          {decisionEvent ? (
            <article className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.055] p-4">
              <div className="cockpit-kicker text-emerald-300">選択した改善</div>
              <p className="mt-2 text-sm leading-6 text-slate-200">{decisionEvent.message}</p>
            </article>
          ) : null}
          {observedEvent ? (
            <article className="rounded-xl border border-blue-400/20 bg-blue-400/[0.065] p-4">
              <div className="cockpit-kicker">再評価結果</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-blue-100">
                {observedEvent.message}
              </p>
            </article>
          ) : null}
        </div>
      ) : null}

      <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="AI改善プロセス">
        {loopStages.map(([number, code, label]) => (
          <li key={code} className="cockpit-card px-3 py-3">
            <div className="text-[10px] font-bold text-blue-400">{number}</div>
            <div className="mt-2 text-[10px] font-bold tracking-[0.12em] text-slate-500">
              {code}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-200">{label}</div>
          </li>
        ))}
      </ol>

      <div
        role="log"
        aria-label="AI改善フローの更新"
        aria-live="polite"
        aria-relevant="additions"
        className="mt-7 space-y-2"
      >
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 px-5 py-10 text-center">
            <div className="text-sm font-semibold text-slate-300">
              {isPending ? "実行を準備しています" : "改善ログはまだありません"}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {isPending ? "実行中。判断ログは自動更新されます。" : "上のボタンからAI改善を開始できます。"}
            </p>
          </div>
        ) : (
          events.map((event, index) => (
            <article
              key={event.id}
              className="group grid gap-3 rounded-xl border border-white/[0.07] bg-slate-950/35 p-4 transition hover:border-blue-400/20 sm:grid-cols-[2.5rem_1fr]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-[10px] font-semibold tabular-nums text-slate-500">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md border px-2 py-1 text-[10px] font-bold ${
                      agentTone[event.agentName] ??
                      "border-slate-600 bg-slate-800 text-slate-200"
                    }`}
                  >
                    {agentDisplayName(event.agentName)}
                  </span>
                  <time className="text-[10px] tabular-nums text-slate-600">
                    {new Date(event.createdAt).toLocaleTimeString("ja-JP")}
                  </time>
                  {event.type === "completed" ? (
                    <span className="ml-auto text-[10px] font-bold text-emerald-400">完了</span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{event.message}</p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
