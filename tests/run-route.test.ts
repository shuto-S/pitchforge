import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Run } from "@/lib/schemas/project";
import { ActiveRunConflictError } from "@/lib/server/db/types";

const mocks = vi.hoisted(() => ({
  getObjectStorage: vi.fn(),
  getRepository: vi.fn(),
  isAuthError: vi.fn(() => false),
  requireProjectOwner: vi.fn(),
  runPitchForge: vi.fn()
}));

vi.mock("@/lib/server/auth", () => ({
  isAuthError: mocks.isAuthError,
  requireProjectOwner: mocks.requireProjectOwner
}));

vi.mock("@/lib/server/db", () => ({
  getRepository: mocks.getRepository
}));

vi.mock("@/lib/server/storage", () => ({
  getObjectStorage: mocks.getObjectStorage
}));

vi.mock("@/lib/server/ai/orchestrator", () => ({
  runPitchForge: mocks.runPitchForge
}));

import { POST } from "@/app/api/projects/[projectId]/runs/route";

const activeRun: Run = {
  id: "run_active",
  projectId: "project_active",
  status: "running",
  currentStep: "Judge Agent",
  progress: 20,
  startedAt: "2026-07-12T00:00:00.000Z",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:01.000Z"
};

describe("run creation route", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.isAuthError.mockReturnValue(false);
  });

  it("returns the atomically detected active run as a 409 response", async () => {
    const repo = {
      createRun: vi.fn().mockRejectedValue(new ActiveRunConflictError(activeRun))
    };
    mocks.getRepository.mockReturnValue(repo);
    mocks.requireProjectOwner.mockResolvedValue({
      project: { id: activeRun.projectId },
      user: { uid: "owner" }
    });

    const request = new Request(
      `https://pitchforge.test/api/projects/${activeRun.projectId}/runs`,
      { method: "POST" }
    );
    const response = await POST(request, {
      params: Promise.resolve({ projectId: activeRun.projectId })
    });

    expect(mocks.requireProjectOwner).toHaveBeenCalledWith(
      request,
      activeRun.projectId,
      repo
    );
    expect(repo.createRun).toHaveBeenCalledWith(activeRun.projectId);
    expect(mocks.runPitchForge).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      runId: activeRun.id,
      status: activeRun.status,
      message: "A run is already active"
    });
  });
});
