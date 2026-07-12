import type { ZodError } from "zod";
import type { AIProvider, GenerateJsonParams } from "@/lib/server/ai/provider";
import {
  requireZodSchema,
  zodToGeminiSchema
} from "@/lib/server/ai/zod-to-gemini-schema";
import { getRuntimeConfig } from "@/lib/server/config";
import { safeErrorMessage } from "@/lib/server/security";

export type GeminiGenerateClient = {
  models: {
    generateContent(input: unknown): Promise<{ text?: string }>;
  };
};

type GoogleGenAIConstructor = new (options: Record<string, unknown>) => GeminiGenerateClient;

export type GeminiAIProviderOptions = {
  client?: GeminiGenerateClient;
  model?: string;
  now?: () => number;
  overallTimeoutMs?: number;
  requestTimeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_OVERALL_TIMEOUT_MS = 13 * 60 * 1_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ALLOWED_ATTEMPTS = 10;
const OVERALL_DEADLINE_ERROR = "Gemini overall generation deadline exceeded";

function optionalPositiveInteger(
  value: number | undefined,
  name: string,
  maximum?: number
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value <= 0 || (maximum !== undefined && value > maximum)) {
    const maximumMessage = maximum === undefined ? "" : ` and at most ${maximum}`;
    throw new Error(`${name} must be a positive integer${maximumMessage}`);
  }
  return value;
}

function optionalNonNegativeInteger(
  value: number | undefined,
  name: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function optionalTemperature(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error("temperature must be between 0 and 2");
  }
  return value;
}

class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly retryInstruction: string
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

function invalidJsonError(): StructuredOutputError {
  return new StructuredOutputError(
    "Gemini response was not valid JSON",
    "The previous response was not valid JSON. Return only one JSON value matching the requested schema."
  );
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed);
    }
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      return JSON.parse(match[1]);
    }
  } catch {
    throw invalidJsonError();
  }
  throw invalidJsonError();
}

function safeIssuePath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "$response";
  }
  return path
    .map((segment) =>
      typeof segment === "number"
        ? `[${segment}]`
        : segment.replace(/[^A-Za-z0-9_-]/g, "?").slice(0, 48)
    )
    .join(".");
}

function summarizeValidationIssues(error: ZodError): string {
  const summary = error.issues
    .slice(0, 5)
    .map((issue) => `${safeIssuePath(issue.path)} (${issue.code})`)
    .join(", ");
  const remaining = error.issues.length - 5;
  return remaining > 0 ? `${summary}, and ${remaining} more issue(s)` : summary;
}

function schemaMismatchError(schemaName: string, error: ZodError): StructuredOutputError {
  const issues = summarizeValidationIssues(error);
  return new StructuredOutputError(
    `Gemini response did not match ${schemaName}: ${issues}`,
    `The previous response did not match ${schemaName}. Fix these validation issues: ${issues}. Return only corrected JSON matching the requested schema.`
  );
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class GeminiRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini request timed out after ${timeoutMs}ms`);
    this.name = "GeminiRequestTimeoutError";
  }
}

async function generateWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = Promise.resolve().then(() => operation(controller.signal));
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new GeminiRequestTimeoutError(timeoutMs));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export class GeminiAIProvider implements AIProvider {
  private readonly deadlineAt: number;
  private readonly now: () => number;

  constructor(private readonly options: GeminiAIProviderOptions = {}) {
    this.now = options.now ?? Date.now;
    this.deadlineAt =
      this.now() + (options.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS);
  }

  async generateJson<T>(params: GenerateJsonParams): Promise<T> {
    this.requireRemainingBudget();
    const maxAttempts =
      optionalPositiveInteger(params.maxAttempts, "maxAttempts", MAX_ALLOWED_ATTEMPTS) ??
      DEFAULT_MAX_ATTEMPTS;
    const maxOutputTokens = optionalPositiveInteger(
      params.maxOutputTokens,
      "maxOutputTokens"
    );
    const temperature = optionalTemperature(params.temperature);
    const thinkingBudget = optionalNonNegativeInteger(
      params.thinkingBudget,
      "thinkingBudget"
    );
    const config = getRuntimeConfig();
    let ai = this.options.client;
    if (!ai) {
      const { GoogleGenAI } = (await import("@google/genai")) as unknown as {
        GoogleGenAI: GoogleGenAIConstructor;
      };
      ai = new GoogleGenAI(
        config.useVertex
          ? {
              vertexai: true,
              project: config.googleCloudProject,
              location: config.googleCloudLocation
            }
          : { apiKey: process.env.GEMINI_API_KEY }
      );
    }

    const outputSchema = requireZodSchema(params.schema);
    const responseSchema = zodToGeminiSchema(outputSchema);
    const imageParts = (params.images ?? []).map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data.toString("base64")
      }
    }));
    const sleep = this.options.sleep ?? defaultSleep;
    const requestTimeoutMs = this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    let correctionInstruction: string | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const prompt = correctionInstruction
        ? `${params.prompt}\n\n${correctionInstruction}`
        : params.prompt;
      const parts: unknown[] = [{ text: prompt }, ...imageParts];
      const attemptTimeoutMs = Math.min(
        requestTimeoutMs,
        this.requireRemainingBudget()
      );

      try {
        const response = await generateWithTimeout(
          (abortSignal) =>
            ai.models.generateContent({
              model: this.options.model ?? config.geminiModel,
              contents: [{ role: "user", parts }],
              config: {
                abortSignal,
                systemInstruction: params.system,
                responseMimeType: "application/json",
                responseSchema,
                ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
                ...(temperature === undefined ? {} : { temperature }),
                ...(thinkingBudget === undefined
                  ? {}
                  : { thinkingConfig: { thinkingBudget } })
              }
            }),
          attemptTimeoutMs
        );
        this.requireRemainingBudget();
        const parsed = extractJson(response.text ?? "");
        const validated = outputSchema.safeParse(parsed);
        if (!validated.success) {
          throw schemaMismatchError(params.schemaName, validated.error);
        }
        this.requireRemainingBudget();
        return validated.data as T;
      } catch (error) {
        lastError = error;
        if (error instanceof StructuredOutputError) {
          correctionInstruction = error.retryInstruction;
        }
        const remainingMs = this.remainingBudgetMs();
        if (remainingMs <= 0) {
          throw new Error(OVERALL_DEADLINE_ERROR);
        }
        if (attempt < maxAttempts - 1) {
          await sleep(Math.min(300 * (attempt + 1), remainingMs));
          this.requireRemainingBudget();
        }
      }
    }

    throw new Error(`Gemini generation failed: ${safeErrorMessage(lastError)}`);
  }

  private remainingBudgetMs(): number {
    return this.deadlineAt - this.now();
  }

  private requireRemainingBudget(): number {
    const remainingMs = this.remainingBudgetMs();
    if (remainingMs <= 0) {
      throw new Error(OVERALL_DEADLINE_ERROR);
    }
    return remainingMs;
  }
}
