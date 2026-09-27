"use client";

import { useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";
import { getDeferredInstallPrompt, setDeferredInstallPrompt, subscribeInstallPrompt } from "@/lib/pwa/install-store";
import { installOffer } from "@/lib/pwa/install";
import { snapshotInstallEnv, type InstallEnvSnapshot } from "@/lib/pwa/install-env";
import { INSTALL_ACTION, INSTALL_HELP, INSTALL_TITLE, IOS_INSTALL_STEPS } from "@/lib/pwa/messages";

const noop = () => () => {};

/**
 * "Install Monitriq" in the profile menu — the secondary, always-available
 * fallback now that the top-of-shell InstallBanner (P0-E6-S1R3) is the
 * primary, discoverable entry point. Hidden when already installed/
 * standalone; the button appears only when the browser really offers
 * installation; iPhone/iPad get Add to Home Screen guidance and never see
 * Android wording, and vice versa. If the top banner was dismissed, this
 * stays available (a deliberate manual fallback, never itself dismissible).
 */
export function InstallSection() {
  const env = useSyncExternalStore(noop, snapshotInstallEnv, () => "");
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getDeferredInstallPrompt, () => null);
  if (!env) return null;
  const { standalone, platform, inApp } = JSON.parse(env) as InstallEnvSnapshot;
  const offer = installOffer({ standalone, platform, hasPrompt: prompt !== null, inAppBrowser: inApp });
  if (offer === "none") return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    setDeferredInstallPrompt(null);
  }

  return (
    <div className="flex flex-col gap-1 border-b border-border py-3">
      <span className="px-1 text-xs font-medium uppercase tracking-wide text-text-muted">{INSTALL_TITLE}</span>
      <p className="px-1 text-xs text-text-secondary">{INSTALL_HELP}</p>
      {offer === "prompt" ? (
        <button type="button" onClick={install} className="flex min-h-12 items-center gap-2 rounded-md px-2 text-sm font-semibold text-accent-primary hover:bg-surface-muted">
          <Download size={16} aria-hidden="true" />
          {INSTALL_ACTION}
        </button>
      ) : (
        <p className="flex min-h-12 items-center gap-2 rounded-md px-2 text-sm text-text-primary">
          <Share size={16} className="shrink-0 text-accent-primary" aria-hidden="true" />
          {IOS_INSTALL_STEPS}
        </p>
      )}
    </div>
  );
}
