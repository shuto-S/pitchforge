import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createFirebaseSession,
  getSessionCookieName
} from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

const sessionRequestSchema = z.object({
  idToken: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = sessionRequestSchema.parse(await request.json());
    const { sessionCookie, maxAgeSeconds, user } = await createFirebaseSession(parsed.idToken);
    const response = NextResponse.json({ user });
    response.cookies.set(getSessionCookieName(), sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
