/**
 * Navigation structure (P0-E5-S4). Plain data so it can be asserted by
 * tests and shared by every nav surface. Routes/domain names are unchanged;
 * only the visible labels are consumer-friendly.
 */
export interface PrimaryNavItem {
  href: string;
  label: string;
  icon: "home" | "money" | "budget" | "goals";
}

/** Everyday destinations, left of the centre Quick Add "+". */
export const PRIMARY_BEFORE_ADD: PrimaryNavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/money", label: "Money", icon: "money" },
];

/** Everyday destinations, right of the centre Quick Add "+". */
export const PRIMARY_AFTER_ADD: PrimaryNavItem[] = [
  { href: "/budget", label: "Budget", icon: "budget" },
  { href: "/goals", label: "Goals", icon: "goals" },
];

import type { TermKey } from "../../lib/domain/language/terms.ts";

export interface DrawerItem {
  /** When set, the visible label follows the user's explanation vocabulary (route unchanged). */
  term?: TermKey;
  key: "assets" | "debts" | "owed" | "decisions" | "overview" | "rules";
  href: string;
  label: string;
}

export interface DrawerSection {
  heading: string;
  items: DrawerItem[];
}

/** Secondary financial tools. None of these appear in the bottom nav or the profile menu. */
export const DRAWER_SECTIONS: DrawerSection[] = [
  {
    heading: "Your money",
    items: [
      { key: "assets", href: "/assets", label: "Assets" },
      { key: "debts", href: "/liabilities", label: "Debts", term: "debts" },
      { key: "owed", href: "/receivables", label: "Money Owed to You", term: "money_owed" },
    ],
  },
  {
    heading: "Planning",
    items: [
      { key: "decisions", href: "/decisions", label: "Decisions" },
      { key: "overview", href: "/financial-position", label: "Financial Overview" },
      { key: "rules", href: "/rules", label: "Rules & Commitments" },
    ],
  },
];
