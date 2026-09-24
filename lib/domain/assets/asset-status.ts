import type { AssetStatusCode } from "./types.ts";

/** Must match the CHECK constraint on assets.status_code in the migration. */
export const ASSET_STATUS_OPTIONS: { value: AssetStatusCode; label: string }[] = [
  { value: "awaiting_repair", label: "Awaiting Repair" },
  { value: "repairing", label: "Repairing" },
  { value: "ready_to_list", label: "Ready to List" },
  { value: "listed", label: "Listed" },
  { value: "offer_received", label: "Offer Received" },
  { value: "under_negotiation", label: "Under Negotiation" },
];

const LABEL_BY_CODE = new Map(ASSET_STATUS_OPTIONS.map((o) => [o.value, o.label]));

export function assetStatusLabel(code: AssetStatusCode | null): string {
  if (code === null) return "Status not set";
  return LABEL_BY_CODE.get(code) ?? code;
}
