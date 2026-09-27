import { detectPlatform, isInAppBrowser, isStandalone, type Platform } from "./install.ts";

export interface InstallEnvSnapshot {
  standalone: boolean;
  platform: Platform;
  inApp: boolean;
}

/**
 * Reads the browser's real install-relevant signals once. Both
 * InstallSection (profile menu) and InstallBanner (top-shell prompt) read
 * from this SAME function — one detector, not two that could drift apart
 * (P0-E6-S1R3: "reuse the existing iOS device detection architecture").
 * DOM-only, not unit-tested directly — detectPlatform/isInAppBrowser/
 * isStandalone (the pure logic it calls) are what the test suite exercises
 * against fixed inputs.
 */
export function snapshotInstallEnv(): string {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const standalone = isStandalone({ matchesStandalone: window.matchMedia("(display-mode: standalone)").matches, iosStandalone: nav.standalone });
  const platform = detectPlatform({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints });
  const inApp = isInAppBrowser(nav.userAgent);
  const env: InstallEnvSnapshot = { standalone, platform, inApp };
  return JSON.stringify(env);
}
