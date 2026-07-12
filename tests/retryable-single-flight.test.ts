import { describe, expect, it, vi } from "vitest";
import { RetryableSingleFlight } from "@/lib/server/utils/retryable-single-flight";

describe("RetryableSingleFlight", () => {
  it("shares concurrent initialization and keeps a successful result cached", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const operation = vi.fn(() => gate);
    const singleFlight = new RetryableSingleFlight();

    const first = singleFlight.run(operation);
    const concurrent = singleFlight.run(operation);
    await Promise.resolve();

    expect(operation).toHaveBeenCalledOnce();
    release?.();
    await Promise.all([first, concurrent]);
    await singleFlight.run(operation);

    expect(operation).toHaveBeenCalledOnce();
  });

  it("clears a failed initialization so the next call can retry", async () => {
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(undefined);
    const singleFlight = new RetryableSingleFlight();

    await expect(singleFlight.run(operation)).rejects.toThrow("temporary failure");
    await expect(singleFlight.run(operation)).resolves.toBeUndefined();

    expect(operation).toHaveBeenCalledTimes(2);
  });
});
