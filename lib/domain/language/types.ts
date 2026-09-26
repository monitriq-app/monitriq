/**
 * Adaptive financial language (P0-E5-S5). ONE financial engine, three
 * explanation styles. The mode changes WORDING only: never a calculation,
 * threshold, warning state, suggestion, permission or feature.
 *
 * The stored value is a stable code (profiles.financial_language_mode);
 * display labels below are never stored.
 */
export const LANGUAGE_MODES = ["simple", "balanced", "financial"] as const;
export type FinancialLanguageMode = (typeof LANGUAGE_MODES)[number];

export const DEFAULT_LANGUAGE_MODE: FinancialLanguageMode = "simple";

export function isLanguageMode(value: unknown): value is FinancialLanguageMode {
  return typeof value === "string" && (LANGUAGE_MODES as readonly string[]).includes(value);
}

/** Missing, null or invalid (e.g. old data) always resolves safely to "simple"; a vocabulary preference must never break a financial page. */
export function resolveLanguageMode(value: unknown): FinancialLanguageMode {
  return isLanguageMode(value) ? value : DEFAULT_LANGUAGE_MODE;
}

export const LANGUAGE_QUESTION = "How would you like Monitriq to explain your money?";
export const LANGUAGE_SETTINGS_HEADING = "How Monitriq explains money";

/** Selector copy. Deliberately not a test of knowledge: no Beginner / Intermediate / Expert. */
export const LANGUAGE_MODE_OPTIONS: { value: FinancialLanguageMode; label: string; description: string }[] = [
  { value: "simple", label: "Keep it simple", description: "Everyday words and clear explanations." },
  { value: "balanced", label: "Balanced", description: "Simple explanations with financial terms when useful." },
  { value: "financial", label: "Financial terms", description: "Traditional financial wording and more detail." },
];
