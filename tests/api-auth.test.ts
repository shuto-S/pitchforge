import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getProject } from "@/app/api/projects/[projectId]/route";
import { POST as createProject } from "@/app/api/projects/route";

const envSnapshot = {
  authBypass: process.env.AUTH_BYPASS_FOR_TEST,
  authBypassUid: process.env.AUTH_BYPASS_UID,
  authBypassEmail: process.env.AUTH_BYPASS_EMAIL,
  databaseMode: process.env.DATABASE_MODE,
  databaseUrl: process.env.DATABASE_URL
};

describe("authenticated project API", () => {
  beforeEach(() => {
    process.env.DATABASE_MODE = "postgres";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? "postgres://pitchforge:pitchforge@localhost:5432/pitchforge";
  });

  afterEach(() => {
    restoreEnv("AUTH_BYPASS_FOR_TEST", envSnapshot.authBypass);
    restoreEnv("AUTH_BYPASS_UID", envSnapshot.authBypassUid);
    restoreEnv("AUTH_BYPASS_EMAIL", envSnapshot.authBypassEmail);
    restoreEnv("DATABASE_MODE", envSnapshot.databaseMode);
    restoreEnv("DATABASE_URL", envSnapshot.databaseUrl);
  });

  it("rejects project creation without authentication", async () => {
    process.env.AUTH_BYPASS_FOR_TEST = "false";

    const response = await createProject(projectRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("UNAUTHENTICATED");
  });

  it("rejects cross-origin project creation before processing the request", async () => {
    process.env.AUTH_BYPASS_FOR_TEST = "true";
    process.env.AUTH_BYPASS_UID = `csrf-owner-${randomUUID()}`;
    process.env.AUTH_BYPASS_EMAIL = "csrf-owner@example.test";

    const response = await createProject(projectRequest("https://attacker.example"));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("FORBIDDEN");
  });

  it("rejects an unconfirmed GitHub import draft even when the API is called directly", async () => {
    process.env.AUTH_BYPASS_FOR_TEST = "true";
    process.env.AUTH_BYPASS_UID = `draft-owner-${randomUUID()}`;
    process.env.AUTH_BYPASS_EMAIL = "draft-owner@example.test";

    const response = await createProject(
      projectRequest(undefined, {
        problem: "要確認: 解決する課題を追記してください。"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.issues).toContainEqual({
      path: "problem",
      message:
        "「解決する課題」に未確認の下書きが残っています。「要確認:」を実際の内容に置き換えてください。"
    });
  });

  it("creates projects for the current user and rejects another user", async () => {
    const suffix = randomUUID();
    process.env.AUTH_BYPASS_FOR_TEST = "true";
    process.env.AUTH_BYPASS_UID = `owner-a-${suffix}`;
    process.env.AUTH_BYPASS_EMAIL = `owner-a-${suffix}@example.test`;

    const createResponse = await createProject(projectRequest());
    const createPayload = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createPayload.project.ownerUid).toBe(`owner-a-${suffix}`);

    process.env.AUTH_BYPASS_UID = `owner-b-${suffix}`;
    process.env.AUTH_BYPASS_EMAIL = `owner-b-${suffix}@example.test`;

    const response = await getProject(new Request("https://example.test/api/projects"), {
      params: Promise.resolve({ projectId: createPayload.projectId })
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("FORBIDDEN");
  });
});

function projectRequest(origin?: string, overrides: Record<string, unknown> = {}) {
  return new NextRequest("https://example.test/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {})
    },
    body: JSON.stringify({
      title: "PitchForge",
      oneLiner: "AI監督が提出物を磨く",
      description:
        "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
      problem: "提出直前に価値が伝わる形へ整理できない。",
      targetUsers: "ハッカソン参加者",
      gcpUsage: "Cloud Run, Gemini API, Cloud SQL, Cloud Storage",
      aiAgentBehavior: "作品理解、採点、改善、再採点を行う。",
      techStack: ["Cloud Run", "Gemini API"],
      ...overrides
    })
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
