import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as passwordLogin } from "@/app/api/auth/password/route";
import {
  INVALID_PASSWORD_LOGIN_MESSAGE,
  PASSWORD_LOGIN_MAX_FAILURES,
  getSessionCookieName,
  preRegisterPasswordAuthUser,
  requireUser
} from "@/lib/server/auth";
import { verifyPassword } from "@/lib/server/auth/password-hash";
import { PostgresPitchForgeRepository } from "@/lib/server/db/postgres-db";

const envSnapshot = {
  authBypass: process.env.AUTH_BYPASS_FOR_TEST,
  authMode: process.env.AUTH_MODE,
  authSessionSecret: process.env.AUTH_SESSION_SECRET,
  databaseMode: process.env.DATABASE_MODE,
  databaseUrl: process.env.DATABASE_URL
};

describe("pre-registered password authentication", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS_FOR_TEST = "false";
    process.env.AUTH_MODE = "password";
    process.env.DATABASE_MODE = "postgres";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? "postgres://pitchforge:pitchforge@localhost:5432/pitchforge";
    process.env.AUTH_SESSION_SECRET = `test-password-session-secret-${randomUUID()}`;
  });

  afterEach(() => {
    restoreEnv("AUTH_BYPASS_FOR_TEST", envSnapshot.authBypass);
    restoreEnv("AUTH_MODE", envSnapshot.authMode);
    restoreEnv("DATABASE_MODE", envSnapshot.databaseMode);
    restoreEnv("DATABASE_URL", envSnapshot.databaseUrl);
    restoreEnv("AUTH_SESSION_SECRET", envSnapshot.authSessionSecret);
  });

  it("upserts and finds a normalized pre-registered account without storing plaintext", async () => {
    const repo = new PostgresPitchForgeRepository();
    const suffix = randomUUID();
    const password = `first-password-${suffix}`;

    try {
      await repo.migrate();
      const created = await preRegisterPasswordAuthUser(
        {
          uid: `password-user-${suffix}`,
          loginId: `Judge-${suffix}`,
          email: `Judge-${suffix}@Example.Test`,
          displayName: "Hackathon Judge",
          password,
          isAdmin: false,
          isActive: true
        },
        repo
      );

      expect(created.loginId).toBe(`judge-${suffix}`);
      expect(created.email).toBe(`judge-${suffix}@example.test`);
      expect(created.passwordHash).not.toContain(password);
      await expect(verifyPassword(password, created.passwordHash)).resolves.toBe(true);

      const replacementPassword = `replacement-password-${suffix}`;
      const updated = await preRegisterPasswordAuthUser(
        {
          uid: created.uid,
          loginId: created.loginId.toUpperCase(),
          email: created.email,
          displayName: "Updated Judge",
          password: replacementPassword,
          isAdmin: true,
          isActive: true
        },
        repo
      );
      const found = await repo.findPasswordAuthUser(`  ${created.loginId.toUpperCase()}  `);

      expect(updated.createdAt).toBe(created.createdAt);
      expect(found).toMatchObject({
        uid: created.uid,
        loginId: created.loginId,
        displayName: "Updated Judge",
        isAdmin: true,
        isActive: true
      });
      await expect(verifyPassword(password, updated.passwordHash)).resolves.toBe(false);
      await expect(verifyPassword(replacementPassword, updated.passwordHash)).resolves.toBe(true);
    } finally {
      await repo.close();
    }
  });

  it("returns one generic error for an unknown ID and a wrong password, then issues the existing signed cookie", async () => {
    const repo = new PostgresPitchForgeRepository();
    const suffix = randomUUID();
    const loginId = `judge-${suffix}`;
    const password = `password-${suffix}`;

    try {
      await repo.migrate();
      const account = await preRegisterPasswordAuthUser(
        {
          uid: `password-user-${suffix}`,
          loginId,
          email: `${loginId}@example.test`,
          displayName: "Hackathon Judge",
          password,
          isAdmin: false,
          isActive: true
        },
        repo
      );

      const wrongPassword = await loginRequest(loginId, "wrong-password", "192.0.2.10");
      const unknownLogin = await loginRequest(
        `missing-${suffix}`,
        "wrong-password",
        "192.0.2.10"
      );

      expect(wrongPassword.status).toBe(401);
      expect(unknownLogin.status).toBe(401);
      await expect(wrongPassword.json()).resolves.toEqual(invalidCredentialsPayload());
      await expect(unknownLogin.json()).resolves.toEqual(invalidCredentialsPayload());
      await expect(repo.findPasswordAuthUser(`missing-${suffix}`)).resolves.toBeNull();

      const success = await loginRequest(loginId.toUpperCase(), password, "192.0.2.10");
      expect(success.status).toBe(200);
      await expect(success.json()).resolves.toMatchObject({
        user: {
          uid: account.uid,
          email: account.email,
          isAdmin: false,
          isInvited: true
        }
      });

      const setCookie = success.headers.get("set-cookie");
      expect(setCookie).toContain(`${getSessionCookieName()}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=lax");
      expect(success.headers.get("cache-control")).toBe("no-store");
      const cookie = setCookie?.split(";")[0];
      expect(cookie).toBeTruthy();
      const sessionValue = cookie?.slice(cookie.indexOf("=") + 1) ?? "";
      const [, encodedPayload] = decodeURIComponent(sessionValue).split(".");
      const sessionPayload = JSON.parse(
        Buffer.from(encodedPayload ?? "", "base64url").toString("utf8")
      ) as Record<string, unknown>;
      expect(Object.keys(sessionPayload).sort()).toEqual(["exp", "uid"]);
      await expect(
        requireUser(
          new Request("https://pitchforge.test/api/auth/me", {
            headers: { cookie: cookie ?? "" }
          })
        )
      ).resolves.toMatchObject({ uid: account.uid, email: account.email });

      await preRegisterPasswordAuthUser(
        {
          uid: account.uid,
          loginId: account.loginId,
          email: account.email,
          displayName: account.displayName,
          password,
          isAdmin: false,
          isActive: false
        },
        repo
      );
      await expect(
        requireUser(
          new Request("https://pitchforge.test/api/auth/me", {
            headers: { cookie: cookie ?? "" }
          })
        )
      ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    } finally {
      await repo.close();
    }
  });

  it("temporarily locks a pre-provisioned account after repeated failures", async () => {
    const repo = new PostgresPitchForgeRepository();
    const suffix = randomUUID();
    const loginId = `limited-${suffix}`;
    const password = `password-${suffix}`;

    try {
      await repo.migrate();
      await preRegisterPasswordAuthUser(
        {
          uid: `limited-user-${suffix}`,
          loginId,
          email: `${loginId}@example.test`,
          password,
          isAdmin: false,
          isActive: true
        },
        repo
      );

      for (let attempt = 0; attempt < PASSWORD_LOGIN_MAX_FAILURES; attempt += 1) {
        const response = await loginRequest(loginId, "wrong-password", "192.0.2.20");
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual(invalidCredentialsPayload());
      }

      const validLogin = await loginRequest(loginId, password, "192.0.2.21");
      expect(validLogin.status).toBe(401);
      await expect(validLogin.json()).resolves.toEqual(invalidCredentialsPayload());
    } finally {
      await repo.close();
    }
  });

  it("keeps unknown-ID attempts isolated from a pre-provisioned account", async () => {
    const repo = new PostgresPitchForgeRepository();
    const suffix = randomUUID();
    const loginId = `global-limit-${suffix}`;
    const password = `password-${suffix}`;

    try {
      await repo.migrate();
      await preRegisterPasswordAuthUser(
        {
          uid: `global-limit-user-${suffix}`,
          loginId,
          email: `${loginId}@example.test`,
          password,
          isAdmin: false,
          isActive: true
        },
        repo
      );

      for (let attempt = 0; attempt < PASSWORD_LOGIN_MAX_FAILURES + 3; attempt += 1) {
        const response = await loginRequest(
          `missing-${attempt}-${suffix}`,
          "wrong-password",
          `198.51.100.${attempt + 1}`
        );
        expect(response.status).toBe(401);
      }

      const validLogin = await loginRequest(loginId, password, "203.0.113.10");
      expect(validLogin.status).toBe(200);
      await expect(validLogin.json()).resolves.toMatchObject({
        user: { email: `${loginId}@example.test` }
      });
    } finally {
      await repo.close();
    }
  });

  it("rejects cross-origin, malformed, and oversized requests without caching", async () => {
    const crossOrigin = await passwordLogin(
      new Request("https://pitchforge.test/api/auth/password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example"
        },
        body: JSON.stringify({ loginId: "judge", password: "password" })
      })
    );
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.headers.get("cache-control")).toBe("no-store");

    const malformed = await passwordLogin(
      new Request("https://pitchforge.test/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      })
    );
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("cache-control")).toBe("no-store");

    const oversized = await passwordLogin(
      new Request("https://pitchforge.test/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId: "judge", password: "x".repeat(5000) })
      })
    );
    expect(oversized.status).toBe(413);
    expect(oversized.headers.get("cache-control")).toBe("no-store");
  });
});

function loginRequest(loginId: string, password: string, clientAddress: string) {
  return passwordLogin(
    new Request("https://pitchforge.test/api/auth/password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": clientAddress
      },
      body: JSON.stringify({ loginId, password })
    })
  );
}

function invalidCredentialsPayload() {
  return {
    error: INVALID_PASSWORD_LOGIN_MESSAGE,
    code: "UNAUTHENTICATED"
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
