import { NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(getSessionCookieName(), "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const response = jsonError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
