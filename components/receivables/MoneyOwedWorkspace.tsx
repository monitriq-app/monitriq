"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateReceivable } from "@/lib/domain/receivables/repository";
import { moneyOwedEmpty, NOT_CASH_NOTE, type MoneyOwedView } from "@/lib/domain/receivables/presentation";
import type { ReceivableSummary } from "@/lib/domain/receivables/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { BackLink } from "@/components/layout/BackLink";
import { useTerms } from "@/components/language/LanguageProvider";
import { MoreDetails } from "@/components/ui/MoreDetails";
import { AddMoneyOwedSheet } from "@/components/receivables/AddMoneyOwedSheet";
import { RecordRecoverySheet } from "@/components/receivables/RecordRecoverySheet";

interface Props {
  view: MoneyOwedView;
  receivables: ReceivableSummary[];
  currencies: Currency[];
  buckets: CashBucket[];
  defaultCurrencyCode: string | null;
}

export function MoneyOwedWorkspace({ view, receivables, currencies, buckets, defaultCurrencyCode }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const terms = useTerms();
  const empty = moneyOwedEmpty(terms.mode);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const recovering = recoveringId ? receivables.find((r) => r.receivableId === recoveringId) : undefined;

  async function logFollowUp(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await updateReceivable(createClient(), id, { lastFollowUpAt: new Date().toISOString() });
      router.refresh();
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not save the follow-up.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary">{terms.t("money_owed")}</h1>
          <p className="text-sm text-text-secondary">{terms.t("money_owed_subtitle")}</p>
          {terms.hint("money_owed") ? <p className="text-xs text-text-muted">{terms.hint("money_owed")}</p> : null}
        </div>
        {view.cards.length > 0 ? (
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-accent-primary px-4 text-[13px] font-semibold text-background">
            <Plus size={14} aria-hidden="true" />
            Add {terms.t("money_owed_singular")}
          </button>
        ) : null}
      </div>

      {view.cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-raised p-6 text-center">
          <HandCoins size={24} className="text-text-secondary" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-text-primary">{empty.title}</p>
          <p className="max-w-xs text-sm text-text-muted">{empty.body}</p>
          <button type="button" onClick={() => setAdding(true)} className="h-12 rounded-full bg-accent-primary px-6 text-sm font-semibold text-background">
            {empty.action}
          </button>
        </div>
      ) : (
        <>
          <section aria-label="Still to be paid" className="flex flex-col gap-2">
            {view.outstandingTotals.map((t) => (
              <div key={t.currencyCode} className="rounded-xl bg-surface-raised p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.currencyCode} · Still to be paid</p>
                <p className="tabular-figures break-words text-lg font-semibold text-text-primary">{t.label}</p>
              </div>
            ))}
            <p className="text-xs text-text-muted">{NOT_CASH_NOTE}</p>
          </section>

          <ul className="flex flex-col gap-2.5">
            {view.cards.map((c) => {
              const source = receivables.find((r) => r.receivableId === c.receivableId);
              return (
                <li key={c.receivableId} className="rounded-xl bg-surface-raised p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-text-primary">{c.name}</p>
                      <p className="text-xs text-text-muted">{c.isSettled ? "Fully paid back" : c.expectedDateLabel ? `Expected ${c.expectedDateLabel}` : "No expected date"}</p>
                    </div>
                    <div className="min-w-0 shrink-0 text-right">
                      <p className="text-[11px] text-text-muted">Still owed to you</p>
                      <p className="tabular-figures break-words text-sm font-semibold text-text-primary">{c.outstandingLabel}</p>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Paid back so far: <span className="tabular-figures text-text-secondary">{c.recoveredLabel}</span>
                  </p>
                  {c.estimateLabel ? (
                    <p className="text-xs text-text-muted">
                      You expect to recover about <span className="tabular-figures text-text-secondary">{c.estimateLabel}</span> (an estimate)
                    </p>
                  ) : null}
                  {c.followUpLabel ? <p className="text-xs text-text-muted">{c.followUpLabel}</p> : null}
                  <MoreDetails label="More details">
                    <dl className="grid grid-cols-2 gap-2 pb-1 text-sm">
                      {c.details.map((d) => (
                        <div key={d.label} className="min-w-0">
                          <dt className="text-xs text-text-muted">{d.label}</dt>
                          <dd className="tabular-figures break-words font-semibold text-text-primary">{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </MoreDetails>
                  {c.canRecord ? (
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <button type="button" disabled={busyId === c.receivableId} onClick={() => logFollowUp(c.receivableId)} className="min-h-12 rounded-full bg-surface-strong px-3 text-[13px] font-semibold text-text-primary disabled:opacity-50">
                        {busyId === c.receivableId ? "Saving…" : "Log Follow-Up"}
                      </button>
                      <button type="button" onClick={() => setRecoveringId(c.receivableId)} disabled={!source} className="min-h-12 rounded-full bg-accent-primary px-3 text-[13px] font-semibold text-background">
                        Record Recovery
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </>
      )}

      {adding ? <AddMoneyOwedSheet currencies={currencies} defaultCurrencyCode={defaultCurrencyCode} onClose={() => setAdding(false)} /> : null}
      {recovering ? <RecordRecoverySheet receivable={recovering} buckets={buckets} currencies={currenciesByCode} onClose={() => setRecoveringId(null)} /> : null}
    </div>
  );
}
