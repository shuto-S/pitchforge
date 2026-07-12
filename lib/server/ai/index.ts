import type { AIProvider } from "@/lib/server/ai/provider";
import {
  GeminiAIProvider,
  type GeminiAIProviderOptions
} from "@/lib/server/ai/gemini-provider";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import { getRuntimeConfig } from "@/lib/server/config";

export function getAIProvider(options: GeminiAIProviderOptions = {}): AIProvider {
  const config = getRuntimeConfig();
  if (config.aiProvider === "mock") {
    return new MockAIProvider();
  }
  if (config.aiProvider === "gemini") {
    return new GeminiAIProvider(options);
  }
  if (config.useVertex || config.hasGeminiApiKey) {
    return new GeminiAIProvider(options);
  }
  return new MockAIProvider();
}
