import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Framework-level authenticated route boundary. This improves UX (no
 * flash of protected content, clean redirect to /login) — it is NOT the
 * security boundary for financial data. That is database Row Level
 * Security, established when the data layer exists (see
 * docs/security/SECURITY_AND_RLS_PRINCIPLES.md).
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

  return <AppShell>{children}</AppShell>;
}
