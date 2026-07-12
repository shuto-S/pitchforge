import { describe, expect, it } from "vitest";
import { selectLatestDecisionEvidence } from "@/lib/client/decision-evidence";
import type { RunEvent } from "@/lib/schemas/project";

describe("DirectorRoom decision evidence", () => {
  it("pairs the latest decision with the observation from the same round", () => {
    const events = [
      event("planner-1", "改善計画", "改善ラウンド1: 継続。対象: 実装力。"),
      event("judge-1", "品質レビュー", "改善ラウンド1の再採点: 70点 → 78点（+8点）。"),
      event("planner-2", "改善計画", "改善ラウンド2: 継続。対象: ユーザビリティ。"),
      event("judge-2", "品質レビュー", "改善ラウンド2の再採点: 78点 → 86点（+8点）。")
    ];

    const selected = selectLatestDecisionEvidence(events);

    expect(selected.decisionEvent?.id).toBe("planner-2");
    expect(selected.observedEvent?.id).toBe("judge-2");
  });

  it("does not show a previous-round result while the latest round is running", () => {
    const events = [
      event("planner-1", "AI改善プランナー", "改善ラウンド1: 継続。対象: 実装力。"),
      event("judge-1", "AI審査員", "改善ラウンド1の再採点: 70点 → 78点（+8点）。"),
      event("planner-2", "AI改善プランナー", "改善ラウンド2: 継続。対象: ユーザビリティ。")
    ];

    const selected = selectLatestDecisionEvidence(events);

    expect(selected.decisionEvent?.id).toBe("planner-2");
    expect(selected.observedEvent).toBeUndefined();
  });

  it("keeps pairing events stored with the legacy agent names", () => {
    const events = [
      event("planner-legacy", "AI改善プランナー", "改善ラウンド1: 継続。対象: 実装力。"),
      event(
        "judge-legacy",
        "AI審査員",
        "改善ラウンド1の再採点: 70点 → 78点（+8点）。"
      )
    ];

    const selected = selectLatestDecisionEvidence(events);

    expect(selected.decisionEvent?.id).toBe("planner-legacy");
    expect(selected.observedEvent?.id).toBe("judge-legacy");
  });
});

function event(id: string, agentName: string, message: string): RunEvent {
  return {
    id,
    runId: "run-test",
    projectId: "project-test",
    agentName,
    type: "message",
    message,
    createdAt: "2026-07-12T00:00:00.000Z"
  };
}
