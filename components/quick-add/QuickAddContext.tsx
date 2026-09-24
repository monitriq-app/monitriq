"use client";

import { createContext, useContext } from "react";

export type QuickAddView = "hub" | "received" | "spent" | "move" | "asset";

export interface QuickAddContextValue {
  isOpen: boolean;
  view: QuickAddView;
  open: () => void;
  close: () => void;
  goTo: (view: QuickAddView) => void;
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
