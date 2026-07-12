export type AIImageInput = {
  mimeType: string;
  data: Buffer;
};

export type GenerateJsonParams = {
  system: string;
  prompt: string;
  schemaName: string;
  schema: unknown;
  images?: AIImageInput[];
  maxAttempts?: number;
  maxOutputTokens?: number;
  temperature?: number;
  thinkingBudget?: number;
};

export interface AIProvider {
  generateJson<T>(params: GenerateJsonParams): Promise<T>;
}
