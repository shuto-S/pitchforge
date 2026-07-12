import { describe, expect, it } from "vitest";
import {
  HIDDEN_EXTERNAL_URL_TEXT,
  externalHttpUrlDisplayText,
  redactCredentialBearingHttpUrls,
  safeExternalHttpUrl,
  sanitizeCredentialBearingUrls
} from "@/lib/safe-external-url";

describe("safeExternalHttpUrl", () => {
  it.each([
    ["https://example.com/demo?q=1", "https://example.com/demo?q=1"],
    [" HTTP://EXAMPLE.COM/path ", "http://example.com/path"]
  ])("accepts absolute HTTP(S) links: %s", (input, expected) => {
    expect(safeExternalHttpUrl(input)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://user:password@example.com/private",
    "//example.com/path",
    "/relative/path",
    "https://example.com/\nnext",
    "not a URL"
  ])("rejects non-HTTP, credential-bearing, relative, or malformed links: %s", (input) => {
    expect(safeExternalHttpUrl(input)).toBeNull();
  });

  it("redacts credential-bearing URLs without retaining any credential or host fragment", () => {
    const rawUrl = "https://legacy-user:super-secret@example.com/private";
    const redacted = redactCredentialBearingHttpUrls(`before ${rawUrl} after`);

    expect(redacted).toBe(`before ${HIDDEN_EXTERNAL_URL_TEXT} after`);
    expect(redacted).not.toContain("legacy-user");
    expect(redacted).not.toContain("super-secret");
    expect(redacted).not.toContain("example.com/private");
    expect(externalHttpUrlDisplayText(rawUrl)).toBe(HIDDEN_EXTERNAL_URL_TEXT);
  });

  it("redacts credential-bearing URLs recursively in persisted JSON-like data", () => {
    const rawUrl = "https://user:password@example.com/private";
    const sanitized = sanitizeCredentialBearingUrls({
      nested: [{ value: rawUrl }],
      safe: "https://example.com/public"
    });

    expect(JSON.stringify(sanitized)).not.toContain(rawUrl);
    expect(sanitized.nested[0].value).toBe(HIDDEN_EXTERNAL_URL_TEXT);
    expect(sanitized.safe).toBe("https://example.com/public");
  });
});
