import { Decimal } from "decimal.js";
import type { Currency } from "./types.ts";

function addThousandsSeparators(integerPart: string): string {
  const negative = integerPart.startsWith("-");
  const digits = negative ? integerPart.slice(1) : integerPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
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
): string {
  const fixed = new Decimal(amount).toFixed(currency.decimal_exponent);
  const [integerPart, fractionalPart] = fixed.split(".");
  const grouped = addThousandsSeparators(integerPart);
  const value = fractionalPart ? `${grouped}.${fractionalPart}` : grouped;
  return `${currency.code} ${value}`;
}
