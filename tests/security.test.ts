import { describe, expect, it } from "vitest";
import { maskSecrets } from "@/lib/server/security";

describe("secret masking", () => {
  it("masks api key shaped values", () => {
    const masked = maskSecrets("GEMINI_API_KEY=demo-secret-value");
    expect(masked).toBe("GEMINI_API_KEY=****");
  });

  it("masks private key blocks", () => {
    const begin = "-----BEGIN ";
    const end = "-----END ";
    const privateLabel = "PRIVATE ";
    const keyLabel = "KEY-----";
    const key = [begin + privateLabel + keyLabel, "abc", end + privateLabel + keyLabel].join(
      "\n"
    );
    const masked = maskSecrets(key);
    expect(masked).toBe("****");
  });
});
