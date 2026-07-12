export type RunScopedValue<T> = {
  runId: string;
  value: T;
} | null;

export type PendingRunSwitch = {
  previousRunId: string | null;
};

export function isRunSwitchConfirmed(
  pendingSwitch: PendingRunSwitch | null,
  latestRunId: string | null | undefined
): boolean {
  return Boolean(
    pendingSwitch && latestRunId && latestRunId !== pendingSwitch.previousRunId
  );
}

export function visibleRunDuringSwitch<T extends { id: string }>(
  latestRun: T | null | undefined,
  pendingSwitch: PendingRunSwitch | null
): T | null {
  if (!latestRun) {
    return null;
  }
  if (!pendingSwitch || isRunSwitchConfirmed(pendingSwitch, latestRun.id)) {
    return latestRun;
  }
  return null;
}

export function retainValueForRun<T>(
  scopedValue: RunScopedValue<T>,
  runId: string | null | undefined
): RunScopedValue<T> {
  if (!runId || scopedValue?.runId !== runId) {
    return null;
  }
  return scopedValue;
}

export function clearValueForRun<T>(
  scopedValue: RunScopedValue<T>,
  runId: string
): RunScopedValue<T> {
  return scopedValue?.runId === runId ? null : scopedValue;
}

export function valueForRun<T>(
  scopedValue: RunScopedValue<T>,
  runId: string | null | undefined
): T | null {
  return runId && scopedValue?.runId === runId ? scopedValue.value : null;
}
