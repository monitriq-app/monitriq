"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { voidFinancialEvent } from "@/lib/domain/money/repository";

interface SuccessPanelProps {
  eventId: string;
  message: string;
  onDone: () => void;
}

const UNDO_WINDOW_SECONDS = 5;

/**
 * Real, canonically-backed Undo — not a fake action. Money's only
 * supported correction is voiding (financial_events.voided_at, an
 * append-only correction, never a delete — see docs/architecture/
 * FINANCIAL_DOMAIN_MODEL.md, "correction/voiding strategy"). Tapping
 * Undo within the window calls that exact same voidFinancialEvent()
 * used everywhere else in the app; after the countdown, the button
 * disappears rather than silently continuing to claim it can undo
 * something it no longer safely can.
 */
export function SuccessPanel({ eventId, message, onDone }: SuccessPanelProps) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(UNDO_WINDOW_SECONDS);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleUndo() {
    setUndoing(true);
    setError(null);
    try {
      const supabase = createClient();
      await voidFinancialEvent(supabase, eventId);
      setUndone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo this.");
    } finally {
      setUndoing(false);
    }
  }

  if (undone) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-strong text-text-secondary">
          <Undo2 size={28} aria-hidden="true" />
        </div>
        <p className="text-base font-semibold text-text-primary">Reversed</p>
        <p className="max-w-xs text-sm text-text-muted">This entry was voided and no longer counts in your balances or summaries.</p>
        <button type="button" onClick={onDone} className="mt-2 h-12 w-full rounded-full bg-accent-primary text-sm font-semibold text-background">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-primary/10 text-accent-primary">
        <CheckCircle2 size={32} aria-hidden="true" />
      </div>
      <p className="text-base font-bold text-text-primary">Activity recorded</p>
      <p className="max-w-xs text-sm text-accent-primary">{message}</p>

      <div className="mt-2 flex w-full items-center justify-between rounded-xl bg-surface-strong p-4">
        <div className="text-left">
          <p className="text-sm font-medium text-text-primary">Recorded by mistake?</p>
          <p className="text-xs text-text-muted">Undo reverses it immediately.</p>
        </div>
        {secondsLeft > 0 ? (
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoing}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-xs font-bold text-text-primary disabled:opacity-50"
          >
            {undoing ? "Undoing…" : `Undo (${secondsLeft}s)`}
            <Undo2 size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <button type="button" onClick={onDone} className="mt-1 h-12 w-full rounded-full bg-accent-primary text-sm font-semibold text-background">
        Done
      </button>
    </div>
  );
}
