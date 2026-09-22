// Relative/extensioned — see the comment in lib/domain/profile/types.ts.
// This module is used by Profile, Money, Assets, and the plain-`node`
// test harnesses, so it stays framework-agnostic.
import type { Database } from "../../supabase/database.types.ts";

export type Currency = Database["public"]["Tables"]["currencies"]["Row"];

/**
 * A monetary amount paired with its currency. `amount` is always the exact
 * decimal-string form the database returned (never a parsed JS number) —
 * see docs/architecture/MULTI_CURRENCY_MODEL.md, "decimal precision".
 * Shared by Money and Assets (and anything else that reports per-currency
 * totals) rather than each domain declaring its own copy.
 */
export interface CurrencyAmount {
  currencyCode: string;
  amount: string;
}
