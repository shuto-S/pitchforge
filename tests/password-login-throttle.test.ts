import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearPasswordLoginFailures: vi.fn(),
  findPasswordAuthUser: vi.fn(),
  getPasswordLoginThrottle: vi.fn(),
  getRepository: vi.fn(),
  recordPasswordLoginFailure: vi.fn(),
  verifyPasswordWithBulkhead: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({
  getRepository: mocks.getRepository
}));

vi.mock("@/lib/server/auth/password-verifier", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/server/auth/password-verifier")
  >();
  return {
    ...actual,
    verifyPasswordWithBulkhead: mocks.verifyPasswordWithBulkhead
  };
});

import {
  createPasswordAuthSession,
  INVALID_PASSWORD_LOGIN_MESSAGE,
  PASSWORD_LOGIN_LOCK_SECONDS,
  PASSWORD_LOGIN_MAX_FAILURES
} from "@/lib/server/auth";
import { DUMMY_PASSWORD_HASH } from "@/lib/server/auth/password-hash";

const envSnapshot = {
  authMode: process.env.AUTH_MODE,
  authSessionSecret: process.env.AUTH_SESSION_SECRET
};

const authRecord = {
  uid: "review-user",
  loginId: "review-login",
  email: "reviewer@example.test",
  displayName: "Reviewer",
  passwordHash: "stored-password-hash",
  isAdmin: false,
  isActive: true,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z"
};

const repo = {
  clearPasswordLoginFailures: mocks.clearPasswordLoginFailures,
  findPasswordAuthUser: mocks.findPasswordAuthUser,
  getPasswordLoginThrottle: mocks.getPasswordLoginThrottle,
  recordPasswordLoginFailure: mocks.recordPasswordLoginFailure
};

describe("password login throttle", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    process.env.AUTH_MODE = "password";
    process.env.AUTH_SESSION_SECRET =
      "test-password-session-secret-at-least-thirty-two-characters";
    mocks.getRepository.mockReturnValue(repo);
    mocks.findPasswordAuthUser.mockResolvedValue(authRecord);
    mocks.getPasswordLoginThrottle.mockResolvedValue(null);
    mocks.recordPasswordLoginFailure.mockResolvedValue({ failedCount: 1 });
    mocks.verifyPasswordWithBulkhead.mockResolvedValue(true);
  });

  afterEach(() => {
    restoreEnv("AUTH_MODE", envSnapshot.authMode);
    restoreEnv("AUTH_SESSION_SECRET", envSnapshot.authSessionSecret);
  });

  it("rejects an active lock with the generic error without running scrypt", async () => {
    mocks.getPasswordLoginThrottle.mockResolvedValue({
      failedCount: PASSWORD_LOGIN_MAX_FAILURES,
      lockedUntil: new Date(Date.now() + 60_000).toISOString()
    });

    await expect(
      createPasswordAuthSession({ loginId: "REVIEW-LOGIN", password: "correct" })
    ).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      message: INVALID_PASSWORD_LOGIN_MESSAGE
    });

    expect(mocks.verifyPasswordWithBulkhead).not.toHaveBeenCalled();
    expect(mocks.recordPasswordLoginFailure).not.toHaveBeenCalled();
    expect(mocks.clearPasswordLoginFailures).not.toHaveBeenCalled();
  });

  it("records a failed check only after password verification", async () => {
    mocks.verifyPasswordWithBulkhead.mockResolvedValue(false);
    mocks.recordPasswordLoginFailure.mockResolvedValue({
      failedCount: PASSWORD_LOGIN_MAX_FAILURES,
      lockedUntil: new Date(Date.now() + 60_000).toISOString()
    });

    await expect(
      createPasswordAuthSession({ loginId: "review-login", password: "wrong" })
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_PASSWORD_LOGIN_MESSAGE
    });

    const attemptKey = mocks.getPasswordLoginThrottle.mock.calls[0]?.[0];
    expect(mocks.verifyPasswordWithBulkhead).toHaveBeenCalledWith(
      "wrong",
      authRecord.passwordHash
    );
    expect(mocks.recordPasswordLoginFailure).toHaveBeenCalledWith(
      attemptKey,
      PASSWORD_LOGIN_MAX_FAILURES,
      PASSWORD_LOGIN_LOCK_SECONDS
    );
    expect(mocks.verifyPasswordWithBulkhead.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordPasswordLoginFailure.mock.invocationCallOrder[0]
    );
    expect(mocks.clearPasswordLoginFailures).not.toHaveBeenCalled();
  });

  it("clears previous failures after a successful verification", async () => {
    mocks.getPasswordLoginThrottle.mockResolvedValue({
      failedCount: PASSWORD_LOGIN_MAX_FAILURES,
      lockedUntil: new Date(Date.now() - 60_000).toISOString()
    });

    const result = await createPasswordAuthSession({
      loginId: "review-login",
      password: "correct"
    });

    const attemptKey = mocks.getPasswordLoginThrottle.mock.calls[0]?.[0];
    expect(result.user).toMatchObject({ uid: authRecord.uid, email: authRecord.email });
    expect(mocks.recordPasswordLoginFailure).not.toHaveBeenCalled();
    expect(mocks.clearPasswordLoginFailures).toHaveBeenCalledWith(attemptKey);
  });

  it("keeps an unknown login on the generic dummy-verification path", async () => {
    mocks.findPasswordAuthUser.mockResolvedValue(null);

    await expect(
      createPasswordAuthSession({ loginId: "missing-login", password: "wrong" })
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_PASSWORD_LOGIN_MESSAGE
    });

    expect(mocks.verifyPasswordWithBulkhead).toHaveBeenCalledWith(
      "wrong",
      DUMMY_PASSWORD_HASH
    );
    expect(mocks.getPasswordLoginThrottle).not.toHaveBeenCalled();
    expect(mocks.recordPasswordLoginFailure).not.toHaveBeenCalled();
    expect(mocks.clearPasswordLoginFailures).not.toHaveBeenCalled();
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
