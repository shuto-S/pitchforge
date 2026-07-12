import { requireProjectOwner } from "@/lib/server/auth";
import { getRepository } from "@/lib/server/db";
import { renderArchitectureSvg } from "@/lib/server/export/architecture-svg";
import { jsonError, notFound } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { projectId, runId } = await params;
    const repo = getRepository();
    const { project } = await requireProjectOwner(request, projectId, repo);
    const artifacts = await repo.getArtifacts(projectId, runId);
    if (!artifacts) {
      return notFound("Artifacts not found");
    }

    const svg = renderArchitectureSvg({ project, artifacts });
    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-disposition": 'inline; filename="pitchforge-architecture.svg"',
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
