/** Customer-facing auth copy. Raw provider errors are never shown in the UI. */

export const RESEND_COOLDOWN_SECONDS = 60;

export const CONFIRM_INVALID_TITLE = "This confirmation link is no longer valid";
export const CONFIRM_INVALID_BODY: Record<"missing" | "expired" | "invalid", string> = {
  missing: "This link looks incomplete. Request a new confirmation email and use the link in that message.",
  expired: "It may have expired or already been used. Send yourself a new confirmation email to continue.",
  invalid: "It may have expired or already been used. Send yourself a new confirmation email to continue.",
};

export const CHECK_EMAIL_TITLE = "Check your email";
export const CHECK_EMAIL_INTRO = "We sent a confirmation link to:";
export const CHECK_EMAIL_NEXT = "Confirm your email to continue setting up Monitriq.";
export const RESENT_NOTICE = "If that address is waiting for confirmation, a new email is on its way.";
export const RESEND_WAIT_NOTICE = "Please wait a moment before requesting another email.";
export const RESEND_FAILED_NOTICE = "We couldn't send the email right now. Please try again shortly.";

interface AuthErrorLike {
  code?: string;
  status?: number;
}

export type AuthErrorKind = "signup" | "signin";

/** Maps a Supabase auth error to friendly copy that never echoes provider text. */
export function friendlyAuthError(error: AuthErrorLike | null | undefined, kind: AuthErrorKind): string {
  const code = error?.code ?? "";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error?.status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (code === "weak_password") return "Choose a stronger password (at least 8 characters).";
  if (kind === "signin") {
    if (code === "email_not_confirmed") return "Please confirm your email before signing in.";
    if (code === "invalid_credentials") return "That email and password don't match. Please try again.";
    return "We couldn't sign you in. Please try again.";
  }
  return "We couldn't create your account. Please check your details and try again.";
}
