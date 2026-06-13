import { NextResponse } from "next/server";
import { requireProjectOwner } from "@/lib/server/auth";
import { getRepository } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const repo = getRepository();
    const { project } = await requireProjectOwner(request, projectId, repo);
    const [assets, runs] = await Promise.all([
      repo.listAssets(projectId),
      repo.listRuns(projectId)
    ]);
    return NextResponse.json({ project, assets, runs });
  } catch (error) {
    return jsonError(error);
  }
}
