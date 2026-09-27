/**
 * Post-auth redirects may only ever land on approved INTERNAL routes. A
 * `next` value from a query string is untrusted input: `//evil.example`,
 * `https://evil.example`, `/\evil.example`, `@evil.example` and
 * `javascript:` must never be followed.
 */
const APPROVED_PATHS = [
  "/home",
  "/money",
  "/budget",
  "/goals",
  "/assets",
  "/liabilities",
  "/receivables",
  "/decisions",
  "/financial-position",
  "/rules",
  "/spending-check",
  "/onboarding",
  "/update-password",
] as const;

const PLACEHOLDER_ORIGIN = "http://internal.invalid";

/** Returns an approved internal pathname (no query, no fragment), or `fallback`. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PLACEHOLDER_ORIGIN) return fallback;

  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  const approved = APPROVED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  return approved ? path : fallback;
}
