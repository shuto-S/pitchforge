import { NextRequest, NextResponse } from "next/server";
import { createInviteSchema } from "@/lib/schemas";
import { requireAdminUser } from "@/lib/server/auth";
import { getRepository } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const invites = await getRepository().listInvites();
    return NextResponse.json({ invites });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request);
    const parsed = createInviteSchema.parse(await request.json());
    const invite = await getRepository().createInvite(parsed.email, admin.uid);
    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
