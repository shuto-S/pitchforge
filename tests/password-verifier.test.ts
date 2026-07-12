import { describe, expect, it } from "vitest";
import { AsyncBulkhead } from "@/lib/server/auth/password-verifier";

describe("AsyncBulkhead", () => {
  it("bounds concurrency and releases capacity after a rejected task", async () => {
    const bulkhead = new AsyncBulkhead(2);
    let active = 0;
    let maximumActive = 0;
    let releaseFirstWave: (() => void) | undefined;
    const firstWave = new Promise<void>((resolve) => {
      releaseFirstWave = resolve;
    });

    const tasks = Array.from({ length: 4 }, (_, index) =>
      bulkhead.run(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          if (index < 2) {
            await firstWave;
          }
          if (index === 2) {
            throw new Error("expected failure");
          }
          return index;
        } finally {
          active -= 1;
        }
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maximumActive).toBe(2);
    releaseFirstWave?.();

    const results = await Promise.allSettled(tasks);
    expect(maximumActive).toBe(2);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
      "fulfilled"
    ]);
  });

  it("hands a released slot directly to a queued task", async () => {
    const bulkhead = new AsyncBulkhead(1);
    let active = 0;
    let maximumActive = 0;

    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        Promise.resolve().then(() =>
          bulkhead.run(async () => {
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await new Promise((resolve) => setTimeout(resolve, index % 2));
            active -= 1;
          })
        )
      )
    );

    expect(maximumActive).toBe(1);
  });
});
