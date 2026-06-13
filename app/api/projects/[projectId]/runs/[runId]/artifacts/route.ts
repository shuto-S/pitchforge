import { NextResponse } from "next/server";
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
    return NextResponse.json(artifacts);
  } catch (error) {
    return jsonError(error);
  }
}
