import type { DecisionSummary } from "@/lib/domain/decisions/types";

interface ActiveDecisionsListProps {
  decisions: DecisionSummary[];
}

/** Factual list only — never ranked, never told which is "most important." */
export function ActiveDecisionsList({ decisions }: ActiveDecisionsListProps) {
  if (decisions.length === 0) {
    return <p className="text-text-muted">No active Decisions.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {decisions.map((d) => (
        <li key={d.decisionId} className="py-2 text-sm">
          <p className="text-text-primary">{d.name}</p>
          <p className="text-text-muted">
            {d.decisionTypeLabel}
            {d.currentChoice ? ` — Latest choice: ${d.currentChoice}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
