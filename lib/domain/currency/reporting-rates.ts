import { Decimal } from "decimal.js";
import type { RawReportingFxRateRow, ResolvedReportingRate } from "./types.ts";

/**
 * Resolves raw candidate rows (from reporting_fx_rates(), both directions,
 * already latest-per-pair) into one rate per currency needing conversion
 * to `reportingCurrency`. A direct rate (stored as currency -> reporting)
 * always wins over an inverse rate (stored as reporting -> currency) when
 * both exist for the same currency — the direct entry is literally what
 * the user recorded to express that currency in the reporting currency,
 * so it takes precedence over a derived value. Inversion uses decimal.js
 * exclusively (never binary float), and the result always carries full
 * provenance (§ ResolvedReportingRate) so the caller can show exactly how
 * a converted figure was constructed. No triangulation: only a currency
 * with a direct or explicit-inverse manual rate against the reporting
 * currency resolves at all.
 */
export function resolveReportingRates(rows: RawReportingFxRateRow[], reportingCurrency: string): ResolvedReportingRate[] {
  const direct = new Map<string, ResolvedReportingRate>();
  const inverse = new Map<string, ResolvedReportingRate>();

  for (const row of rows) {
    if (row.quoteCurrency === reportingCurrency && row.baseCurrency !== reportingCurrency) {
      direct.set(row.baseCurrency, {
        currencyCode: row.baseCurrency,
        rate: row.rate,
        isInverse: false,
        storedBaseCurrency: row.baseCurrency,
        storedQuoteCurrency: row.quoteCurrency,
        storedRate: row.rate,
        rateAsOf: row.rateAsOf,
        source: row.source,
      });
    } else if (row.baseCurrency === reportingCurrency && row.quoteCurrency !== reportingCurrency) {
      inverse.set(row.quoteCurrency, {
        currencyCode: row.quoteCurrency,
        rate: new Decimal(1).dividedBy(row.rate).toString(),
        isInverse: true,
        storedBaseCurrency: row.baseCurrency,
        storedQuoteCurrency: row.quoteCurrency,
        storedRate: row.rate,
        rateAsOf: row.rateAsOf,
        source: row.source,
      });
    }
  }

  const merged = new Map(inverse);
  for (const [currencyCode, resolved] of direct) {
    merged.set(currencyCode, resolved);
  }
  return Array.from(merged.values());
}

/** Flattens resolved rates into the plain currencyCode -> rate map convertToReportingCurrency()/convertFinancialPositionToReportingCurrency() expect. */
export function toRatesMap(resolved: ResolvedReportingRate[]): Map<string, string> {
  return new Map(resolved.map((r) => [r.currencyCode, r.rate]));
}
