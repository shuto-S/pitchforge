import { describe, expect, it } from "vitest";
import {
  clearValueForRun,
  isRunSwitchConfirmed,
  retainValueForRun,
  valueForRun,
  visibleRunDuringSwitch,
  type PendingRunSwitch,
  type RunScopedValue
} from "@/lib/client/project-workspace-state";

describe("project workspace run-scoped state", () => {
  const scopedValue: RunScopedValue<string[]> = {
    runId: "run-old",
    value: ["old result"]
  };

  it("drops stale data as soon as the latest run changes or disappears", () => {
    expect(retainValueForRun(scopedValue, "run-new")).toBeNull();
    expect(retainValueForRun(scopedValue, null)).toBeNull();
  });

  it("retains data while refreshing the same run", () => {
    expect(retainValueForRun(scopedValue, "run-old")).toBe(scopedValue);
  });

  it("only exposes data belonging to the current run", () => {
    expect(valueForRun(scopedValue, "run-old")).toEqual(["old result"]);
    expect(valueForRun(scopedValue, "run-new")).toBeNull();
    expect(valueForRun(scopedValue, undefined)).toBeNull();
  });

  it("clears a not-found run without deleting a newer run's data", () => {
    expect(clearValueForRun(scopedValue, "run-old")).toBeNull();
    expect(clearValueForRun(scopedValue, "run-new")).toBe(scopedValue);
  });

  it("hides the previous run until a different latest run is confirmed", () => {
    const pendingSwitch: PendingRunSwitch = { previousRunId: "run-old" };
    const previousRun = { id: "run-old", status: "completed" };
    const nextRun = { id: "run-new", status: "queued" };

    expect(visibleRunDuringSwitch(previousRun, pendingSwitch)).toBeNull();
    expect(isRunSwitchConfirmed(pendingSwitch, previousRun.id)).toBe(false);
    expect(visibleRunDuringSwitch(previousRun, null)).toBe(previousRun);
    expect(visibleRunDuringSwitch(nextRun, pendingSwitch)).toBe(nextRun);
    expect(isRunSwitchConfirmed(pendingSwitch, nextRun.id)).toBe(true);
  });

  it("waits for the first run when a project had no previous run", () => {
    const pendingSwitch: PendingRunSwitch = { previousRunId: null };
    const firstRun = { id: "run-first" };

    expect(visibleRunDuringSwitch(null, pendingSwitch)).toBeNull();
    expect(isRunSwitchConfirmed(pendingSwitch, null)).toBe(false);
    expect(visibleRunDuringSwitch(firstRun, pendingSwitch)).toBe(firstRun);
  });

  it("shows the latest run normally when no switch is pending", () => {
    const latestRun = { id: "run-latest" };
    expect(visibleRunDuringSwitch(latestRun, null)).toBe(latestRun);
  });
});
