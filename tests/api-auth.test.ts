import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getProject } from "@/app/api/projects/[projectId]/route";
import { POST as createProject } from "@/app/api/projects/route";

const envSnapshot = {
  authBypass: process.env.AUTH_BYPASS_FOR_TEST,
  authBypassUid: process.env.AUTH_BYPASS_UID,
  authBypassEmail: process.env.AUTH_BYPASS_EMAIL,
  datastoreMode: process.env.DATASTORE_MODE,
  localDataDir: process.env.LOCAL_DATA_DIR
};

describe("authenticated project API", () => {
  beforeEach(async () => {
    process.env.DATASTORE_MODE = "local";
    process.env.LOCAL_DATA_DIR = await mkdtemp(path.join(tmpdir(), "pitchforge-api-test-"));
  });

  afterEach(() => {
    restoreEnv("AUTH_BYPASS_FOR_TEST", envSnapshot.authBypass);
    restoreEnv("AUTH_BYPASS_UID", envSnapshot.authBypassUid);
    restoreEnv("AUTH_BYPASS_EMAIL", envSnapshot.authBypassEmail);
    restoreEnv("DATASTORE_MODE", envSnapshot.datastoreMode);
    restoreEnv("LOCAL_DATA_DIR", envSnapshot.localDataDir);
  });

  it("rejects project creation without authentication", async () => {
    process.env.AUTH_BYPASS_FOR_TEST = "false";

    const response = await createProject(projectRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("UNAUTHENTICATED");
  });

  it("creates projects for the current user and rejects another user", async () => {
    process.env.AUTH_BYPASS_FOR_TEST = "true";
    process.env.AUTH_BYPASS_UID = "owner-a";
    process.env.AUTH_BYPASS_EMAIL = "owner-a@example.test";

    const createResponse = await createProject(projectRequest());
    const createPayload = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createPayload.project.ownerUid).toBe("owner-a");

    process.env.AUTH_BYPASS_UID = "owner-b";
    process.env.AUTH_BYPASS_EMAIL = "owner-b@example.test";

    const response = await getProject(new Request("https://example.test/api/projects"), {
      params: Promise.resolve({ projectId: createPayload.projectId })
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("FORBIDDEN");
  });
});

function projectRequest() {
  return new NextRequest("https://example.test/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "PitchForge",
      oneLiner: "AI監督が提出物を磨く",
      description:
        "ハッカソン作品の説明、GCP利用、AIエージェント性を整理し、提出物を生成するプロダクトです。",
      problem: "提出直前に価値が伝わる形へ整理できない。",
      targetUsers: "ハッカソン参加者",
      gcpUsage: "Cloud Run, Gemini API, Firestore, Cloud Storage",
      aiAgentBehavior: "作品理解、採点、改善、再採点を行う。",
      techStack: ["Cloud Run", "Gemini API"]
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
