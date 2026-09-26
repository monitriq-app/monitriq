"use client";

import { MoreDetails } from "@/components/ui/MoreDetails";
import { useTerms } from "@/components/language/LanguageProvider";
import { availableExplanationCopy } from "@/lib/domain/language/explain";

interface Props {
  /** Already-formatted canonical figures: liquid cash, minimum_cash_floor, protected_commitments, required_retained_cash, safe_to_deploy. Nothing is calculated here. */
  cash: string;
  moneyYouWantToKeep: string | null;
  setAside: string;
  protecting: string;
  available: string;
  currencyCode?: string;
  /** Compact label for small tiles (Home, Decisions) where the full label would wrap. */
  short?: boolean;
}

/**
 * The disclosure behind every "available above that" figure. Labels and the
 * explanation depth follow the user's explanation preference (simple /
 * balanced / financial) through the shared vocabulary; the figures are the
 * Rules engine's, identical in every mode.
 */
function Row({ term, value, strong }: { term: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "border-t border-border pt-1" : ""}`}>
      <dt className="min-w-0 text-text-muted">{term}</dt>
      <dd className="tabular-figures min-w-0 break-words text-right font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

export function AvailableExplanation({ cash, moneyYouWantToKeep, setAside, protecting, available, currencyCode, short }: Props) {
  const terms = useTerms();
  const copy = availableExplanationCopy(terms.mode, { available, cash, protecting });
  const label = terms.t(short ? "how_worked_out_short" : "how_worked_out");
  return (
    <MoreDetails label={currencyCode ? `${label} (${currencyCode})` : label}>
      <div className="flex flex-col gap-2 rounded-lg bg-surface-strong p-2.5 text-xs">
        <p className="font-semibold text-text-primary">{copy.heading}</p>
        <dl className="flex flex-col gap-1">
          <Row term={terms.t("cash")} value={cash} />
          {moneyYouWantToKeep !== null ? <Row term={terms.t("money_to_keep")} value={moneyYouWantToKeep} /> : null}
          <Row term={terms.t("set_aside_goals_payments")} value={setAside} />
          <Row term={terms.t("protecting")} value={protecting} strong />
          <Row term={terms.t("available_above")} value={available} strong />
        </dl>
        <p className="text-text-muted">{copy.body}</p>
        {terms.hint("protecting") ? <p className="text-text-muted">{terms.hint("protecting")}</p> : null}
      </div>
    </MoreDetails>
  );
}
