import { HandCoins } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { ReceivableSummary } from "@/lib/domain/receivables/types";
import { LogFollowUpButton, RecordRecoveryButton } from "@/components/assets/ReceivableActions";

interface ReceivablesSectionProps {
  receivables: ReceivableSummary[];
  currencies: Map<string, Currency>;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * "Money You're Owed" — real Receivables domain data (a separate domain
 * from Assets' own `assets` table, composed here the same way Home
 * composes Financial Position + Money). Outstanding is never treated as
 * liquid cash — the card's own copy says so explicitly, matching the
 * receivables domain's long-standing distinction. Recovery goes through
 * the real canonical recordRecovery() (via the shared Quick Add sheet);
 * follow-up goes through the real updateReceivable(). Recovered amount,
 * outstanding amount, recoverable estimate, and expected payment date are
 * all read verbatim from receivable_summary() — none derived here.
 */
export function ReceivablesSection({ receivables, currencies }: ReceivablesSectionProps) {
  const active = receivables.filter((r) => !r.isArchived);
  if (active.length === 0) return null;

  const outstandingByCurrency = new Map<string, string>();
  for (const r of active) {
    outstandingByCurrency.set(r.currencyCode, r.outstandingAmount);
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold leading-6 text-text-primary">
          <HandCoins size={16} className="text-focus" aria-hidden="true" />
          Money You&apos;re Owed
        </h2>
        <span className="text-xs text-text-muted">
          {Array.from(outstandingByCurrency.entries())
            .map(([code, amount]) => `${fmt(amount, code, currencies)} outstanding`)
            .join(" · ")}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {active.map((r) => (
          <div key={r.receivableId} className="rounded-xl bg-surface-raised p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="rounded-full bg-surface-strong px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">Money Owed to You</span>
              <span className="rounded-full bg-surface-strong px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">
                {r.lastFollowUpAt ? `Followed up ${new Date(r.lastFollowUpAt).toLocaleDateString()}` : "Last follow-up: Not set"}
              </span>
            </div>
            <p className="text-base font-semibold text-text-primary">{r.name}</p>
            <p className="mt-0.5 text-xs text-text-muted">Money owed to you — not the same as cash in hand.</p>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] text-text-muted">Outstanding</p>
                <p className="tabular-figures text-sm font-semibold text-text-primary">{fmt(r.outstandingAmount, r.currencyCode, currencies)}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-muted">Recovered</p>
                <p className="tabular-figures text-sm font-semibold text-accent-primary">{fmt(r.recoveredAmount, r.currencyCode, currencies)}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-muted">Est. Recoverable</p>
                <p className="tabular-figures text-sm font-semibold text-text-primary">{r.estimatedRecoverableValue !== null ? fmt(r.estimatedRecoverableValue, r.currencyCode, currencies) : "Not set"}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-muted">Expected Payment</p>
                <p className="text-sm font-semibold text-text-primary">{r.expectedPaymentDate ? new Date(r.expectedPaymentDate).toLocaleDateString() : "Not set"}</p>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <LogFollowUpButton receivableId={r.receivableId} />
              <RecordRecoveryButton />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
