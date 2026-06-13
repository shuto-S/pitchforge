import { NextResponse } from "next/server";
import { getRepository } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { projectId, runId } = await params;
    const events = await getRepository().listRunEvents(projectId, runId);
    return NextResponse.json({ events });
  } catch (error) {
    return jsonError(error);
  }
}
