import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const NO_TIMEZONES: string[] = [];
const NO_DETECTED_TIMEZONE = "";

/**
 * `Intl.supportedValuesOf("timeZone")`/`Intl.DateTimeFormat().resolvedOptions()`
 * are browser capability reads, not an external MUTABLE store — they
 * never change during the page's lifetime, so useSyncExternalStore's
 * `subscribe` is a genuine no-op here (there is nothing to subscribe to).
 * A prior bug here was never "useSyncExternalStore is the wrong tool"; it
 * was that getSnapshot called `Intl.supportedValuesOf` directly, which
 * allocates a BRAND-NEW array on every call — useSyncExternalStore
 * requires getSnapshot to return a referentially stable value when
 * nothing has changed (via Object.is), so React saw a "different"
 * snapshot on every render and re-rendered forever ("Maximum update
 * depth exceeded" / "the result of getServerSnapshot should be cached").
 * The fix is exactly what that warning says: cache it. Each snapshot is
 * computed at most once (module-level cache, populated lazily on first
 * client call) and the same array/string reference is returned on every
 * subsequent call, satisfying the stability contract correctly instead
 * of working around it. getServerSnapshot stays the fixed empty
 * fallback, so the server-rendered and first client-rendered HTML are
 * identical — no hydration mismatch. `Intl.supportedValuesOf` doesn't
 * exist in every runtime (older Safari, some server/edge runtimes), so
 * its absence, and any exception either call might throw, safely fall
 * back to the empty list/string rather than crashing; OnboardingForm
 * still injects the user's own detected/saved zone as a selectable
 * option even if it's not in the full list, so onboarding still
 * completes in that case, without a second hardcoded timezone registry.
 *
 * Kept in a plain, JSX-free module (rather than inline in
 * OnboardingForm.tsx) so this logic — the exact thing that was buggy —
 * can be exercised directly in a real React-DOM render test without
 * needing a JSX/TSX transform pipeline. See docs/reports/
 * P0-E3-S2-home-command-center-production-ui.txt for how this was
 * verified (a scratch jsdom + react-dom/client harness, not a permanent
 * addition to the Supabase-backed test suite).
 */
let cachedTimezones: string[] | null = null;
function getSupportedTimezonesSnapshot(): string[] {
  if (cachedTimezones === null) {
    try {
      cachedTimezones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : NO_TIMEZONES;
    } catch {
      cachedTimezones = NO_TIMEZONES;
    }
  }
  return cachedTimezones;
}

export function useSupportedTimezones(): string[] {
  return useSyncExternalStore(noopSubscribe, getSupportedTimezonesSnapshot, () => NO_TIMEZONES);
}

let cachedDetectedTimezone: string | null = null;
function getDetectedTimezoneSnapshot(): string {
  if (cachedDetectedTimezone === null) {
    try {
      cachedDetectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      cachedDetectedTimezone = NO_DETECTED_TIMEZONE;
    }
  }
  return cachedDetectedTimezone;
}

export function useDetectedTimezone(): string {
  return useSyncExternalStore(noopSubscribe, getDetectedTimezoneSnapshot, () => NO_DETECTED_TIMEZONE);
}
