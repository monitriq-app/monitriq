"use client";

import { useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PageContainer } from "@/components/layout/PageContainer";
import { InstallInstructionsSheet } from "@/components/pwa/InstallInstructionsSheet";
import { useInstallPromptVisible } from "@/components/pwa/useInstallPromptVisible";
import { setDeferredInstallPrompt } from "@/lib/pwa/install-store";
import { dismissInstallPromptForSession, markInstallPromptInstalled } from "@/lib/pwa/install-prompt-store";
import { INSTALL_BANNER_BODY, INSTALL_BANNER_INSTALL, INSTALL_BANNER_NOT_NOW, INSTALL_BANNER_TITLE } from "@/lib/pwa/messages";

/**
 * Top-of-shell install invitation (P0-E6-S1R3) — the primary, discoverable
 * entry point; the Profile menu's "Install Monitriq" (InstallSection)
 * remains a secondary fallback, unchanged. Mounted once in AppShell, so it
 * is never shown during signup/confirmation/onboarding (those routes don't
 * render AppShell) and, because AppShell is a persistent Next.js layout,
 * this component stays mounted across in-app navigation rather than
 * re-appearing on every page.
 *
 * Android: reuses the same captured `beforeinstallprompt` as the profile
 * menu. iOS (any browser, not Safari-only — see lib/pwa/install.ts): opens
 * an instruction sheet, since iOS has no programmatic install API.
 */
export function InstallBanner() {
  const { visible, offer, prompt } = useInstallPromptVisible();
  const [sheetOpen, setSheetOpen] = useState(false);

  // No separate "close the sheet" effect needed: if the banner becomes
  // ineligible (e.g. installed via the browser's own UI while open), this
  // whole component — including any open sheet it rendered — unmounts here.
  if (!visible) return null;

  async function handleInstall() {
    if (offer === "prompt" && prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      setDeferredInstallPrompt(null);
      if (choice?.outcome === "accepted") markInstallPromptInstalled();
      else dismissInstallPromptForSession();
      return;
    }
    if (offer === "ios_guide") setSheetOpen(true);
  }

  return (
    <>
      <PageContainer className="pt-3">
        <div role="region" aria-label={INSTALL_BANNER_TITLE} className="rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 p-1.5">
              <BrandLogo variant="mark" className="h-full w-full" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary">{INSTALL_BANNER_TITLE}</p>
              <p className="text-xs text-text-secondary">{INSTALL_BANNER_BODY}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-1">
            <button type="button" onClick={() => dismissInstallPromptForSession()} className="flex min-h-12 items-center rounded-full px-3 text-sm font-semibold text-text-secondary hover:bg-surface-muted">
              {INSTALL_BANNER_NOT_NOW}
            </button>
            <button type="button" onClick={handleInstall} className="flex min-h-12 items-center rounded-full bg-accent-primary px-4 text-sm font-semibold text-background hover:opacity-90">
              {INSTALL_BANNER_INSTALL}
            </button>
          </div>
        </div>
      </PageContainer>
      {sheetOpen ? <InstallInstructionsSheet onClose={() => setSheetOpen(false)} /> : null}
    </>
  );
}
