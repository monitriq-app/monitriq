import { Decimal } from "decimal.js";
import type { Currency } from "./types.ts";

function addThousandsSeparators(integerPart: string): string {
  const negative = integerPart.startsWith("-");
  const digits = negative ? integerPart.slice(1) : integerPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

export interface FormatCurrencyAmountOptions {
  /**
   * Presentational only — never changes the underlying value. When true
   * AND the amount, rounded to the currency's own decimal_exponent, has
   * an all-zero fractional part (e.g. "30850200.00" -> "30,850,200"),
   * the fractional part and separator are omitted from the returned
   * string. An amount with any real (nonzero, after rounding to the
   * currency's own precision) fractional value is always shown in full —
   * this never truncates or rounds away meaningful precision, it only
   * omits a fraction that would otherwise display as all zeros. Default
   * (omitted/false) reproduces this function's exact prior behavior
   * byte-for-byte, so every existing caller is unaffected; opt in only
   * where a summary/headline context genuinely wants it (e.g. Home) —
   * detail/transaction views should keep showing full currency precision
   * by leaving this unset. See docs/architecture/MULTI_CURRENCY_MODEL.md,
   * "Home-only trailing-zero display option".
   */
  trimTrailingZeros?: boolean;
}

/**
 * Formats an exact decimal-string amount for display, using the currency's
 * own decimal_exponent (0 for JPY, 2 for most, 3 for KWD, ...) rather than
 * assuming 2 everywhere. Always prefixes the currency code (never a bare
 * symbol) so currency identity is never ambiguous — see
 * docs/design/VISUAL_CONSTITUTION.md and docs/architecture/
 * MULTI_CURRENCY_MODEL.md, "multi-currency UI language". Grouping digits
 * with commas is done via string manipulation, not by round-tripping
 * through a JS number, so this never risks float precision loss even for
 * very large amounts.
 */
export function formatCurrencyAmount(
  amount: string,
  currency: Pick<Currency, "code" | "decimal_exponent">,
  options?: FormatCurrencyAmountOptions,
): string {
  const fixed = new Decimal(amount).toFixed(currency.decimal_exponent);
  const [integerPart, fractionalPart] = fixed.split(".");
  const grouped = addThousandsSeparators(integerPart);
  const dropFraction = Boolean(options?.trimTrailingZeros) && fractionalPart !== undefined && /^0*$/.test(fractionalPart);
  const value = fractionalPart && !dropFraction ? `${grouped}.${fractionalPart}` : grouped;
  return `${currency.code} ${value}`;
}
