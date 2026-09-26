import { cn } from "@/lib/utils/cn";

interface BrandLogoProps {
  /** "mark" (icon only) or "wordmark" (the approved horizontal Monitriq logo). See docs/reference/brand/BRAND.md. */
  variant?: "mark" | "wordmark";
  className?: string;
}

/**
 * Renders the approved Monitriq brand-pack artwork from public/brand,
 * exactly as supplied — never redrawn, recolored, or typed out as text.
 * The wordmark variant swaps between two SUPPLIED files (dark wordmark for
 * the light theme, white wordmark for the dark theme) purely with CSS
 * against the `data-theme` attribute next-themes already sets on <html>
 * (same mechanism as lib/styles/tokens.css), so no client-side theme
 * branching is needed.
 */
export function BrandLogo({ variant = "wordmark", className }: BrandLogoProps) {
  if (variant === "mark") {
    // eslint-disable-next-line @next/next/no-img-element -- static brand SVG, no optimization needed
    return <img src="/brand/monitriq-mark-transparent.svg" alt="Monitriq" className={cn("object-contain", className)} />;
  }

  return (
    <span className={cn("inline-flex items-center", className)}>
      {/* Dark theme (default): white-wordmark logo. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG, no optimization needed */}
      <img
        src="/brand/monitriq-logo-horizontal-white-transparent.svg"
        alt="Monitriq"
        className="h-full w-auto [[data-theme=light]_&]:hidden"
      />
      {/* Light theme: dark-wordmark logo. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG, no optimization needed */}
      <img
        src="/brand/monitriq-logo-horizontal-transparent.svg"
        alt="Monitriq"
        className="hidden h-full w-auto [[data-theme=light]_&]:block"
      />
    </span>
  );
}
