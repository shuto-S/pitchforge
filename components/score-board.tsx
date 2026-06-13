import type { JudgeScore } from "@/lib/schemas/agent";

export function ScoreBoard({
  baselineScore,
  finalScore
}: {
  baselineScore?: JudgeScore;
  finalScore?: JudgeScore;
}) {
  if (!baselineScore && !finalScore) {
    return (
      <section className="rounded-lg border border-line bg-panel p-5 shadow-soft">
        <h2 className="text-xl font-semibold">Scoreboard</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          run完了後に改善前後のスコアが表示されます。
        </p>
      </section>
    );
  }

  const finalByKey = new Map(finalScore?.categories.map((category) => [category.key, category]));

  return (
    <section className="rounded-lg border border-line bg-panel p-5 shadow-soft">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Scoreboard</h2>
          <p className="mt-2 text-sm text-muted">
            総合スコア: {baselineScore?.totalScore ?? "-"} {"->"}{" "}
            {finalScore?.totalScore ?? "-"}
          </p>
        </div>
        {baselineScore && finalScore ? (
          <div className="text-4xl font-semibold text-forge">
            +{finalScore.totalScore - baselineScore.totalScore}
          </div>
        ) : null}
      </div>
      <div className="space-y-3">
        {(baselineScore?.categories ?? finalScore?.categories ?? []).map((category) => {
          const after = finalByKey.get(category.key);
          const beforeValue = category.score;
          const afterValue = after?.score ?? beforeValue;
          return (
            <div key={category.key} className="rounded-md border border-line bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{category.label}</span>
                <span className="text-muted">
                  {beforeValue} {"->"} {afterValue}
                </span>
              </div>
              <div className="grid gap-2">
                <div className="h-2 rounded-full bg-line">
                  <div className="h-2 rounded-full bg-muted" style={{ width: `${beforeValue}%` }} />
                </div>
                <div className="h-2 rounded-full bg-line">
                  <div className="h-2 rounded-full bg-forge" style={{ width: `${afterValue}%` }} />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{after?.improvement ?? category.improvement}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
