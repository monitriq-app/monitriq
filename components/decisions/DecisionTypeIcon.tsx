import { ShoppingCart, Tag, Wrench, Briefcase, ShoppingBag, PiggyBank, Landmark, CreditCard, Rocket, CircleDollarSign } from "lucide-react";
import type { DecisionTypeCode } from "@/lib/domain/decisions/types";

/**
 * The one shared decision-type → icon mapping (P0-E4-S3), extracted from
 * Home's `YourMovesSection.tsx` so the full Decisions screen and Home's
 * "Your Moves" card read as the same product rather than maintaining two
 * copies of the same switch statement. A type-identity icon, never a
 * numbered priority badge — Decisions never ranks.
 */
export function DecisionTypeIcon({ typeCode, size = 14 }: { typeCode: DecisionTypeCode; size?: number }) {
  switch (typeCode) {
    case "buy_asset":
      return <ShoppingCart size={size} aria-hidden="true" />;
    case "sell_asset":
      return <Tag size={size} aria-hidden="true" />;
    case "repair_improve_asset":
      return <Wrench size={size} aria-hidden="true" />;
    case "business_investment":
      return <Briefcase size={size} aria-hidden="true" />;
    case "large_personal_purchase":
      return <ShoppingBag size={size} aria-hidden="true" />;
    case "use_savings":
      return <PiggyBank size={size} aria-hidden="true" />;
    case "take_debt":
      return <Landmark size={size} aria-hidden="true" />;
    case "pay_down_debt":
      return <CreditCard size={size} aria-hidden="true" />;
    case "start_new_venture":
      return <Rocket size={size} aria-hidden="true" />;
    default:
      return <CircleDollarSign size={size} aria-hidden="true" />;
  }
}
