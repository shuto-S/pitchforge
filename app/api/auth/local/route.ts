import { NextResponse } from "next/server";
import {
  createLocalAuthSession,
  getSessionCookieName
} from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { getRuntimeConfig } from "@/lib/server/config";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (getRuntimeConfig().authMode !== "local") {
    return unavailableResponse();
  }

  try {
    assertSameOrigin(request);
    const { sessionCookie, maxAgeSeconds, user } = await createLocalAuthSession();
    const response = NextResponse.json({ user });
    response.cookies.set(getSessionCookieName(), sessionCookie, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds
    });
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
