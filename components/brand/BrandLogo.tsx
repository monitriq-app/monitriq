type BrandLogoVariant = "wordmark" | "mark";

const SOURCES: Record<BrandLogoVariant, string> = {
  wordmark: "/brand/monatriq-logo-white.svg",
  mark: "/brand/monatriq-mark-gradient.svg",
};

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  className?: string;
}

/** Renders an approved Monatriq brand asset from public/brand. Never redraws the mark. */
export function BrandLogo({ variant = "wordmark", className }: BrandLogoProps) {
  // eslint-disable-next-line @next/next/no-img-element -- static brand SVG, no optimization needed
  return <img src={SOURCES[variant]} alt="Monatriq" className={className} />;
}
