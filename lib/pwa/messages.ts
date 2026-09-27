/** User-facing PWA copy (kept in one place so tests and UI cannot drift). */
export const OFFLINE_TITLE = "You’re offline";
export const OFFLINE_MESSAGE = "You’re offline. Reconnect to refresh your financial information.";
export const OFFLINE_DETAIL = "Monitriq doesn’t store your financial information on this device, so nothing is shown while you’re offline.";
export const OFFLINE_RETRY = "Try again";

export const UPDATE_MESSAGE = "An update is available.";
export const UPDATE_ACTION = "Refresh";
export const UPDATE_LATER = "Later";

export const INSTALL_TITLE = "Install Monitriq";
export const INSTALL_HELP = "Add Monitriq to your device for quicker access.";
export const INSTALL_ACTION = "Install Monitriq";
export const IOS_INSTALL_STEPS = "Tap Share, then Add to Home Screen.";

/** Top-shell install banner (P0-E6-S1R3) — deliberately plain, same in every language mode (see section 16 of the P0-E6-S1 report). */
export const INSTALL_BANNER_TITLE = "Install Monitriq";
export const INSTALL_BANNER_BODY = "Get quicker access from your Home Screen.";
export const INSTALL_BANNER_NOT_NOW = "Not now";
export const INSTALL_BANNER_INSTALL = "Install";

/** The iOS Add to Home Screen instruction sheet, opened from the banner's Install button. */
export const IOS_SHEET_TITLE = "Install Monitriq";
export const IOS_SHEET_STEPS: readonly string[] = ["Tap the Share button in your browser.", 'Choose "Add to Home Screen".', 'Tap "Add".'];
export const IOS_SHEET_FOOTER = "Then launch Monitriq from the new Home Screen icon.";
export const IOS_SHEET_DISMISS = "Got it";
