"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { categoryMeta } from "@/lib/domain/assets/category-meta";
import type { AssetType, AssetTypeCode } from "@/lib/domain/assets/types";

interface AssetTypeSelectorProps {
  assetTypes: AssetType[];
  value: AssetTypeCode | "";
  onChange: (code: AssetTypeCode) => void;
}

/**
 * A real horizontal carousel, not just `overflow-x-auto` on a flex row —
 * a prior pass assumed hiding the native scrollbar was sufficient and
 * manual QA disproved it. The structure deliberately separates the
 * SCROLL OWNER (this component's outer viewport — `overflow-x-auto`,
 * `min-w-0` so it's allowed to shrink below its content's natural width)
 * from the TRACK (`w-max min-w-full` — grows past the viewport when
 * content demands it, never the reverse) so chips (`shrink-0
 * whitespace-nowrap`) can never compress to fit, which is what caused
 * the earlier "some types are simply unreachable" defect: a bare flex
 * row with no `min-w-0` on its scroll ancestor lets the browser shrink
 * flex children instead of actually overflowing/scrolling in some
 * layouts. Left/right controls exist because the native scrollbar is
 * intentionally hidden — desktop pointer users need a visible way to
 * discover there's more; they render ONLY when there is real overflow in
 * that direction (`canScrollLeft`/`canScrollRight`, computed from actual
 * `scrollLeft`/`scrollWidth`, not assumed) and never change the selected
 * type, only the scroll position.
 */
export function AssetTypeSelector({ assetTypes, value, onChange }: AssetTypeSelectorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, assetTypes.length]);

  // Scrolls the newly-selected chip fully into view — handles the case
  // where the user taps/keys a chip that is only partially visible.
  useEffect(() => {
    if (!value) return;
    const el = viewportRef.current?.querySelector<HTMLElement>(`[data-asset-type="${value}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [value]);

  function scrollByStep(direction: 1 | -1) {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.7), behavior: "smooth" });
  }

  return (
    <div className="flex items-center gap-1">
      {canScrollLeft ? (
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          aria-label="Previous asset types"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary transition hover:text-text-primary"
        >
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
      ) : null}

      <div className="relative min-w-0 flex-1">
        {canScrollLeft ? <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-surface-raised to-transparent" /> : null}
        {canScrollRight ? <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-surface-raised to-transparent" /> : null}

        <div ref={viewportRef} className="no-scrollbar relative min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x">
          <div className="flex w-max min-w-full gap-1.5 px-4">
            {assetTypes.map((t) => {
              const meta = categoryMeta(t.code as AssetTypeCode);
              const active = value === t.code;
              return (
                <button
                  key={t.code}
                  type="button"
                  data-asset-type={t.code}
                  onClick={() => onChange(t.code as AssetTypeCode)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    active ? "bg-accent-primary text-background" : "bg-surface-strong text-text-secondary"
                  }`}
                >
                  <meta.Icon size={14} aria-hidden="true" />
                  {t.display_name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {canScrollRight ? (
        <button
          type="button"
          onClick={() => scrollByStep(1)}
          aria-label="More asset types"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary transition hover:text-text-primary"
        >
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
