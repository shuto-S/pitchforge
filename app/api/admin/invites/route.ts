import { NextRequest, NextResponse } from "next/server";
import { createInviteSchema } from "@/lib/schemas";
import { requireAdminUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { getRuntimeConfig } from "@/lib/server/config";
import { getRepository } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (getRuntimeConfig().authMode !== "identity-platform") {
    return unavailableResponse();
  }

  try {
    await requireAdminUser(request);
    const invites = await getRepository().listInvites();
    const response = NextResponse.json({ invites });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const response = jsonError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

export async function POST(request: NextRequest) {
  if (getRuntimeConfig().authMode !== "identity-platform") {
    return unavailableResponse();
  }

  try {
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 4096) {
      return NextResponse.json(
        { error: "Request is too large" },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }
    const admin = await requireAdminUser(request);
    const parsed = createInviteSchema.parse(await request.json());
    const invite = await getRepository().createInvite(parsed.email, admin.uid);
    const response = NextResponse.json({ invite }, { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const response = jsonError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

function unavailableResponse() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}
