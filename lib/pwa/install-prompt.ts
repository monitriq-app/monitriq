import type { InstallOffer } from "./install.ts";

/**
 * The ONLY thing ever written to device storage for the top install banner.
 * A bare epoch-millisecond timestamp — never a balance, account, budget
 * figure, user identity or Supabase session. See lib/pwa/install-prompt-store.ts.
 */
export const INSTALL_PROMPT_DISMISS_KEY = "monitriq_install_prompt_dismissed_at";

/** Centralized, easy to change (P0-E6-S1R3 spec: "Suggested reminder delay: 7 days"). */
export const INSTALL_PROMPT_REMINDER_DAYS = 7;
export const INSTALL_PROMPT_REMINDER_MS = INSTALL_PROMPT_REMINDER_DAYS * 24 * 60 * 60 * 1000;

/** Let the shell settle before the banner appears (avoids layout jank on first paint). */
export const INSTALL_PROMPT_SHOW_DELAY_MS = 1500;

export interface InstallPromptVisibilityInput {
  /** From installOffer() — already encodes standalone/in-app/eligibility; this module adds no second detector. */
  offer: InstallOffer;
  /** Persisted "Not now" (or declined-native-prompt) timestamp, or null if never dismissed. */
  dismissedAt: number | null;
  now: number;
  /** Dismissed earlier in this same tab session — must not reappear on the next navigation. */
  sessionDismissed: boolean;
  /** True once INSTALL_PROMPT_SHOW_DELAY_MS has elapsed since mount. */
  ready: boolean;
}

/**
 * Whether the top banner should be visible right now. Pure and DOM-free so
 * it is directly unit-testable; every actual browser signal (standalone,
 * platform, in-app webview) already lives inside `offer` via installOffer(),
 * so this function only adds the banner-specific concerns: first-show
 * timing and dismissal.
 */
export function shouldShowInstallPrompt(input: InstallPromptVisibilityInput): boolean {
  if (!input.ready) return false;
  if (input.offer === "none") return false;
  if (input.sessionDismissed) return false;
  if (input.dismissedAt !== null && input.now - input.dismissedAt < INSTALL_PROMPT_REMINDER_MS) return false;
  return true;
}
