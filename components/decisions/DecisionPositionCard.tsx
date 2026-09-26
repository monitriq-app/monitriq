import Link from "next/link";
import type { ReactNode } from "react";
import { Shield, Info, ArrowRight } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { NativeFinancialPosition } from "@/lib/domain/financial-position/types";
import type { UpcomingObligation } from "@/lib/domain/obligations/types";
import { TONE_TEXT_CLASS } from "@/lib/domain/rules/labels";
import type { Terminology } from "@/lib/domain/language/terms";
import { cashStatus, cashStatusSentence, type CashStatusResult } from "@/lib/domain/rules/cash-status";
import { CashStatusBadge } from "@/components/rules/CashStatusBadge";
import { AvailableExplanation } from "@/components/rules/AvailableExplanation";

interface DecisionPositionCardProps {
  nativePositions: NativeFinancialPosition[];
  upcomingObligations: UpcomingObligation[];
  currencies: Map<string, Currency>;
  terms: Terminology;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * Renders one metric across every native currency the user actually has
 * — never blended into one number (Decisions is multi-currency-first,
 * same discipline as Home's PositionSection). A single-currency user
 * simply sees one line per cell, matching the reference's plain
 * single-value composition exactly; a multi-currency user sees a short
 * stacked list instead of a silently-summed total.
 */
function MetricLines({ rows }: { rows: { key: string; node: ReactNode }[] }) {
  if (rows.length === 0) return <span className="font-semibold text-text-primary">Not set</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((r) => (
        <div key={r.key}>{r.node}</div>
      ))}
    </div>
  );
}

/**
 * "DECISION POSITION" — reads Home's exact same canonical figures
 * (financial_position_by_currency() via getFinancialPositionSummary(),
 * the SAME function Home's PositionSection uses — no second
 * calculation). Cash Position (not "Liquid Cash" — see P0-E4-S2's
 * PositionSection rationale, reused verbatim here for terminology
 * consistency), Protected Cash, Safe to Deploy, and Upcoming Obligations
 * match the approved reference's 4-card grid composition. Every cell
 * shows "Not configured"/"Not set"/"Not calculated" rather than a
 * fabricated figure when the underlying fact doesn't exist yet — the
 * reference's own hardcoded "Not configured" cells are reproduced
 * exactly as REAL empty states here, not literal copy.
 */
export function DecisionPositionCard({ nativePositions, upcomingObligations, currencies, terms }: DecisionPositionCardProps) {
  const cashRows = nativePositions.map((p) => ({
    key: p.currencyCode,
    node: (
      <span className="tabular-figures text-[22px] font-bold leading-tight text-text-primary">{fmt(p.liquidCash, p.currencyCode, currencies)}</span>
    ),
  }));

  const protectedRows = nativePositions
    .filter((p) => p.protectedCommitments !== null)
    .map((p) => ({
      key: p.currencyCode,
      node: <span className="text-sm font-semibold text-text-primary">{fmt(p.protectedCommitments!, p.currencyCode, currencies)}</span>,
    }));

  const statusFor = (p: NativeFinancialPosition): CashStatusResult =>
    cashStatus({ status: p.safeToDeployStatus, liquidCash: p.liquidCash, requiredRetainedCash: p.requiredRetainedCash, safeToDeploy: p.safeToDeploy, retainedDeficit: p.retainedDeficit });

  const safeRows = nativePositions
    .filter((p) => p.safeToDeployStatus === "calculated" && p.safeToDeploy !== null)
    .map((p) => {
      const st = statusFor(p);
      const f = (v: string) => fmt(v, p.currencyCode, currencies);
      return {
        key: p.currencyCode,
        node: (
          <span className="flex flex-col gap-0.5">
            <span className={`tabular-figures break-words text-sm font-semibold ${TONE_TEXT_CLASS[st.tone]}`}>{f(p.safeToDeploy!)}</span>
            <span>
              <CashStatusBadge result={st} />
            </span>
            <span className="text-[11px] leading-snug text-text-muted">{cashStatusSentence(st, f, "home", terms.mode)}</span>
          </span>
        ),
      };
    });
  const notConfigured = nativePositions.some((p) => p.safeToDeployStatus === "not_configured");

  const nearestObligation = upcomingObligations.length > 0
    ? [...upcomingObligations].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    : null;

  return (
    <section className="rounded-xl bg-surface-raised p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-text-primary">Decision Position</h2>
          <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold text-focus">Based on Tracked Data</span>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="flex flex-col justify-between rounded-lg bg-surface-strong p-2.5">
          <span className="text-[11px] text-text-muted">{terms.t("cash")}</span>
          <div className="mt-1">
            <MetricLines rows={cashRows} />
            <p className="mt-0.5 truncate text-[11px] text-text-muted">Across your cash accounts</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-lg bg-surface-strong p-2.5">
          <span className="text-[11px] text-text-muted">{terms.t("set_aside_goals_payments")}</span>
          <div className="mt-1">
            {protectedRows.length > 0 ? (
              <MetricLines rows={protectedRows} />
            ) : (
              <span className="text-sm font-semibold text-text-secondary">Not configured</span>
            )}
            <p className="mt-0.5 text-[11px] leading-snug text-text-muted">Set the amount you want to keep</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-lg bg-surface-strong p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">{terms.t("available_above")}</span>
            <Shield size={13} className="text-text-muted" aria-hidden="true" />
          </div>
          <div className="mt-1">
            {safeRows.length > 0 ? (
              <MetricLines rows={safeRows} />
            ) : (
              <span className={`text-sm font-semibold ${notConfigured ? "text-attention" : "text-text-secondary"}`}>{notConfigured ? "Needs setup" : "Not calculated"}</span>
            )}
            <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{terms.t("available_help")}</p>
            {nativePositions
              .filter((p) => p.safeToDeployStatus === "calculated" && p.safeToDeploy !== null && p.requiredRetainedCash !== null && p.protectedCommitments !== null)
              .map((p) => (
                <AvailableExplanation
                  short
                  key={p.currencyCode}
                  currencyCode={safeRows.length > 1 ? p.currencyCode : undefined}
                  cash={fmt(p.liquidCash, p.currencyCode, currencies)}
                  available={fmt(p.safeToDeploy!, p.currencyCode, currencies)}
                  moneyYouWantToKeep={p.minimumCashFloor !== null ? fmt(p.minimumCashFloor, p.currencyCode, currencies) : null}
                  setAside={fmt(p.protectedCommitments!, p.currencyCode, currencies)}
                  protecting={fmt(p.requiredRetainedCash!, p.currencyCode, currencies)}
                />
              ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-lg bg-surface-strong p-2.5">
          <span className="text-[11px] text-text-muted">Upcoming Obligations</span>
          <div className="mt-1">
            {upcomingObligations.length > 0 ? (
              <span className="text-sm font-semibold text-text-primary">
                {upcomingObligations.length} upcoming
              </span>
            ) : (
              <span className="text-sm font-semibold text-text-secondary">Not set</span>
            )}
            <p className="mt-0.5 truncate text-[11px] text-text-muted">
              {nearestObligation ? `Next: ${nearestObligation.name}` : "No upcoming obligations recorded"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 pt-1">
        <span className="flex items-start gap-1.5 text-xs text-text-muted">
          <Info size={14} className="mt-0.5 shrink-0 text-accent-primary" aria-hidden="true" />
          Set the cash you want to keep protected and your upcoming commitments so Monitriq can warn you before you reach it.
        </span>
        <Link href="/rules" className="relative flex shrink-0 items-center gap-1 text-[11px] font-semibold text-accent-primary before:absolute before:-inset-2.5 before:content-[''] hover:underline">
          {terms.t("set_amount_action")}
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
