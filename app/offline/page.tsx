import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { OFFLINE_DETAIL, OFFLINE_MESSAGE, OFFLINE_RETRY, OFFLINE_TITLE } from "@/lib/pwa/messages";

export const metadata: Metadata = { title: "Offline", robots: { index: false, follow: false } };

/**
 * The only page the service worker ever caches. It is public, static and
 * contains no user data: shown instead of a page when the network is
 * unavailable, so stale financial information is never presented as current.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-[max(3rem,env(safe-area-inset-top))] text-center">
      <BrandLogo variant="wordmark" className="h-10 w-auto" />
      <div className="flex max-w-sm flex-col items-center gap-3">
        <WifiOff size={28} className="text-text-secondary" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-text-primary">{OFFLINE_TITLE}</h1>
        <p className="text-base text-text-primary">{OFFLINE_MESSAGE}</p>
        <p className="text-sm text-text-muted">{OFFLINE_DETAIL}</p>
      </div>
      {/* A plain link to the current URL: the worker serves this page at whatever URL was requested, and offline its JS chunks may not have loaded, so retry must not depend on hydration. */}
      <a href="" className="inline-flex h-12 items-center rounded-full bg-accent-primary px-6 text-sm font-semibold text-background">
        {OFFLINE_RETRY}
      </a>
    </main>
  );
}
