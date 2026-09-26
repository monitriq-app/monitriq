"use client";

import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { debtsEmpty, type DebtsView } from "@/lib/domain/liabilities/presentation";
import type { LiabilitySummary, LiabilityType } from "@/lib/domain/liabilities/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { BackLink } from "@/components/layout/BackLink";
import { useTerms } from "@/components/language/LanguageProvider";
import { MoreDetails } from "@/components/ui/MoreDetails";
import { AddDebtSheet } from "@/components/liabilities/AddDebtSheet";
import { RecordPaymentSheet } from "@/components/liabilities/RecordPaymentSheet";

interface Props {
  view: DebtsView;
  liabilities: LiabilitySummary[];
  liabilityTypes: LiabilityType[];
  currencies: Currency[];
  buckets: CashBucket[];
  defaultCurrencyCode: string | null;
  openAdd: boolean;
}

export function DebtsWorkspace({ view, liabilities, liabilityTypes, currencies, buckets, defaultCurrencyCode, openAdd }: Props) {
  const [adding, setAdding] = useState(openAdd);
  const terms = useTerms();
  const empty = debtsEmpty(terms.mode);
  const [payingId, setPayingId] = useState<string | null>(null);
  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const paying = payingId ? liabilities.find((l) => l.liabilityId === payingId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary">{terms.t("debts")}</h1>
          <p className="text-sm text-text-secondary">{terms.t("debts_subtitle")}</p>
          {terms.hint("debts") ? <p className="text-xs text-text-muted">{terms.hint("debts")}</p> : null}
        </div>
        {view.cards.length > 0 ? (
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-accent-primary px-4 text-[13px] font-semibold text-background">
            <Plus size={14} aria-hidden="true" />
            Add {terms.t("debt_singular")}
          </button>
        ) : null}
      </div>

      {view.cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-raised p-6 text-center">
          <Wallet size={24} className="text-text-secondary" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-text-primary">{empty.title}</p>
          <p className="max-w-xs text-sm text-text-muted">{empty.body}</p>
          <button type="button" onClick={() => setAdding(true)} className="h-12 rounded-full bg-accent-primary px-6 text-sm font-semibold text-background">
            {empty.action}
          </button>
        </div>
      ) : (
        <>
          <section aria-label="Total owed" className="flex flex-col gap-2">
            {view.totals.map((t) => (
              <div key={t.currencyCode} className="rounded-xl bg-surface-raised p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.currencyCode} · Total owed</p>
                <p className="tabular-figures break-words text-lg font-semibold text-text-primary">{t.label}</p>
              </div>
            ))}
          </section>

          <ul className="flex flex-col gap-2.5">
            {view.cards.map((d) => (
              <li key={d.liabilityId} className="rounded-xl bg-surface-raised p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-text-primary">{d.name}</p>
                    <p className="text-xs text-text-muted">
                      {d.typeLabel}
                      {d.interestLabel ? ` · ${d.interestLabel}` : ""}
                    </p>
                  </div>
                  <div className="min-w-0 shrink-0 text-right">
                    <p className="text-[11px] text-text-muted">Still owed</p>
                    <p className="tabular-figures break-words text-sm font-semibold text-text-primary">{d.owedLabel}</p>
                  </div>
                </div>
                {d.maturityLabel ? <p className="mt-1 text-xs text-text-muted">{d.maturityLabel}</p> : null}
                <MoreDetails label="More details">
                  <dl className="grid grid-cols-2 gap-2 pb-1 text-sm">
                    {d.details.map((row) => (
                      <div key={row.label} className="min-w-0">
                        <dt className="text-xs text-text-muted">{row.label}</dt>
                        <dd className="tabular-figures break-words font-semibold text-text-primary">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </MoreDetails>
                <button type="button" onClick={() => setPayingId(d.liabilityId)} className="mt-1 min-h-12 w-full rounded-full bg-surface-strong px-4 text-[13px] font-semibold text-accent-primary">
                  Record Payment
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {adding ? <AddDebtSheet liabilityTypes={liabilityTypes} currencies={currencies} defaultCurrencyCode={defaultCurrencyCode} onClose={() => setAdding(false)} /> : null}
      {paying ? <RecordPaymentSheet debt={paying} buckets={buckets} currencies={currenciesByCode} onClose={() => setPayingId(null)} /> : null}
    </div>
  );
}
