import { NextResponse } from "next/server";
import { requireProjectOwner } from "@/lib/server/auth";
import { getRepository } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { projectId, runId } = await params;
    const repo = getRepository();
    await requireProjectOwner(request, projectId, repo);
    const events = await repo.listRunEvents(projectId, runId);
    return NextResponse.json({ events });
  } catch (error) {
    return jsonError(error);
  }
}
