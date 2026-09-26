import Link from "next/link";
import { Flag, Link as LinkIcon } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { GoalSummary } from "@/lib/domain/goals/types";
import type { DecisionSummary } from "@/lib/domain/decisions/types";
import { DecisionTypeIcon } from "@/components/decisions/DecisionTypeIcon";

interface YourMovesSectionProps {
  focusGoal: GoalSummary | null;
  activeDecisions: DecisionSummary[];
  currencies: Map<string, Currency>;
}

const CHOICE_LABEL: Record<string, string> = {
  proceed: "Proceed",
  wait: "Wait",
  decline: "Decline",
  keep_reviewing: "Keep reviewing",
};

/** A factual status chip — the exact choice value the user recorded, never colored to imply good/bad (Monitriq doesn't judge a Decision's choice). */
function ChoiceChip({ choice }: { choice: string | null }) {
  const label = choice ? (CHOICE_LABEL[choice] ?? choice) : "No choice recorded yet";
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{label}</span>
  );
}

/**
 * Factual state only — the user's own explicitly-chosen focus goal and
 * their own active Decisions, never an invented recommendation ("Sell
 * this asset", "Pay debt now"). Zero, one, two, or three-plus items are
 * all valid; nothing is manufactured to fill space, and nothing is
 * ranked or labeled "best"/"recommended" (see docs/product/
 * PRODUCT_DEFINITION.md #4 — the user remains the decision-maker).
 * Card composition matches the reference's "move card" (leading badge,
 * name, status chip, inner highlight box, bottom context row + action)
 * as closely as real data allows: `scenarioCount` — already returned by
 * getActiveDecisions() — fills the inner highlight box the reference
 * reserves for a scenario-specific amount, since DecisionSummary carries
 * no such amount (evaluating one requires reading a specific scenario,
 * not the Home-level list). The reference's bottom-row status line (e.g.
 * "Draft & valuation completed") has no Monitriq equivalent and is
 * dropped in favor of the decision's real linked-asset/liability name
 * when one exists. The inner highlight box uses the reference's own
 * actual padding (p-2, ~8px, matching code.html's `p-space-sm` for this
 * specific nested element — NOT the 16px card-level padding). No
 * chevron affordance was added inside that box: the reference's chevron
 * has no distinct destination of its own in code.html (it's decorative),
 * and adding one here that pointed at the same /decisions or /goals
 * link the card's own "Review" action already uses would be a redundant
 * second control to an identical destination, not a real second
 * affordance — omitted per the gap-closure brief's own guidance to omit
 * rather than add a confusing duplicate interaction.
 */
export function YourMovesSection({ focusGoal, activeDecisions, currencies }: YourMovesSectionProps) {
  if (!focusGoal && activeDecisions.length === 0) {
    return (
      <p className="text-text-muted">
        No focus goal or active decisions yet.{" "}
        <Link href="/decisions" className="text-accent-primary hover:underline">
          Consider a decision
        </Link>{" "}
        or{" "}
        <Link href="/goals" className="text-accent-primary hover:underline">
          set a focus goal
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {focusGoal ? (
        <li className="rounded-xl bg-surface-raised p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary">
                <Flag size={14} aria-hidden="true" />
              </span>
              <h4 className="truncate text-base font-semibold text-text-primary">{focusGoal.name}</h4>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full bg-accent-primary/15 px-2 py-0.5 text-[11px] font-semibold text-accent-primary">
              Focused
            </span>
          </div>

          {focusGoal.currencyCode && focusGoal.allocatedTotal !== null ? (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-strong p-2">
              <div>
                <span className="block text-xs text-text-muted">Allocated</span>
                <span className="tabular-figures text-sm font-bold text-accent-primary">
                  {(() => {
                    const currency = currencies.get(focusGoal.currencyCode!);
                    return currency
                      ? formatCurrencyAmount(focusGoal.allocatedTotal!, currency, { trimTrailingZeros: true })
                      : focusGoal.allocatedTotal;
                  })()}
                </span>
              </div>
              {focusGoal.targetValue !== null ? (
                <div className="text-right">
                  <span className="block text-xs text-text-muted">Target</span>
                  <span className="tabular-figures text-sm font-semibold text-text-primary">
                    {(() => {
                      const currency = currencies.get(focusGoal.currencyCode!);
                      return currency ? formatCurrencyAmount(focusGoal.targetValue!, currency, { trimTrailingZeros: true }) : focusGoal.targetValue;
                    })()}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-1.5 flex items-center justify-end">
            <Link href="/goals" className="text-xs font-semibold text-text-secondary underline decoration-text-muted">
              Review
            </Link>
          </div>
        </li>
      ) : null}

      {activeDecisions.map((decision) => {
        const linkedName = decision.linkedAssetName ?? decision.linkedLiabilityName ?? null;
        return (
          <li key={decision.decisionId} className="rounded-xl bg-surface-raised p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary">
                  <DecisionTypeIcon typeCode={decision.decisionTypeCode} />
                </span>
                <h4 className="truncate text-base font-semibold text-text-primary">{decision.name}</h4>
              </div>
              <ChoiceChip choice={decision.currentChoice} />
            </div>

            <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-strong p-2">
              <span className="text-xs text-text-muted">{decision.decisionTypeLabel}</span>
              <span className="tabular-figures text-sm font-bold text-text-primary">
                {decision.scenarioCount > 0
                  ? `${decision.scenarioCount} scenario${decision.scenarioCount === 1 ? "" : "s"} evaluated`
                  : "Not yet evaluated"}
              </span>
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2">
              {linkedName ? (
                <span className="flex min-w-0 items-center gap-1 truncate text-xs text-text-muted">
                  <LinkIcon size={11} className="shrink-0" aria-hidden="true" />
                  {linkedName}
                </span>
              ) : (
                <span />
              )}
              <Link href="/decisions" className="shrink-0 text-xs font-semibold text-text-secondary underline decoration-text-muted">
                Review
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
