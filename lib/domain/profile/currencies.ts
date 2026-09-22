/**
 * A curated, alphabetically-sorted set of common ISO 4217 currency codes
 * for the onboarding picker. Not exhaustive, not geography-specific to any
 * one user — full multi-currency accounting does not exist yet (see
 * docs/architecture/FINANCIAL_DOMAIN_MODEL.md #6). Extend this list as
 * needed; it does not require a migration since preferred_currency only
 * enforces a three-letter-uppercase format at the database layer.
 */
export const CURRENCY_OPTIONS = [
  { code: "AED", name: "UAE Dirham" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "DKK", name: "Danish Krone" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "INR", name: "Indian Rupee" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "USD", name: "US Dollar" },
  { code: "ZAR", name: "South African Rand" },
] as const;
