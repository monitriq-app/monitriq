import { CheckCircle2, CircleAlert, ShieldAlert, Settings2, TriangleAlert, type LucideIcon } from "lucide-react";
import { TONE_BADGE_CLASS } from "@/lib/domain/rules/labels";
import type { CashStatus, CashStatusResult } from "@/lib/domain/rules/cash-status";

const ICON: Record<CashStatus, LucideIcon> = {
  comfortable: CheckCircle2,
  getting_close: TriangleAlert,
  at_limit: CircleAlert,
  below_limit: ShieldAlert,
  needs_setup: Settings2,
};

/** Status chip: text label plus icon; colour only reinforces (teal / amber / red). */
export function CashStatusBadge({ result }: { result: CashStatusResult }) {
  const Icon = ICON[result.state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_BADGE_CLASS[result.tone]}`}>
      <Icon size={12} aria-hidden="true" />
      {result.label}
    </span>
  );
}
