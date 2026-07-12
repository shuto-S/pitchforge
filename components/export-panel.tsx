import type { ArtifactBundle } from "@/lib/schemas/artifact";
import { ArchitectureExport } from "@/components/architecture-export";
import { sanitizeCredentialBearingUrls } from "@/lib/safe-external-url";

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
        JSON.stringify(sanitizeCredentialBearingUrls(artifacts.jsonExport), null, 2)
      )}`
    : "#";
  const architectureUrl =
    artifacts && runId
      ? `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(
          runId
        )}/architecture.svg`
      : undefined;

  return (
    <section className="cockpit-panel p-5 sm:p-7">
      <div className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="cockpit-kicker">エクスポート</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">成果物を保存</h2>
          <p className="mt-2 text-sm text-slate-400">共有・レビューに使える形式で書き出します。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="cockpit-chip">Markdown</span>
          <span className="cockpit-chip">JSON</span>
          <span className="cockpit-chip">SVG</span>
          <span className="cockpit-chip">PNG</span>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <a
          aria-disabled={!artifacts || !runId}
          href={artifacts && runId ? mdUrl : undefined}
          className="cockpit-button-primary aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          Markdownを保存
        </a>
        <a
          aria-disabled={!artifacts}
          href={artifacts ? jsonUrl : undefined}
          download="pitchforge-output.json"
          className="cockpit-button-secondary aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          JSONを保存
        </a>
      </div>
      <ArchitectureExport architectureUrl={architectureUrl} />
    </section>
  );
}
