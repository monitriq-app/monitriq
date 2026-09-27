/**
 * Install-experience logic, kept pure so it can be tested without a browser.
 * Rules: never offer install inside an installed app; Android/Chromium only
 * when the browser really exposes the install prompt; iOS only gets the Add to
 * Home Screen guidance (and never Android wording); nothing shown elsewhere.
 */
export type Platform = "ios" | "android" | "desktop" | "other";

export interface PlatformInput {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

export function detectPlatform(input: PlatformInput): Platform {
  const ua = input.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // iPadOS 13+ Safari reports a Mac user agent; touch support tells it apart.
  if ((input.platform === "MacIntel" || /Macintosh/.test(ua)) && (input.maxTouchPoints ?? 0) > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return "desktop";
  return "other";
}

/** In-app webviews (Instagram, Facebook, ...) cannot Add to Home Screen. */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|Snapchat|LinkedInApp/.test(userAgent);
}

export interface StandaloneInput {
  matchesStandalone: boolean;
  /** iOS Safari's non-standard navigator.standalone. */
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
