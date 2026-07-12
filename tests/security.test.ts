import { describe, expect, it } from "vitest";
import {
  maskPublicRepositorySecrets,
  maskSecrets,
  safeErrorMessage
} from "@/lib/server/security";

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

  it("redacts credential-bearing URLs including their hosts and paths", () => {
    const message = safeErrorMessage(
      new Error(
        "DB failed at postgres://db-user:p%40ssword@private-db.internal:5432/pitchforge?sslmode=require"
      )
    );

    expect(message).toBe("DB failed at [credential URL redacted]");
    expect(message).not.toContain("db-user");
    expect(message).not.toContain("p%40ssword");
    expect(message).not.toContain("private-db.internal");
  });

  it("redacts credential-bearing URLs for arbitrary schemes but preserves public URLs", () => {
    expect(
      maskSecrets("Cache failed at redis://cache-user:secret@cache.internal:6379/0")
    ).toBe("Cache failed at [credential URL redacted]");
    expect(maskSecrets("See https://public.example.test/docs")).toBe(
      "See https://public.example.test/docs"
    );
  });

  it("redacts common credentials found in public repository text", () => {
    const githubToken = `github_pat_${"a".repeat(30)}`;
    const awsKey = `AKIA${"A".repeat(16)}`;
    const masked = maskPublicRepositorySecrets(
      `TOKEN=${githubToken}\nAWS_ACCESS_KEY_ID=${awsKey}\nclient_secret=super-secret-value`
    );

    expect(masked).not.toContain(githubToken);
    expect(masked).not.toContain(awsKey);
    expect(masked).not.toContain("super-secret-value");
    expect(masked).toContain("****");
  });

  it("redacts generic tokens and incomplete private-key blocks", () => {
    // Assemble realistic shapes at runtime so repository push protection does
    // not mistake the inert masking fixtures for live credentials.
    const slackToken = ["xoxb", "1234567890", "abcdefghijklmnop"].join("-");
    const openAiToken = ["sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
    const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const masked = maskPublicRepositorySecrets(
      [
        `SLACK_TOKEN=${slackToken}`,
        `OPENAI_API_KEY=${openAiToken}`,
        privateKeyHeader,
        "partial-private-key-material"
      ].join("\n")
    );

    expect(masked).not.toContain(slackToken);
    expect(masked).not.toContain(openAiToken);
    expect(masked).not.toContain("partial-private-key-material");
  });

  it("redacts sensitive assignments in JSON, YAML, TOML, and ENV text", () => {
    const secrets = [
      "json-password-with-escaped-\\\"quote",
      "json-api-key",
      "yaml secret value",
      "toml-client-secret",
      "env-access-token",
      "short"
    ];
    const masked = maskPublicRepositorySecrets(
      [
        `{"password":"${secrets[0]}","apiKey": "${secrets[1]}"}`,
        `database:\n  password: ${secrets[2]} # redact the complete YAML scalar`,
        `client_secret = '${secrets[3]}'`,
        `export ACCESS_TOKEN=${secrets[4]}`,
        `token: "${secrets[5]}"`
      ].join("\n")
    );

    for (const secret of secrets) {
      expect(masked).not.toContain(secret);
    }
    expect(masked).toContain('"password":"****"');
    expect(masked).toContain('"apiKey": "****"');
    expect(masked).toContain("password: **** # redact the complete YAML scalar");
    expect(masked).toContain("client_secret = '****'");
    expect(masked).toContain("export ACCESS_TOKEN=****");
  });

  it("does not redact non-secret keys that merely contain sensitive words", () => {
    const input = [
      'tokenBudget: 2048',
      'passwordPolicy = "strong"',
      'apiKeyHint: "configured in Secret Manager"',
      'secretary: "Ada"'
    ].join("\n");

    expect(maskPublicRepositorySecrets(input)).toBe(input);
  });
});
