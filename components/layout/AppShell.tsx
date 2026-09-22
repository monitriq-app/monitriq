import type { ReactNode } from "react";
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
          <BrandLogo variant="wordmark" className="h-6 w-auto" />
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
