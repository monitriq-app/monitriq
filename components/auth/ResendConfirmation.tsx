"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { RESENT_NOTICE, RESEND_COOLDOWN_SECONDS, RESEND_FAILED_NOTICE, RESEND_WAIT_NOTICE } from "@/lib/auth/messages";

interface ResendConfirmationProps {
  /** When known (just after signup / failed sign-in), the address is fixed; otherwise the user types it. */
  email?: string;
  /** Called by "Use a different email" on the post-signup screen. */
  onChangeEmail?: () => void;
  buttonLabel?: string;
}

/**
 * Sends a new confirmation email through Supabase Auth (the token authority;
 * Resend only delivers it). The reply is deliberately identical whether or
 * not the address has an account, so this cannot be used to probe accounts,
 * and a cooldown stops rapid repeat sends (Supabase also rate-limits server-side).
 */
export function ResendConfirmation({ email: knownEmail, onChangeEmail, buttonLabel = "Resend email" }: ResendConfirmationProps) {
  const [typedEmail, setTypedEmail] = useState("");
  const email = knownEmail ?? typedEmail;
  const [pending, setPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft]);

  async function resend(event?: FormEvent) {
    event?.preventDefault();
    if (pending || secondsLeft > 0 || !email.trim()) return;
    setPending(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (error) {
        setNotice(error.code === "over_email_send_rate_limit" || error.status === 429 ? RESEND_WAIT_NOTICE : RESEND_FAILED_NOTICE);
      } else {
        setNotice(RESENT_NOTICE);
      }
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    } catch {
      setNotice(RESEND_FAILED_NOTICE);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={resend} className="flex flex-col gap-3" noValidate>
      {knownEmail === undefined ? (
        <FormField label="Email" htmlFor="resend-email">
          <Input id="resend-email" name="email" type="email" autoComplete="email" required value={typedEmail} onChange={(e) => setTypedEmail(e.target.value)} />
        </FormField>
      ) : null}
      <Button type="submit" disabled={pending || secondsLeft > 0 || !email.trim()}>
        {pending ? "Sending…" : secondsLeft > 0 ? `${buttonLabel} in ${secondsLeft}s` : buttonLabel}
      </Button>
      {onChangeEmail ? (
        <Button type="button" variant="secondary" onClick={onChangeEmail}>
          Use a different email
        </Button>
      ) : null}
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-text-secondary">
        {notice}
      </p>
    </form>
  );
}
