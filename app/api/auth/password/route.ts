import { NextResponse } from "next/server";
import { z } from "zod";
import { createPasswordAuthSession, getSessionCookieName } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

const passwordLoginRequestSchema = z
  .object({
    loginId: z.string().trim().min(1).max(128),
    password: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 256, "Password is too long")
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 4096) {
      return NextResponse.json(
        { error: "Request is too large" },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 4096) {
      return NextResponse.json(
        { error: "Request is too large" },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    const credentials = passwordLoginRequestSchema.parse(parsedBody);
    const { sessionCookie, maxAgeSeconds, user } =
      await createPasswordAuthSession(credentials);
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
