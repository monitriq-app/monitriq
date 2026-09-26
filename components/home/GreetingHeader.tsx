interface GreetingHeaderProps {
  preferredName: string | null;
  timeOfDay: "morning" | "afternoon" | "evening";
}

/**
 * Uses the authenticated user's own preferred/first name — falls back to
 * a neutral greeting when absent. Never hardcodes a person's name. See
 * docs/product/PRODUCT_DEFINITION.md and the P0-E3-S2 report's "Dynamic
 * user" section. Visually a contained card panel (the reference's "Top
 * Command Greeting Banner"), with an avatar showing the user's own
 * initial — the only reference element deliberately dropped is the
 * duplicated brand-name pill next to the subtitle (would triple the
 * brand name on one screen with no real data behind the third instance);
 * see the P0-E3-S2 report's strict-replication addendum for the full list
 * of reference elements without a real Monitriq equivalent. The ambient
 * corner glow (P0-E3-S2 gap-audit item [2]) is purely decorative — a
 * static, very low-opacity (5%) accent-colored blur, never animated,
 * never a glass/backdrop-blur effect — kept subtle enough to read
 * correctly in both Dark and Light without affecting text contrast.
 */
export function GreetingHeader({ preferredName, timeOfDay }: GreetingHeaderProps) {
  const salutation = `Good ${timeOfDay}`;
  const initial = preferredName ? preferredName.charAt(0).toUpperCase() : null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-raised p-4">
      <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-accent-primary/5 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-primary" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Monitriq</span>
          </div>
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-text-primary">
            {salutation}
            {preferredName ? `, ${preferredName}` : ""}
          </h1>
          <p className="mt-0.5 text-xs text-text-secondary">Here&apos;s where you stand today.</p>
        </div>
        {initial ? (
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-strong">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted">
              <span className="text-sm font-bold text-accent-primary">{initial}</span>
            </div>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-accent-primary ring-2 ring-surface-raised" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
