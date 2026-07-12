import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createIdentityPlatformSession, getSessionCookieName } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { getRuntimeConfig } from "@/lib/server/config";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

const sessionRequestSchema = z.object({
  idToken: z.string().min(1).max(20_000)
});

export async function POST(request: NextRequest) {
  if (getRuntimeConfig().authMode !== "identity-platform") {
    return unavailableResponse();
  }

  try {
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 32_768) {
      return NextResponse.json(
        { error: "Request is too large" },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }
    const parsed = sessionRequestSchema.parse(await request.json());
    const { sessionCookie, maxAgeSeconds, user } =
      await createIdentityPlatformSession(parsed.idToken);
    const response = NextResponse.json({ user });
    response.cookies.set(getSessionCookieName(), sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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
