"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface MoreDetailsProps {
  children: ReactNode;
  /** Defaults to "More details" — the one standardized label for this pattern across the app (P0-E4-S2). Only override when a screen-specific label is genuinely clearer (e.g. "Sale details"). */
  label?: string;
  defaultOpen?: boolean;
}

/**
 * The ONE progressive-disclosure control Monatriq uses for optional/
 * advanced financial detail (P0-E4-S2) — never a screen-by-screen mix of
 * "More" / "Advanced" / "Details" / "Show extras". A plain button + a
 * conditionally-rendered region rather than the native `<details>`
 * element: native `<details>` cannot be smoothly restyled to match the
 * app's existing button/disclosure visual language (ChevronDown rotation,
 * shared spacing) without fighting default UA styles, and every other
 * expand/collapse control in this codebase (ManageCashSection,
 * AvailableCashSection) already uses this same button+state shape — this
 * keeps the pattern consistent with established precedent rather than
 * introducing a second disclosure mechanism. `aria-expanded` on the
 * trigger and a real DOM removal/insertion (not just a CSS hide) when
 * collapsed keeps it announced correctly by assistive tech; the trigger
 * is a real `<button>` so it is keyboard-reachable and activatable with
 * Enter/Space with no extra wiring.
 *
 * The button's visible box stays compact (h-9, 36px) to match the app's
 * existing text-link-style disclosure controls, but its actual hit target
 * is widened to the 48px minimum via a `::before` pseudo-element positioned
 * to extend 6px beyond the button's top/bottom edges (P0-E4-S2A) — the
 * pseudo-element is a hit-testable descendant box of the button itself, so
 * pointer/tap events landing in that extra 6px still fire the button's
 * onClick; it carries no visible styling, so the compact appearance is
 * unchanged. Keyboard activation (Enter/Space) is unaffected either way.
 */
export function MoreDetails({ children, label = "More details", defaultOpen = false }: MoreDetailsProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="relative flex h-9 items-center gap-1 text-[13px] font-semibold text-text-secondary transition before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] hover:text-text-primary"
      >
        {open ? "Hide details" : label}
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
