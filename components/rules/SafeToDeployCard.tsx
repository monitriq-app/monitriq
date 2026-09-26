import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { SafeToDeployResult } from "@/lib/domain/rules/types";
import { TONE_TEXT_CLASS } from "@/lib/domain/rules/labels";
import type { Terminology } from "@/lib/domain/language/terms";
import { cashStatus, cashStatusSentence } from "@/lib/domain/rules/cash-status";
import { AvailableExplanation } from "@/components/rules/AvailableExplanation";
import { CashStatusBadge } from "@/components/rules/CashStatusBadge";

interface SafeToDeployCardProps {
  results: SafeToDeployResult[];
  currencies: Map<string, Currency>;
  terms: Terminology;
}

function fmt(value: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency, { trimTrailingZeros: true }) : `${currencyCode} ${value}`;
}

/**
 * "Your cash" summary (P0-E5-S4A) — the plain three-line picture: Cash you
 * have, Money Monitriq is protecting, Available above that, plus the
 * status (Comfortable / Getting close / At your limit / Below your limit /
 * Needs setup). Every figure is read verbatim from the canonical
 * safe_to_deploy_by_currency() row (liquid cash, required retained cash,
 * safe to deploy); the status only classifies those figures (see
 * lib/domain/rules/cash-status.ts). One card per currency, never blended.
 * The file/component name keeps the internal concept name on purpose.
 */
export function SafeToDeployCard({ results, currencies, terms }: SafeToDeployCardProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl bg-surface-raised p-4">
        <p className="text-sm text-text-muted">Add cash in Money to see your position here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {results.map((r) => {
        const st = cashStatus({ status: r.status, liquidCash: r.liquidCash, requiredRetainedCash: r.requiredRetainedCash, safeToDeploy: r.safeToDeploy, retainedDeficit: r.retainedDeficit });
        const f = (v: string) => fmt(v, r.currencyCode, currencies);
        const configured = st.state !== "needs_setup" && r.requiredRetainedCash !== null && r.safeToDeploy !== null;
        return (
          <div key={r.currencyCode} className="rounded-xl bg-surface-raised p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-text-primary">{r.currencyCode}</span>
              <CashStatusBadge result={st} />
            </div>

            <dl className="flex flex-col gap-2">
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{terms.t("cash")}</dt>
                <dd className="tabular-figures break-words text-lg font-semibold text-text-primary">{f(r.liquidCash)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{terms.t("protecting")}</dt>
                <dd className="tabular-figures break-words text-lg font-semibold text-text-primary">{configured ? f(r.requiredRetainedCash!) : "Needs setup"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{terms.t("available_above")}</dt>
                <dd className={`tabular-figures break-words text-lg font-semibold ${configured ? TONE_TEXT_CLASS[st.tone] : "text-text-secondary"}`}>{configured ? f(r.safeToDeploy!) : "Needs setup"}</dd>
              </div>
            </dl>

            <p className="mt-2 text-sm text-text-secondary">{cashStatusSentence(st, f, "default", terms.mode)}</p>
            {configured ? <p className="mt-1 text-xs text-text-muted">{terms.t("available_help")}</p> : null}
            {configured ? (
              <AvailableExplanation cash={f(r.liquidCash)} moneyYouWantToKeep={r.minimumCashFloor !== null ? f(r.minimumCashFloor) : null} setAside={f(r.protectedCommitments)} protecting={f(r.requiredRetainedCash!)} available={f(r.safeToDeploy!)} />
            ) : (
              <p className="mt-2 text-xs text-text-muted">Set {terms.t("money_to_keep").toLowerCase()} for {r.currencyCode} below.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
