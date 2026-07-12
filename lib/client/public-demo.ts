export function shouldLoadCurrentUser(pathname: string): boolean {
  return pathname !== "/demo" && !pathname.startsWith("/demo/");
}

export function shouldRequestRuntimeStatus(statusOverride: unknown): boolean {
  return statusOverride === undefined;
}

export function resolveExportUrls({
  projectId,
  runId,
  markdownUrl,
  architectureUrl
}: {
  projectId: string;
  runId?: string;
  markdownUrl?: string;
  architectureUrl?: string;
}) {
  return {
    markdown:
      markdownUrl ?? (runId ? `/api/projects/${projectId}/runs/${runId}/export.md` : "#"),
    architecture:
      architectureUrl ??
      (runId
        ? `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(
            runId
          )}/architecture.svg`
        : undefined)
  };
}
