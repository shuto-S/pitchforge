import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generatedArtifactsSchema } from "@/lib/schemas/artifact";
import {
  demoScriptsSchema,
  directorStrategySchema,
  judgeScoreSchema,
  projectBriefSchema,
  protoPediaContentSchema,
  revisionPlanSchema,
  submissionChecklistSchema,
  visualConceptsSchema
} from "@/lib/schemas/agent";
import {
  GeminiAIProvider,
  type GeminiGenerateClient
} from "@/lib/server/ai/gemini-provider";
import {
  type GeminiJsonSchema,
  zodToGeminiSchema
} from "@/lib/server/ai/zod-to-gemini-schema";

type CapturedRequest = {
  model: string;
  contents: Array<{
    role: string;
    parts: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
    }>;
  }>;
  config: {
    abortSignal: AbortSignal;
    systemInstruction: string;
    responseMimeType: string;
    responseSchema: GeminiJsonSchema;
    maxOutputTokens?: number;
    temperature?: number;
    thinkingConfig?: { thinkingBudget: number };
  };
};

class FakeGeminiClient implements GeminiGenerateClient {
  readonly requests: CapturedRequest[] = [];

  constructor(private readonly responseTexts: string[]) {}

  readonly models = {
    generateContent: async (input: unknown): Promise<{ text?: string }> => {
      this.requests.push(input as CapturedRequest);
      const text = this.responseTexts.shift();
      if (text === undefined) {
        throw new Error("Fake Gemini response queue is empty");
      }
      return { text };
    }
  };
}

class HangingGeminiClient implements GeminiGenerateClient {
  readonly requests: CapturedRequest[] = [];

  readonly models = {
    generateContent: async (input: unknown): Promise<{ text?: string }> => {
      this.requests.push(input as CapturedRequest);
      return new Promise(() => undefined);
    }
  };
}

const resultSchema = z.object({
  count: z.number().int().min(0).max(10),
  status: z.enum(["ready", "missing"])
});

function createProvider(client: FakeGeminiClient): GeminiAIProvider {
  return new GeminiAIProvider({
    client,
    model: "gemini-test-model",
    sleep: async () => undefined
  });
}

describe("GeminiAIProvider structured output", () => {
  it("sends responseSchema and retries a schema-invalid response with safe correction guidance", async () => {
    const sensitiveBody = "SENSITIVE_GENERATED_BODY_DO_NOT_REPEAT";
    const client = new FakeGeminiClient([
      JSON.stringify({ count: sensitiveBody, status: "ready" }),
      JSON.stringify({ count: 2, status: "ready" })
    ]);

    const result = await createProvider(client).generateJson<z.infer<typeof resultSchema>>({
      system: "system instruction",
      prompt: "original prompt",
      schemaName: "TestResult",
      schema: resultSchema
    });

    expect(result).toEqual({ count: 2, status: "ready" });
    expect(client.requests).toHaveLength(2);
    expect(client.requests[0]).toMatchObject({
      model: "gemini-test-model",
      config: {
        systemInstruction: "system instruction",
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            count: { type: "integer", minimum: 0, maximum: 10 },
            status: { type: "string", enum: ["ready", "missing"] }
          },
          required: ["count", "status"]
        }
      }
    });

    const initialPrompt = client.requests[0].contents[0].parts[0].text ?? "";
    const retryPrompt = client.requests[1].contents[0].parts[0].text ?? "";
    expect(initialPrompt).toBe("original prompt");
    expect(initialPrompt).not.toContain("system instruction");
    expect(retryPrompt).toContain("The previous response did not match TestResult");
    expect(retryPrompt).toContain("count (invalid_type)");
    expect(retryPrompt).toContain("original prompt");
    expect(retryPrompt).not.toContain("system instruction");
    expect(retryPrompt).not.toContain(sensitiveBody);
    for (const request of client.requests) {
      expect(request.config.systemInstruction).toBe("system instruction");
      expect(request.config.systemInstruction).not.toContain("The previous response");
      expect(request.config).not.toHaveProperty("thinkingConfig");
      expect(request.config).not.toHaveProperty("temperature");
    }
  });

  it("keeps untrusted project text and images in the user role", async () => {
    const system = "TRUSTED_SYSTEM_BOUNDARY";
    const untrustedPrompt = "UNTRUSTED_PROJECT_PROMPT";
    const image = Buffer.from("untrusted screenshot bytes");
    const client = new FakeGeminiClient([
      JSON.stringify({ count: 1, status: "ready" })
    ]);

    await createProvider(client).generateJson({
      system,
      prompt: untrustedPrompt,
      schemaName: "TestResult",
      schema: resultSchema,
      images: [{ mimeType: "image/png", data: image }]
    });

    expect(client.requests).toHaveLength(1);
    const request = client.requests[0];
    expect(request.config.systemInstruction).toBe(system);
    expect(request.contents).toHaveLength(1);
    expect(request.contents[0].role).toBe("user");
    expect(request.contents[0].parts[0]).toEqual({ text: untrustedPrompt });
    expect(request.contents[0].parts[0].text).not.toContain(system);
    expect(request.contents[0].parts[1]).toEqual({
      inlineData: {
        mimeType: "image/png",
        data: image.toString("base64")
      }
    });
  });

  it("stops after three invalid responses without exposing generated content", async () => {
    const sensitiveBody = "SENSITIVE_GENERATED_BODY_DO_NOT_EXPOSE";
    const client = new FakeGeminiClient(
      Array.from({ length: 3 }, () =>
        JSON.stringify({ count: sensitiveBody, status: "not-an-enum-value" })
      )
    );

    let thrown: unknown;
    try {
      await createProvider(client).generateJson({
        system: "system instruction",
        prompt: "original prompt",
        schemaName: "TestResult",
        schema: resultSchema
      });
    } catch (error) {
      thrown = error;
    }

    expect(client.requests).toHaveLength(3);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Gemini generation failed");
    expect((thrown as Error).message).toContain("TestResult");
    expect((thrown as Error).message).not.toContain(sensitiveBody);
    for (const request of client.requests.slice(1)) {
      expect(request.contents[0].parts[0].text).not.toContain(sensitiveBody);
    }
  });

  it("supports bounded low-variance generation with thinking disabled", async () => {
    const client = new FakeGeminiClient([
      JSON.stringify({ count: "invalid", status: "ready" })
    ]);

    await expect(
      createProvider(client).generateJson({
        system: "system instruction",
        prompt: "repository draft",
        schemaName: "TestResult",
        schema: resultSchema,
        maxAttempts: 1,
        maxOutputTokens: 2048,
        temperature: 0.1,
        thinkingBudget: 0
      })
    ).rejects.toThrow("Gemini generation failed");

    expect(client.requests).toHaveLength(1);
    expect(client.requests[0].config).toMatchObject({
      maxOutputTokens: 2048,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 0 }
    });
  });

  it("rejects invalid generation controls before making an SDK request", async () => {
    const client = new FakeGeminiClient([
      JSON.stringify({ count: 1, status: "ready" })
    ]);
    const provider = createProvider(client);

    await expect(
      provider.generateJson({
        system: "system instruction",
        prompt: "repository draft",
        schemaName: "TestResult",
        schema: resultSchema,
        temperature: 2.1
      })
    ).rejects.toThrow("temperature must be between 0 and 2");
    await expect(
      provider.generateJson({
        system: "system instruction",
        prompt: "repository draft",
        schemaName: "TestResult",
        schema: resultSchema,
        thinkingBudget: -1
      })
    ).rejects.toThrow("thinkingBudget must be a non-negative integer");

    expect(client.requests).toHaveLength(0);
  });

  it("aborts and force-times-out every attempt even when the SDK ignores the signal", async () => {
    const client = new HangingGeminiClient();
    const provider = new GeminiAIProvider({
      client,
      model: "gemini-test-model",
      requestTimeoutMs: 5,
      sleep: async () => undefined
    });

    await expect(
      provider.generateJson({
        system: "system instruction",
        prompt: "original prompt",
        schemaName: "TestResult",
        schema: resultSchema
      })
    ).rejects.toThrow("Gemini generation failed: Gemini request timed out after 5ms");

    expect(client.requests).toHaveLength(3);
    for (const request of client.requests) {
      expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
      expect(request.config.abortSignal.aborted).toBe(true);
      expect(request.config.systemInstruction).toBe("system instruction");
      expect(request.config.responseSchema).toBeTruthy();
      expect(request.contents[0].role).toBe("user");
    }
  });

  it("shares one overall deadline across multiple generateJson calls", async () => {
    let now = 1_000;
    const client = new FakeGeminiClient([
      JSON.stringify({ count: 1, status: "ready" }),
      JSON.stringify({ count: 2, status: "ready" })
    ]);
    const provider = new GeminiAIProvider({
      client,
      model: "gemini-test-model",
      now: () => now,
      overallTimeoutMs: 100,
      sleep: async () => undefined
    });

    await expect(
      provider.generateJson({
        system: "system instruction",
        prompt: "first prompt",
        schemaName: "TestResult",
        schema: resultSchema
      })
    ).resolves.toEqual({ count: 1, status: "ready" });

    now = 1_100;
    await expect(
      provider.generateJson({
        system: "system instruction",
        prompt: "second prompt",
        schemaName: "TestResult",
        schema: resultSchema
      })
    ).rejects.toThrow("Gemini overall generation deadline exceeded");
    expect(client.requests).toHaveLength(1);
  });

  it("caps an attempt at the remaining overall budget and fails without extra retries", async () => {
    const client = new HangingGeminiClient();
    const provider = new GeminiAIProvider({
      client,
      model: "gemini-test-model",
      overallTimeoutMs: 100,
      requestTimeoutMs: 1_000,
      sleep: async () => undefined
    });

    await expect(
      provider.generateJson({
        system: "system instruction",
        prompt: "original prompt",
        schemaName: "TestResult",
        schema: resultSchema
      })
    ).rejects.toThrow("Gemini overall generation deadline exceeded");
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0].config.abortSignal.aborted).toBe(true);
  });

  it("clears the per-attempt timer after a successful response", async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeGeminiClient([
        JSON.stringify({ count: 1, status: "ready" })
      ]);
      const provider = new GeminiAIProvider({
        client,
        model: "gemini-test-model",
        now: () => 0,
        overallTimeoutMs: 1_000,
        requestTimeoutMs: 500,
        sleep: async () => undefined
      });

      await expect(
        provider.generateJson({
          system: "system instruction",
          prompt: "original prompt",
          schemaName: "TestResult",
          schema: resultSchema
        })
      ).resolves.toEqual({ count: 1, status: "ready" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("zodToGeminiSchema", () => {
  it("converts every current agent output schema", () => {
    const currentAgentSchemas = [
      projectBriefSchema,
      judgeScoreSchema,
      directorStrategySchema,
      demoScriptsSchema,
      protoPediaContentSchema,
      visualConceptsSchema,
      submissionChecklistSchema,
      revisionPlanSchema,
      generatedArtifactsSchema
    ];

    for (const schema of currentAgentSchemas) {
      expect(() => zodToGeminiSchema(schema)).not.toThrow();
    }
  });

  it("uses the string limit representation expected by the installed Gemini SDK", () => {
    const schema = z.object({
      label: z.string().min(1).max(20),
      items: z.array(z.string()).min(1).max(5)
    });

    expect(zodToGeminiSchema(schema)).toMatchObject({
      properties: {
        label: { minLength: "1", maxLength: "20" },
        items: { minItems: "1", maxItems: "5" }
      }
    });
  });

  it("fails explicitly for unsupported Zod types", () => {
    expect(() => zodToGeminiSchema(z.boolean())).toThrow(
      "Unsupported Zod schema for Gemini responseSchema at $response: ZodBoolean"
    );
  });
});
