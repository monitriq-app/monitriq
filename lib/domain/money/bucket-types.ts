import type { BucketType } from "./types.ts";

/** Must match the CHECK constraint on cash_buckets.bucket_type in the migration. */
export const BUCKET_TYPE_OPTIONS: { value: BucketType; label: string }[] = [
  { value: "bank_account", label: "Bank account" },
  { value: "cash_wallet", label: "Cash wallet" },
  { value: "savings_account", label: "Savings account" },
  { value: "mobile_wallet", label: "Mobile wallet" },
  { value: "business_cash", label: "Business cash" },
  { value: "other", label: "Other cash reserve" },
];
