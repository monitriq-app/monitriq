import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/domain/profile/repository";
import { classifyVerifyError, parseConfirmType, postConfirmDestination, type ConfirmFailureReason } from "@/lib/auth/confirm";

/**
 * Email confirmation landing route (signup, and recovery links).
 *
 * The Supabase email template links here with `token_hash` + `type`, so the
 * one-time token is verified on the SERVER with the cookie-based SSR client:
 * the session cookies are written to this very response, and the browser
 * arrives at the next page already authenticated. Unlike the PKCE `?code=`
 * flow, this does not depend on a code-verifier cookie set by the browser
 * that started the signup, so it works when the link is opened in a
 * different browser, an in-app mail viewer, or the installed app.
 *
 * Never logs the token. Never shows raw provider errors: failures redirect
 * to a Monitriq screen.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parseConfirmType(searchParams.get("type"));

  const fail = (reason: ConfirmFailureReason) => redirectTo(origin, `/link-invalid?reason=${reason}`);

  if (!tokenHash || !type) {
    console.warn("[auth/confirm] rejected link", { reason: "missing", hasToken: Boolean(tokenHash), type: searchParams.get("type") });
    return fail("missing");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    console.warn("[auth/confirm] verification failed", { type, code: error.code, status: error.status });
    return fail(classifyVerifyError(error));
  }

  // Confirm the session really exists in this cookie context before moving on.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.error("[auth/confirm] verified but no session was established", { type });
    return fail("invalid");
  }

  let onboardingCompleted = false;
  try {
    // The profile row is created by the handle_new_user() trigger; only read it here.
    onboardingCompleted = (await getProfile(supabase))?.onboarding_completed === true;
  } catch (err) {
    console.error("[auth/confirm] profile read failed; defaulting to onboarding", { message: err instanceof Error ? err.message : "unknown" });
  }

  return redirectTo(origin, postConfirmDestination({ type, onboardingCompleted, next: searchParams.get("next") }));
}

function redirectTo(origin: string, path: string) {
  const response = NextResponse.redirect(`${origin}${path}`);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
