import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#071820",
    theme_color: "#071820",
    icons: [
      { src: "/brand/monatriq-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/monatriq-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
