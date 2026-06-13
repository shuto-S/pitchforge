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
    const run = await getRepository().getRun(projectId, runId);
    if (!run) {
      return notFound("Run not found");
    }
    return NextResponse.json({ run });
  } catch (error) {
    return jsonError(error);
  }
}
