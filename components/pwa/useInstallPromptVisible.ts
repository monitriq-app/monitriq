"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { snapshotInstallEnv, type InstallEnvSnapshot } from "@/lib/pwa/install-env";
import { installOffer, type InstallOffer } from "@/lib/pwa/install";
import { getDeferredInstallPrompt, subscribeInstallPrompt, type DeferredInstallPrompt } from "@/lib/pwa/install-store";
import { isInstallPromptSessionDismissed, readInstallPromptDismissedAt, subscribeInstallPromptDismissal } from "@/lib/pwa/install-prompt-store";
import { INSTALL_PROMPT_SHOW_DELAY_MS, shouldShowInstallPrompt } from "@/lib/pwa/install-prompt";

const noop = () => () => {};

export interface InstallPromptState {
  visible: boolean;
  offer: InstallOffer;
  prompt: DeferredInstallPrompt | null;
}

/**
 * Single source of truth for "should the top install banner show right
 * now". InstallBanner renders from it; PwaRuntime reads it too, purely to
 * suppress its own update banner while this one is showing — installation
 * takes precedence and the two must never stack (P0-E6-S1R3 section 17).
 * This does not change how updates are registered, detected or applied.
 */
export function useInstallPromptVisible(): InstallPromptState {
  const env = useSyncExternalStore(noop, snapshotInstallEnv, () => "");
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getDeferredInstallPrompt, () => null);
  const sessionDismissed = useSyncExternalStore(subscribeInstallPromptDismissal, isInstallPromptSessionDismissed, () => false);
  // localStorage is read through useSyncExternalStore too (not inline during render): this hook's
  // own dismissInstallPromptForSession()/markInstallPromptInstalled() notify() the same listener set,
  // so a dismissal is picked up immediately without a second, independent polling mechanism.
  const dismissedAt = useSyncExternalStore(subscribeInstallPromptDismissal, readInstallPromptDismissedAt, () => null);
  const [ready, setReady] = useState(false);
  // Captured once the show-delay elapses (inside the effect, not during render) — shouldShowInstallPrompt
  // stays a pure function of its inputs; "now" is state, not a live Date.now() read at render time.
  const [readyAt, setReadyAt] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
      setReadyAt(Date.now());
    }, INSTALL_PROMPT_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!env) return { visible: false, offer: "none", prompt: null };

  const { standalone, platform, inApp } = JSON.parse(env) as InstallEnvSnapshot;
  const offer = installOffer({ standalone, platform, hasPrompt: prompt !== null, inAppBrowser: inApp });
  const visible = shouldShowInstallPrompt({ offer, dismissedAt, now: readyAt ?? 0, sessionDismissed, ready });
  return { visible, offer, prompt };
}
