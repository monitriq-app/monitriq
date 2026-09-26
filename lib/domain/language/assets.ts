import { resolveLanguageMode } from "./types.ts";

/**
 * Asset card wording by explanation mode. The asset-type labels themselves are already plain
 * ("What did you pay?", "Amount invested"), so Simple keeps them unchanged; Balanced states them
 * briefly; Financial uses the conventional accounting terms. Same recorded values in every mode.
 */
export function assetBasisLabel(mode: unknown, configLabel: string): string {
  const m = resolveLanguageMode(mode);
  if (m === "financial") return "Cost basis";
  if (m === "balanced") return /invest/i.test(configLabel) ? "Amount invested" : "Amount paid";
  return configLabel;
}

export function assetCurrentValueLabel(mode: unknown, configLabel: string): string {
  return resolveLanguageMode(mode) === "financial" ? "Current valuation" : configLabel;
}
