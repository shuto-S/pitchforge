import { createHmac, timingSafeEqual } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import type { Project } from "@/lib/schemas/project";
import { getRuntimeConfig } from "@/lib/server/config";
import { getRepository } from "@/lib/server/db";
import type {
  PasswordAuthUser,
  PasswordLoginThrottle,
  PitchForgeRepository,
  UpsertPasswordAuthUserInput
} from "@/lib/server/db/types";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword
} from "@/lib/server/auth/password-hash";
import { verifyPasswordWithBulkhead } from "@/lib/server/auth/password-verifier";

export type AuthUser = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isAdmin: boolean;
  isInvited: boolean;
};

export const INVALID_PASSWORD_LOGIN_MESSAGE = "Invalid login ID or password";
export const PASSWORD_LOGIN_MAX_FAILURES = 5;
export const PASSWORD_LOGIN_LOCK_SECONDS = 60;

export type PreRegisterPasswordAuthUserInput = Omit<
  UpsertPasswordAuthUserInput,
  "passwordHash"
> & {
  password: string;
};

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVITE_REQUIRED",
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function getSessionCookieName(): string {
  return getRuntimeConfig().sessionCookieName;
}

export function getSessionCookieMaxAgeSeconds(): number {
  return 5 * 24 * 60 * 60;
}

export function isAdminEmail(email: string): boolean {
  return parseEmailList(getRuntimeConfig().authAdminEmails).has(normalizeEmail(email));
}

export function assertVerifiedGoogleIdentity(decoded: {
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
}): void {
  if (
    decoded.email_verified !== true ||
    decoded.firebase?.sign_in_provider !== "google.com"
  ) {
    throw new AuthError(403, "FORBIDDEN", "Verified Google sign-in is required");
  }
}

export async function createIdentityPlatformSession(idToken: string): Promise<{
  sessionCookie: string;
  maxAgeSeconds: number;
  user: AuthUser;
}> {
  if (getRuntimeConfig().authMode !== "identity-platform") {
    throw new AuthError(403, "FORBIDDEN", "Identity Platform authentication is disabled");
  }
  const auth = getIdentityPlatformAdminAuth();
  const decoded = await auth.verifyIdToken(idToken);
  assertVerifiedGoogleIdentity(decoded);
  const nowSeconds = Date.now() / 1000;
  if (!decoded.auth_time || nowSeconds - decoded.auth_time > 5 * 60) {
    throw new AuthError(401, "UNAUTHENTICATED", "Recent sign-in is required");
  }

  const user = await syncUserFromToken(decoded);
  const maxAgeSeconds = getSessionCookieMaxAgeSeconds();
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: maxAgeSeconds * 1000
  });
  return { sessionCookie, maxAgeSeconds, user };
}

export async function createLocalAuthSession(): Promise<{
  sessionCookie: string;
  maxAgeSeconds: number;
  user: AuthUser;
}> {
  const config = getRuntimeConfig();
  if (config.authMode !== "local" || process.env.NODE_ENV === "production") {
    throw new AuthError(403, "FORBIDDEN", "Local auth is disabled");
  }

  const email = normalizeEmail(config.localAuthEmail);
  const user = await getRepository().upsertUser({
    uid: config.localAuthUid,
    email,
    displayName: config.localAuthDisplayName,
    isAdmin: true,
    isInvited: true
  });
  const authUser: AuthUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAdmin: true,
    isInvited: true
  };
  const maxAgeSeconds = getSessionCookieMaxAgeSeconds();
  return {
    sessionCookie: signHmacSession(authUser, maxAgeSeconds, "local"),
    maxAgeSeconds,
    user: authUser
  };
}

export async function preRegisterPasswordAuthUser(
  input: PreRegisterPasswordAuthUserInput,
  repo: PitchForgeRepository = getRepository()
): Promise<PasswordAuthUser> {
  const { password, ...profile } = input;
  const passwordHash = await hashPassword(password);
  return repo.upsertPasswordAuthUser({ ...profile, passwordHash });
}

export async function createPasswordAuthSession(input: {
  loginId: string;
  password: string;
}): Promise<{
  sessionCookie: string;
  maxAgeSeconds: number;
  user: AuthUser;
}> {
  const config = getRuntimeConfig();
  if (config.authMode !== "password") {
    throw new AuthError(403, "FORBIDDEN", "Password authentication is disabled");
  }
  assertPasswordAuthSecretConfigured();

  const loginId = normalizeLoginId(input.loginId);
  const loginAttemptKey = passwordLoginAttemptKey(loginId, "login");
  const repo = getRepository();
  const authRecord = await repo.findPasswordAuthUser(loginId);

  if (!authRecord) {
    // Keep the observable verification path generic without persisting arbitrary
    // attacker-controlled login IDs. The bulkhead bounds expensive scrypt work.
    await verifyPasswordWithBulkhead(input.password, DUMMY_PASSWORD_HASH);
    throw invalidPasswordLoginError();
  }

  const throttle = await repo.getPasswordLoginThrottle(loginAttemptKey);
  if (isPasswordLoginLocked(throttle)) {
    throw invalidPasswordLoginError();
  }

  const passwordMatches = await verifyPasswordWithBulkhead(
    input.password,
    authRecord.passwordHash
  );
  if (!passwordMatches || !authRecord.isActive) {
    await repo.recordPasswordLoginFailure(
      loginAttemptKey,
      PASSWORD_LOGIN_MAX_FAILURES,
      PASSWORD_LOGIN_LOCK_SECONDS
    );
    throw invalidPasswordLoginError();
  }

  await repo.clearPasswordLoginFailures(loginAttemptKey);
  const authUser: AuthUser = {
    uid: authRecord.uid,
    email: authRecord.email,
    displayName: authRecord.displayName,
    isAdmin: authRecord.isAdmin,
    isInvited: true
  };
  const maxAgeSeconds = getSessionCookieMaxAgeSeconds();
  return {
    sessionCookie: signHmacSession(authUser, maxAgeSeconds, "password"),
    maxAgeSeconds,
    user: authUser
  };
}

export async function requireUser(request: Request): Promise<AuthUser> {
  const config = getRuntimeConfig();
  if (config.authBypassForTest) {
    const email = normalizeEmail(process.env.AUTH_BYPASS_EMAIL ?? "test-user@example.test");
    return {
      uid: process.env.AUTH_BYPASS_UID ?? "test-user",
      email,
      displayName: "Test User",
      isAdmin: isAdminEmail(email),
      isInvited: true
    };
  }

  const sessionCookie = readCookie(request, getSessionCookieName());
  if (!sessionCookie) {
    throw new AuthError(401, "UNAUTHENTICATED", "Authentication required");
  }

  if (
    (config.authMode === "local" && process.env.NODE_ENV !== "production") ||
    config.authMode === "password"
  ) {
    if (config.authMode === "password") {
      assertPasswordAuthSecretConfigured();
    }
    if (config.authMode === "local") {
      return verifyHmacSession(sessionCookie, "local");
    }

    const sessionUid = verifyPasswordHmacSession(sessionCookie);
    const authRecord = await getRepository().findPasswordAuthUserByUid(sessionUid);
    if (!authRecord?.isActive) {
      throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
    }
    return {
      uid: authRecord.uid,
      email: authRecord.email,
      displayName: authRecord.displayName,
      isAdmin: authRecord.isAdmin,
      isInvited: true
    };
  }

  try {
    const decoded = await getIdentityPlatformAdminAuth().verifySessionCookie(
      sessionCookie,
      true
    );
    assertVerifiedGoogleIdentity(decoded);
    return await syncUserFromToken(decoded);
  } catch (error) {
    if (isAuthError(error)) {
      throw error;
    }
    throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
  }
}

export async function requireAdminUser(request: Request): Promise<AuthUser> {
  const user = await requireUser(request);
  if (!user.isAdmin) {
    throw new AuthError(403, "FORBIDDEN", "Admin access required");
  }
  return user;
}

export async function requireProjectOwner(
  request: Request,
  projectId: string,
  repo: PitchForgeRepository = getRepository()
): Promise<{ user: AuthUser; project: Project }> {
  const user = await requireUser(request);
  const project = await repo.getProject(projectId);
  if (!project) {
    throw new AuthError(403, "FORBIDDEN", "Project is not accessible");
  }
  if (project.ownerUid !== user.uid) {
    throw new AuthError(403, "FORBIDDEN", "Project is not accessible");
  }
  return { user, project };
}

async function syncUserFromToken(decoded: DecodedIdToken): Promise<AuthUser> {
  const email = decoded.email ? normalizeEmail(decoded.email) : null;
  if (!email) {
    throw new AuthError(403, "INVITE_REQUIRED", "An email address is required");
  }

  const uid = decoded.uid;
  const admin = isAdminEmail(email);
  const repo = getRepository();
  const invite = await repo.getInviteByEmail(email);
  if (!admin && !invite) {
    throw new AuthError(403, "INVITE_REQUIRED", "Invite required");
  }

  if (invite?.status === "invited") {
    await repo.acceptInvite(email, uid);
  }

  const user = await repo.upsertUser({
    uid,
    email,
    displayName: typeof decoded.name === "string" ? decoded.name : undefined,
    photoURL: typeof decoded.picture === "string" ? decoded.picture : undefined,
    isAdmin: admin,
    isInvited: admin || Boolean(invite)
  });

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAdmin: user.isAdmin,
    isInvited: user.isInvited
  };
}

function getIdentityPlatformAdminAuth() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault()
    });
  }
  return getAuth();
}

function signHmacSession(
  user: AuthUser,
  maxAgeSeconds: number,
  mode: "local" | "password"
): string {
  const sessionPayload =
    mode === "password"
      ? {
          uid: user.uid,
          exp: Math.floor(Date.now() / 1000) + maxAgeSeconds
        }
      : {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          isAdmin: user.isAdmin,
          isInvited: user.isInvited,
          exp: Math.floor(Date.now() / 1000) + maxAgeSeconds
        };
  const payload = Buffer.from(JSON.stringify(sessionPayload), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret(mode))
    .update(payload)
    .digest("base64url");
  return `${mode}.${payload}.${signature}`;
}

function verifyHmacSession(cookie: string, mode: "local"): AuthUser {
  const parsed = verifySignedHmacPayload(cookie, mode);
  if (
    typeof parsed.uid !== "string" ||
    typeof parsed.email !== "string" ||
    !parsed.uid ||
    !parsed.email
  ) {
    throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
  }

  return {
    uid: parsed.uid,
    email: normalizeEmail(parsed.email),
    displayName: parsed.displayName,
    photoURL: parsed.photoURL,
    isAdmin: Boolean(parsed.isAdmin),
    isInvited: Boolean(parsed.isInvited)
  };
}

function verifyPasswordHmacSession(cookie: string): string {
  const parsed = verifySignedHmacPayload(cookie, "password");
  if (typeof parsed.uid !== "string" || !parsed.uid || parsed.uid.length > 128) {
    throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
  }
  return parsed.uid;
}

function verifySignedHmacPayload(
  cookie: string,
  mode: "local" | "password"
): Partial<AuthUser & { exp: number }> {
  const parts = cookie.split(".");
  if (parts.length !== 3) {
    throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
  }
  const [prefix, payload, signature] = parts;
  if (prefix !== mode || !payload || !signature) {
    throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
  }

  const expected = createHmac("sha256", sessionSecret(mode))
    .update(payload)
    .digest("base64url");
  if (!safeEqual(signature, expected)) {
    throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
  }

  let parsed: Partial<AuthUser & { exp: number }>;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<
      AuthUser & { exp: number }
    >;
  } catch {
    throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
  }
  if (
    typeof parsed.exp !== "number" ||
    !Number.isFinite(parsed.exp) ||
    parsed.exp < Date.now() / 1000
  ) {
    throw new AuthError(401, "UNAUTHENTICATED", "Session expired");
  }
  return parsed;
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function assertPasswordAuthSecretConfigured(): void {
  const secret = getRuntimeConfig().authSessionSecret.trim();
  if (
    !secret ||
    secret.length < 32 ||
    secret === "replace-with-production-secret"
  ) {
    throw new AuthError(403, "FORBIDDEN", "Password authentication is not configured");
  }
}

function passwordLoginAttemptKey(loginId: string, scope: string): string {
  return createHmac("sha256", sessionSecret("password"))
    .update(loginId)
    .update("\0")
    .update(scope)
    .digest("hex");
}

function sessionSecret(mode: "local" | "password"): string {
  const config = getRuntimeConfig();
  return mode === "password" ? config.authSessionSecret : config.localAuthSecret;
}

function invalidPasswordLoginError(): AuthError {
  return new AuthError(401, "UNAUTHENTICATED", INVALID_PASSWORD_LOGIN_MESSAGE);
}

function isPasswordLoginLocked(throttle: PasswordLoginThrottle | null): boolean {
  if (!throttle?.lockedUntil) {
    return false;
  }
  const lockedUntil = Date.parse(throttle.lockedUntil);
  return Number.isFinite(lockedUntil) && lockedUntil > Date.now();
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...valueParts] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return null;
}

function parseEmailList(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeLoginId(loginId: string): string {
  return loginId.trim().toLowerCase();
}
