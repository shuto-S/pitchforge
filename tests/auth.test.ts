import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthError, requireProjectOwner } from "@/lib/server/auth";
import { LocalPitchForgeRepository } from "@/lib/server/db/local-db";

const envSnapshot = {
  authBypass: process.env.AUTH_BYPASS_FOR_TEST,
  authBypassUid: process.env.AUTH_BYPASS_UID,
  authBypassEmail: process.env.AUTH_BYPASS_EMAIL,
  authAdminEmails: process.env.AUTH_ADMIN_EMAILS
};

describe("auth and ownership", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS_FOR_TEST = "true";
    process.env.AUTH_BYPASS_UID = "owner-a";
    process.env.AUTH_BYPASS_EMAIL = "owner-a@example.test";
    process.env.AUTH_ADMIN_EMAILS = "admin@example.test";
  });

  afterEach(() => {
    restoreEnv("AUTH_BYPASS_FOR_TEST", envSnapshot.authBypass);
    restoreEnv("AUTH_BYPASS_UID", envSnapshot.authBypassUid);
    restoreEnv("AUTH_BYPASS_EMAIL", envSnapshot.authBypassEmail);
    restoreEnv("AUTH_ADMIN_EMAILS", envSnapshot.authAdminEmails);
  });

  it("allows only the project owner to access a project", async () => {
    const repo = await newTestRepo();
    const ownedProject = await repo.createProject({
      ...projectInput(),
      ownerUid: "owner-a",
      ownerEmail: "owner-a@example.test"
    });
    const otherProject = await repo.createProject({
      ...projectInput({ title: "Other Project" }),
      ownerUid: "owner-b",
      ownerEmail: "owner-b@example.test"
    });

    const request = new Request("https://example.test/projects");
    await expect(requireProjectOwner(request, ownedProject.id, repo)).resolves.toMatchObject({
      project: { id: ownedProject.id },
      user: { uid: "owner-a" }
    });
    await expect(requireProjectOwner(request, otherProject.id, repo)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN"
    } satisfies Partial<AuthError>);
  });

  it("lists projects by owner only", async () => {
    const repo = await newTestRepo();
    await repo.createProject({
      ...projectInput({ title: "Owned Project" }),
      ownerUid: "owner-a",
      ownerEmail: "owner-a@example.test"
    });
    await repo.createProject({
      ...projectInput({ title: "Hidden Project" }),
      ownerUid: "owner-b",
      ownerEmail: "owner-b@example.test"
    });

    const projects = await repo.listProjects("owner-a");

    expect(projects).toHaveLength(1);
    expect(projects[0]?.title).toBe("Owned Project");
  });

  it("normalizes, stores, and accepts invites", async () => {
    const repo = await newTestRepo();

    const invite = await repo.createInvite("NewUser@Example.Test", "admin-user");
    const stored = await repo.getInviteByEmail("newuser@example.test");
    const accepted = await repo.acceptInvite("NEWUSER@example.test", "new-user");

    expect(invite.email).toBe("newuser@example.test");
    expect(stored?.status).toBe("invited");
    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptedByUid).toBe("new-user");
  });
});

async function newTestRepo() {
  const localDir = await mkdtemp(path.join(tmpdir(), "pitchforge-auth-test-"));
  return new LocalPitchForgeRepository(localDir);
}

function projectInput(overrides: { title?: string } = {}) {
  return {
    title: overrides.title ?? "PitchForge",
    oneLiner: "AI監督が提出物を磨く",
    description:
      "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
    problem: "提出直前に価値が伝わる形へ整理できない。",
    targetUsers: "ハッカソン参加者",
    gcpUsage: "Cloud Run, Gemini API, Firestore, Cloud Storage",
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
