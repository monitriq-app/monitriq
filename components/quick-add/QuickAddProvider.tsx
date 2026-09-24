"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Gem, X, ChevronRight, Info } from "lucide-react";
import type { CashBucket, BucketBalance, MoneyReceivedCategory, MoneySpendingCategory } from "@/lib/domain/money/types";
import { QuickAddContext, type QuickAddView } from "@/components/quick-add/QuickAddContext";
import { MoneyReceivedForm } from "@/components/quick-add/MoneyReceivedForm";
import { MoneySpentForm } from "@/components/quick-add/MoneySpentForm";
import { MoveMoneyForm } from "@/components/quick-add/MoveMoneyForm";

interface QuickAddProviderProps {
  children: ReactNode;
  buckets: CashBucket[];
  balances: BucketBalance[];
  receivedCategories: MoneyReceivedCategory[];
  spendingCategories: MoneySpendingCategory[];
}

const HUB_OPTIONS: { view: QuickAddView; title: string; description: string; icon: ReactNode; tint: string }[] = [
  { view: "received", title: "Money Received", description: "Salary, sales, money you're owed, refunds.", icon: <ArrowDownLeft size={22} aria-hidden="true" />, tint: "bg-accent-primary/10 text-accent-primary" },
  { view: "spent", title: "Money Spent", description: "Repairs, fuel, rent, business, personal expenses.", icon: <ArrowUpRight size={22} aria-hidden="true" />, tint: "bg-surface-strong text-text-primary" },
  { view: "move", title: "Move Money", description: "Move money between your own cash buckets.", icon: <ArrowLeftRight size={22} aria-hidden="true" />, tint: "bg-focus/10 text-focus" },
  { view: "asset", title: "Asset / Investment", description: "Convert cash into an asset or investment.", icon: <Gem size={22} aria-hidden="true" />, tint: "bg-attention/10 text-attention" },
];

/**
 * Mounted once in AppShell (see that file) so the shared bottom nav's
 * central `+` opens real Quick Add from any page, not just Money —
 * matching the reference's own behavior of intercepting the nav's +
 * button (P0-E3-S3). "Asset / Investment" never creates a second Asset
 * domain: it routes straight to the existing canonical Add Asset
 * workflow on /assets (#add-asset), the same production form used
 * there — no parallel form is built here.
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
export function QuickAddProvider({ children, buckets, balances, receivedCategories, spendingCategories }: QuickAddProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<QuickAddView>("hub");

  function open() {
    setView("hub");
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
    <QuickAddContext.Provider value={{ isOpen, view, open, close, goTo, backToHub }}>
      {children}

      {isOpen && view === "hub" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={close} role="presentation">
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Add Activity"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Add Activity</h2>
                  <p className="text-sm text-text-muted">What happened with your money?</p>
                </div>
                <button type="button" onClick={close} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-strong text-text-secondary" aria-label="Close">
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              {buckets.length === 0 ? (
                <div className="flex items-start gap-2.5 rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">
                  <Info size={16} className="mt-0.5 shrink-0 text-focus" aria-hidden="true" />
                  <span>
                    Add a cash bucket first so Monatriq knows where to track your money.{" "}
                    <Link href="/money#create-bucket" onClick={close} className="text-accent-primary underline">
                      Add Cash Balance
                    </Link>
                    .
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {HUB_OPTIONS.map((option) => (
                    <button
                      key={option.view}
                      type="button"
                      onClick={() => (option.view === "asset" ? undefined : goTo(option.view))}
                      className="flex min-h-[52px] w-full items-center justify-between rounded-xl bg-surface-strong p-3 text-left"
                    >
                      {option.view === "asset" ? (
                        <Link href="/assets#add-asset" onClick={close} className="flex w-full items-center justify-between">
                          <span className="flex items-center gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${option.tint}`}>{option.icon}</span>
                            <span>
                              <span className="block text-sm font-semibold text-text-primary">{option.title}</span>
                              <span className="block text-xs text-text-muted">{option.description}</span>
                            </span>
                          </span>
                          <ChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
                        </Link>
                      ) : (
                        <>
                          <span className="flex items-center gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${option.tint}`}>{option.icon}</span>
                            <span>
                              <span className="block text-sm font-semibold text-text-primary">{option.title}</span>
                              <span className="block text-xs text-text-muted">{option.description}</span>
                            </span>
                          </span>
                          <ChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
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
            aria-label="Add Activity"
          >
            <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />

            {view === "received" ? <MoneyReceivedForm buckets={buckets.filter((b) => !b.is_archived)} categories={receivedCategories} onBack={backToHub} onClose={close} /> : null}
            {view === "spent" ? <MoneySpentForm buckets={buckets.filter((b) => !b.is_archived)} categories={spendingCategories} onBack={backToHub} onClose={close} /> : null}
            {view === "move" ? <MoveMoneyForm buckets={buckets.filter((b) => !b.is_archived)} balances={balances} onBack={backToHub} onClose={close} /> : null}
          </div>
        </div>
      ) : null}
    </QuickAddContext.Provider>
  );
}
