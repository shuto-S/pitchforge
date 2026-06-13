import { NextResponse } from "next/server";
import { getPublicRuntimeStatus } from "@/lib/server/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getPublicRuntimeStatus());
}
