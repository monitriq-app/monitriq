import { cn } from "@/lib/utils/cn";

interface BrandLogoProps {
  /** "mark" (icon only) or "wordmark" (icon + name). Both use the gradient mark, which reads correctly on light and dark surfaces alike — see docs/design/VISUAL_CONSTITUTION.md #2. */
  variant?: "mark" | "wordmark";
  className?: string;
}

/**
 * Renders the approved Monatriq gradient mark from public/brand — never
 * redraws it. Deliberately theme-agnostic: the gradient mark itself
 * doesn't need a light/dark variant, and "Monatriq" (when shown) uses the
 * semantic `text-text-primary` token, which already flips per theme — so
 * no client-side theme branching is needed just to render the logo.
 */
export function BrandLogo({ variant = "wordmark", className }: BrandLogoProps) {
  if (variant === "mark") {
    // eslint-disable-next-line @next/next/no-img-element -- static brand SVG, no optimization needed
    return <img src="/brand/monatriq-mark-gradient.svg" alt="Monatriq" className={className} />;
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG, no optimization needed */}
      <img src="/brand/monatriq-mark-gradient.svg" alt="" className="h-full w-auto" />
      <span className="font-semibold text-text-primary">Monatriq</span>
    </span>
  );
}
