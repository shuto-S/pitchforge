import { NextResponse } from "next/server";
import { requireProjectOwner } from "@/lib/server/auth";
import { getRepository } from "@/lib/server/db";
import { jsonError, notFound } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { projectId, runId } = await params;
    const repo = getRepository();
    await requireProjectOwner(request, projectId, repo);
    const run = await repo.getRun(projectId, runId);
    if (!run) {
      return notFound("Run not found");
    }
    return NextResponse.json({ run });
  } catch (error) {
    return jsonError(error);
  }
}
