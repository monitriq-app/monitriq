/**
 * "Good morning/afternoon/evening" derived from the user's own profile
 * timezone (falling back to UTC when unset) — never the server's local
 * time. Presentational only, not a financial calculation.
 */
export function timeOfDayGreeting(timezone: string | null, now: Date = new Date()): "morning" | "afternoon" | "evening" {
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone ?? "UTC",
  }).format(now);
  const hour = Number(formatted) % 24;

  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
