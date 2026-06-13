import { getRepository } from "@/lib/server/db";
import { jsonError, notFound } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { projectId, runId } = await params;
    const artifacts = await getRepository().getArtifacts(projectId, runId);
    if (!artifacts) {
      return notFound("Artifacts not found");
    }
    return new Response(artifacts.markdownExport, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename=\"pitchforge-${projectId}-${runId}.md\"`
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
