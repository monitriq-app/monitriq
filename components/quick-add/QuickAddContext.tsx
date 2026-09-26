"use client";

import { createContext, useContext } from "react";

export type QuickAddView = "hub" | "received" | "spent" | "move" | "asset";

/** Values a caller (e.g. "Can I afford this?") pre-fills into the Money Spent form. The user still confirms and saves — nothing is recorded by opening it. */
export interface SpentPrefill {
  amount: string;
  bucketId: string;
  categoryCode: string | null;
  description: string;
}

export interface QuickAddContextValue {
  isOpen: boolean;
  view: QuickAddView;
  open: () => void;
  close: () => void;
  goTo: (view: QuickAddView) => void;
  /** Opens Money Spent with the fields pre-filled; the user must still press Save. */
  openSpent: (prefill: SpentPrefill) => void;
  backToHub: () => void;
}

export const QuickAddContext = createContext<QuickAddContextValue | null>(null);

/**
 * The central `+` in the shared bottom nav opens this (see
 * MobileBottomNav.tsx) — a real sheet/route into Money's canonical
 * mutation boundaries, never a link to a generic page (P0-E3-S3).
 */
export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used within QuickAddProvider");
  return ctx;
}
