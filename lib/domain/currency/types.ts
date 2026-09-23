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

export type FxRate = Database["public"]["Tables"]["fx_rates"]["Row"];
export type FxRateSource = "manual" | "transaction_actual";

/**
 * What the user typed in to record a manual reporting/valuation rate —
 * "1 baseCurrency = rate quoteCurrency", the same base/quote direction
 * public.fx_rates itself uses. Always source='manual', event_id=null;
 * never the rate actually applied to a real fx_transfer (source=
 * 'transaction_actual' rows are a completely separate concept — see
 * docs/architecture/MULTI_CURRENCY_MODEL.md, "reporting FX vs transaction
 * FX").
 */
export interface RecordManualReportingRateInput {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  rateAsOf?: string;
}

/** One raw row from reporting_fx_rates() — the user's own latest manual rate for one currency pair, exactly as recorded, before any direct/inverse resolution. */
export interface RawReportingFxRateRow {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  rateAsOf: string;
  source: FxRateSource;
}

/**
 * A raw rate row resolved against one specific reporting currency: the
 * currency it converts, the (possibly inverted) rate to use, and full
 * provenance — whether it was inverted, what was actually stored, when,
 * and its source. Never `live`/`market`/`official`; V1 is manual-first.
 */
export interface ResolvedReportingRate {
  currencyCode: string;
  /** Units of the reporting currency per 1 unit of currencyCode — possibly the mathematical inverse of what was stored. */
  rate: string;
  isInverse: boolean;
  storedBaseCurrency: string;
  storedQuoteCurrency: string;
  /** The rate exactly as the user recorded it, pre-inversion. */
  storedRate: string;
  rateAsOf: string;
  source: FxRateSource;
}
