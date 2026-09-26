import Link from "next/link";
import { TONE_TEXT_CLASS } from "@/lib/domain/rules/labels";
import type { Terminology } from "@/lib/domain/language/terms";
import { availableExplanationCopy } from "@/lib/domain/language/explain";
import { cashStatus, cashStatusSentence } from "@/lib/domain/rules/cash-status";
import { CashStatusBadge } from "@/components/rules/CashStatusBadge";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { NativeFinancialPosition } from "@/lib/domain/financial-position/types";

interface NativePositionListProps {
  positions: NativeFinancialPosition[];
  currencies: Map<string, Currency>;
  terms: Terminology;
}

function fmt(value: string | null, currencyCode: string, currencies: Map<string, Currency>): string {
  if (value === null) return "Not set";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

/**
 * One card per native currency — every figure here is read verbatim from
 * financial_position_by_currency(). Net Worth is the only value this
 * domain calculates; everything else (Safe to Deploy, protected cash,
 * potential liquidity) is composed from its own owning domain and never
 * re-derived here. See docs/architecture/FINANCIAL_DOMAIN_MODEL.md,
 * "Financial Position" section.
 */
export function NativePositionList({ positions, currencies, terms }: NativePositionListProps) {
  if (positions.length === 0) {
    return <p className="text-text-muted">No financial activity recorded yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {positions.map((p) => (
        <li key={p.currencyCode} className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-medium text-text-primary">{p.currencyCode}</p>
            <p className="tabular-figures text-lg font-semibold text-text-primary">
              Net Worth: {fmt(p.netWorth, p.currencyCode, currencies)}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-text-muted">{terms.t("cash")}</dt>
              <dd className="tabular-figures text-text-secondary">{fmt(p.liquidCash, p.currencyCode, currencies)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{terms.t("non_cash_assets")}</dt>
              <dd className="tabular-figures text-text-secondary">{fmt(p.nonCashAssetValue, p.currencyCode, currencies)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{terms.t("money_owed_to_you_total")}</dt>
              <dd className="tabular-figures text-text-secondary">{fmt(p.receivablesOutstanding, p.currencyCode, currencies)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{terms.t("debts_you_owe")}</dt>
              <dd className="tabular-figures text-text-secondary">{fmt(p.liabilitiesOutstanding, p.currencyCode, currencies)}</dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">{terms.t("protections_heading")}</p>
            {(() => {
              const st = cashStatus({ status: p.safeToDeployStatus, liquidCash: p.liquidCash, requiredRetainedCash: p.requiredRetainedCash, safeToDeploy: p.safeToDeploy, retainedDeficit: p.retainedDeficit });
              const f = (v: string) => fmt(v, p.currencyCode, currencies);
              if (st.state === "needs_setup") {
                return (
                  <div className="flex flex-col gap-1 text-sm">
                    <span>
                      <CashStatusBadge result={st} />
                    </span>
                    <p className="text-text-secondary">{cashStatusSentence(st, f, "default", terms.mode)}</p>
                    <Link href="/rules" className="inline-flex min-h-12 items-center font-semibold text-accent-primary">
                      {terms.t("set_amount_action")}
                    </Link>
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-2">
                  <span>
                    <CashStatusBadge result={st} />
                  </span>
                  <p className="text-sm text-text-secondary">{cashStatusSentence(st, f, "default", terms.mode)}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-text-muted">{terms.t("set_aside_goals")}</dt>
                      <dd className="tabular-figures text-text-secondary">{fmt(p.protectedGoalCash, p.currencyCode, currencies)}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">{terms.t("set_aside_goals_payments")}</dt>
                      <dd className="tabular-figures text-text-secondary">{fmt(p.protectedCommitments, p.currencyCode, currencies)}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">{terms.t("protecting")}</dt>
                      <dd className="tabular-figures text-text-secondary">{fmt(p.requiredRetainedCash, p.currencyCode, currencies)}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">{terms.t("available_above")}</dt>
                      <dd className={`tabular-figures font-medium ${TONE_TEXT_CLASS[st.tone]}`}>{fmt(p.safeToDeploy, p.currencyCode, currencies)}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-text-muted">{availableExplanationCopy(terms.mode, { available: f(p.safeToDeploy!), cash: f(p.liquidCash), protecting: f(p.requiredRetainedCash!) }).body}</p>
                </div>
              );
            })()}
            {Number(p.allocationShortfall) > 0 ? (
              <p className="mt-2 text-sm text-danger">Allocation Shortfall: {fmt(p.allocationShortfall, p.currencyCode, currencies)}</p>
            ) : null}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">{terms.t("convertible_to_cash")}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-text-muted">Estimated value if sold quickly</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(p.assetQuickSalePotential, p.currencyCode, currencies)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Expected to recover from money owed to you</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(p.receivablesEstimatedRecoverable, p.currencyCode, currencies)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Difference from what you are owed</dt>
                <dd className="tabular-figures text-text-secondary">{fmt(p.receivablesRecoverabilityDifference, p.currencyCode, currencies)}</dd>
              </div>
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}
