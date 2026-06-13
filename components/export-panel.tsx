import type { ArtifactBundle } from "@/lib/schemas/artifact";

export function ExportPanel({
  projectId,
  runId,
  artifacts
}: {
  projectId: string;
  runId?: string;
  artifacts: ArtifactBundle | null;
}) {
  const mdUrl = runId ? `/api/projects/${projectId}/runs/${runId}/export.md` : "#";
  const jsonUrl = artifacts
    ? `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(artifacts.jsonExport, null, 2)
      )}`
    : "#";

  return (
    <section className="rounded-lg border border-line bg-panel p-5 shadow-soft">
      <h2 className="text-xl font-semibold">Export</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        MarkdownとJSONを出力し、Proto Pediaや動画台本の作成に使います。
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          aria-disabled={!artifacts || !runId}
          href={artifacts && runId ? mdUrl : undefined}
          className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Markdown download
        </a>
        <a
          aria-disabled={!artifacts}
          href={artifacts ? jsonUrl : undefined}
          download="pitchforge-output.json"
          className="rounded-md border border-line bg-white px-4 py-3 text-sm font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          JSON download
        </a>
      </div>
    </section>
  );
}
