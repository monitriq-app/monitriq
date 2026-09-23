import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PageContainer } from "@/components/layout/PageContainer";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { getCurrentUser } from "@/lib/supabase/get-current-user";

interface AppShellProps {
  children: ReactNode;
}

/**
 * Minimal authenticated shell: brand header + sign-out + content area.
 * This is scaffolding, not the final Home design — Home's real aggregation
 * layer belongs to a future domain phase (see
 * docs/architecture/SYSTEM_ARCHITECTURE.md #4).
 */
export async function AppShell({ children }: AppShellProps) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-text-primary">
      <header className="border-b border-border">
        <PageContainer className="flex items-center justify-between py-4">
          <div className="flex items-center gap-6">
            <BrandLogo variant="wordmark" className="h-6 w-auto" />
            <nav className="flex items-center gap-4 text-sm text-text-secondary">
              <Link href="/home" className="hover:text-text-primary">
                Home
              </Link>
              <Link href="/money" className="hover:text-text-primary">
                Money
              </Link>
              <Link href="/assets" className="hover:text-text-primary">
                Assets
              </Link>
              <Link href="/receivables" className="hover:text-text-primary">
                Receivables
              </Link>
              <Link href="/liabilities" className="hover:text-text-primary">
                Liabilities
              </Link>
              <Link href="/goals" className="hover:text-text-primary">
                Goals
              </Link>
              <Link href="/rules" className="hover:text-text-primary">
                Rules
              </Link>
              <Link href="/decisions" className="hover:text-text-primary">
                Decisions
              </Link>
              <Link href="/financial-position" className="hover:text-text-primary">
                Financial Position
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm text-text-secondary">
            {user?.email ? <span>{user.email}</span> : null}
            <SignOutButton />
          </div>
        </PageContainer>
      </header>
      <main className="flex-1">
        <PageContainer className="py-8">{children}</PageContainer>
      </main>
    </div>
  );
}
