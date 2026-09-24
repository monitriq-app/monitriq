import type { ReactNode } from "react";
import { HeaderBrand } from "@/components/layout/HeaderBrand";
import { PageContainer } from "@/components/layout/PageContainer";
import { DesktopNav } from "@/components/layout/DesktopNav";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { QuickAddProvider } from "@/components/quick-add/QuickAddProvider";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { listBuckets, listMoneyReceivedCategories, listMoneySpendingCategories, getBucketBalances } from "@/lib/domain/money/repository";

interface AppShellProps {
  children: ReactNode;
}

/**
 * Production authenticated shell (P0-E3-S2): sticky header (brand +
 * real page-context + desktop nav + account menu), content area, and a
 * fixed mobile bottom nav. Conceptual production navigation is Home/
 * Money/+/Assets/Decisions/Goals (docs/product/PRODUCT_DEFINITION.md
 * #3) — Financial Position/Rules/Receivables/Liabilities remain real
 * routes, surfaced from the account menu instead of primary navigation
 * (see AccountMenu.tsx). Header height is 64px (h-16) on every
 * breakpoint, matching the approved Home reference's own header
 * proportion (P0-E3-S2 gap-audit item [1]) — this shell is shared by
 * every (app) route, so the height applies everywhere, not just Home.
 * Bottom padding on <main> reserves room for the fixed mobile nav so
 * content is never hidden behind it.
 *
 * QuickAddProvider is mounted here, once, for the whole authenticated
 * shell (P0-E3-S3) — the shared bottom nav's central `+` must open real
 * Quick Add from any page, not just Money, so its sheet lives at this
 * level. It needs a small amount of real Money data (the user's own
 * buckets/balances/categories) up front to render its forms without a
 * loading flash; that's a deliberate, bounded cost on every
 * authenticated page load, not a redesign of any other page. It wraps
 * the ENTIRE shell, including the header — `DesktopNav`'s own Quick Add
 * trigger calls `useQuickAdd()` too, so the provider must be an
 * ancestor of the header, not just of `<main>`/`MobileBottomNav` (a real
 * "used outside its provider" crash on every page load, caught while
 * verifying an unrelated fix in a running dev server, not by build/
 * lint/typecheck/the Postgres test suite — none of which render this
 * component tree at request time for a dynamic route).
 */
export async function AppShell({ children }: AppShellProps) {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [buckets, balances, receivedCategories, spendingCategories] = user
    ? await Promise.all([listBuckets(supabase), getBucketBalances(supabase), listMoneyReceivedCategories(supabase), listMoneySpendingCategories(supabase)])
    : [[], [], [], []];

  return (
    <QuickAddProvider buckets={buckets} balances={balances} receivedCategories={receivedCategories} spendingCategories={spendingCategories}>
      <div className="flex min-h-dvh flex-col bg-background text-text-primary">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-[max(env(safe-area-inset-top),0px)] backdrop-blur">
          <PageContainer className="flex h-16 items-center justify-between gap-4">
            <HeaderBrand />
            <DesktopNav />
            <AccountMenu email={user?.email ?? null} />
          </PageContainer>
        </header>
        <main className="flex-1 pb-24 md:pb-8">
          <PageContainer className="py-6 md:py-8">{children}</PageContainer>
        </main>
        <MobileBottomNav />
      </div>
    </QuickAddProvider>
  );
}
