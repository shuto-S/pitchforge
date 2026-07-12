import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AuthError,
  assertVerifiedGoogleIdentity,
  createLocalAuthSession,
  getSessionCookieName,
  requireProjectOwner,
  requireUser
} from "@/lib/server/auth";
import { PostgresPitchForgeRepository } from "@/lib/server/db/postgres-db";

const envSnapshot = {
  authBypass: process.env.AUTH_BYPASS_FOR_TEST,
  authBypassUid: process.env.AUTH_BYPASS_UID,
  authBypassEmail: process.env.AUTH_BYPASS_EMAIL,
  authAdminEmails: process.env.AUTH_ADMIN_EMAILS,
  authMode: process.env.AUTH_MODE,
  localAuthUid: process.env.LOCAL_AUTH_UID,
  localAuthEmail: process.env.LOCAL_AUTH_EMAIL,
  localAuthSecret: process.env.LOCAL_AUTH_SECRET,
  databaseMode: process.env.DATABASE_MODE,
  databaseUrl: process.env.DATABASE_URL
};

describe("auth and ownership", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS_FOR_TEST = "true";
    process.env.AUTH_BYPASS_UID = "owner-a";
    process.env.AUTH_BYPASS_EMAIL = "owner-a@example.test";
    process.env.AUTH_MODE = "identity-platform";
    process.env.AUTH_ADMIN_EMAILS = "admin@example.test";
    process.env.LOCAL_AUTH_SECRET = "test-local-auth-secret";
    process.env.DATABASE_MODE = "postgres";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? "postgres://pitchforge:pitchforge@localhost:5432/pitchforge";
  });

  afterEach(() => {
    restoreEnv("AUTH_BYPASS_FOR_TEST", envSnapshot.authBypass);
    restoreEnv("AUTH_BYPASS_UID", envSnapshot.authBypassUid);
    restoreEnv("AUTH_BYPASS_EMAIL", envSnapshot.authBypassEmail);
    restoreEnv("AUTH_ADMIN_EMAILS", envSnapshot.authAdminEmails);
    restoreEnv("AUTH_MODE", envSnapshot.authMode);
    restoreEnv("LOCAL_AUTH_UID", envSnapshot.localAuthUid);
    restoreEnv("LOCAL_AUTH_EMAIL", envSnapshot.localAuthEmail);
    restoreEnv("LOCAL_AUTH_SECRET", envSnapshot.localAuthSecret);
    restoreEnv("DATABASE_MODE", envSnapshot.databaseMode);
    restoreEnv("DATABASE_URL", envSnapshot.databaseUrl);
  });

  it("allows only the project owner to access a project", async () => {
    const repo = await newTestRepo();
    const suffix = randomUUID();
    process.env.AUTH_BYPASS_UID = `owner-a-${suffix}`;
    process.env.AUTH_BYPASS_EMAIL = `owner-a-${suffix}@example.test`;
    const ownedProject = await repo.createProject({
      ...projectInput(),
      ownerUid: `owner-a-${suffix}`,
      ownerEmail: `owner-a-${suffix}@example.test`
    });
    const otherProject = await repo.createProject({
      ...projectInput({ title: "Other Project" }),
      ownerUid: `owner-b-${suffix}`,
      ownerEmail: `owner-b-${suffix}@example.test`
    });

    const request = new Request("https://example.test/projects");
    await expect(requireProjectOwner(request, ownedProject.id, repo)).resolves.toMatchObject({
      project: { id: ownedProject.id },
      user: { uid: `owner-a-${suffix}` }
    });
    await expect(requireProjectOwner(request, otherProject.id, repo)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN"
    } satisfies Partial<AuthError>);
  });

  it("lists projects by owner only", async () => {
    const repo = await newTestRepo();
    const suffix = randomUUID();
    await repo.createProject({
      ...projectInput({ title: "Owned Project" }),
      ownerUid: `owner-a-${suffix}`,
      ownerEmail: `owner-a-${suffix}@example.test`
    });
    await repo.createProject({
      ...projectInput({ title: "Hidden Project" }),
      ownerUid: `owner-b-${suffix}`,
      ownerEmail: `owner-b-${suffix}@example.test`
    });

    const projects = await repo.listProjects(`owner-a-${suffix}`);

    expect(projects).toHaveLength(1);
    expect(projects[0]?.title).toBe("Owned Project");
  });

  it("normalizes, stores, and accepts invites", async () => {
    const repo = await newTestRepo();
    const suffix = randomUUID();
    const email = `NewUser-${suffix}@Example.Test`;

    const invite = await repo.createInvite(email, "admin-user");
    const stored = await repo.getInviteByEmail(email.toLowerCase());
    const accepted = await repo.acceptInvite(email.toUpperCase(), "new-user");

    expect(invite.email).toBe(email.toLowerCase());
    expect(stored?.status).toBe("invited");
    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptedByUid).toBe("new-user");
  });

  it("creates and verifies a local auth session", async () => {
    const suffix = randomUUID();
    process.env.AUTH_BYPASS_FOR_TEST = "false";
    process.env.AUTH_MODE = "local";
    process.env.LOCAL_AUTH_UID = `local-${suffix}`;
    process.env.LOCAL_AUTH_EMAIL = `local-${suffix}@example.test`;

    const session = await createLocalAuthSession();
    const request = new Request("https://example.test/projects", {
      headers: {
        cookie: `${getSessionCookieName()}=${encodeURIComponent(session.sessionCookie)}`
      }
    });

    await expect(requireUser(request)).resolves.toMatchObject({
      uid: `local-${suffix}`,
      email: `local-${suffix}@example.test`,
      isAdmin: true,
      isInvited: true
    });
  });

  it("allows only verified Google Identity Platform claims", () => {
    expect(() =>
      assertVerifiedGoogleIdentity({
        email_verified: true,
        firebase: { sign_in_provider: "google.com" }
      })
    ).not.toThrow();

    const rejectedClaims = [
      {
        email_verified: false,
        firebase: { sign_in_provider: "google.com" }
      },
      {
        firebase: { sign_in_provider: "google.com" }
      },
      {
        email_verified: true,
        firebase: { sign_in_provider: "password" }
      },
      {
        email_verified: true
      }
    ];

    for (const claims of rejectedClaims) {
      expect(() => assertVerifiedGoogleIdentity(claims)).toThrow(
        expect.objectContaining({
          status: 403,
          code: "FORBIDDEN",
          message: "Verified Google sign-in is required"
        })
      );
    }
  });
});

async function newTestRepo() {
  const repo = new PostgresPitchForgeRepository();
  await repo.migrate();
  return repo;
}

function projectInput(overrides: { title?: string } = {}) {
  return {
    title: overrides.title ?? "PitchForge",
    oneLiner: "AI監督が提出物を磨く",
    description:
      "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
    problem: "提出直前に価値が伝わる形へ整理できない。",
    targetUsers: "ハッカソン参加者",
    gcpUsage: "Cloud Run, Gemini API, Cloud SQL, Cloud Storage",
    aiAgentBehavior: "作品理解、採点、改善、再採点を行う。",
    techStack: ["Cloud Run", "Gemini API"]
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
