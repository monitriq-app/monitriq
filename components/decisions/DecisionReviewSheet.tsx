"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, SlidersHorizontal, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  listDecisionScenarios,
  evaluateDecisionScenario,
  createDecisionScenario,
  recordDecisionChoice,
  getDecisionChoiceHistory,
  updateDecision,
} from "@/lib/domain/decisions/repository";
import type { DecisionScenario, DecisionScenarioEvaluation, DecisionSummary, DecisionChoice, DecisionChoiceHistoryItem } from "@/lib/domain/decisions/types";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import type { FinancialRuleSummary } from "@/lib/domain/rules/types";
import {
  decisionTypePresentation,
  RULE_STATUS_LABELS,
  CHOICE_LABELS,
  MISSING_INFO_LABELS,
  directionalCashAmount,
  signPrefix,
  buildDecisionCalculationExplanation,
  coveredMissingInfoCodes,
  type ExplanationTerm,
  type CalculationExplanationBlock,
} from "@/lib/domain/decisions/presentation";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { DecisionTypeIcon } from "@/components/decisions/DecisionTypeIcon";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoreDetails } from "@/components/ui/MoreDetails";

interface DecisionReviewSheetProps {
  decision: DecisionSummary;
  currencies: Map<string, Currency>;
  buckets: CashBucket[];
  liabilities: LiabilitySummary[];
  ruleSummaries: FinancialRuleSummary[];
  onClose: () => void;
}

function fmt(value: string | null, currencyCode: string, currencies: Map<string, Currency>): string {
  if (value === null) return "Not calculated";
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency) : `${currencyCode} ${value}`;
}

interface FieldRow {
  label: string;
  value: string;
}

/**
 * The full "Review a Decision" experience (P0-E4-S3) — Facts / Your
 * Assumptions / What This Changes / Rules, Scenario Comparison when 2+
 * scenarios exist, and Choice recording. Every figure comes straight
 * from `evaluateDecisionScenario()` (itself a thin read over
 * `evaluate_decision_scenario()`) — nothing here recomputes cash-after,
 * Safe-to-Deploy, or a rule status independently. Facts/Assumptions/
 * Derived stay in visually distinct groups (never merged into one
 * ambiguous list) and only the fields relevant to THIS decision's type
 * are shown, via `decisionTypePresentation()`.
 */
export function DecisionReviewSheet({ decision, currencies, buckets, liabilities, ruleSummaries, onClose }: DecisionReviewSheetProps) {
  const router = useRouter();
  const typeCode = decision.decisionTypeCode;
  const presentation = decisionTypePresentation(typeCode);

  const [scenarios, setScenarios] = useState<DecisionScenario[] | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, DecisionScenarioEvaluation>>({});
  const [history, setHistory] = useState<DecisionChoiceHistoryItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Legacy-incomplete-decision repair (P0-E4-S3B) — a decision created
  // before this phase's required-link rule existed may have no linked
  // liability/asset. `updateDecision()` already supports setting one
  // after the fact (decisions are not append-only, unlike scenarios/
  // choices/evaluations), so this is a real fix, not a workaround.
  const [linkingLiability, setLinkingLiability] = useState(false);
  const [liabilityFixId, setLiabilityFixId] = useState("");
  const [liabilityFixPending, setLiabilityFixPending] = useState(false);
  const [liabilityFixError, setLiabilityFixError] = useState<string | null>(null);
  const [liabilityOverride, setLiabilityOverride] = useState<{ id: string; name: string } | null>(null);
  const effectiveLinkedLiabilityId = liabilityOverride?.id ?? decision.linkedLiabilityId;
  const effectiveLinkedLiabilityName = liabilityOverride?.name ?? decision.linkedLiabilityName;

  const [addingScenario, setAddingScenario] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioCurrency, setScenarioCurrency] = useState("");
  const [scenarioAmount, setScenarioAmount] = useState("");
  const [scenarioBucketId, setScenarioBucketId] = useState("");
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [scenarioPending, setScenarioPending] = useState(false);

  const [choice, setChoice] = useState<DecisionChoice | "">("");
  const [note, setNote] = useState("");
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [choicePending, setChoicePending] = useState(false);

  async function loadAll() {
    const supabase = createClient();
    try {
      const [scenarioRows, choiceHistory] = await Promise.all([
        listDecisionScenarios(supabase, decision.decisionId),
        getDecisionChoiceHistory(supabase, decision.decisionId),
      ]);
      setScenarios(scenarioRows);
      setHistory(choiceHistory);
      const evalPairs = await Promise.all(
        scenarioRows.map(async (s) => [s.id, await evaluateDecisionScenario(supabase, s.id)] as const),
      );
      setEvaluations(Object.fromEntries(evalPairs));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this decision.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      try {
        const [scenarioRows, choiceHistory] = await Promise.all([
          listDecisionScenarios(supabase, decision.decisionId),
          getDecisionChoiceHistory(supabase, decision.decisionId),
        ]);
        if (cancelled) return;
        const evalPairs = await Promise.all(scenarioRows.map(async (s) => [s.id, await evaluateDecisionScenario(supabase, s.id)] as const));
        if (cancelled) return;
        setScenarios(scenarioRows);
        setHistory(choiceHistory);
        setEvaluations(Object.fromEntries(evalPairs));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load this decision.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [decision.decisionId]);

  const primaryScenario = scenarios?.[0] ?? null;
  const primaryEvaluation = primaryScenario ? evaluations[primaryScenario.id] : null;
  const matchingBuckets = scenarioCurrency ? buckets.filter((b) => b.currency_code === scenarioCurrency) : buckets;

  async function handleAddScenario(event: FormEvent) {
    event.preventDefault();
    setScenarioError(null);
    setScenarioPending(true);
    try {
      const supabase = createClient();
      await createDecisionScenario(supabase, {
        decisionId: decision.decisionId,
        name: scenarioName.trim(),
        currencyCode: scenarioCurrency,
        sourceBucketId: presentation.allowsSourceBucket ? scenarioBucketId || undefined : undefined,
        destinationBucketId: presentation.allowsDestinationBucket ? scenarioBucketId || undefined : undefined,
        cashRequired: presentation.cashRequiredLabel ? scenarioAmount || undefined : undefined,
        grossProceeds: presentation.grossProceedsLabel ? scenarioAmount || undefined : undefined,
      });
      setScenarioName("");
      setScenarioCurrency("");
      setScenarioAmount("");
      setScenarioBucketId("");
      setAddingScenario(false);
      await loadAll();
      router.refresh();
    } catch (err) {
      setScenarioError(err instanceof Error ? err.message : "Could not add this scenario.");
    } finally {
      setScenarioPending(false);
    }
  }

  async function handleLinkLiability(event: FormEvent) {
    event.preventDefault();
    setLiabilityFixError(null);
    setLiabilityFixPending(true);
    try {
      const supabase = createClient();
      await updateDecision(supabase, decision.decisionId, { linkedLiabilityId: liabilityFixId });
      const liability = liabilities.find((l) => l.liabilityId === liabilityFixId);
      setLiabilityOverride({ id: liabilityFixId, name: liability?.name ?? "" });
      setLinkingLiability(false);
      await loadAll();
      router.refresh();
    } catch (err) {
      setLiabilityFixError(err instanceof Error ? err.message : "Could not link this debt.");
    } finally {
      setLiabilityFixPending(false);
    }
  }

  async function handleRecordChoice(chosen: DecisionChoice) {
    setChoiceError(null);
    setChoicePending(true);
    try {
      const supabase = createClient();
      await recordDecisionChoice(supabase, { decisionId: decision.decisionId, choice: chosen, note: note.trim() || undefined });
      setChoice(chosen);
      setNote("");
      const supabase2 = createClient();
      setHistory(await getDecisionChoiceHistory(supabase2, decision.decisionId));
      router.refresh();
    } catch (err) {
      setChoiceError(err instanceof Error ? err.message : "Could not record this choice.");
    } finally {
      setChoicePending(false);
    }
  }

  const factRows: FieldRow[] = useMemo(() => {
    if (!primaryEvaluation) return [];
    const cur = primaryEvaluation.currencyCode;
    const rows: FieldRow[] = [];
    if (primaryEvaluation.linkedAssetId) {
      rows.push({ label: "What You Have Invested", value: fmt(primaryEvaluation.linkedAssetCostBasis, cur, currencies) });
      rows.push({ label: "Current Value", value: fmt(primaryEvaluation.linkedAssetLatestValue, cur, currencies) });
    }
    if (primaryEvaluation.linkedLiabilityId) {
      rows.push({ label: "Outstanding Debt", value: fmt(primaryEvaluation.linkedLiabilityOutstandingPrincipal, cur, currencies) });
    }
    if (primaryEvaluation.sourceBucketBalance !== null) {
      rows.push({ label: "Account Balance Now", value: fmt(primaryEvaluation.sourceBucketBalance, cur, currencies) });
    } else if (primaryEvaluation.destinationBucketBalance !== null) {
      rows.push({ label: "Account Balance Now", value: fmt(primaryEvaluation.destinationBucketBalance, cur, currencies) });
    }
    return rows;
  }, [primaryEvaluation, currencies]);

  const assumptionRows: FieldRow[] = useMemo(() => {
    if (!primaryEvaluation) return [];
    const cur = primaryEvaluation.currencyCode;
    const rows: FieldRow[] = [];
    if (presentation.cashRequiredLabel && primaryEvaluation.cashRequired !== null) rows.push({ label: presentation.cashRequiredLabel, value: fmt(primaryEvaluation.cashRequired, cur, currencies) });
    if (presentation.acquisitionCostsLabel && primaryEvaluation.acquisitionCosts !== null) rows.push({ label: presentation.acquisitionCostsLabel, value: fmt(primaryEvaluation.acquisitionCosts, cur, currencies) });
    if (presentation.grossProceedsLabel && primaryEvaluation.grossProceeds !== null) rows.push({ label: presentation.grossProceedsLabel, value: fmt(primaryEvaluation.grossProceeds, cur, currencies) });
    if (presentation.proceedsCostsLabel && primaryEvaluation.proceedsCosts !== null) rows.push({ label: presentation.proceedsCostsLabel, value: fmt(primaryEvaluation.proceedsCosts, cur, currencies) });
    if (primaryEvaluation.debtPrincipalPayment !== null) rows.push({ label: "Payment Amount", value: fmt(primaryEvaluation.debtPrincipalPayment, cur, currencies) });
    if (presentation.showsExpectedValue && primaryEvaluation.expectedValueAssumption !== null) rows.push({ label: presentation.expectedValueLabel, value: fmt(primaryEvaluation.expectedValueAssumption, cur, currencies) });
    if (presentation.showsRepairFields && primaryEvaluation.expectedFutureSaleValue !== null) rows.push({ label: "Target Value After Repair", value: fmt(primaryEvaluation.expectedFutureSaleValue, cur, currencies) });
    return rows;
  }, [primaryEvaluation, presentation, currencies]);

  const derivedRows: FieldRow[] = useMemo(() => {
    if (!primaryEvaluation) return [];
    const cur = primaryEvaluation.currencyCode;
    const rows: FieldRow[] = [];
    if (primaryEvaluation.netImmediateCashDelta !== null) {
      const { label, magnitude } = directionalCashAmount(primaryEvaluation.netImmediateCashDelta, presentation.netProceedsLabel, "Cash Required");
      rows.push({ label, value: fmt(magnitude, cur, currencies) });
    }
    if (primaryEvaluation.bucketBalanceAfter !== null) rows.push({ label: "Cash After", value: fmt(primaryEvaluation.bucketBalanceAfter, cur, currencies) });
    if (primaryEvaluation.currencySafeToDeployBefore !== null) rows.push({ label: "Safe to Deploy Before", value: fmt(primaryEvaluation.currencySafeToDeployBefore, cur, currencies) });
    if (primaryEvaluation.currencySafeToDeployAfter !== null) rows.push({ label: "Safe to Deploy After", value: fmt(primaryEvaluation.currencySafeToDeployAfter, cur, currencies) });
    if (presentation.showsProfitLoss) rows.push({ label: presentation.profitLossLabel, value: fmt(primaryEvaluation.projectedGrossProfitLoss, cur, currencies) });
    if (presentation.showsRepairFields) rows.push({ label: "Expected Final Amount Invested", value: fmt(primaryEvaluation.basisAfterCapitalizedImprovement, cur, currencies) });
    if (primaryEvaluation.hypotheticalLiabilityOutstandingAfter !== null) rows.push({ label: "Remaining Debt", value: fmt(primaryEvaluation.hypotheticalLiabilityOutstandingAfter, cur, currencies) });
    return rows;
  }, [primaryEvaluation, presentation, currencies]);

  // The user's own configured minimum-cash-to-keep for THIS scenario's
  // currency — a real, static fact from getFinancialRuleSummaries(),
  // never a hypothetical/recomputed value. Used only as read-only
  // context (never an equation input) — see buildDecisionCalculation
  // Explanation()'s own doc comment.
  const minimumCashFloor = useMemo(() => {
    if (!primaryEvaluation) return { configured: false, amount: null as string | null };
    const rule = ruleSummaries.find((r) => r.currencyCode === primaryEvaluation.currencyCode && r.status === "active");
    return { configured: rule !== undefined, amount: rule?.currentThreshold ?? null };
  }, [primaryEvaluation, ruleSummaries]);

  const explanationBlocks = useMemo(() => {
    if (!primaryEvaluation) return [];
    return buildDecisionCalculationExplanation(presentation, primaryEvaluation, minimumCashFloor);
  }, [primaryEvaluation, presentation, minimumCashFloor]);

  // P0-E4-S3C: a missing_information code already explained by one of
  // explanationBlocks' own reasons (e.g. the debt block's "Choose a debt
  // to evaluate its remaining balance." for no_liability_linked) must
  // not ALSO get its own "Not Yet Calculated" card below — same
  // unresolved calculation, shown once, not twice.
  const uncoveredMissingInformation = useMemo(() => {
    if (!primaryEvaluation) return [];
    const covered = coveredMissingInfoCodes(explanationBlocks);
    return primaryEvaluation.missingInformation.filter((code) => !covered.has(code));
  }, [primaryEvaluation, explanationBlocks]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="mx-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Review ${decision.name}`}
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary">
              <DecisionTypeIcon typeCode={typeCode} size={15} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold leading-6 text-text-primary">{decision.name}</h3>
              <p className="text-xs text-text-muted">{decision.decisionTypeLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary before:absolute before:-inset-1.5 before:content-['']"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {(presentation.liabilityLinkRequired || decision.linkedLiabilityId !== null || presentation.assetLinkRequired || decision.linkedAssetId !== null) ? (
          <div className="mb-3 rounded-lg bg-surface-strong p-2.5">
            {presentation.liabilityLinkRequired || decision.linkedLiabilityId !== null ? (
              effectiveLinkedLiabilityId ? (
                <p className="text-xs text-text-secondary">
                  <span className="text-text-muted">Paying down: </span>
                  <span className="font-semibold text-text-primary">{effectiveLinkedLiabilityName ?? "Linked debt"}</span>
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-text-secondary">
                    <span className="text-text-muted">Debt: </span>
                    <span className="font-semibold text-attention">Not linked</span>
                  </p>
                  {liabilities.length === 0 ? (
                    // No canonical debt exists to link at all — showing an
                    // enabled "Link debt" action over an empty selector is a
                    // dead end (P0-E4-S3C). Monitriq's only real debt-
                    // creation flow lives at /liabilities (`CreateLiability
                    // Form`, backed by the same createLiability() this
                    // decision would eventually link to) — route there
                    // instead of inventing a second, throwaway liability
                    // form inside Decisions.
                    <>
                      <p className="text-xs text-text-muted">Add the debt you want to evaluate before continuing.</p>
                      <Link href="/liabilities" className="flex min-h-12 items-center gap-1 self-start text-xs font-semibold text-accent-primary">
                        Add a debt
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    </>
                  ) : !linkingLiability ? (
                    <button type="button" onClick={() => setLinkingLiability(true)} className="min-h-12 self-start text-xs font-semibold text-accent-primary">
                      Link a debt to complete this calculation
                    </button>
                  ) : (
                    <form onSubmit={handleLinkLiability} className="flex flex-col gap-2">
                      <Select required value={liabilityFixId} onChange={(e) => setLiabilityFixId(e.target.value)} className="text-sm">
                        <option value="" disabled>
                          Select a debt
                        </option>
                        {liabilities.map((l) => (
                          <option key={l.liabilityId} value={l.liabilityId}>
                            {l.name}
                          </option>
                        ))}
                      </Select>
                      {liabilityFixError ? <p className="text-xs text-danger">{liabilityFixError}</p> : null}
                      <div className="flex gap-2">
                        <button type="submit" disabled={liabilityFixPending || !liabilityFixId} className="min-h-12 flex-1 rounded-full bg-accent-primary text-xs font-semibold text-background disabled:opacity-50">
                          {liabilityFixPending ? "Linking…" : "Link debt"}
                        </button>
                        <button type="button" onClick={() => setLinkingLiability(false)} className="min-h-12 rounded-full bg-surface px-3 text-xs font-semibold text-text-secondary">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )
            ) : null}
            {presentation.assetLinkRequired || decision.linkedAssetId !== null ? (
              <p className="text-xs text-text-secondary">
                <span className="text-text-muted">Asset: </span>
                <span className={decision.linkedAssetId ? "font-semibold text-text-primary" : "font-semibold text-attention"}>{decision.linkedAssetName ?? "Not linked"}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}

        {!scenarios ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : scenarios.length === 0 ? (
          <p className="text-sm text-text-muted">No scenario yet for this decision.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {primaryEvaluation ? (
              <div className="rounded-xl bg-surface-strong p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Facts, Assumptions &amp; What This Changes</span>
                  <SlidersHorizontal size={14} className="text-text-muted" aria-hidden="true" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <CategoryBlock label="Tracked Fact" rows={factRows} />
                  <CategoryBlock label="Your Assumption" rows={assumptionRows} />
                </div>
              </div>
            ) : null}

            {primaryEvaluation && derivedRows.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-primary">What This Changes</h4>
                <div className="flex flex-col gap-1.5">
                  {derivedRows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between rounded-lg bg-surface-strong p-2.5">
                      <span className="text-xs text-text-muted">{r.label}</span>
                      <span className="tabular-figures text-sm font-semibold text-text-primary">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {primaryEvaluation && explanationBlocks.length > 0 ? (
              <MoreDetails label="How this was calculated">
                <div className="flex flex-col gap-3">
                  {explanationBlocks.map((block) => (
                    <CalculationBlockView key={block.key} block={block} currencyCode={primaryEvaluation.currencyCode} currencies={currencies} />
                  ))}
                </div>
              </MoreDetails>
            ) : null}

            {uncoveredMissingInformation.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-primary">Not Yet Calculated</h4>
                <div className="flex flex-col gap-1.5">
                  {uncoveredMissingInformation.map((key) => {
                    const info = MISSING_INFO_LABELS[key];
                    return (
                      <div key={key} className="rounded-lg bg-surface-strong p-2.5">
                        <p className="text-xs font-semibold text-text-primary">{info?.title ?? "Not calculated"}</p>
                        <p className="mt-0.5 text-xs text-text-muted">{info?.body ?? "Add the missing information to calculate this."}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {primaryEvaluation ? (
              <div className="flex flex-col gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-primary">Rules</h4>
                <div className="flex flex-col gap-1.5">
                  <RuleRow
                    label="Minimum Cash to Keep"
                    status={primaryEvaluation.minimumCashFloorStatus}
                    context={minimumCashFloor.configured && minimumCashFloor.amount !== null ? `Minimum: ${fmt(minimumCashFloor.amount, primaryEvaluation.currencyCode, currencies)}` : null}
                  />
                  <RuleRow label="Protected Goal" status={primaryEvaluation.protectedGoalStatus} context={null} />
                  <RuleRow label="Protected Obligation" status={primaryEvaluation.protectedObligationStatus} context={null} />
                </div>
              </div>
            ) : null}

            {scenarios.length > 1 ? (
              <div className="flex flex-col gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-primary">Scenario Comparison</h4>
                <div className="flex flex-col gap-2">
                  {scenarios.map((s) => {
                    const e = evaluations[s.id];
                    if (!e) return null;
                    return (
                      <div key={s.id} className="rounded-lg bg-surface-strong p-2.5">
                        <p className="mb-1 text-sm font-semibold text-text-primary">{s.name}</p>
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          <span className="text-text-muted">Net cash effect</span>
                          <span className="text-right tabular-figures text-text-primary">
                            {e.netImmediateCashDelta !== null ? `${signPrefix(e.netImmediateCashDelta)}${fmt(e.netImmediateCashDelta, e.currencyCode, currencies)}` : "Not calculated"}
                          </span>
                          {presentation.showsProfitLoss ? (
                            <>
                              <span className="text-text-muted">{presentation.profitLossLabel}</span>
                              <span className="text-right tabular-figures text-text-primary">{fmt(e.projectedGrossProfitLoss, e.currencyCode, currencies)}</span>
                            </>
                          ) : null}
                          <span className="text-text-muted">Safe to Deploy after</span>
                          <span className="text-right tabular-figures text-text-primary">{fmt(e.currencySafeToDeployAfter, e.currencyCode, currencies)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-text-muted">Shown side by side for comparison only — Monitriq does not rank or recommend a scenario.</p>
              </div>
            ) : null}

            <div>
              {addingScenario ? (
                <form onSubmit={handleAddScenario} className="flex flex-col gap-3 rounded-lg bg-surface-strong p-3">
                  <FormField label="Scenario name" htmlFor="new-scenario-name">
                    <Input id="new-scenario-name" required maxLength={100} value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Alternative" />
                  </FormField>
                  <FormField label="Currency" htmlFor="new-scenario-currency">
                    <Select id="new-scenario-currency" required value={scenarioCurrency} onChange={(e) => setScenarioCurrency(e.target.value)}>
                      <option value="" disabled>
                        Select
                      </option>
                      {Array.from(currencies.values()).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.display_name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  {presentation.cashRequiredLabel || presentation.grossProceedsLabel ? (
                    <FormField label={presentation.cashRequiredLabel ?? presentation.grossProceedsLabel ?? "Amount"} htmlFor="new-scenario-amount">
                      <Input id="new-scenario-amount" inputMode="decimal" value={scenarioAmount} onChange={(e) => setScenarioAmount(e.target.value)} placeholder="0.00" />
                    </FormField>
                  ) : null}
                  {presentation.allowsSourceBucket || presentation.allowsDestinationBucket ? (
                    <FormField label={presentation.allowsSourceBucket ? presentation.sourceBucketLabel : presentation.destinationBucketLabel} htmlFor="new-scenario-bucket">
                      <Select id="new-scenario-bucket" value={scenarioBucketId} onChange={(e) => setScenarioBucketId(e.target.value)}>
                        <option value="">None</option>
                        {matchingBuckets.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  ) : null}
                  {scenarioError ? <p className="text-sm text-danger">{scenarioError}</p> : null}
                  <div className="flex gap-2">
                    <button type="submit" disabled={scenarioPending} className="min-h-12 flex-1 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
                      {scenarioPending ? "Adding…" : "Add scenario"}
                    </button>
                    <button type="button" onClick={() => setAddingScenario(false)} className="min-h-12 rounded-full bg-surface px-4 text-sm font-semibold text-text-secondary">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingScenario(true)}
                  className="min-h-12 w-full rounded-lg border border-dashed border-border text-sm font-semibold text-text-secondary hover:text-text-primary"
                >
                  + Add another scenario
                </button>
              )}
            </div>

            <div className="rounded-xl bg-surface-strong p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Your Decision</span>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {(["proceed", "wait", "decline", "keep_reviewing"] as DecisionChoice[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={choicePending}
                    onClick={() => handleRecordChoice(c)}
                    className={`min-h-12 rounded-lg text-center text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                      choice === c ? "bg-accent-primary text-background" : "bg-surface text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {CHOICE_LABELS[c]}
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Reason / note (optional)" className="text-sm" />
              </div>
              {choiceError ? <p className="mt-2 text-sm text-danger">{choiceError}</p> : null}
              {decision.currentChoice ? (
                <p className="mt-2 text-xs text-text-muted">
                  Current choice: <span className="font-semibold text-text-secondary">{CHOICE_LABELS[decision.currentChoice] ?? decision.currentChoice}</span>
                </p>
              ) : null}
            </div>

            {history.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-primary">History</h4>
                <ul className="flex flex-col divide-y divide-border text-xs">
                  {history.map((item) => (
                    <li key={item.id} className="flex items-center justify-between py-1.5">
                      <span className="text-text-secondary">{CHOICE_LABELS[item.choice] ?? item.choice}</span>
                      <span className="text-text-muted">
                        {new Date(item.createdAt).toLocaleDateString()}
                        {item.note ? ` — ${item.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryBlock({ label, rows }: { label: string; rows: FieldRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg bg-surface p-2">
      <span className="mb-1 inline-block rounded bg-surface-raised px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-[11px] text-text-muted">{r.label}</p>
            <p className="tabular-figures text-sm font-semibold text-text-primary">{r.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * `context` (P0-E4-S3B) is a real, already-canonical fact shown next to
 * the status — e.g. the user's own configured minimum-cash-to-keep
 * amount next to "Minimum Cash to Keep — Conflict" — never a computed
 * "how far below" difference (see `buildDecisionCalculationExplanation
 * ()`'s doc comment for why: the figures needed for that subtraction
 * are scoped differently — one bucket vs. the whole currency — so
 * showing a manufactured gap here would misrepresent the real formula).
 */
function RuleRow({ label, status, context }: { label: string; status: string | null; context: string | null }) {
  const displayStatus = status ?? "not_configured";
  return (
    <div className="rounded-lg bg-surface-strong p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">{label}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{RULE_STATUS_LABELS[displayStatus] ?? displayStatus}</span>
      </div>
      {context ? <p className="mt-1 text-[11px] text-text-muted">{context}</p> : null}
    </div>
  );
}

/**
 * Renders one "How this was calculated" block (P0-E4-S3B). When
 * `calculated`, shows the explanatory `terms` (Tracked/Your assumption/
 * Calculated, each with its own sign) stacked vertically — never one
 * long line that could overflow on a narrow screen — followed by a
 * rule and the canonical `result` (copied verbatim from the evaluation,
 * never re-summed from the terms shown above it). Any `context` facts
 * render separately, without a "=" implying they combine into `result`.
 * When NOT calculated, shows the specific `reason` (never a generic
 * "insufficient information") and, only when the domain provides one, a
 * real navigable `actionLabel`/`actionHref`.
 */
function CalculationBlockView({ block, currencyCode, currencies }: { block: CalculationExplanationBlock; currencyCode: string; currencies: Map<string, Currency> }) {
  return (
    <div className="rounded-lg bg-surface p-2.5">
      <p className="text-xs font-semibold text-text-primary">{block.title}</p>
      {block.calculated ? (
        <div className="mt-1.5 flex flex-col gap-1">
          {block.terms.map((term) => (
            <TermRow key={term.label} term={term} currencyCode={currencyCode} currencies={currencies} />
          ))}
          {block.terms.length > 0 ? <div className="my-0.5 border-t border-border" aria-hidden="true" /> : null}
          {block.result ? (
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-secondary">Calculated · {block.result.label}</span>
              <span className="tabular-figures text-sm font-semibold text-text-primary">{fmt(block.result.amount, currencyCode, currencies)}</span>
            </div>
          ) : null}
          {block.context.length > 0 ? (
            <div className="mt-1.5 flex flex-col gap-0.5 border-t border-border pt-1.5">
              {block.context.map((c) => (
                <div key={c.label} className="flex items-center justify-between text-[11px] text-text-muted">
                  <span>{c.label}</span>
                  <span className="tabular-figures">{fmt(c.amount, currencyCode, currencies)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-1">
          <p className="text-xs text-text-muted">Not calculated</p>
          {block.reason ? <p className="mt-0.5 text-xs text-text-secondary">{block.reason}</p> : null}
          {block.actionLabel && block.actionHref ? (
            <Link href={block.actionHref} className="mt-1.5 inline-flex min-h-12 items-center gap-1 text-xs font-semibold text-accent-primary">
              {block.actionLabel}
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

const TERM_KIND_LABELS: Record<ExplanationTerm["kind"], string> = {
  tracked: "Tracked",
  assumption: "Your assumption",
  calculated: "Calculated",
};

function TermRow({ term, currencyCode, currencies }: { term: ExplanationTerm; currencyCode: string; currencies: Map<string, Currency> }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-text-muted">
        <span className="mr-1 rounded bg-surface-raised px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-muted">{TERM_KIND_LABELS[term.kind]}</span>
        {term.label}
      </span>
      <span className="tabular-figures text-xs text-text-secondary">
        {term.sign} {fmt(term.amount, currencyCode, currencies)}
      </span>
    </div>
  );
}
