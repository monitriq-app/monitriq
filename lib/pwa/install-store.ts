/**
 * Holds the browser's deferred install prompt (Chromium fires
 * beforeinstallprompt once, early) so the profile menu can use it later.
 * Module-level store read with useSyncExternalStore; holds no user data.
 */
export interface DeferredInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: DeferredInstallPrompt | null = null;
const listeners = new Set<() => void>();

export function setDeferredInstallPrompt(event: DeferredInstallPrompt | null): void {
  deferred = event;
  listeners.forEach((l) => l());
}

export function getDeferredInstallPrompt(): DeferredInstallPrompt | null {
  return deferred;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
