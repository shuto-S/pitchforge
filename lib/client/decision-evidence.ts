import type { RunEvent } from "@/lib/schemas/project";

const plannerAgentNames = new Set(["改善計画", "AI改善プランナー"]);
const reviewerAgentNames = new Set(["品質レビュー", "AI審査員"]);

export function selectLatestDecisionEvidence(events: RunEvent[]): {
  decisionEvent?: RunEvent;
  observedEvent?: RunEvent;
} {
  const decisionEvent = [...events]
    .reverse()
    .find(
      (event) =>
        plannerAgentNames.has(event.agentName) &&
        event.message.includes("改善ラウンド") &&
        event.message.includes("対象:")
    );
  const decisionRound = decisionEvent?.message.match(/改善ラウンド(\d+)/)?.[1];
  const observedEvent = [...events]
    .reverse()
    .find(
      (event) =>
        reviewerAgentNames.has(event.agentName) &&
        event.message.includes("再採点:") &&
        (!decisionRound || event.message.includes(`改善ラウンド${decisionRound}`))
    );
  return { decisionEvent, observedEvent };
}
