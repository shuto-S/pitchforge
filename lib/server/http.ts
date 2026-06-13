import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isAuthError } from "@/lib/server/auth";
import { safeErrorMessage } from "@/lib/server/security";

export function jsonError(error: unknown, status = 500) {
  if (isAuthError(error)) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }
  return NextResponse.json({ error: safeErrorMessage(error) }, { status });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}
