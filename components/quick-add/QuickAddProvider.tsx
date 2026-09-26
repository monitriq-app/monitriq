"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Gem, X, ChevronRight, Info, PiggyBank, Target, CalendarClock, ShoppingBag } from "lucide-react";
import type { CashBucket, BucketBalance, MoneyReceivedCategory, MoneySpendingCategory } from "@/lib/domain/money/types";
import { QuickAddContext, type QuickAddView, type SpentPrefill } from "@/components/quick-add/QuickAddContext";
import { MoneyReceivedForm } from "@/components/quick-add/MoneyReceivedForm";
import { MoneySpentForm } from "@/components/quick-add/MoneySpentForm";
import { MoveMoneyForm } from "@/components/quick-add/MoveMoneyForm";
import { QUICK_ADD_GROUPS, QUICK_ADD_TITLE, QUICK_ADD_SUBTITLE, type QuickAddIconKey, type QuickAddOptionConfig } from "@/components/quick-add/options";

interface QuickAddProviderProps {
  children: ReactNode;
  buckets: CashBucket[];
  balances: BucketBalance[];
  receivedCategories: MoneyReceivedCategory[];
  spendingCategories: MoneySpendingCategory[];
}

const ICONS: Record<QuickAddIconKey, { icon: ReactNode; tint: string }> = {
  received: { icon: <ArrowDownLeft size={20} aria-hidden="true" />, tint: "bg-accent-primary/10 text-accent-primary" },
  spent: { icon: <ArrowUpRight size={20} aria-hidden="true" />, tint: "bg-surface-strong text-text-primary" },
  move: { icon: <ArrowLeftRight size={20} aria-hidden="true" />, tint: "bg-focus/10 text-focus" },
  asset: { icon: <Gem size={20} aria-hidden="true" />, tint: "bg-attention/10 text-attention" },
  budget: { icon: <PiggyBank size={20} aria-hidden="true" />, tint: "bg-accent-primary/10 text-accent-primary" },
  goal: { icon: <Target size={20} aria-hidden="true" />, tint: "bg-focus/10 text-focus" },
  commitment: { icon: <CalendarClock size={20} aria-hidden="true" />, tint: "bg-attention/10 text-attention" },
  check: { icon: <ShoppingBag size={20} aria-hidden="true" />, tint: "bg-accent-primary/10 text-accent-primary" },
};

/**
 * Mounted once in AppShell (see that file) so the shared bottom nav's
 * central `+` opens real Quick Add from any page, not just Money —
 * matching the reference's own behavior of intercepting the nav's +
 * button (P0-E3-S3). "Asset / Investment" never creates a second Asset
 * domain: it routes straight to the existing canonical Add Asset
 * workflow on /assets (#add-asset). P0-E5-S2 regrouped the hub into
 * Record (Money Received/Spent, Move Money, Asset) and Plan (Budget,
 * Goal, Commitment); the structure lives in ./options.ts, and Plan
 * items route to the existing canonical screens rather than duplicating
 * them.
 *
 * Two distinct presentations, by deliberate product decision (P0-E3-S3
 * refinement): the initial 4-option "hub" chooser is a restrained,
 * CENTERED modal (`items-center justify-center`, `max-w-sm`, content-
 * driven height) rather than the reference's own bottom-sheet placement
 * for that specific screen — everything downstream of a choice (Money
 * Received/Spent/Move Money's detailed forms) keeps the taller,
 * reference-style bottom sheet, since those forms have real content
 * that benefits from the extra height and scroll room a tiny centered
 * card can't offer.
 */
function HubRow({ option, onSelect, onNavigate }: { option: QuickAddOptionConfig; onSelect: (v: QuickAddView) => void; onNavigate: () => void }) {
  const { icon, tint } = ICONS[option.icon];
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tint}`}>{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text-primary">{option.title}</span>
          <span className="block text-xs text-text-muted">{option.description}</span>
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
    </>
  );
  const cls = "flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-surface-strong px-3 py-2 text-left";
  if (option.href) {
    return (
      <Link href={option.href} onClick={onNavigate} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onSelect(option.view as QuickAddView)} className={cls}>
      {body}
    </button>
  );
}

export function QuickAddProvider({ children, buckets, balances, receivedCategories, spendingCategories }: QuickAddProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<QuickAddView>("hub");
  const [prefill, setPrefill] = useState<SpentPrefill | null>(null);

  function open() {
    setPrefill(null);
    setView("hub");
    setIsOpen(true);
  }
  function openSpent(values: SpentPrefill) {
    setPrefill(values);
    setView("spent");
    setIsOpen(true);
  }
  function close() {
    setIsOpen(false);
  }
  function goTo(next: QuickAddView) {
    setView(next);
  }
  function backToHub() {
    setView("hub");
  }

  return (
    <QuickAddContext.Provider value={{ isOpen, view, open, close, goTo, openSpent, backToHub }}>
      {children}

      {isOpen && view === "hub" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={close} role="presentation">
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={QUICK_ADD_TITLE}
          >
            <div className="flex max-h-[85vh] flex-col gap-3 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-text-primary">{QUICK_ADD_TITLE}</h2>
                  <p className="text-sm text-text-muted">{QUICK_ADD_SUBTITLE}</p>
                </div>
                <button type="button" onClick={close} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-text-secondary" aria-label="Close">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-strong">
                    <X size={20} aria-hidden="true" />
                  </span>
                </button>
              </div>

              {QUICK_ADD_GROUPS.map((group) => {
                const blocked = group.requiresBucket && buckets.length === 0;
                return (
                  <section key={group.heading} aria-label={group.heading} className="flex flex-col gap-1.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{group.heading}</h3>
                    {blocked ? (
                      <div className="flex items-start gap-2.5 rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">
                        <Info size={16} className="mt-0.5 shrink-0 text-focus" aria-hidden="true" />
                        <span>
                          Add a cash bucket first so Monitriq knows where to track your money.{" "}
                          <Link href="/money#create-bucket" onClick={close} className="text-accent-primary underline">
                            Add Cash Balance
                          </Link>
                          .
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {group.options.map((option) => (
                          <HubRow key={option.key} option={option} onSelect={goTo} onNavigate={close} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {isOpen && view !== "hub" ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm" onClick={close} role="presentation">
          <div
            className="mx-auto flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Quick Add"
          >
            <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />

            {view === "received" ? <MoneyReceivedForm buckets={buckets.filter((b) => !b.is_archived)} categories={receivedCategories} onBack={backToHub} onClose={close} /> : null}
            {view === "spent" ? <MoneySpentForm buckets={buckets.filter((b) => !b.is_archived)} categories={spendingCategories} prefill={prefill} onBack={backToHub} onClose={close} /> : null}
            {view === "move" ? <MoveMoneyForm buckets={buckets.filter((b) => !b.is_archived)} balances={balances} onBack={backToHub} onClose={close} /> : null}
          </div>
        </div>
      ) : null}
    </QuickAddContext.Provider>
  );
}
