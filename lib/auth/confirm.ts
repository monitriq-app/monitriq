import { safeNextPath } from "./redirects.ts";

/** Email one-time-link types the /auth/confirm route accepts. */
export const CONFIRM_TYPES = ["email", "signup", "recovery"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export function parseConfirmType(value: string | null | undefined): ConfirmType | null {
  return (CONFIRM_TYPES as readonly string[]).includes(value ?? "") ? (value as ConfirmType) : null;
}

export type ConfirmFailureReason = "missing" | "expired" | "invalid";

/**
 * Supabase reports an expired token and an already-used token identically
 * (`otp_expired`), so both are presented as "no longer valid".
 */
export function classifyVerifyError(error: { code?: string; status?: number } | null | undefined): ConfirmFailureReason {
  if (error?.code === "otp_expired") return "expired";
  return "invalid";
}

interface DestinationInput {
  type: ConfirmType;
  onboardingCompleted: boolean;
  next?: string | null;
}

/**
 * Where a successfully verified user goes next. An incomplete profile always
 * goes to onboarding (the canonical first-run destination) regardless of any
 * `next`; a completed one goes to an approved `next` or Home.
 */
export function postConfirmDestination({ type, onboardingCompleted, next }: DestinationInput): string {
  if (type === "recovery") return "/update-password";
  if (!onboardingCompleted) return "/onboarding";
  return safeNextPath(next, "/home");
}
