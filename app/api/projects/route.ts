import { NextRequest, NextResponse } from "next/server";
import { projectInputSchema } from "@/lib/schemas";
import { requireUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { getRepository } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const projects = await getRepository().listProjects(user.uid);
    return NextResponse.json({ projects });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json();
    const parsed = projectInputSchema.parse(body);
    const repo = getRepository();
    const project = await repo.createProject({
      ...parsed,
      ownerUid: user.uid,
      ownerEmail: user.email,
      productUrl: parsed.productUrl || undefined,
      githubUrl: parsed.githubUrl || undefined
    });
    return NextResponse.json({ projectId: project.id, project }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
