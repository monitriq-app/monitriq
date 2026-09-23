import { convertToReportingCurrency, type ReportingConversionResult } from "../currency/conversion.ts";
import type { SafeToDeployResult } from "./types.ts";

/**
 * Consolidates per-currency Safe to Deploy results into one reporting-
 * currency figure — but ONLY when every relevant currency's Safe to
 * Deploy is itself 'calculated' AND the caller supplies every required
 * FX rate. If even one relevant currency is 'not_configured', a
 * consolidated total would silently treat its (unknown) contribution as
 * zero — so this returns not_calculated instead of guessing. Reuses
 * lib/domain/currency's convertToReportingCurrency() — no second FX/
 * conversion implementation. See docs/architecture/MULTI_CURRENCY_MODEL.md,
 * "reporting-currency Safe to Deploy".
 */
export function aggregateSafeToDeployToReportingCurrency(
  results: SafeToDeployResult[],
  reportingCurrency: string,
  rates: ReadonlyMap<string, string>,
): ReportingConversionResult {
  const notConfigured = results.filter((r) => r.status === "not_configured");
  if (notConfigured.length > 0) {
    return {
      status: "not_calculated",
      missingRates: notConfigured.map((r) => r.currencyCode).sort(),
    };
  }

  const balances = results
    .filter((r) => r.status === "calculated" && r.safeToDeploy !== null)
    .map((r) => ({ currencyCode: r.currencyCode, amount: r.safeToDeploy as string }));

  return convertToReportingCurrency(balances, reportingCurrency, rates);
}
