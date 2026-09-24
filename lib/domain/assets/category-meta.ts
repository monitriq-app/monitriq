import { Car, Building2, Briefcase, TrendingUp, Wrench, Package, Gem, CircleDollarSign, type LucideIcon } from "lucide-react";
import type { AssetTypeCode } from "./types.ts";

/**
 * One shared source for each asset type's section title/icon/unit-word —
 * never scattered per-component switch statements that could drift from
 * each other. Purely presentational; never affects which real assets
 * exist or what they're worth.
 */
interface CategoryMeta {
  sectionTitle: string;
  unitWord: string;
  Icon: LucideIcon;
  /**
   * Identity-stable, purely categorical accent — never semantic
   * (never implies good/bad/risk). Drawn only from Monatriq's three
   * non-semantic accent tokens (teal/aqua/amber) plus tints/neutrals for
   * the tail, matching the approved reference's own three-hue
   * categorical palette. `text`/`bg` variants of the SAME hue, so a
   * category's icon, heading accent, and allocation-bar segment always
   * agree.
   */
  textClass: string;
  bgClass: string;
}

const META: Record<string, CategoryMeta> = {
  vehicle: { sectionTitle: "Vehicles", unitWord: "vehicle", Icon: Car, textClass: "text-attention", bgClass: "bg-attention" },
  property: { sectionTitle: "Real Estate & Land", unitWord: "property", Icon: Building2, textClass: "text-accent-primary", bgClass: "bg-accent-primary" },
  business_interest: { sectionTitle: "Business Interests", unitWord: "interest", Icon: Briefcase, textClass: "text-focus", bgClass: "bg-focus" },
  financial_investment: { sectionTitle: "Financial Investments", unitWord: "investment", Icon: TrendingUp, textClass: "text-accent-primary", bgClass: "bg-accent-primary/55" },
  equipment: { sectionTitle: "Equipment", unitWord: "item", Icon: Wrench, textClass: "text-attention", bgClass: "bg-attention/55" },
  inventory: { sectionTitle: "Inventory", unitWord: "item", Icon: Package, textClass: "text-focus", bgClass: "bg-focus/55" },
  collectible: { sectionTitle: "Collectibles", unitWord: "item", Icon: Gem, textClass: "text-text-secondary", bgClass: "bg-text-secondary" },
  other: { sectionTitle: "Other Assets", unitWord: "item", Icon: CircleDollarSign, textClass: "text-text-muted", bgClass: "bg-border" },
};

const DEFAULT_META: CategoryMeta = { sectionTitle: "Assets", unitWord: "item", Icon: CircleDollarSign, textClass: "text-text-secondary", bgClass: "bg-border" };

export function categoryMeta(assetType: AssetTypeCode): CategoryMeta {
  return META[assetType] ?? DEFAULT_META;
}
