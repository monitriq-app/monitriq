import { Wallet, Receipt, Car, Building2, Briefcase, TrendingUp, Wrench, Package, Gem, CircleDollarSign } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { AssetType } from "@/lib/domain/assets/types";
import type { Terminology } from "@/lib/domain/language/terms";
import type { CapitalDistributionCategory, CapitalDistributionResult } from "@/lib/domain/financial-position/capital-distribution";

interface CapitalDistributionSectionProps {
  terms: Terminology;
  distribution: CapitalDistributionResult;
  currencies: Map<string, Currency>;
  assetTypes: Map<string, AssetType>;
}

const CATEGORY_LABELS: Record<string, string> = {
  cash: "Cash on Hand",
  receivables: "Receivables",
};

function labelFor(key: string, assetTypes: Map<string, AssetType>): string {
  return CATEGORY_LABELS[key] ?? assetTypes.get(key)?.display_name ?? key;
}

/** Returns a fully-formed icon element (never a stored component reference) so the icon-per-category lookup stays a plain render-time switch, not a dynamic JSX tag. */
function CategoryIcon({ categoryKey }: { categoryKey: string }) {
  switch (categoryKey) {
    case "cash":
      return <Wallet size={16} aria-hidden="true" />;
    case "receivables":
      return <Receipt size={16} aria-hidden="true" />;
    case "vehicle":
      return <Car size={16} aria-hidden="true" />;
    case "property":
      return <Building2 size={16} aria-hidden="true" />;
    case "business_interest":
      return <Briefcase size={16} aria-hidden="true" />;
    case "financial_investment":
      return <TrendingUp size={16} aria-hidden="true" />;
    case "equipment":
      return <Wrench size={16} aria-hidden="true" />;
    case "inventory":
      return <Package size={16} aria-hidden="true" />;
    case "collectible":
      return <Gem size={16} aria-hidden="true" />;
    default:
      return <CircleDollarSign size={16} aria-hidden="true" />;
  }
}

/** Deterministic (never random) fallback palette for asset-type categories — stable per category key via a simple string hash, so a given category always renders the same color across renders/users, never shifting with sort order. */
const FALLBACK_BAR_COLORS = ["bg-focus", "bg-text-muted", "bg-surface-strong"];

function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Bar-segment color assigned by CATEGORY IDENTITY, not array/sort
 * position — matching the reference's guarantee that "Cash on Hand" is
 * always the accent-colored segment regardless of its relative size.
 * Receivables get the same amber `attention` token already used
 * elsewhere for tactical/liquidity-adjacent state. Every other
 * (asset-type) category gets a stable, deterministically-hashed color
 * from a small neutral palette — never `Math.random()`, never the
 * accent/attention tokens reserved for cash/receivables, and never a
 * color chosen to imply financial quality or a recommendation.
 */
function barColorFor(key: string): string {
  if (key === "cash") return "bg-accent-primary";
  if (key === "receivables") return "bg-attention";
  return FALLBACK_BAR_COLORS[hashKey(key) % FALLBACK_BAR_COLORS.length];
}

/**
 * Icon + label form the left column (label truncates); amount + percentage
 * form a right-aligned stacked column. This two-column structure is
 * inherently collision-safe (the earlier per-row collision bug came from
 * label/amount/percentage sharing one line) while matching the
 * reference's own row composition exactly — amount above percentage,
 * both right-aligned. The reference's per-row descriptive subline (e.g.
 * "3 registered motor units") has no real Monitriq equivalent —
 * CapitalDistributionCategory carries no per-category count or
 * description — so it is omitted rather than fabricated. Cash on Hand
 * gets the reference's accent treatment (icon + label + amount in the
 * accent color) since it's the one category the reference visually
 * distinguishes as "already liquid." Rows are separated by spacing only
 * (`py-2` on each row, no divider line) — matching the reference's own
 * un-divided treatment for this specific list (its Recent Activity list
 * does use dividers; this one deliberately doesn't).
 */
function CategoryRow({
  category,
  currencyCode,
  currencies,
  assetTypes,
}: {
  category: CapitalDistributionCategory;
  currencyCode: string;
  currencies: Map<string, Currency>;
  assetTypes: Map<string, AssetType>;
}) {
  const currency = currencies.get(currencyCode);
  const formatted = currency ? formatCurrencyAmount(category.amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${category.amount}`;
  const isCash = category.key === "cash";
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isCash ? "bg-accent-primary/10 text-accent-primary" : "bg-surface-strong text-text-secondary"}`}
        >
          <CategoryIcon categoryKey={category.key} />
        </span>
        <span className={`truncate text-base ${isCash ? "font-semibold text-accent-primary" : "font-semibold text-text-primary"}`}>
          {labelFor(category.key, assetTypes)}
        </span>
      </div>
      <div className="shrink-0 text-right">
        <p className={`tabular-figures text-base font-semibold ${isCash ? "text-accent-primary" : "text-text-primary"}`}>{formatted}</p>
        <p className={`text-[11px] font-semibold ${isCash ? "text-accent-primary" : "text-text-muted"}`}>{category.percentage}%</p>
      </div>
    </li>
  );
}

function DistributionBar({ categories }: { categories: CapitalDistributionCategory[] }) {
  return (
    <div className="flex h-3 w-full gap-0.5 rounded-full bg-surface-strong p-0.5">
      {categories.map((c, i) => (
        <div
          key={c.key}
          className={`h-full transition-all ${barColorFor(c.key)} ${i === 0 ? "rounded-l-full" : ""} ${i === categories.length - 1 ? "rounded-r-full" : ""}`}
          style={{ width: `${c.percentage}%` }}
        />
      ))}
    </div>
  );
}

/** Sum of already-computed category amounts/percentages for every category except "cash" — a presentational aggregation over values the domain layer already derived, not a new financial formula on raw ledger data (same pattern as Home's already-permitted reserve-count sum). */
function summarizeLiquidity(categories: CapitalDistributionCategory[]) {
  let cashAmount = new Decimal(0);
  let cashPct = new Decimal(0);
  let lockedAmount = new Decimal(0);
  let lockedPct = new Decimal(0);
  for (const c of categories) {
    if (c.key === "cash") {
      cashAmount = cashAmount.plus(c.amount);
      cashPct = cashPct.plus(c.percentage);
    } else {
      lockedAmount = lockedAmount.plus(c.amount);
      lockedPct = lockedPct.plus(c.percentage);
    }
  }
  return { cashAmount, cashPct, lockedAmount, lockedPct };
}

function LiquiditySummaryLine({
  categories,
  currencyCode,
  currencies,
  terms,
}: {
  categories: CapitalDistributionCategory[];
  currencyCode: string;
  currencies: Map<string, Currency>;
  terms: Terminology;
}) {
  const { cashAmount, cashPct, lockedAmount, lockedPct } = summarizeLiquidity(categories);
  const currency = currencies.get(currencyCode);
  const fmt = (v: Decimal) => (currency ? formatCurrencyAmount(v.toString(), currency, { trimTrailingZeros: true }) : `${currencyCode} ${v.toString()}`);

  return (
    <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
      {lockedAmount.greaterThan(0) ? <span className="text-text-muted">{terms.t("tied_up_summary")}: {fmt(lockedAmount)} ({lockedPct.toFixed(1)}%)</span> : <span />}
      {cashAmount.greaterThan(0) ? <span className="text-text-secondary">{terms.t("cash_available")}: {fmt(cashAmount)} ({cashPct.toFixed(1)}%)</span> : null}
    </div>
  );
}

/** The "N% of your net worth is tied up in assets" header badge (an attention/concentration signal, so amber) — the sum of every already-computed non-cash category percentage, not a new percentage formula. Omitted when there's no non-cash capital (nothing tied up to report). */
function IlliquidBadge({ categories, terms }: { categories: CapitalDistributionCategory[]; terms: Terminology }) {
  const { lockedPct } = summarizeLiquidity(categories);
  if (lockedPct.lessThanOrEqualTo(0)) return null;
  return (
    <span className="min-w-0 rounded-full bg-attention/15 px-2.5 py-1 text-[11px] font-semibold text-attention">
      {terms.t("tied_up_badge").replace("{pct}", lockedPct.toFixed(1))}
    </span>
  );
}

/**
 * "Where Your Capital Lives" — built entirely from
 * getFinancialPositionSummary()'s capitalDistribution field (Cash + Assets
 * by type + Receivables; liabilities are never a category). The
 * reference's editorial subtitle ("High Net Worth, Low Liquidity") is a
 * value judgment with no domain state behind it and is deliberately
 * dropped — see the P0-E3-S2 report's governing rule on invented
 * badges/subtitles. Percentages only ever appear within a currency that's
 * actually been converted (or that stands alone) — a mixed-currency user
 * without complete reporting FX sees one honest grouping per native
 * currency instead of an invalid blended chart.
 */
export function CapitalDistributionSection({ distribution, currencies, assetTypes, terms }: CapitalDistributionSectionProps) {
  if (distribution.mode === "empty") {
    return <p className="text-text-muted">No assets, cash, or receivables recorded yet.</p>;
  }

  if (distribution.mode === "native_incomplete") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          Multiple currencies without a complete reporting conversion — shown separately, never blended.
        </p>
        {distribution.groups.map((group) => (
          <div key={group.currencyCode} className="rounded-xl bg-surface-raised p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-primary">{group.currencyCode}</p>
              <IlliquidBadge categories={group.categories} terms={terms} />
            </div>
            <DistributionBar categories={group.categories} />
            <div className="mt-1.5">
              <LiquiditySummaryLine categories={group.categories} currencyCode={group.currencyCode} currencies={currencies} terms={terms} />
            </div>
            <ul className="mt-1 flex flex-col">
              {group.categories.map((c) => (
                <CategoryRow key={c.key} category={c} currencyCode={group.currencyCode} currencies={currencies} assetTypes={assetTypes} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const currencyCode = distribution.mode === "single_currency" ? distribution.currencyCode : distribution.reportingCurrency;

  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-semibold text-text-primary">Where Your Capital Lives</h3>
        <IlliquidBadge categories={distribution.categories} terms={terms} />
      </div>
      <DistributionBar categories={distribution.categories} />
      <div className="mt-1.5">
        <LiquiditySummaryLine categories={distribution.categories} currencyCode={currencyCode} currencies={currencies} terms={terms} />
      </div>
      <ul className="mt-2 flex flex-col">
        {distribution.categories.map((c) => (
          <CategoryRow key={c.key} category={c} currencyCode={currencyCode} currencies={currencies} assetTypes={assetTypes} />
        ))}
      </ul>
    </div>
  );
}
