"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface SheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The bottom-sheet wrapper used by Create Budget / Add Commitment,
 * extracted for the Goals, Debts and Money Owed flows (P0-E5-S2B). Same
 * geometry (max-w-md, rounded top, safe-area bottom padding), labelled
 * dialog, Escape to close, and a real 48px close target.
 */
export function Sheet({ title, subtitle, onClose, children }: SheetProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="mx-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 shrink-0 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-6 text-text-primary">{title}</h3>
            {subtitle ? <p className="text-xs text-text-muted">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-text-secondary" aria-label="Close">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong">
              <X size={18} aria-hidden="true" />
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SheetError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

export const primaryButtonClass = "h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50";
export const secondaryButtonClass = "h-12 rounded-full bg-surface-strong text-sm font-semibold text-text-primary disabled:opacity-50";
