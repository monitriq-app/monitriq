"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { terminology, type Terminology } from "@/lib/domain/language/terms";
import { resolveLanguageMode, type FinancialLanguageMode } from "@/lib/domain/language/types";

const LanguageContext = createContext<FinancialLanguageMode>("simple");

/**
 * Mounted once in AppShell with the mode the server already resolved from
 * the profile, so client components read it from context instead of
 * fetching profiles themselves. Changing the preference calls router.refresh(),
 * the server re-renders with the new mode and this provider updates.
 */
export function LanguageProvider({ mode, children }: { mode: unknown; children: ReactNode }) {
  return <LanguageContext.Provider value={resolveLanguageMode(mode)}>{children}</LanguageContext.Provider>;
}

export function useLanguageMode(): FinancialLanguageMode {
  return useContext(LanguageContext);
}

/** The typed vocabulary for the current mode. Outside a provider it is the safe "simple" default. */
export function useTerms(): Terminology {
  const mode = useLanguageMode();
  return useMemo(() => terminology(mode), [mode]);
}
