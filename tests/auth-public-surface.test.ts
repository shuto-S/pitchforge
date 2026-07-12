import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GET as listInvites,
  POST as createInvite
} from "@/app/api/admin/invites/route";
import { POST as localLogin } from "@/app/api/auth/local/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as currentUser } from "@/app/api/auth/me/route";
import { POST as identitySession } from "@/app/api/auth/session/route";

const envSnapshot = {
  authBypass: process.env.AUTH_BYPASS_FOR_TEST,
  authMode: process.env.AUTH_MODE,
  sessionCookieName: process.env.SESSION_COOKIE_NAME
};

describe("password auth public surface", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS_FOR_TEST = "false";
    process.env.AUTH_MODE = "password";
    process.env.SESSION_COOKIE_NAME = "pitchforge_test_session";
  });

  afterEach(() => {
    restoreEnv("AUTH_BYPASS_FOR_TEST", envSnapshot.authBypass);
    restoreEnv("AUTH_MODE", envSnapshot.authMode);
    restoreEnv("SESSION_COOKIE_NAME", envSnapshot.sessionCookieName);
  });

  it("returns 404 for legacy login and invite APIs", async () => {
    const responses = await Promise.all([
      identitySession(
        new NextRequest("https://pitchforge.test/api/auth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: "unused" })
        })
      ),
      localLogin(
        new Request("https://pitchforge.test/api/auth/local", { method: "POST" })
      ),
      listInvites(new NextRequest("https://pitchforge.test/api/admin/invites")),
      createInvite(
        new NextRequest("https://pitchforge.test/api/admin/invites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "judge@example.test" })
        })
      )
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    }
  });

  it("marks current-user responses as non-cacheable", async () => {
    const response = await currentUser(
      new Request("https://pitchforge.test/api/auth/me")
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "UNAUTHENTICATED"
    });
  });

  it("clears the session with a same-origin, non-cacheable response", async () => {
    const response = await logout(
      new Request("https://pitchforge.test/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://pitchforge.test" }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain(
      "pitchforge_test_session="
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects cross-origin logout without clearing the session", async () => {
    const response = await logout(
      new Request("https://pitchforge.test/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://attacker.example" }
      })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("legacy auth CSRF protection", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS_FOR_TEST = "false";
  });

  afterEach(() => {
    restoreEnv("AUTH_BYPASS_FOR_TEST", envSnapshot.authBypass);
    restoreEnv("AUTH_MODE", envSnapshot.authMode);
    restoreEnv("SESSION_COOKIE_NAME", envSnapshot.sessionCookieName);
  });

  it("rejects cross-origin Identity Platform session creation", async () => {
    process.env.AUTH_MODE = "identity-platform";

    const response = await identitySession(
      new NextRequest("https://pitchforge.test/api/auth/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example"
        },
        body: JSON.stringify({ idToken: "unused" })
      })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects cross-origin local login before creating a session", async () => {
    process.env.AUTH_MODE = "local";

    const response = await localLogin(
      new Request("https://pitchforge.test/api/auth/local", {
        method: "POST",
        headers: { origin: "https://attacker.example" }
      })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cross-origin invite creation before authorization", async () => {
    process.env.AUTH_MODE = "identity-platform";

    const response = await createInvite(
      new NextRequest("https://pitchforge.test/api/admin/invites", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example"
        },
        body: JSON.stringify({ email: "judge@example.test" })
      })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
