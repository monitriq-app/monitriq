import { INSTALL_PROMPT_DISMISS_KEY } from "./install-prompt.ts";

/**
 * Dismissal state for the top install banner. Two layers, both holding
 * nothing but a timestamp:
 *  - an in-memory "dismissed this tab session" flag, so navigating between
 *    pages within the app never re-shows a banner the user just closed;
 *  - a `localStorage` timestamp (INSTALL_PROMPT_DISMISS_KEY) for the
 *    7-day reminder delay across visits. No financial data, no identity,
 *    no Supabase session — see lib/pwa/install-prompt.ts's doc comment.
 */
let sessionDismissed = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** "Not now", or a declined native install prompt — same reminder delay either way. */
export function dismissInstallPromptForSession(): void {
  sessionDismissed = true;
  try {
    window.localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, String(Date.now()));
  } catch {
    // Private browsing / storage blocked: the session-only flag above still applies for this tab.
  }
  notify();
}

/** A real install completed (native prompt accepted, or the browser's own `appinstalled` event) — never offer it again this session. */
export function markInstallPromptInstalled(): void {
  sessionDismissed = true;
  notify();
}

export function isInstallPromptSessionDismissed(): boolean {
  return sessionDismissed;
}

export function subscribeInstallPromptDismissal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readInstallPromptDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
