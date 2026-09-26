"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, History, Plus, ArrowRight, ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getDecisionSummaries } from "@/lib/domain/decisions/repository";
import type { DecisionSummary, DecisionType, DecisionTypeCode } from "@/lib/domain/decisions/types";
import type { AssetSummary } from "@/lib/domain/assets/types";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket } from "@/lib/domain/money/types";
import type { FinancialRuleSummary } from "@/lib/domain/rules/types";
import { decisionTypePresentation, CHOICE_LABELS } from "@/lib/domain/decisions/presentation";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import { DecisionTypeIcon } from "@/components/decisions/DecisionTypeIcon";
import { CreateDecisionSheet } from "@/components/decisions/CreateDecisionSheet";
import { DecisionReviewSheet } from "@/components/decisions/DecisionReviewSheet";

type TabKey = "active" | "test" | "compare" | "journal" | "rules";

interface DecisionsWorkspaceProps {
  decisions: DecisionSummary[];
  decisionTypes: DecisionType[];
  assets: AssetSummary[];
  liabilities: LiabilitySummary[];
  currencies: Currency[];
  buckets: CashBucket[];
  ruleSummaries: FinancialRuleSummary[];
}

const TABS: { key: TabKey; label: (n: number) => string }[] = [
  { key: "active", label: (n) => `Active (${n})` },
  { key: "test", label: () => "Test New" },
  { key: "compare", label: () => "Compare Scenarios" },
  { key: "journal", label: () => "Journal" },
  { key: "rules", label: () => "Financial Rules" },
];

/**
 * Client-side tab controller + sheet orchestration for the full Decisions
 * screen (P0-E4-S3) — mirrors the approved reference's segmented-pill tab
 * bar + primary "Test a Decision" CTA + tab panes, all driven by real
 * server-fetched data passed down as props (no invented content). Two
 * bottom sheets share one orchestration: `CreateDecisionSheet` (name +
 * first scenario for a freshly-chosen type) hands off directly into
 * `DecisionReviewSheet` once the decision exists — the SAME sheet used
 * to reopen any existing decision from the Active/Journal/Compare tabs,
 * so "just created" and "reopened later" render identically.
 */
export function DecisionsWorkspace({ decisions, decisionTypes, assets, liabilities, currencies, buckets, ruleSummaries }: DecisionsWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("active");
  const [creatingType, setCreatingType] = useState<DecisionType | null>(null);
  const [reviewing, setReviewing] = useState<DecisionSummary | null>(null);
  const [liveDecisions, setLiveDecisions] = useState(decisions);

  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const activeDecisions = liveDecisions.filter((d) => d.status === "active");
  const decisionsWithChoice = liveDecisions
    .filter((d) => d.currentChoice !== null && d.currentChoiceAt !== null)
    .sort((a, b) => (b.currentChoiceAt as string).localeCompare(a.currentChoiceAt as string));
  const comparableDecisions = liveDecisions.filter((d) => d.scenarioCount > 1);

  async function refreshDecisions() {
    const supabase = createClient();
    try {
      setLiveDecisions(await getDecisionSummaries(supabase));
    } catch {
      // Non-fatal — the sheet's own error states already cover write failures; this is a best-effort background refresh.
    }
    router.refresh();
  }

  function openReview(decision: DecisionSummary) {
    setReviewing(decision);
  }

  async function handleCreated(decisionId: string) {
    setCreatingType(null);
    const supabase = createClient();
    try {
      const fresh = await getDecisionSummaries(supabase);
      setLiveDecisions(fresh);
      const created = fresh.find((d) => d.decisionId === decisionId);
      if (created) setReviewing(created);
    } catch {
      // If the refetch fails, the user can still find their new decision from Active — no data was lost.
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="w-full overflow-x-auto py-0.5" style={{ scrollbarWidth: "none" }}>
        <div className="flex w-max items-center gap-1 rounded-full bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "true" : undefined}
              className={`relative whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] ${
                tab === t.key ? "bg-accent-primary text-background" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.key === "active" ? t.label(activeDecisions.length) : t.label(0)}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setTab("test")}
        className="flex w-full items-center gap-3 rounded-xl bg-surface-raised p-4 text-left shadow-sm transition hover:bg-surface-strong"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-primary text-background">
          <SlidersHorizontal size={20} aria-hidden="true" />
        </span>
        <span>
          <span className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
            Test a Decision
            <ArrowRight size={14} aria-hidden="true" />
          </span>
          <span className="block text-xs text-text-muted">See how it could affect your cash, goals and commitments before you decide.</span>
        </span>
      </button>

      {tab === "active" ? (
        <ActiveTab decisions={activeDecisions} onOpenTest={() => setTab("test")} onReview={openReview} />
      ) : null}

      {tab === "test" ? <TestNewTab decisionTypes={decisionTypes} onSelect={setCreatingType} /> : null}

      {tab === "compare" ? <CompareTab decisions={comparableDecisions} onReview={openReview} /> : null}

      {tab === "journal" ? <JournalTab decisions={decisionsWithChoice} onReview={openReview} /> : null}

      {tab === "rules" ? <RulesTab ruleSummaries={ruleSummaries} currencies={currenciesByCode} /> : null}

      {creatingType ? (
        <CreateDecisionSheet
          decisionType={creatingType}
          assets={assets}
          liabilities={liabilities}
          currencies={currencies}
          buckets={buckets}
          onClose={() => setCreatingType(null)}
          onCreated={handleCreated}
        />
      ) : null}

      {reviewing ? (
        <DecisionReviewSheet
          decision={reviewing}
          currencies={currenciesByCode}
          buckets={buckets}
          liabilities={liabilities}
          ruleSummaries={ruleSummaries}
          onClose={() => {
            setReviewing(null);
            refreshDecisions();
          }}
        />
      ) : null}
    </div>
  );
}

function ActiveTab({
  decisions,
  onOpenTest,
  onReview,
}: {
  decisions: DecisionSummary[];
  onOpenTest: () => void;
  onReview: (d: DecisionSummary) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-text-primary">Active Decisions</h3>
        <span className="text-xs text-text-muted">{decisions.length} active</span>
      </div>

      {decisions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-raised p-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-strong text-text-secondary">
            <Inbox size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-text-primary">Nothing under review</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-text-muted">Start a decision when you want to compare a purchase, investment, repair, sale or major expense.</p>
          </div>
          <button type="button" onClick={onOpenTest} className="flex min-h-12 items-center gap-1.5 rounded-full bg-accent-primary px-4 text-[13px] font-semibold text-background">
            <Plus size={15} aria-hidden="true" />
            Test a Decision
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {decisions.map((d) => (
            <DecisionRow key={d.decisionId} decision={d} onReview={() => onReview(d)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DecisionRow({ decision, onReview }: { decision: DecisionSummary; onReview: () => void }) {
  return (
    <div className="rounded-xl bg-surface-raised p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary">
            <DecisionTypeIcon typeCode={decision.decisionTypeCode} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-text-primary">{decision.name}</p>
            <p className="truncate text-xs text-text-muted">{decision.decisionTypeLabel}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
          {decision.currentChoice ? CHOICE_LABELS[decision.currentChoice] ?? decision.currentChoice : "No choice yet"}
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between rounded-lg bg-surface-strong p-2">
        <span className="text-xs text-text-muted">{decision.linkedAssetName ?? decision.linkedLiabilityName ?? "No linked record"}</span>
        <span className="text-xs font-semibold text-text-primary">
          {decision.scenarioCount > 0 ? `${decision.scenarioCount} scenario${decision.scenarioCount === 1 ? "" : "s"}` : "Not yet evaluated"}
        </span>
      </div>

      <button type="button" onClick={onReview} className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-surface-strong text-[13px] font-semibold text-accent-primary hover:bg-surface">
        Review Decision
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function TestNewTab({ decisionTypes, onSelect }: { decisionTypes: DecisionType[]; onSelect: (t: DecisionType) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-semibold text-text-primary">What are you considering?</h3>
        <p className="text-sm text-text-muted">Choose what you&apos;re thinking about doing. See how it could affect your cash, assets and rules — nothing here moves real money.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {decisionTypes.map((type) => {
          const presentation = decisionTypePresentation(type.code as DecisionTypeCode);
          return (
            <button
              key={type.code}
              type="button"
              onClick={() => onSelect(type)}
              className="flex flex-col justify-between gap-2.5 rounded-xl bg-surface-raised p-3.5 text-left transition hover:bg-surface-strong"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-strong text-accent-primary">
                <DecisionTypeIcon typeCode={type.code as DecisionTypeCode} size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-text-primary">{type.display_name}</span>
                <span className="block text-xs text-text-muted">{presentation.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompareTab({ decisions, onReview }: { decisions: DecisionSummary[]; onReview: (d: DecisionSummary) => void }) {
  if (decisions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-raised p-6 text-center">
        <ArrowLeftRight size={20} className="text-text-secondary" aria-hidden="true" />
        <p className="text-[15px] font-semibold text-text-primary">No comparisons yet</p>
        <p className="max-w-xs text-sm text-text-muted">Add a second scenario to any decision to compare them side by side here.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[15px] font-semibold text-text-primary">Decisions with multiple scenarios</h3>
      {decisions.map((d) => (
        <div key={d.decisionId} className="rounded-xl bg-surface-raised p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary">
              <DecisionTypeIcon typeCode={d.decisionTypeCode} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-text-primary">{d.name}</p>
              <p className="text-xs text-text-muted">{d.scenarioCount} scenarios</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onReview(d)}
            className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-surface-strong text-[13px] font-semibold text-focus hover:bg-surface"
          >
            Open Scenario Comparison
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function JournalTab({ decisions, onReview }: { decisions: DecisionSummary[]; onReview: (d: DecisionSummary) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-text-primary">Decision Journal</h3>
          <p className="text-xs text-text-muted">Decisions you&apos;ve recorded a choice on — so you can compare what you expected with what actually happened.</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-strong px-2.5 py-1 text-[11px] font-semibold text-text-secondary">{decisions.length} recorded</span>
      </div>

      {decisions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-raised p-6 text-center">
          <History size={20} className="text-text-secondary" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-text-primary">No decisions recorded yet</p>
          <p className="max-w-xs text-sm text-text-muted">Decisions you record will appear here.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {decisions.map((d) => (
            <li key={d.decisionId}>
              <button type="button" onClick={() => onReview(d)} className="flex min-h-12 w-full items-center justify-between rounded-xl bg-surface-raised p-3.5 text-left hover:bg-surface-strong">
                <span className="flex min-w-0 items-center gap-2">
                  <DecisionTypeIcon typeCode={d.decisionTypeCode} />
                  <span className="truncate text-sm font-medium text-text-primary">{d.name}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-text-muted">
                  <span className="block font-semibold text-text-secondary">{d.currentChoice ? CHOICE_LABELS[d.currentChoice] ?? d.currentChoice : ""}</span>
                  {d.currentChoiceAt ? new Date(d.currentChoiceAt).toLocaleDateString() : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RulesTab({ ruleSummaries, currencies }: { ruleSummaries: FinancialRuleSummary[]; currencies: Map<string, Currency> }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-text-primary">Financial Rules</h3>
          <p className="text-xs text-text-muted">Your own configured rules for protecting cash. Decisions checks every scenario against these.</p>
        </div>
        <Link href="/rules" className="relative shrink-0 rounded-full bg-accent-primary px-3 py-1.5 text-[11px] font-semibold text-background before:absolute before:-inset-2.5 before:content-['']">
          Configure
        </Link>
      </div>

      {ruleSummaries.length === 0 ? (
        <div className="rounded-xl bg-surface-raised p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">Minimum Cash to Keep</span>
            <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold text-text-secondary">Not set</span>
          </div>
          <p className="mt-1 text-xs text-text-muted">The amount you want to keep untouched per currency, before Decisions treats anything else as Safe to Deploy.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ruleSummaries
            .filter((r) => r.status === "active")
            .map((r) => {
              const currency = currencies.get(r.currencyCode);
              const formatted = r.currentThreshold === null ? "Not set" : currency ? formatCurrencyAmount(r.currentThreshold, currency, { trimTrailingZeros: true }) : `${r.currencyCode} ${r.currentThreshold}`;
              return (
                <div key={r.ruleId} className="rounded-xl bg-surface-raised p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text-primary">{r.currencyCode} — Minimum Cash to Keep</span>
                  </div>
                  <p className="mt-1 tabular-figures text-sm text-text-secondary">{formatted}</p>
                </div>
              );
            })}
        </div>
      )}

      <p className="text-[11px] text-text-muted">
        Protected Goal and Protected Obligation status are checked automatically for each decision, from your real Goals and Upcoming Obligations — shown inside each decision&apos;s own review, not configured here.
      </p>
    </div>
  );
}
