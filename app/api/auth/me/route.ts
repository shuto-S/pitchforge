import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
