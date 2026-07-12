import { NextResponse } from "next/server";
import { requireProjectOwner } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { getRepository } from "@/lib/server/db";
import { ActiveRunConflictError } from "@/lib/server/db/types";
import { jsonError } from "@/lib/server/http";
import { runPitchForge } from "@/lib/server/ai/orchestrator";
import { getObjectStorage } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    assertSameOrigin(request);
    const { projectId } = await params;
    const repo = getRepository();
    await requireProjectOwner(request, projectId, repo);
    const run = await repo.createRun(projectId);
    await runPitchForge({
      projectId,
      runId: run.id,
      repo,
      storage: getObjectStorage()
    });
    const completedRun = await repo.getRun(projectId, run.id);
    return NextResponse.json(
      { runId: run.id, status: completedRun?.status ?? "completed" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ActiveRunConflictError) {
      return NextResponse.json(
        {
          runId: error.run.id,
          status: error.run.status,
          message: error.message
        },
        { status: 409 }
      );
    }
    return jsonError(error);
  }
}
