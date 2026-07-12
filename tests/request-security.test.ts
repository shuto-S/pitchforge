import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSameOrigin } from "@/lib/server/auth/request-security";

describe("same-origin request guard", () => {
  const originalCloudRunService = process.env.K_SERVICE;

  beforeEach(() => {
    delete process.env.K_SERVICE;
  });

  afterEach(() => {
    if (originalCloudRunService === undefined) {
      delete process.env.K_SERVICE;
    } else {
      process.env.K_SERVICE = originalCloudRunService;
    }
  });

  it("accepts same-origin and non-browser requests", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://pitchforge.test/api/projects", {
          method: "POST",
          headers: { origin: "https://pitchforge.test" }
        })
      )
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://pitchforge.test/api/projects", { method: "POST" })
      )
    ).not.toThrow();
  });

  it("rejects mismatched origins and cross-site fetch metadata", () => {
    const requests = [
      new Request("https://pitchforge.test/api/projects", {
        method: "POST",
        headers: { origin: "https://attacker.example" }
      }),
      new Request("https://pitchforge.test/api/projects", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" }
      })
    ];

    for (const request of requests) {
      expect(() => assertSameOrigin(request)).toThrow(
        expect.objectContaining({ status: 403, code: "FORBIDDEN" })
      );
    }
  });

  it("accepts the browser-facing Host when a Docker bind address appears in request.url", () => {
    expect(() =>
      assertSameOrigin(
        new Request("http://0.0.0.0:3000/api/projects/import-github", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000"
          }
        })
      )
    ).not.toThrow();
  });

  it("uses forwarded host information only inside the Cloud Run proxy boundary", () => {
    const request = () =>
      new Request("http://0.0.0.0:8080/api/projects/import-github", {
        method: "POST",
        headers: {
          host: "internal:8080",
          origin: "https://pitchforge.example.com",
          "x-forwarded-host": "pitchforge.example.com",
          "x-forwarded-proto": "https"
        }
      });

    expect(() => assertSameOrigin(request())).toThrow(
      expect.objectContaining({ status: 403, code: "FORBIDDEN" })
    );

    process.env.K_SERVICE = "pitchforge";
    expect(() => assertSameOrigin(request())).not.toThrow();
  });

  it("rejects ambiguous forwarded values instead of selecting an attacker-controlled entry", () => {
    process.env.K_SERVICE = "pitchforge";
    expect(() =>
      assertSameOrigin(
        new Request("https://pitchforge.test/api/projects/import-github", {
          method: "POST",
          headers: {
            host: "pitchforge.test",
            origin: "https://attacker.example",
            "x-forwarded-host": "pitchforge.test, attacker.example",
            "x-forwarded-proto": "https"
          }
        })
      )
    ).toThrow(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
  });
});
