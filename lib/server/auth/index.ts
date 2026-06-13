import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import type { Project } from "@/lib/schemas/project";
import { getRuntimeConfig } from "@/lib/server/config";
import { getRepository } from "@/lib/server/db";
import type { PitchForgeRepository } from "@/lib/server/db/types";

export type AuthUser = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isAdmin: boolean;
  isInvited: boolean;
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

export async function createIdentityPlatformSession(idToken: string): Promise<{
  sessionCookie: string;
  maxAgeSeconds: number;
  user: AuthUser;
}> {
  const auth = getIdentityPlatformAdminAuth();
  const decoded = await auth.verifyIdToken(idToken);
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

  try {
    const decoded = await getIdentityPlatformAdminAuth().verifySessionCookie(
      sessionCookie,
      true
    );
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
