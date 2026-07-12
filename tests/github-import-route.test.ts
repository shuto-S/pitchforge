import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireUser: vi.fn(),
  isAuthError: vi.fn((error: unknown) => Boolean((error as { auth?: boolean })?.auth)),
  fetchPublicGitHubRepository: vi.fn(),
  buildMechanicalProjectDraft: vi.fn(),
  generateProjectDraftFromRepository: vi.fn(),
  getAIProvider: vi.fn(),
  getPublicRuntimeStatus: vi.fn(),
  getRepository: vi.fn(),
  reserveGitHubImport: vi.fn()
}));

vi.mock("@/lib/server/auth", () => ({
  isAuthError: mocks.isAuthError,
  requireUser: mocks.requireUser
}));

vi.mock("@/lib/server/auth/request-security", () => ({
  assertSameOrigin: mocks.assertSameOrigin
}));

vi.mock("@/lib/server/import/github-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/import/github-repository")>();
  return {
    ...actual,
    fetchPublicGitHubRepository: mocks.fetchPublicGitHubRepository
  };
});

vi.mock("@/lib/server/import/project-draft", () => ({
  buildMechanicalProjectDraft: mocks.buildMechanicalProjectDraft,
  generateProjectDraftFromRepository: mocks.generateProjectDraftFromRepository
}));

vi.mock("@/lib/server/ai", () => ({ getAIProvider: mocks.getAIProvider }));
vi.mock("@/lib/server/config", () => ({
  getPublicRuntimeStatus: mocks.getPublicRuntimeStatus
}));
vi.mock("@/lib/server/db", () => ({ getRepository: mocks.getRepository }));

import { POST } from "@/app/api/projects/import-github/route";

const snapshot = {
  canonicalUrl: "https://github.com/example/project",
  files: [{ path: "README.md", content: "README" }],
  warnings: []
};

const mechanicalDraft = {
  title: "project",
  oneLiner: "公開リポジトリをもとにしたプロダクトです。",
  description: "公開リポジトリをもとに作成したプロダクト情報の下書きです。",
  problem: "要確認: 解決する課題を追記してください。",
  targetUsers: "要確認: 想定ユーザーを追記してください。",
  productUrl: "",
  githubUrl: "https://github.com/example/project",
  gcpUsage: "要確認: Google Cloudの役割を追記してください。",
  aiAgentBehavior: "要確認: AIの自律動作を追記してください。",
  techStack: ["TypeScript"]
};

describe("GitHub project import route", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.isAuthError.mockImplementation((error: unknown) =>
      Boolean((error as { auth?: boolean })?.auth)
    );
    mocks.requireUser.mockResolvedValue({ uid: "reviewer" });
    mocks.fetchPublicGitHubRepository.mockResolvedValue(snapshot);
    mocks.buildMechanicalProjectDraft.mockReturnValue(mechanicalDraft);
    mocks.generateProjectDraftFromRepository.mockResolvedValue({
      ...mechanicalDraft,
      problem: "レビュー準備の情報が分散している。"
    });
    mocks.getAIProvider.mockReturnValue({ generateJson: vi.fn() });
    mocks.getPublicRuntimeStatus.mockReturnValue({ aiMode: "vertex-gemini" });
    mocks.getRepository.mockReturnValue({
      reserveGitHubImport: mocks.reserveGitHubImport
    });
    mocks.reserveGitHubImport.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it("returns an editable AI draft without creating a project", async () => {
    const request = importRequest({ githubUrl: "https://github.com/example/project" });
    const response = await POST(request);

    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(request);
    expect(mocks.requireUser).toHaveBeenCalledWith(request);
    expect(mocks.fetchPublicGitHubRepository).toHaveBeenCalledWith(
      "https://github.com/example/project"
    );
    expect(mocks.generateProjectDraftFromRepository).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      mode: "ai",
      analyzedFiles: ["README.md"],
      draft: { githubUrl: "https://github.com/example/project" }
    });
  });

  it("falls back to the mechanical draft when the one-shot AI call fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.generateProjectDraftFromRepository.mockRejectedValue(
      new Error("model unavailable: GEMINI_API_KEY=do-not-log-this")
    );
    try {
      const response = await POST(
        importRequest({ githubUrl: "https://github.com/example/project" })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        mode: "mechanical",
        draft: mechanicalDraft,
        warnings: [expect.stringContaining("機械抽出")]
      });
      expect(warn).toHaveBeenCalledWith(
        "GitHub import AI fallback:",
        "model unavailable: GEMINI_API_KEY=****"
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain("do-not-log-this");
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects oversized input before calling GitHub or AI", async () => {
    const response = await POST(
      new Request("https://pitchforge.test/api/projects/import-github", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "4096" },
        body: JSON.stringify({ githubUrl: "https://github.com/example/project" })
      })
    );

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.fetchPublicGitHubRepository).not.toHaveBeenCalled();
    expect(mocks.getAIProvider).not.toHaveBeenCalled();
  });

  it("cancels an oversized streamed body without relying on Content-Length", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(1_024)));
        controller.enqueue(new TextEncoder().encode("x".repeat(1_100)));
      },
      cancel() {
        canceled = true;
      }
    });
    const request = new Request(
      "https://pitchforge.test/api/projects/import-github",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        duplex: "half"
      } as RequestInit & { duplex: "half" }
    );

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(canceled).toBe(true);
    expect(mocks.getRepository).not.toHaveBeenCalled();
    expect(mocks.fetchPublicGitHubRepository).not.toHaveBeenCalled();
  });

  it("returns a no-store 429 with Retry-After before calling GitHub or AI", async () => {
    mocks.reserveGitHubImport.mockResolvedValue({
      allowed: false,
      reason: "repository",
      retryAfterSeconds: 47
    });
    const response = await POST(
      importRequest({ githubUrl: "https://github.com/example/project" })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("47");
    await expect(response.json()).resolves.toMatchObject({
      code: "GITHUB_IMPORT_RATE_LIMITED"
    });
    expect(mocks.reserveGitHubImport).toHaveBeenCalledWith(
      "reviewer",
      "https://github.com/example/project"
    );
    expect(mocks.fetchPublicGitHubRepository).not.toHaveBeenCalled();
    expect(mocks.getAIProvider).not.toHaveBeenCalled();
  });

  it("keeps at most two GitHub imports active within one instance", async () => {
    let active = 0;
    let maximumActive = 0;
    let releaseFirstBatch: () => void = () => undefined;
    const firstBatch = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    });
    let started = 0;
    mocks.fetchPublicGitHubRepository.mockImplementation(async () => {
      started += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (started <= 2) {
        await firstBatch;
      }
      active -= 1;
      return snapshot;
    });

    const responses = [1, 2, 3].map((index) =>
      POST(importRequest({ githubUrl: `https://github.com/example/project-${index}` }))
    );
    try {
      await vi.waitFor(() => {
        expect(mocks.fetchPublicGitHubRepository).toHaveBeenCalledTimes(2);
      });
      expect(maximumActive).toBe(2);
    } finally {
      releaseFirstBatch();
    }

    await expect(Promise.all(responses)).resolves.toEqual([
      expect.objectContaining({ status: 200 }),
      expect.objectContaining({ status: 200 }),
      expect.objectContaining({ status: 200 })
    ]);
    expect(maximumActive).toBe(2);
  });

  it("does not authenticate or fetch after same-origin rejection", async () => {
    mocks.assertSameOrigin.mockImplementation(() => {
      throw { auth: true, status: 403, code: "FORBIDDEN", message: "Cross-origin request rejected" };
    });
    const response = await POST(
      importRequest({ githubUrl: "https://github.com/example/project" })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.fetchPublicGitHubRepository).not.toHaveBeenCalled();
  });
});

function importRequest(body: unknown) {
  return new Request("https://pitchforge.test/api/projects/import-github", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
