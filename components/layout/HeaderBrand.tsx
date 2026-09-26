import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * Shared authenticated header brand (P0-E3-S1D): the approved Monitriq
 * logo only. The previous "current page name" label under the brand was
 * removed — it duplicated the active state the bottom navigation (mobile)
 * and DesktopNav (tablet/desktop) already show, and every page renders its
 * own real heading in its content. Because this component is the single
 * shared header for every (app) route, no per-page exception exists.
 */
export function HeaderBrand() {
  return (
    <Link href="/home" className="flex shrink-0 items-center" aria-label="Monitriq Home">
      <BrandLogo variant="wordmark" className="h-8 w-auto" />
    </Link>
  );
}
