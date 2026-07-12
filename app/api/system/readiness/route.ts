import { NextResponse } from "next/server";
import { getRepository } from "@/lib/server/db";
import { getObjectStorage } from "@/lib/server/storage";

export const runtime = "nodejs";

type CheckResult = "ok" | "failed";

async function databaseCheck(): Promise<CheckResult> {
  try {
    const repository = getRepository();
    if (!repository.checkReadiness) {
      return "failed";
    }
    await repository.checkReadiness();
    return "ok";
  } catch {
    return "failed";
  }
}

async function storageCheck(): Promise<CheckResult> {
  try {
    const storage = getObjectStorage();
    if (!storage.checkReadiness) {
      return "failed";
    }
    await storage.checkReadiness();
    return "ok";
  } catch {
    return "failed";
  }
}

export async function GET() {
  const [database, storage] = await Promise.all([databaseCheck(), storageCheck()]);
  const ready = database === "ok" && storage === "ok";

  return NextResponse.json(
    {
      ready,
      checks: { database, storage }
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
