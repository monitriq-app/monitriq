"use client";

import { useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";
import { getDeferredInstallPrompt, setDeferredInstallPrompt, subscribeInstallPrompt } from "@/lib/pwa/install-store";
import { detectPlatform, installOffer, isInAppBrowser, isStandalone } from "@/lib/pwa/install";
import { INSTALL_ACTION, INSTALL_HELP, INSTALL_TITLE, IOS_INSTALL_STEPS } from "@/lib/pwa/messages";

interface InstallEnv {
  standalone: boolean;
  platform: ReturnType<typeof detectPlatform>;
  inApp: boolean;
  /** Raw values, captured only so the P0-E6-S1R2 diagnostics panel below can show real-device ground truth; never used for the actual offer decision. */
  raw: { userAgent: string; navPlatform: string; maxTouchPoints: number; matchesStandalone: boolean; iosStandalone: boolean | null };
  /** True only with `?pwaDebug=1` in the URL — see the P0-E6-S1R2 note on InstallDiagnostics below. */
  debug: boolean;
}

function snapshotEnv(): string {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const matchesStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const standalone = isStandalone({ matchesStandalone, iosStandalone: nav.standalone });
  const platform = detectPlatform({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints });
  let debug = false;
  try {
    debug = new URLSearchParams(window.location.search).get("pwaDebug") === "1";
  } catch {
    debug = false;
  }
  const env: InstallEnv = {
    standalone,
    platform,
    inApp: isInAppBrowser(nav.userAgent),
    raw: { userAgent: nav.userAgent, navPlatform: nav.platform ?? "", maxTouchPoints: nav.maxTouchPoints ?? 0, matchesStandalone, iosStandalone: nav.standalone ?? null },
    debug,
  };
  return JSON.stringify(env);
}

const noop = () => () => {};

/**
 * "Install Monitriq" in the profile menu only (secondary, never a Home
 * banner). Hidden when already installed/standalone; the button appears only
 * when the browser really offers installation; iPhone/iPad get Add to Home
 * Screen guidance and never see Android wording, and vice versa.
 */
export function InstallSection() {
  const env = useSyncExternalStore(noop, snapshotEnv, () => "");
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getDeferredInstallPrompt, () => null);
  if (!env) return null;
  const { standalone, platform, inApp, raw, debug } = JSON.parse(env) as InstallEnv;
  const offer = installOffer({ standalone, platform, hasPrompt: prompt !== null, inAppBrowser: inApp });
  if (offer === "none" && !debug) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    setDeferredInstallPrompt(null);
  }

  return (
    <div className="flex flex-col gap-1 border-b border-border py-3">
      {debug ? <InstallDiagnostics raw={raw} platform={platform} inApp={inApp} standalone={standalone} hasPrompt={prompt !== null} offer={offer} /> : null}
      {offer === "none" ? null : (
        <>
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
        </>
      )}
    </div>
  );
}

/**
 * TEMPORARY (P0-E6-S1R2) — real-device install-guidance diagnosis.
 * Renders ONLY with `?pwaDebug=1` in the URL, so it is invisible to every
 * ordinary user by default in every environment, including production; it
 * is never shown by NODE_ENV alone, because the real device under test is
 * very likely a deployed/LAN build, not `next dev`. Remove this component
 * and the `debug`/`raw` plumbing above once the real cause of "iPhone
 * Chrome shows no install guidance" is confirmed and fixed — do not let it
 * become a permanent feature.
 */
function InstallDiagnostics({
  raw,
  platform,
  inApp,
  standalone,
  hasPrompt,
  offer,
}: {
  raw: InstallEnv["raw"];
  platform: ReturnType<typeof detectPlatform>;
  inApp: boolean;
  standalone: boolean;
  hasPrompt: boolean;
  offer: ReturnType<typeof installOffer>;
}) {
  const rows: [string, string][] = [
    ["navigator.userAgent", raw.userAgent],
    ["navigator.platform", raw.navPlatform || "(empty)"],
    ["navigator.maxTouchPoints", String(raw.maxTouchPoints)],
    ["matchMedia(display-mode: standalone)", String(raw.matchesStandalone)],
    ["navigator.standalone", raw.iosStandalone === null ? "(undefined)" : String(raw.iosStandalone)],
    ["detectPlatform() ->", platform],
    ["isInAppBrowser() ->", String(inApp)],
    ["isStandalone() ->", String(standalone)],
    ["hasPrompt (beforeinstallprompt seen)", String(hasPrompt)],
    ["installOffer() ->", offer],
  ];
  // Deliberate: lets a technician read this via remote inspection too, if available.
  console.log("[pwaDebug] install diagnostics", Object.fromEntries(rows));
  return (
    <div className="mb-2 flex flex-col gap-1 rounded-md border border-dashed border-attention bg-attention/10 p-2 text-[11px]">
      <p className="font-semibold text-attention">TEMPORARY DIAGNOSTICS (P0-E6-S1R2) — remove after real-device diagnosis</p>
      <dl className="flex flex-col gap-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-text-muted">{label}</dt>
            <dd className="break-all font-mono text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
