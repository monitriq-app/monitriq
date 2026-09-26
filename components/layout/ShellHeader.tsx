"use client";

import { useRef, useState } from "react";
import { Menu } from "lucide-react";
import { HeaderBrand } from "@/components/layout/HeaderBrand";
import { PageContainer } from "@/components/layout/PageContainer";
import { DesktopNav } from "@/components/layout/DesktopNav";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { NavDrawer } from "@/components/layout/NavDrawer";

interface ShellHeaderProps {
  displayName: string | null;
  email: string | null;
  preferredCurrency: string | null;
}

type Overlay = "drawer" | "profile" | null;

/**
 * Sticky app header: [menu] [Monitriq] ........ [profile]. Owns which single
 * overlay is open so the navigation drawer and the profile menu can never be
 * open together. The drawer is rendered as a SIBLING of <header>, not inside
 * it: the header's backdrop-blur would otherwise become the containing block
 * of the drawer's fixed positioning.
 */
export function ShellHeader({ displayName, email, preferredCurrency }: ShellHeaderProps) {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  function closeDrawer({ restoreFocus }: { restoreFocus: boolean }) {
    setOverlay(null);
    if (restoreFocus) menuButtonRef.current?.focus();
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-[max(env(safe-area-inset-top),0px)] backdrop-blur">
        <PageContainer className="flex h-14 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Open navigation"
              aria-haspopup="dialog"
              aria-expanded={overlay === "drawer"}
              onClick={() => setOverlay((o) => (o === "drawer" ? null : "drawer"))}
              className="-ml-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:text-text-primary"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <HeaderBrand />
          </div>
          <DesktopNav />
          <AccountMenu
            displayName={displayName}
            email={email}
            preferredCurrency={preferredCurrency}
            open={overlay === "profile"}
            onOpenChange={(next) => setOverlay(next ? "profile" : null)}
          />
        </PageContainer>
      </header>
      {overlay === "drawer" ? <NavDrawer onClose={closeDrawer} /> : null}
    </>
  );
}
