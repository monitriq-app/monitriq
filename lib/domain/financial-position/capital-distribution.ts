import { Decimal } from "decimal.js";
import type { NativeFinancialPosition } from "./types.ts";
import type { AssetTypeCode, AssetValueByType } from "../assets/types.ts";

/** "cash" and "receivables" are synthetic keys; any other value is a raw AssetTypeCode — the UI resolves both to a human label (cash/receivables via a small local map, asset types via the already-canonical asset_types.display_name), matching how currency codes are resolved elsewhere. Liabilities are never a category — they are not a place capital lives. */
export type CapitalDistributionCategoryKey = "cash" | "receivables" | AssetTypeCode;

export interface CapitalDistributionCategory {
  key: CapitalDistributionCategoryKey;
  amount: string;
  /** Share of this group's total, as an exact decimal string (e.g. "58.8"). Always meaningful: either within one native currency (no conversion needed) or, in "reporting" mode, across the already-converted reporting-currency total. */
  percentage: string;
}

export interface NativeCapitalDistributionGroup {
  currencyCode: string;
  totalAmount: string;
  categories: CapitalDistributionCategory[];
}

export type CapitalDistributionResult =
  | { mode: "empty" }
  /** Exactly one native currency has any capital — percentages are exact with zero FX involved. */
  | { mode: "single_currency"; currencyCode: string; totalAmount: string; categories: CapitalDistributionCategory[] }
  /** Multiple currencies, all with a resolved reporting rate — blended into one reporting-currency distribution. */
  | { mode: "reporting"; reportingCurrency: string; totalAmount: string; categories: CapitalDistributionCategory[] }
  /** Multiple currencies, but reporting conversion is unavailable or incomplete — one distribution per native currency, never blended. */
  | { mode: "native_incomplete"; groups: NativeCapitalDistributionGroup[] };

type RawAmounts = Map<string, Map<CapitalDistributionCategoryKey, Decimal>>; // currencyCode -> key -> amount

function percentagesWithinCurrency(amounts: Map<CapitalDistributionCategoryKey, Decimal>, total: Decimal): CapitalDistributionCategory[] {
  return Array.from(amounts.entries())
    .filter(([, amount]) => amount.greaterThan(0))
    .map(([key, amount]) => ({
      key,
      amount: amount.toString(),
      percentage: total.isZero() ? "0.0" : amount.dividedBy(total).times(100).toFixed(1),
    }))
    .sort((a, b) => new Decimal(b.amount).comparedTo(a.amount));
}

/**
 * Composes Cash (liquidCash), Assets by type (assetValueByType), and
 * Receivables (receivablesOutstanding) — the exact figures Financial
 * Position and Assets already compute, never re-derived here — into one
 * "Where Your Capital Lives" distribution. Liabilities are deliberately
 * never included (they are not a place owned capital lives). A category
 * only appears for a currency where its amount is greater than zero.
 *
 * Cross-currency blending happens ONLY when every currency present has a
 * resolved rate into `reportingCurrency` (using `reportingRates`, exactly
 * as already resolved for Financial Position's own reporting Net Worth —
 * no second FX resolution). Otherwise this returns "native_incomplete":
 * one honest distribution per native currency, never a silently-wrong
 * blended percentage.
 */
export function buildCapitalDistribution(
  nativePositions: NativeFinancialPosition[],
  assetValueByType: AssetValueByType[],
  reportingCurrency: string | null,
  reportingRates: ReadonlyMap<string, string>,
): CapitalDistributionResult {
  const raw: RawAmounts = new Map();

  function add(currencyCode: string, key: CapitalDistributionCategoryKey, amount: string) {
    const value = new Decimal(amount);
    if (value.lessThanOrEqualTo(0)) return;
    if (!raw.has(currencyCode)) raw.set(currencyCode, new Map());
    const byKey = raw.get(currencyCode)!;
    byKey.set(key, (byKey.get(key) ?? new Decimal(0)).plus(value));
  }

  for (const position of nativePositions) {
    add(position.currencyCode, "cash", position.liquidCash);
    add(position.currencyCode, "receivables", position.receivablesOutstanding);
  }
  for (const row of assetValueByType) {
    add(row.currencyCode, row.assetType, row.totalEstimatedValue);
  }

  const currencies = Array.from(raw.keys());

  if (currencies.length === 0) {
    return { mode: "empty" };
  }

  if (currencies.length === 1) {
    const currencyCode = currencies[0];
    const amounts = raw.get(currencyCode)!;
    const total = Array.from(amounts.values()).reduce((sum, v) => sum.plus(v), new Decimal(0));
    return {
      mode: "single_currency",
      currencyCode,
      totalAmount: total.toString(),
      categories: percentagesWithinCurrency(amounts, total),
    };
  }

  const canBlend =
    reportingCurrency !== null && currencies.every((code) => code === reportingCurrency || reportingRates.has(code));

  if (canBlend && reportingCurrency !== null) {
    const blended = new Map<CapitalDistributionCategoryKey, Decimal>();
    for (const [currencyCode, amounts] of raw) {
      const rate = currencyCode === reportingCurrency ? new Decimal(1) : new Decimal(reportingRates.get(currencyCode)!);
      for (const [key, amount] of amounts) {
        blended.set(key, (blended.get(key) ?? new Decimal(0)).plus(amount.times(rate)));
      }
    }
    const total = Array.from(blended.values()).reduce((sum, v) => sum.plus(v), new Decimal(0));
    return {
      mode: "reporting",
      reportingCurrency,
      totalAmount: total.toString(),
      categories: percentagesWithinCurrency(blended, total),
    };
  }

  const groups: NativeCapitalDistributionGroup[] = currencies.map((currencyCode) => {
    const amounts = raw.get(currencyCode)!;
    const total = Array.from(amounts.values()).reduce((sum, v) => sum.plus(v), new Decimal(0));
    return { currencyCode, totalAmount: total.toString(), categories: percentagesWithinCurrency(amounts, total) };
  });
  return { mode: "native_incomplete", groups };
}
