import { convertToReportingCurrency, type ReportingConversionResult } from "../currency/conversion.ts";
import type { DecisionScenarioEvaluation } from "./types.ts";

/**
 * Converts a scenario's net immediate cash delta into a reporting
 * currency — but only when an explicit rate is supplied for its native
 * currency (unless it already IS the reporting currency). Never guesses,
 * never calls a live FX API. Reuses convertToReportingCurrency() — no
 * Decisions-specific FX implementation. See docs/architecture/
 * MULTI_CURRENCY_MODEL.md, "Decisions and cross-currency scenarios."
 */
export function convertScenarioNetDeltaToReportingCurrency(
  evaluation: DecisionScenarioEvaluation,
  reportingCurrency: string,
  rates: ReadonlyMap<string, string>,
): ReportingConversionResult {
  if (evaluation.netImmediateCashDelta === null) {
    return { status: "not_calculated", missingRates: [] };
  }

  return convertToReportingCurrency(
    [{ currencyCode: evaluation.currencyCode, amount: evaluation.netImmediateCashDelta }],
    reportingCurrency,
    rates,
  );
}
