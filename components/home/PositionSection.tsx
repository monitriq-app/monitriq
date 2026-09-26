import Link from "next/link";
import { Wallet, Plus } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { NativeFinancialPosition } from "@/lib/domain/financial-position/types";
import type { ReportingFinancialPosition } from "@/lib/domain/financial-position/aggregate";
import { TONE_TEXT_CLASS, type StatusTone } from "@/lib/domain/rules/labels";
import type { Terminology } from "@/lib/domain/language/terms";
import { cashStatus, cashStatusSentence, type CashStatusResult } from "@/lib/domain/rules/cash-status";
import { CashStatusBadge } from "@/components/rules/CashStatusBadge";
import { AvailableExplanation } from "@/components/rules/AvailableExplanation";

interface PositionSectionProps {
  nativePositions: NativeFinancialPosition[];
  reportingCurrency: string | null;
  reportingPosition: ReportingFinancialPosition | null;
  currencies: Map<string, Currency>;
  /** Count of the user's own buckets currently holding a positive balance, per currency — real domain state, from Money's own canonical money_bucket_balances(). */
  activeReserveCountByCurrency: Map<string, number>;
  /** The user's explanation vocabulary (wording only; every figure is identical in every mode). */
  terms: Terminology;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * "CURRENT POSITION" eyebrow groups the three metrics below it — matches
 * the reference's section-label row. The reference's right-side element
 * there is an editable link ("Tracked Cash"); the reserve-count fact
 * that previously sat here is not a real action, and it's already shown
 * again inside the Cash Position card's own bottom row (see
 * ReserveContext below) — so this slot now carries a genuinely
 * clickable "Add cash" link into Money's real canonical entry point
 * instead, per the gap audit's "Current Position action" item. Nothing
 * here is styled as clickable unless it actually is.
 */
function CurrentPositionHeader() {
  return (
    <div className="mb-2 flex items-center justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Current Position</p>
      <Link href="/money#record-money" className="flex items-center gap-1 text-[11px] font-semibold text-accent-primary">
        <Plus size={12} aria-hidden="true" />
        Add cash
      </Link>
    </div>
  );
}

/**
 * "Cash Position" (renamed from "Liquid Position", P0-E4-S2 — plain
 * language for the same figure) is the dominant primary card
 * (reference's "Dominant Focus Card"): large headline figure, short
 * explanation, and a real reserve-count pill — matching the reference's
 * composition closely. Deliberately NOT renamed to "Available Cash":
 * this figure is `liquidCash`, the RAW total across every cash bucket,
 * including any amount already allocated/protected for a goal — calling
 * it "available" would misrepresent money the user has already earmarked
 * as freely spendable, which is exactly the kind of financial falsehood
 * simplification must not introduce (see PRODUCT_DEFINITION.md's "UX
 * Language Principle"). "Safe to Deploy," the OTHER card on this
 * screen, is the one that actually subtracts protected/committed
 * amounts — "Cash Position" stays a neutral, accurate label for the
 * unadjusted total. The reference's top-right status chip ("Immediate
 * Cash Available") has no real Monitriq domain state behind it (liquid
 * cash overall doesn't carry an "immediate availability" flag), so it is
 * OMITTED rather than copied verbatim — the row is kept, just without a
 * fabricated badge. Net Worth and Safe to Deploy are two distinct
 * compact secondary cards,
 * side-by-side on ordinary mobile widths (`grid-cols-2` from the base
 * breakpoint, not gated behind `sm:`) — the reference's specific visual
 * signature. Safe to Deploy's figure uses the existing amber `attention`
 * token (not a new color) to match the reference's tactical-amber
 * treatment for that specific card. Every amount is rendered through
 * `formatCurrencyAmount`, which renders "{CODE} {amount}" (e.g. an NGN
 * figure as "NGN 12,000") rather than a currency symbol — the trusted
 * multi-currency formatting layer, unchanged by this visual pass.
 */
export function PositionSection({ nativePositions, reportingCurrency, reportingPosition, currencies, activeReserveCountByCurrency, terms }: PositionSectionProps) {
  const calculated = reportingPosition?.status === "calculated" ? reportingPosition : null;

  return (
    <div>
      <CurrentPositionHeader />

      <div className="flex flex-col gap-2">
        <div className="relative overflow-hidden rounded-xl bg-surface-raised px-4 py-3.5">
          <div
            className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-accent-primary/5 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{terms.t("cash")}</p>
            {calculated ? (
              <p className="tabular-figures mt-0.5 text-[32px] font-bold leading-tight tracking-tight text-text-primary">
                {fmt(calculated.liquidCash, calculated.reportingCurrency, currencies)}
              </p>
            ) : (
              <NativeAmountList positions={nativePositions} field="liquidCash" currencies={currencies} />
            )}
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="flex min-w-0 flex-[1_1_12rem] items-start gap-1.5 text-xs leading-snug text-text-secondary">
                <Wallet size={14} className="mt-0.5 shrink-0 text-accent-primary" aria-hidden="true" />
                <span>Actual cash across your reserves — not receivables, not estimates.</span>
              </span>
              <ReserveContext positions={nativePositions} activeReserveCountByCurrency={activeReserveCountByCurrency} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-2">
          <div className="rounded-xl bg-surface-raised p-3">
            <div className="mb-0.5 flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Net Worth</span>
              <Wallet size={14} className="text-text-muted" aria-hidden="true" />
            </div>
            {calculated ? (
              <p className="tabular-figures break-words text-[15px] font-semibold leading-snug text-text-primary">
                {fmt(calculated.netWorth, calculated.reportingCurrency, currencies)}
              </p>
            ) : (
              <NativeAmountList positions={nativePositions} field="netWorth" currencies={currencies} compact />
            )}
            {reportingCurrency === null ? (
              <p className="mt-0.5 text-xs text-text-muted">Not set.</p>
            ) : reportingPosition?.status === "not_calculated" ? (
              <p className="mt-0.5 text-xs text-text-muted">Missing rate.</p>
            ) : (
              <p className="mt-0.5 text-xs leading-snug text-text-muted">Tracked assets minus debt</p>
            )}
          </div>

          <div className="rounded-xl bg-surface-raised p-3">
            <div className="mb-1 flex items-start justify-between gap-1.5">
              <span className="min-w-0 text-[11px] font-semibold uppercase leading-tight tracking-wide text-text-muted">{terms.t("available_above_alone")}</span>
              <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[worstTone(nativePositions)]}`} aria-hidden="true" />
            </div>
            <AvailableAboveList positions={nativePositions} currencies={currencies} terms={terms} />
                      </div>
        </div>

        <AllocationShortfallNote positions={nativePositions} currencies={currencies} />
      </div>
    </div>
  );
}

/**
 * Real reserve count per currency (buckets currently holding a positive
 * balance) — omitted entirely when there's nothing to count, never a
 * fabricated "N reserves." Rendered as a pill on its own row beneath the
 * explanatory sentence (never sharing a line with it — see the P0-E3-S2
 * report's mobile text-wrap fix), right-aligned by its `justify-end`
 * wrapper. `max-w-full` (no `whitespace-nowrap`) lets its own text wrap
 * internally rather than ever forcing horizontal overflow, in the
 * unlikely case of a user with several currencies producing a long pill.
 */
function ReserveContext({
  positions,
  activeReserveCountByCurrency,
}: {
  positions: NativeFinancialPosition[];
  activeReserveCountByCurrency: Map<string, number>;
}) {
  const rows = positions
    .map((p) => ({ currencyCode: p.currencyCode, count: activeReserveCountByCurrency.get(p.currencyCode) ?? 0 }))
    .filter((r) => r.count > 0);
  if (rows.length === 0) return null;

  return (
    <span className="max-w-full shrink-0 rounded bg-surface-strong px-2 py-1 text-[11px] font-semibold text-text-secondary">
      {rows.map((r, i) => (
        <span key={r.currencyCode}>
          {i > 0 ? " · " : ""}
          {r.count} {r.count === 1 ? "reserve" : "reserves"} ({r.currencyCode})
        </span>
      ))}
    </span>
  );
}

/** Actual backed protected cash may fall short of nominal goal allocation — see FINANCIAL_DOMAIN_MODEL.md's allocation-shortfall model. Shown only when a real shortfall exists, never fabricated. */
function AllocationShortfallNote({ positions, currencies }: { positions: NativeFinancialPosition[]; currencies: Map<string, Currency> }) {
  const withShortfall = positions.filter((p) => Number(p.allocationShortfall) > 0);
  if (withShortfall.length === 0) return null;

  return (
    <div className="rounded-xl border border-attention/30 bg-attention/10 p-3 text-sm text-text-primary">
      <p className="font-medium">Some protected cash isn&apos;t fully backed</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-text-secondary">
        {withShortfall.map((p) => (
          <li key={p.currencyCode}>
            {p.currencyCode}: {fmt(p.allocationShortfall, p.currencyCode, currencies)} short of what&apos;s allocated to goals.
          </li>
        ))}
      </ul>
    </div>
  );
}

function NativeAmountList({
  positions,
  field,
  currencies,
  compact,
}: {
  positions: NativeFinancialPosition[];
  field: "liquidCash" | "netWorth";
  currencies: Map<string, Currency>;
  compact?: boolean;
}) {
  if (positions.length === 0) {
    return <p className={compact ? "text-lg font-semibold text-text-muted" : "text-[32px] font-bold leading-tight text-text-muted"}>No activity yet</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {positions.map((p, index) => {
        // First currency keeps the headline size; further currencies are secondary (same exact values, smaller type).
        const size = compact ? (index === 0 ? "text-[15px] leading-snug" : "text-sm") : index === 0 ? "text-[32px] font-bold leading-tight tracking-tight" : "text-xl font-semibold leading-snug";
        return (
          <li key={p.currencyCode} className={`tabular-figures break-words font-semibold text-text-primary ${size}`}>
            {fmt(p[field], p.currencyCode, currencies)}
          </li>
        );
      })}
    </ul>
  );
}

const DOT_CLASS: Record<StatusTone, string> = { positive: "bg-accent-primary", neutral: "bg-text-muted", attention: "bg-attention", danger: "bg-danger" };
const TONE_RANK: StatusTone[] = ["positive", "neutral", "attention", "danger"];

function statusOf(p: NativeFinancialPosition): CashStatusResult {
  return cashStatus({ status: p.safeToDeployStatus, liquidCash: p.liquidCash, requiredRetainedCash: p.requiredRetainedCash, safeToDeploy: p.safeToDeploy, retainedDeficit: p.retainedDeficit });
}

/** The tile's dot follows the most serious status across currencies (a status signal, never wealth). */
function worstTone(positions: NativeFinancialPosition[]): StatusTone {
  const relevant = positions.filter((p) => p.safeToDeployStatus === "calculated" || p.safeToDeployStatus === "not_configured");
  if (relevant.length === 0) return "attention";
  return relevant.map((p) => statusOf(p).tone).sort((x, y) => TONE_RANK.indexOf(y) - TONE_RANK.indexOf(x))[0];
}

function AvailableAboveList({ positions, currencies, terms }: { positions: NativeFinancialPosition[]; currencies: Map<string, Currency>; terms: Terminology }) {
  const withRules = positions.filter((p) => p.safeToDeployStatus === "calculated" || p.safeToDeployStatus === "not_configured");
  const fallback = cashStatus({ status: "not_configured", liquidCash: "0", requiredRetainedCash: null, safeToDeploy: null, retainedDeficit: null });
  if (withRules.length === 0) {
    return (
      <div>
        <CashStatusBadge result={fallback} />
        <p className="mt-1 text-xs text-text-muted">{cashStatusSentence(fallback, () => "", "default", terms.mode)}</p>
        <Link href="/rules" className="relative inline-flex h-7 w-fit items-center text-xs font-semibold text-accent-primary before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-['']">
          {terms.t("set_amount_action")}
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {withRules.map((p, index) => {
        const st = statusOf(p);
        const fmtHere = (v: string) => fmt(v, p.currencyCode, currencies);
        return (
          <li key={p.currencyCode} className={`flex flex-col gap-1 ${index > 0 ? "mt-2 border-t border-border pt-2" : ""}`}>
            {st.headroom !== null ? <p className={`tabular-figures break-words text-base font-semibold leading-tight ${TONE_TEXT_CLASS[st.tone]}`}>{fmtHere(st.headroom)}</p> : null}
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {st.headroom === null ? <span className="text-[11px] font-semibold text-text-muted">{p.currencyCode}</span> : null}
              <CashStatusBadge result={st} />
            </span>
            <p className="text-xs leading-snug text-text-muted">{cashStatusSentence(st, fmtHere, "home", terms.mode)}</p>
            {st.state === "needs_setup" ? (
              <Link href="/rules" className="relative inline-flex h-7 w-fit items-center text-xs font-semibold text-accent-primary before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-['']">
                {terms.t("set_amount_action")}
              </Link>
            ) : p.requiredRetainedCash !== null && p.protectedCommitments !== null ? (
              <AvailableExplanation
                short
                cash={fmtHere(p.liquidCash)}
                moneyYouWantToKeep={p.minimumCashFloor !== null ? fmtHere(p.minimumCashFloor) : null}
                setAside={fmtHere(p.protectedCommitments)}
                protecting={fmtHere(p.requiredRetainedCash)}
                available={fmtHere(p.safeToDeploy!)}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
