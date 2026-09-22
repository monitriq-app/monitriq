import { Decimal } from "decimal.js";
import type { CurrencyAmount } from "./types.ts";

export type ReportingConversionResult =
  | { status: "converted"; reportingCurrency: string; amount: string }
  | { status: "not_calculated"; missingRates: string[] };

/**
 * Converts a set of per-currency balances into one reporting-currency
 * total — ONLY when every non-reporting currency present has an explicit
 * rate supplied by the caller. Never calls an external FX API, never
 * assumes or fabricates a rate. See docs/architecture/
 * MULTI_CURRENCY_MODEL.md, "reporting across multiple currencies": unlike
 * currencies are never directly summed, and a missing rate returns an
 * explicit incomplete state rather than a guess.
 *
 * `rates` maps a currency code to "units of reportingCurrency received for
 * 1 unit of that currency" — the same base/quote direction convention as
 * the fx_rates table (that currency is the base, reportingCurrency is the
 * quote).
 *
 * Shared by Money and Assets (and anything else that reports per-currency
 * totals) — one reporting-conversion contract, per
 * docs/architecture/MULTI_CURRENCY_MODEL.md's "one shared currency
 * domain" rule, not a second copy living under either domain. Not wired
 * into any UI this phase — no rate source (manual entry or otherwise) is
 * presented to the user yet, so both Money and Assets only ever show
 * per-currency totals (money_currency_totals / asset_native_currency_
 * totals). This function exists so that boundary is real and tested, not
 * just documented as a future TODO.
 */
export function convertToReportingCurrency(
  balances: CurrencyAmount[],
  reportingCurrency: string,
  rates: ReadonlyMap<string, string>,
): ReportingConversionResult {
  const missing = new Set<string>();
  let total = new Decimal(0);

  for (const balance of balances) {
    if (balance.currencyCode === reportingCurrency) {
      total = total.plus(balance.amount);
      continue;
    }

    const rate = rates.get(balance.currencyCode);
    if (rate === undefined) {
      missing.add(balance.currencyCode);
      continue;
    }

    total = total.plus(new Decimal(balance.amount).times(rate));
  }

  if (missing.size > 0) {
    return { status: "not_calculated", missingRates: Array.from(missing).sort() };
  }

  return { status: "converted", reportingCurrency, amount: total.toString() };
}
