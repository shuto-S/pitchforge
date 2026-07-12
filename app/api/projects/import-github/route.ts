import { NextResponse } from "next/server";
import { githubProjectImportRequestSchema } from "@/lib/schemas/project";
import { getAIProvider } from "@/lib/server/ai";
import { requireUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { getPublicRuntimeStatus } from "@/lib/server/config";
import { getRepository } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import {
  GitHubImportError,
  fetchPublicGitHubRepository
} from "@/lib/server/import/github-repository";
import {
  buildMechanicalProjectDraft,
  generateProjectDraftFromRepository
} from "@/lib/server/import/project-draft";
import {
  readRequestTextWithinLimit,
  RequestBodyTooLargeError
} from "@/lib/server/request-body";
import { AsyncBulkhead } from "@/lib/server/utils/async-bulkhead";
import { safeErrorMessage } from "@/lib/server/security";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 2 * 1024;
const GITHUB_IMPORT_CONCURRENCY = 2;
const githubImportBulkhead = new AsyncBulkhead(GITHUB_IMPORT_CONCURRENCY);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);

    let rawBody: string;
    try {
      rawBody = await readRequestTextWithinLimit(request, MAX_REQUEST_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return jsonNoStore({ error: "Request is too large" }, 413);
      }
      return jsonNoStore({ error: "Invalid JSON" }, 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonNoStore({ error: "Invalid JSON" }, 400);
    }
    const input = githubProjectImportRequestSchema.parse(body);
    const reservation = await getRepository().reserveGitHubImport(user.uid, input.githubUrl);
    if (!reservation.allowed) {
      return jsonNoStore(
        {
          error: "GitHubリポジトリの読み取り回数が上限に達しました。",
          code: "GITHUB_IMPORT_RATE_LIMITED"
        },
        429,
        { "Retry-After": String(reservation.retryAfterSeconds) }
      );
    }

    return await githubImportBulkhead.run(async () => {
      const snapshot = await fetchPublicGitHubRepository(input.githubUrl);
      const warnings = [...snapshot.warnings];
      let draft = buildMechanicalProjectDraft(snapshot);
      let mode: "ai" | "mechanical" = "mechanical";

      if (getPublicRuntimeStatus().aiMode !== "mock") {
        try {
          const provider = getAIProvider({
            overallTimeoutMs: 45_000,
            requestTimeoutMs: 35_000
          });
          draft = await generateProjectDraftFromRepository(provider, snapshot);
          mode = "ai";
        } catch (error) {
          console.warn(
            "GitHub import AI fallback:",
            safeErrorMessage(error)
          );
          warnings.push(
            "AI補完を完了できなかったため、リポジトリから機械抽出した下書きを表示しています。"
          );
        }
      } else {
        warnings.push(
          "ローカル環境では、リポジトリから機械抽出した下書きを表示しています。"
        );
      }

      return jsonNoStore({
        draft,
        analyzedFiles: snapshot.files.map((file) => file.path),
        mode,
        warnings: uniqueStrings(warnings)
      });
    });
  } catch (error) {
    if (error instanceof GitHubImportError) {
      return jsonNoStore({ error: error.message, code: error.code }, error.status);
    }
    const response = jsonError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

function jsonNoStore(body: unknown, status = 200, headers: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...headers, "Cache-Control": "no-store" }
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
