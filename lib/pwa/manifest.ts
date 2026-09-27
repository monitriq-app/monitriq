import { siteConfig, themeColors } from "../config/site.ts";

/**
 * The web app manifest (served by app/manifest.ts at /manifest.webmanifest).
 * One manifest for every user and every language mode: the explanation
 * preference is profile-backed and never affects installation. Orientation is
 * deliberately not locked.
 */
export interface PwaManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  background_color: string;
  theme_color: string;
  lang: string;
  categories: string[];
  icons: { src: string; sizes: string; type: string; purpose?: "any" | "maskable" }[];
}

export function buildManifest(): PwaManifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: themeColors.dark,
    theme_color: themeColors.dark,
    lang: "en",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/brand/monitriq-app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/monitriq-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/monitriq-app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
