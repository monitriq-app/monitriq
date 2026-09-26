"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface BackLinkProps {
  /** Where to go when there is no in-app history to return to (e.g. the page was opened directly). */
  fallbackHref?: string;
  label?: string;
}

/**
 * Shared Back control for secondary routes that are not in the primary
 * navigation (Debts, Money Owed to You, Rules). Returns to the previous
 * Monitriq screen when there is history within this site, otherwise goes
 * to a safe app destination. 48px target; focus ring comes from the global
 * :focus-visible style.
 */
export function BackLink({ fallbackHref = "/home", label = "Back" }: BackLinkProps) {
  const router = useRouter();

  function goBack() {
    const sameSiteReferrer = document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
    if (window.history.length > 1 && sameSiteReferrer) router.back();
    else router.push(fallbackHref);
  }

  return (
    <button type="button" onClick={goBack} aria-label={`${label} to previous screen`} className="-mb-1 flex min-h-12 w-fit items-center gap-1 rounded-full pr-4 text-sm font-medium text-text-secondary hover:text-text-primary">
      <ChevronLeft size={18} aria-hidden="true" />
      {label}
    </button>
  );
}
