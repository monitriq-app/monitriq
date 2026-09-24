"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateReceivable } from "@/lib/domain/receivables/repository";
import { useQuickAdd } from "@/components/quick-add/QuickAddContext";

/** Real, existing mutation — updateReceivable({ lastFollowUpAt }) — the same field the "Follow-Up Not Set" signal reads (ReceivableSummary.lastFollowUpAt). */
export function LogFollowUpButton({ receivableId }: { receivableId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const supabase = createClient();
      await updateReceivable(supabase, receivableId, { lastFollowUpAt: new Date().toISOString() });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="flex h-9 items-center rounded-full bg-surface-strong px-3.5 text-[13px] font-semibold text-text-primary transition hover:bg-surface-strong/70 disabled:opacity-50"
    >
      {pending ? "Logging…" : "Log Follow-Up"}
    </button>
  );
}

/**
 * Opens the SAME real Quick Add sheet Money already uses, pre-navigated
 * to its "Money Received" flow — where the user picks the "Receivable
 * Recovery" chip themselves (P0-E3-S3's own real, dedicated
 * recordRecovery() routing). No second recovery form is built here — this
 * is the canonical flow's only entry point, reused, not duplicated.
 */
export function RecordRecoveryButton() {
  const { open, goTo } = useQuickAdd();

  return (
    <button
      type="button"
      onClick={() => {
        open();
        goTo("received");
      }}
      className="flex h-9 items-center rounded-full bg-accent-primary px-4 text-[13px] font-semibold text-background"
    >
      Record Recovery
    </button>
  );
}
