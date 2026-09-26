import { terminology } from "./terms.ts";
import type { FinancialLanguageMode } from "./types.ts";
import { resolveLanguageMode } from "./types.ts";

/**
 * Explanation DEPTH by mode. The words differ; the meaning and the figures
 * are identical (the Rules engine's own: available = liquid cash minus
 * required retained cash, where required retained cash is the greater of the
 * minimum cash and protected commitments). No formula is computed here.
 */
export interface AvailableExplanationCopy {
  heading: string;
  body: string;
}

export function availableExplanationCopy(mode: unknown, v: { available: string; cash: string; protecting: string }): AvailableExplanationCopy {
  const m: FinancialLanguageMode = resolveLanguageMode(mode);
  const t = terminology(m);
  if (m === "simple") {
    return {
      heading: `Why is ${v.available} available?`,
      body: `You have ${v.cash} in tracked cash. Monitriq is keeping ${v.protecting} protected based on the limits and goals you set. It protects whichever amount is higher, so the same money is not counted twice.`,
    };
  }
  if (m === "balanced") {
    return {
      heading: t.t("how_worked_out"),
      body: `${t.t("available_above")} is the cash remaining after your minimum cash amount and protected goals and commitments are considered. The higher of the two is protected, so nothing is counted twice.`,
    };
  }
  return {
    heading: t.t("how_worked_out"),
    body: `${t.t("available_above")} is liquid cash remaining after Required Retained Cash, based on the greater of the Minimum Cash Floor and protected commitments.`,
  };
}
