export const siteConfig = {
  name: "Monitriq",
  description: "Know today. Go further.",
} as const;

/**
 * Canonical shell colours for browser/PWA chrome. They are the existing brand
 * tokens (docs/reference/brand/brand-tokens.css): --monitriq-obsidian is the
 * dark app background, --monitriq-warm-off-white the light one. A test keeps
 * these in step with the token file. No new palette.
 */
export const themeColors = {
  dark: "#071820",
  light: "#F8F7F2",
} as const;
