import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Framework-level authenticated + onboarded route boundary. This improves
 * UX (no flash of protected content, clean redirects) — it is NOT the
 * security boundary for financial data. That is database Row Level
 * Security (see docs/security/SECURITY_AND_RLS_PRINCIPLES.md).
 *
 * Two distinct gates, per docs/product/PRODUCT_DEFINITION.md
 * ("authenticated != fully onboarded"):
 *   1. No session at all -> /login.
 *   2. A session but profiles.onboarding_completed is false -> /onboarding.
 *
 * `redirect()` is used deliberately rather than conditionally omitting
 * `children`: Next.js can render a layout and the page segment it wraps
 * concurrently, so a layout that just returns different JSX without
 * calling redirect()/notFound() does not reliably stop the nested page
 * from also rendering. redirect() throws a signal the router handles
 * before any concurrently-rendered segment's output is used.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return <AppShell>{children}</AppShell>;
}
