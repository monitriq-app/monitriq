"use client";

import { ThemeProvider as NextThemesProvider } from "@teispace/next-themes";
import type { ReactNode } from "react";

/**
 * Thin client boundary around @teispace/next-themes — a mature,
 * well-tested theme library rather than a hand-rolled one (per
 * docs/project's standing instruction). Originally built on the
 * upstream `next-themes` package; migrated to this actively-maintained
 * fork because upstream has an unresolved React 19.2 bug (its own
 * issue #397/#387/#385 — "Encountered a script tag while rendering
 * React component," reproduced on `npm run dev` with Next 16.3.6/React
 * 19.2.8) with no fixed stable release. The fork is API-compatible:
 * `attribute="data-theme"` still writes `data-theme="light"` or
 * `data-theme="dark"` onto `<html>`, which lib/styles/tokens.css's
 * `:root[data-theme="light"]` override block reads; `defaultTheme`/
 * `enableSystem` are unchanged. `storage="local"` is explicitly set to
 * preserve the exact prior persistence behavior (this fork defaults to
 * a hybrid cookie+localStorage mode instead) — device-local
 * `localStorage` only, no cookie, no financial backend state, per the
 * P0-E3-S2 phase brief's original explicit instruction, still honored.
 * The anti-FOUC inline script is injected via `useServerInsertedHTML`
 * (Next.js's own supported mechanism for this), not through the normal
 * React component tree, which is what avoids the React 19 warning.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem storage="local">
      {children}
    </NextThemesProvider>
  );
}
