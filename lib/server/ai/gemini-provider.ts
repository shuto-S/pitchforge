import type { AIProvider, GenerateJsonParams } from "@/lib/server/ai/provider";
import { getRuntimeConfig } from "@/lib/server/config";
import { safeErrorMessage } from "@/lib/server/security";

type GoogleGenAIClient = {
  models: {
    generateContent(input: unknown): Promise<{ text?: string }>;
  };
};

type GoogleGenAIConstructor = new (options: Record<string, unknown>) => GoogleGenAIClient;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    return JSON.parse(match[1]);
  }
  throw new Error("Gemini response did not contain JSON");
}

export class GeminiAIProvider implements AIProvider {
  async generateJson<T>(params: GenerateJsonParams): Promise<T> {
    const config = getRuntimeConfig();
    const { GoogleGenAI } = (await import("@google/genai")) as unknown as {
      GoogleGenAI: GoogleGenAIConstructor;
    };
    const ai = new GoogleGenAI(
      config.useVertex
        ? {
            vertexai: true,
            project: config.googleCloudProject,
            location: config.googleCloudLocation
          }
        : { apiKey: process.env.GEMINI_API_KEY }
    );

    const parts: unknown[] = [{ text: `${params.system}\n\n${params.prompt}` }];
    for (const image of params.images ?? []) {
      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data.toString("base64")
        }
      });
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model: config.geminiModel,
          contents: [{ role: "user", parts }],
          config: {
            responseMimeType: "application/json"
          }
        });
        const text = response.text ?? "";
        return extractJson(text) as T;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }

    throw new Error(`Gemini generation failed: ${safeErrorMessage(lastError)}`);
  }
}
