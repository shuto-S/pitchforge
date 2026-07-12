import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRepository: vi.fn(),
  isAuthError: vi.fn(() => false),
  requireProjectOwner: vi.fn()
}));

vi.mock("@/lib/server/auth", () => ({
  isAuthError: mocks.isAuthError,
  requireProjectOwner: mocks.requireProjectOwner
}));

vi.mock("@/lib/server/db", () => ({
  getRepository: mocks.getRepository
}));

import { GET } from "@/app/api/projects/[projectId]/runs/[runId]/architecture.svg/route";

const project = {
  title: "PitchForge",
  oneLiner: "AI作戦会議が提出物を磨く",
  techStack: ["Cloud Run", "Gemini", "Cloud SQL"]
};

const artifacts = {
  brief: {
    oneSentencePitch: "作品を審査員に届く提出パッケージへ磨き込む。"
  },
  directorStrategy: {
    agentStory: "計画、選択的な改善、再採点を最大2回繰り返します。"
  },
  protoPediaContent: {
    systemArchitecture: "Cloud Run、Gemini、Cloud SQLで構成します。"
  }
};

const repo = {
  getArtifacts: vi.fn()
};

describe("architecture SVG route", () => {
  beforeEach(() => {
    mocks.getRepository.mockReset();
    mocks.isAuthError.mockClear();
    mocks.requireProjectOwner.mockReset();
    repo.getArtifacts.mockReset();

    mocks.getRepository.mockReturnValue(repo);
    mocks.requireProjectOwner.mockResolvedValue({ project });
    repo.getArtifacts.mockResolvedValue(artifacts);
  });

  it("authenticates the owner before loading and rendering the artifacts", async () => {
    const request = new Request("https://pitchforge.test/api/architecture.svg");
    const response = await GET(request, {
      params: Promise.resolve({ projectId: "project-1", runId: "run-1" })
    });

    expect(mocks.getRepository).toHaveBeenCalledOnce();
    expect(mocks.requireProjectOwner).toHaveBeenCalledWith(
      request,
      "project-1",
      repo
    );
    expect(repo.getArtifacts).toHaveBeenCalledWith("project-1", "run-1");
    expect(mocks.requireProjectOwner.mock.invocationCallOrder[0]).toBeLessThan(
      repo.getArtifacts.mock.invocationCallOrder[0]
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8"
    );
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="pitchforge-architecture.svg"'
    );
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox"
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain("<svg");
    expect(body).toContain("PitchForge");
    expect(body).toContain('data-section="gemini-loop"');
  });

  it("returns 404 when the owned run has no artifact bundle", async () => {
    repo.getArtifacts.mockResolvedValue(null);

    const response = await GET(
      new Request("https://pitchforge.test/api/architecture.svg"),
      {
        params: Promise.resolve({ projectId: "project-1", runId: "missing-run" })
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Artifacts not found" });
  });
});
