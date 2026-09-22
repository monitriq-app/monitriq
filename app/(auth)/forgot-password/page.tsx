"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <AuthCard title="Check your email">
        <p className="text-sm text-text-secondary">
          If an account exists for <span className="text-text-primary">{email}</span>, we sent
          a link to reset your password.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" description="We'll email you a reset link.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-text-secondary">
        <Link href="/login" className="underline underline-offset-2 hover:text-text-primary">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
