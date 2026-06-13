import { NextResponse } from "next/server";
import { getRepository } from "@/lib/server/db";
import { jsonError, notFound } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const repo = getRepository();
    const project = await repo.getProject(projectId);
    if (!project) {
      return notFound("Project not found");
    }
    const [assets, runs] = await Promise.all([
      repo.listAssets(projectId),
      repo.listRuns(projectId)
    ]);
    return NextResponse.json({ project, assets, runs });
  } catch (error) {
    return jsonError(error);
  }
}
