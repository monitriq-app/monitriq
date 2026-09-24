"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Thin client boundary around next-themes — a mature, well-tested theme
 * library rather than a hand-rolled one (per docs/project's standing
 * instruction). `attribute="data-theme"` writes `data-theme="light"` or
 * `data-theme="dark"` onto `<html>`, which lib/styles/tokens.css's
 * `:root[data-theme="light"]` override block reads. next-themes injects
 * its own blocking inline script before hydration so the correct theme is
 * set before first paint — this is what avoids a flash of the wrong
 * theme, not anything bespoke here. Persistence is next-themes' own
 * localStorage key — device-local only, no financial backend state, per
 * the phase brief's explicit instruction.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
