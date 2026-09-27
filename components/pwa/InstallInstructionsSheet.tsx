"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IOS_SHEET_DISMISS, IOS_SHEET_FOOTER, IOS_SHEET_STEPS, IOS_SHEET_TITLE } from "@/lib/pwa/messages";

/**
 * The iOS "Add to Home Screen" instruction sheet, opened from InstallBanner
 * when Install is tapped on any iOS browser. iOS has no programmatic
 * install API, so this is guidance only, never a fake install action.
 */
export function InstallInstructionsSheet({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-sheet-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-lg outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="install-sheet-title" className="text-lg font-semibold text-text-primary">
            {IOS_SHEET_TITLE}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-muted hover:text-text-primary">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <ol className="mt-4 flex flex-col gap-3 text-sm text-text-primary">
          {IOS_SHEET_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-xs font-semibold text-accent-primary">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-text-secondary">{IOS_SHEET_FOOTER}</p>
        <button type="button" onClick={onClose} className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-accent-primary text-sm font-semibold text-background hover:opacity-90">
          {IOS_SHEET_DISMISS}
        </button>
      </div>
    </div>
  );
}
