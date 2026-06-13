import { NextResponse } from "next/server";
import { getRepository } from "@/lib/server/db";
import { jsonError, notFound } from "@/lib/server/http";
import { runPitchForge } from "@/lib/server/ai/orchestrator";
import { getObjectStorage } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function POST(
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
    const existingRuns = await repo.listRuns(projectId);
    const activeRun = existingRuns.find((run) => ["queued", "running"].includes(run.status));
    if (activeRun) {
      return NextResponse.json(
        { runId: activeRun.id, status: activeRun.status, message: "A run is already active" },
        { status: 409 }
      );
    }

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
    return jsonError(error);
  }
}
