import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { FinancialRuleSummary } from "@/lib/domain/rules/types";

interface MinimumCashFloorListProps {
  rules: FinancialRuleSummary[];
  currencies: Map<string, Currency>;
}

/** Reads from financial_rule_summary(). Only active rules are shown here — inactive ones remain in history, not in this list. */
export function MinimumCashFloorList({ rules, currencies }: MinimumCashFloorListProps) {
  const active = rules.filter((r) => r.status === "active");
  if (active.length === 0) {
    return <p className="text-text-muted">No minimum cash floor configured yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {active.map((rule) => {
        const currency = currencies.get(rule.currencyCode);
        const formatted =
          rule.currentThreshold === null
            ? "Not set"
            : currency
              ? formatCurrencyAmount(rule.currentThreshold, currency)
              : `${rule.currencyCode} ${rule.currentThreshold}`;
        return (
          <li key={rule.ruleId} className="flex items-center justify-between py-3">
            <span className="text-text-primary">{rule.currencyCode} Minimum Cash Floor</span>
            <span className="tabular-figures text-text-secondary">{formatted}</span>
          </li>
        );
      })}
    </ul>
  );
}
