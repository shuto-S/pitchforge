import { NextRequest, NextResponse } from "next/server";
import { projectInputSchema } from "@/lib/schemas";
import { getRepository } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = projectInputSchema.parse(body);
    const repo = getRepository();
    const project = await repo.createProject({
      ...parsed,
      productUrl: parsed.productUrl || undefined,
      githubUrl: parsed.githubUrl || undefined
    });
    return NextResponse.json({ projectId: project.id, project }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
