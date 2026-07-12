import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getObjectStorage: vi.fn(),
  getRepository: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({
  getRepository: mocks.getRepository
}));

vi.mock("@/lib/server/storage", () => ({
  getObjectStorage: mocks.getObjectStorage
}));

import { GET } from "@/app/api/system/readiness/route";

const database = { checkReadiness: vi.fn() };
const storage = { checkReadiness: vi.fn() };

describe("system readiness route", () => {
  beforeEach(() => {
    mocks.getObjectStorage.mockReset();
    mocks.getRepository.mockReset();
    database.checkReadiness.mockReset();
    storage.checkReadiness.mockReset();
    mocks.getRepository.mockReturnValue(database);
    mocks.getObjectStorage.mockReturnValue(storage);
    database.checkReadiness.mockResolvedValue(undefined);
    storage.checkReadiness.mockResolvedValue(undefined);
  });

  it("returns 200 only when PostgreSQL and Cloud Storage are reachable", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ready: true,
      checks: { database: "ok", storage: "ok" }
    });
  });

  it("returns a fixed 503 result without exposing a database error", async () => {
    const secret = "postgres://admin:super-secret@private-host/pitchforge";
    database.checkReadiness.mockRejectedValue(new Error(secret));

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(body)).toEqual({
      ready: false,
      checks: { database: "failed", storage: "ok" }
    });
    expect(body).not.toContain(secret);
    expect(body).not.toContain("private-host");
  });

  it("returns a fixed 503 result without exposing a bucket or storage error", async () => {
    const secretBucket = "private-production-bucket-name";
    storage.checkReadiness.mockRejectedValue(
      new Error(`Access denied for gs://${secretBucket}/secret-object`)
    );

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({
      ready: false,
      checks: { database: "ok", storage: "failed" }
    });
    expect(body).not.toContain(secretBucket);
    expect(body).not.toContain("secret-object");
  });
});
