import {
  officialScoreCategoryKeys,
  officialScoreCategoryLabels,
  type JudgeScore
} from "@/lib/schemas/agent";

type JudgeCategory = JudgeScore["categories"][number];

function formatScore(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "-";
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  if (value < 0) {
    return String(value);
  }
  return "±0";
}

function scoreDelta(before: number | undefined, after: number | undefined): number | undefined {
  if (
    typeof before !== "number" ||
    !Number.isFinite(before) ||
    typeof after !== "number" ||
    !Number.isFinite(after)
  ) {
    return undefined;
  }
  return after - before;
}

function progressValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

function nonEmptyText(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function evidenceItems(category: JudgeCategory): string[] {
  if (!Array.isArray(category.evidence)) {
    return [];
  }
  return category.evidence.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

function ScoreProgress({
  label,
  phase,
  score,
  tone
}: {
  label: string;
  phase: "初期評価" | "資料反映後";
  score: number;
  tone: "baseline" | "final";
}) {
  const value = progressValue(score);

  return (
    <div className="grid grid-cols-[3.75rem_1fr_2.75rem] items-center gap-2 text-[11px]">
      <span className="font-semibold text-slate-500">{phase}</span>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-label={`${label} ${phase}スコア`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${formatScore(score)}点`}
      >
        <div
          className={`h-full rounded-full ${
            tone === "final"
              ? "bg-gradient-to-r from-blue-500 to-indigo-400"
              : "bg-slate-600"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span
        className={`text-right font-semibold tabular-nums ${
          tone === "final" ? "text-blue-300" : "text-slate-500"
        }`}
      >
        {formatScore(score)}
      </span>
    </div>
  );
}

export function ScoreBoard({
  baselineScore,
  finalScore
}: {
  baselineScore?: JudgeScore;
  finalScore?: JudgeScore;
}) {
  if (!baselineScore && !finalScore) {
    return (
      <section className="cockpit-panel p-6">
        <div className="cockpit-kicker">評価差分</div>
        <h2 className="mt-3 text-2xl font-semibold text-white">5観点評価</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          評価と資料生成の完了後、5観点の変化を表示します。
        </p>
        <div className="mt-6 grid grid-cols-5 gap-2" aria-hidden="true">
          {[52, 64, 48, 58, 62].map((width, index) => (
            <div key={`${width}-${index}`} className="cockpit-card p-3">
              <div className="h-1 rounded-full bg-slate-800">
                <div className="h-1 rounded-full bg-slate-700" style={{ width: `${width}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const baselineCategories = Array.isArray(baselineScore?.categories)
    ? baselineScore.categories
    : [];
  const finalCategories = Array.isArray(finalScore?.categories) ? finalScore.categories : [];
  const baselineByKey = new Map(baselineCategories.map((category) => [category.key, category]));
  const finalByKey = new Map(finalCategories.map((category) => [category.key, category]));
  const categoryKeys = officialScoreCategoryKeys.filter(
    (key) => baselineByKey.has(key) || finalByKey.has(key)
  );
  const totalDelta = scoreDelta(baselineScore?.totalScore, finalScore?.totalScore);

  return (
    <section className="cockpit-panel p-5 sm:p-7">
      <div className="flex flex-col gap-6 border-b border-white/[0.07] pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <div className="cockpit-kicker">評価差分 / 5観点</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">5観点評価</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            AIによる参考評価です。レビュー結果を保証するものではありません。
          </p>
        </div>
        <div className="grid w-full max-w-xl grid-cols-[1fr_auto_1fr_1fr] items-center gap-2">
          <div className="cockpit-card px-3 py-3 text-center">
            <div className="text-[10px] font-bold tracking-[0.12em] text-slate-600">初期評価</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-400">
              {formatScore(baselineScore?.totalScore)}
            </div>
          </div>
          <div className="text-slate-700">→</div>
          <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.08] px-3 py-3 text-center">
            <div className="text-[10px] font-bold tracking-[0.12em] text-blue-400">資料反映後</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-blue-300">
              {formatScore(finalScore?.totalScore)}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.055] px-3 py-3 text-center">
            <div className="text-[10px] font-bold tracking-[0.12em] text-emerald-500">変化</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-300">
              {totalDelta !== undefined ? formatDelta(totalDelta) : "–"}
            </div>
          </div>
        </div>
      </div>
      {categoryKeys.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">
          5観点の評価データはありません。
        </div>
      ) : (
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {categoryKeys.map((key, index) => {
            const before = baselineByKey.get(key);
            const after = finalByKey.get(key);
            const selected = after ?? before;
            if (!selected) {
              return null;
            }

            const label = officialScoreCategoryLabels[key];
            const evidence = evidenceItems(selected);
            const delta = scoreDelta(before?.score, after?.score);

            return (
              <article key={key} className="cockpit-card p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 text-[10px] font-bold tabular-nums text-blue-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-100">{label}</h3>
                  </div>
                  {delta !== undefined ? (
                    <span
                      className={`rounded-md px-2 py-1 text-[10px] font-bold tabular-nums ${
                        delta > 0
                          ? "bg-emerald-400/[0.08] text-emerald-300"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {formatDelta(delta)}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  {before ? (
                    <ScoreProgress
                      label={label}
                      phase="初期評価"
                      score={before.score}
                      tone="baseline"
                    />
                  ) : null}
                  {after ? (
                    <ScoreProgress label={label} phase="資料反映後" score={after.score} tone="final" />
                  ) : null}
                </div>
                <details className="group mt-4 border-t border-white/[0.06] pt-3">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-slate-500 transition hover:text-slate-300">
                    根拠と改善ポイント <span className="ml-1 group-open:hidden">＋</span>
                    <span className="ml-1 hidden group-open:inline">−</span>
                  </summary>
                  <div className="mt-4 grid gap-4 text-xs leading-5 text-slate-400">
                    <div>
                      <h4 className="font-semibold text-slate-300">評価根拠</h4>
                      {evidence.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-4">
                          {evidence.map((item, evidenceIndex) => (
                            <li key={`${key}-evidence-${evidenceIndex}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2">保存された根拠はありません。</p>
                      )}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-300">評価理由</h4>
                      <p className="mt-2">
                        {nonEmptyText(selected.reason, "保存された評価理由はありません。")}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-300">次の一手</h4>
                      <p className="mt-2">
                        {nonEmptyText(selected.improvement, "保存された改善案はありません。")}
                      </p>
                    </div>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
