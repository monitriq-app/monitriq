/**
 * Install-experience logic, kept pure so it can be tested without a browser.
 * Rules: never offer install inside an installed app; Android/Chromium only
 * when the browser really exposes the install prompt; iOS only gets the Add to
 * Home Screen guidance (and never Android wording); nothing shown elsewhere.
 *
 * iOS guidance is a PLATFORM decision, not a Safari-only one (P0-E6-S1R1).
 * Apple requires every iOS browser — Safari, Chrome (CriOS), Firefox
 * (FxiOS), Edge (EdgiOS), Brave, DuckDuckGo, ... — to use the shared
 * WebKit engine, so they all reach "Add to Home Screen" the same way:
 * the OS-level Share sheet. detectPlatform() below therefore reads the
 * DEVICE (iPhone/iPad UA, or the iPadOS Mac-UA + touch heuristic), never
 * the browser name, and installOffer() offers ios_guide to every iOS
 * browser except a denylisted in-app webview. Do not narrow this to a
 * Safari user-agent check.
 */
export type Platform = "ios" | "android" | "desktop" | "other";

export interface PlatformInput {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

export function detectPlatform(input: PlatformInput): Platform {
  const ua = input.userAgent;
  // Every iOS browser's UA identifies the device this way, regardless of
  // engine wrapper — CriOS/FxiOS/EdgiOS all keep "iPhone"/"iPad"/"iPod".
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // iPadOS 13+ reports a Mac user agent for ANY browser (Safari, Chrome,
  // Firefox, Edge, ...); touch support is what tells a real iPad apart
  // from a desktop Mac, not the browser name.
  if ((input.platform === "MacIntel" || /Macintosh/.test(ua)) && (input.maxTouchPoints ?? 0) > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return "desktop";
  return "other";
}

/**
 * In-app webviews (Instagram, Facebook, ...) cannot reliably reach the
 * system Share sheet / Add to Home Screen, on iOS or Android, so install
 * guidance is hidden there. This is a denylist of known-broken embedded
 * webviews — it is NOT how ordinary iOS browsers (Safari, Chrome, Firefox,
 * Edge, ...) are told apart; those are all allowed by default.
 */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|Snapchat|LinkedInApp/.test(userAgent);
}

export interface StandaloneInput {
  matchesStandalone: boolean;
  /**
   * The non-standard `navigator.standalone`, exposed by WebKit on iOS to
   * every browser (not just Safari). It reads true once the app is
   * launched from a home-screen icon, however that icon was added.
   */
  iosStandalone?: boolean;
}

export function isStandalone(input: StandaloneInput): boolean {
  return input.matchesStandalone || input.iosStandalone === true;
}

export type InstallOffer = "none" | "prompt" | "ios_guide";

export function installOffer(input: { standalone: boolean; platform: Platform; hasPrompt: boolean; inAppBrowser: boolean }): InstallOffer {
  if (input.standalone) return "none";
  if (input.hasPrompt) return "prompt";
  if (input.platform === "ios" && !input.inAppBrowser) return "ios_guide";
  return "none";
}
