"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export function SignOutButton({ className, subtle = false }: { className?: string; subtle?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const label = pending ? "Signing out…" : "Sign out";

  // The profile menu uses the quiet text style so Sign out is findable but not the menu's primary action.
  if (subtle) {
    return (
      <button type="button" onClick={handleSignOut} disabled={pending} className={`flex min-h-12 w-full items-center rounded-md px-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:opacity-50 ${className ?? ""}`}>
        {label}
      </button>
    );
  }

  return (
    <Button variant="secondary" onClick={handleSignOut} disabled={pending} className={className}>
      {label}
    </Button>
  );
}
