export type PotentialLiquidity =
  | { status: "available"; amount: string; currencyCode: string }
  | { status: "not_calculated" };

/**
 * Never equates current value with cash available. Uses the quick-sale
 * estimate as liquidity evidence ONLY when the user explicitly supplied
 * one — no automatic haircut is invented from estimated_current_value or
 * target_value when a quick-sale figure is absent. See
 * docs/architecture/FINANCIAL_DOMAIN_MODEL.md, "potential liquidity".
 */
export function getPotentialLiquidity(
  quickSaleEstimate: string | null,
  currencyCode: string,
): PotentialLiquidity {
  if (quickSaleEstimate === null) {
    return { status: "not_calculated" };
  }
  return { status: "available", amount: quickSaleEstimate, currencyCode };
}
