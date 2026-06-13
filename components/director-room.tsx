import type { Run, RunEvent } from "@/lib/schemas/project";

const agentTone: Record<string, string> = {
  AI監督: "bg-ink text-white",
  AI審査員: "bg-forge text-white",
  AI脚本家: "bg-cloud text-white",
  AI編集者: "bg-gemini text-white",
  AIアートディレクター: "bg-ink text-white",
  AIプロデューサー: "bg-forge text-white",
  AI改善担当: "bg-gemini text-white"
};

export function DirectorRoom({ run, events }: { run: Run | null; events: RunEvent[] }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-5 shadow-soft">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Director Room</h2>
          <p className="mt-1 text-sm text-muted">
            {run ? `${run.currentStep} / ${run.progress}%` : "まだrunはありません。"}
          </p>
        </div>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-forge transition-all"
            style={{ width: `${run?.progress ?? 0}%` }}
          />
        </div>
      </div>
      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-white p-4 text-sm text-muted">
            AI監督に見せると、ここに各エージェントの進行ログが表示されます。
          </div>
        ) : (
          events.map((event) => (
            <article key={event.id} className="rounded-md border border-line bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    agentTone[event.agentName] ?? "bg-ink text-white"
                  }`}
                >
                  {event.agentName}
                </span>
                <span className="text-xs text-muted">
                  {new Date(event.createdAt).toLocaleTimeString("ja-JP")}
                </span>
              </div>
              <p className="text-sm leading-6">{event.message}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
