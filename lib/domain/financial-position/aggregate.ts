import { Decimal } from "decimal.js";
import { convertToReportingCurrency } from "../currency/conversion.ts";
import type { NativeFinancialPosition } from "./types.ts";

export type ReportingFinancialPosition =
  | {
      status: "calculated";
      reportingCurrency: string;
      asOf: string;
      currenciesRequiringConversion: string[];
      ratesUsed: Record<string, string>;
      liquidCash: string;
      nonCashAssetValue: string;
      receivablesOutstanding: string;
      liabilitiesOutstanding: string;
      netWorth: string;
    }
  | {
      status: "not_calculated";
      reportingCurrency: string;
      asOf: string;
      currenciesRequiringConversion: string[];
      missingRates: string[];
    };

/**
 * Consolidates native-currency Financial Position into one reporting-
 * currency Net Worth — but ONLY when an explicit rate is supplied for
 * every currency present that isn't already the reporting currency.
 * Reuses convertToReportingCurrency() (lib/domain/currency) exactly once
 * per component — never a second FX implementation, never a live rate,
 * never a rate borrowed from an unrelated historical transaction.
 *
 * Each of the four Net Worth components (liquid cash, non-cash asset
 * value, receivables outstanding, liabilities outstanding) is converted
 * and summed ACROSS CURRENCIES independently — convertToReportingCurrency()
 * itself never sums unlike currencies before converting each one — and
 * only once every component has successfully converted are the four
 * reporting-currency totals combined into one reporting Net Worth, using
 * decimal.js (never binary float arithmetic). If any required rate is
 * missing for ANY component, the whole result is `not_calculated` — never
 * a partial Net Worth silently omitting a currency.
 */
export function convertFinancialPositionToReportingCurrency(
  nativePositions: NativeFinancialPosition[],
  reportingCurrency: string,
  rates: ReadonlyMap<string, string>,
): ReportingFinancialPosition {
  const asOf = new Date().toISOString();
  const currenciesRequiringConversion = nativePositions
    .map((p) => p.currencyCode)
    .filter((code) => code !== reportingCurrency)
    .sort();

  const liquidCashResult = convertToReportingCurrency(
    nativePositions.map((p) => ({ currencyCode: p.currencyCode, amount: p.liquidCash })),
    reportingCurrency,
    rates,
  );
  const nonCashAssetValueResult = convertToReportingCurrency(
    nativePositions.map((p) => ({ currencyCode: p.currencyCode, amount: p.nonCashAssetValue })),
    reportingCurrency,
    rates,
  );
  const receivablesOutstandingResult = convertToReportingCurrency(
    nativePositions.map((p) => ({ currencyCode: p.currencyCode, amount: p.receivablesOutstanding })),
    reportingCurrency,
    rates,
  );
  const liabilitiesOutstandingResult = convertToReportingCurrency(
    nativePositions.map((p) => ({ currencyCode: p.currencyCode, amount: p.liabilitiesOutstanding })),
    reportingCurrency,
    rates,
  );

  const results = [liquidCashResult, nonCashAssetValueResult, receivablesOutstandingResult, liabilitiesOutstandingResult];
  const missing = new Set<string>();
  for (const result of results) {
    if (result.status === "not_calculated") {
      for (const code of result.missingRates) missing.add(code);
    }
  }

  if (missing.size > 0) {
    return {
      status: "not_calculated",
      reportingCurrency,
      asOf,
      currenciesRequiringConversion,
      missingRates: Array.from(missing).sort(),
    };
  }

  // All four converted successfully — every result here is the
  // "converted" variant, safe to read .amount from.
  const liquidCash = (liquidCashResult as { amount: string }).amount;
  const nonCashAssetValue = (nonCashAssetValueResult as { amount: string }).amount;
  const receivablesOutstanding = (receivablesOutstandingResult as { amount: string }).amount;
  const liabilitiesOutstanding = (liabilitiesOutstandingResult as { amount: string }).amount;

  const netWorth = new Decimal(liquidCash)
    .plus(nonCashAssetValue)
    .plus(receivablesOutstanding)
    .minus(liabilitiesOutstanding)
    .toString();

  const ratesUsed: Record<string, string> = {};
  for (const code of currenciesRequiringConversion) {
    const rate = rates.get(code);
    if (rate !== undefined) ratesUsed[code] = rate;
  }

  return {
    status: "calculated",
    reportingCurrency,
    asOf,
    currenciesRequiringConversion,
    ratesUsed,
    liquidCash,
    nonCashAssetValue,
    receivablesOutstanding,
    liabilitiesOutstanding,
    netWorth,
  };
}
