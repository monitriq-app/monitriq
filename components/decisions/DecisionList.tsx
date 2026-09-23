import Link from "next/link";
import type { DecisionSummary } from "@/lib/domain/decisions/types";

interface DecisionListProps {
  decisions: DecisionSummary[];
}

const CHOICE_LABELS: Record<string, string> = {
  proceed: "Proceed",
  wait: "Wait",
  decline: "Decline",
  keep_reviewing: "Keep Reviewing",
};

/** Reads from decision_summary() — one shared calculation. A Decision is a plan, never a transaction. */
export function DecisionList({ decisions }: DecisionListProps) {
  if (decisions.length === 0) {
    return <p className="text-text-muted">No decisions yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {decisions.map((decision) => (
        <li key={decision.decisionId} className="py-3">
          <Link href={`/decisions/${decision.decisionId}`} className="flex items-center justify-between hover:opacity-80">
            <span className="text-text-primary">
              {decision.name}
              <span className="ml-2 text-text-muted">{decision.decisionTypeLabel}</span>
              {decision.status !== "active" ? <span className="ml-2 text-text-muted">({decision.status})</span> : null}
            </span>
            <span className="text-sm text-text-secondary">
              {decision.scenarioCount} scenario{decision.scenarioCount === 1 ? "" : "s"}
              {decision.currentChoice ? (
                <span className="ml-2 text-text-muted">Your choice: {CHOICE_LABELS[decision.currentChoice] ?? decision.currentChoice}</span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
