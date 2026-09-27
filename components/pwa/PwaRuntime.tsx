"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { setDeferredInstallPrompt, type DeferredInstallPrompt } from "@/lib/pwa/install-store";
import { OFFLINE_MESSAGE, UPDATE_ACTION, UPDATE_LATER, UPDATE_MESSAGE } from "@/lib/pwa/messages";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Loaded lazily (see PwaLoader). Responsibilities, all narrow:
 *  - register the service worker (production only);
 *  - surface "An update is available" when a new deployment's worker is
 *    waiting, and only switch when the user taps Refresh (never mid-form);
 *  - show an honest offline notice while the network is unavailable;
 *  - capture the browser's install prompt for the profile menu.
 * It stores no user data and reads none.
 */
export default function PwaRuntime() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const refreshing = useRef(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as DeferredInstallPrompt);
    };
    const onInstalled = () => setDeferredInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    let registration: ServiceWorkerRegistration | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    const onControllerChange = () => {
      if (refreshing.current) window.location.reload();
    };

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          registration = reg;
          if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            installing?.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) setWaiting(installing);
            });
          });
          document.addEventListener("visibilitychange", onVisible);
          interval = setInterval(() => reg.update().catch(() => {}), UPDATE_CHECK_MS);
        })
        .catch((error) => console.error("Service worker registration failed:", error));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("visibilitychange", onVisible);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (interval) clearInterval(interval);
    };
  }, []);

  function applyUpdate() {
    if (!waiting) return;
    refreshing.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    // Fallback if the worker was already activated by another tab.
    setTimeout(() => {
      if (refreshing.current) window.location.reload();
    }, 3000);
  }

  const showUpdate = waiting !== null && !dismissed;
  if (online && !showUpdate) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[45] flex flex-col items-center gap-2 px-4 md:bottom-4 md:items-end">
      {!online ? (
        <p role="status" className="pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-surface-raised p-3 text-sm text-text-primary shadow-lg">
          {OFFLINE_MESSAGE}
        </p>
      ) : null}
      {showUpdate ? (
        <div role="status" aria-live="polite" className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised p-2 pl-3 text-sm text-text-primary shadow-lg">
          <span className="min-w-0">{UPDATE_MESSAGE}</span>
          <span className="flex shrink-0 items-center">
            <button type="button" onClick={() => setDismissed(true)} className="min-h-12 rounded-full px-3 text-[13px] font-semibold text-text-secondary">
              {UPDATE_LATER}
            </button>
            <button type="button" onClick={applyUpdate} className="min-h-12 rounded-full bg-accent-primary px-4 text-[13px] font-semibold text-background">
              {UPDATE_ACTION}
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
