"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { CHECK_EMAIL_INTRO, CHECK_EMAIL_NEXT, CHECK_EMAIL_TITLE, friendlyAuthError } from "@/lib/auth/messages";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (signUpError) {
        setError(friendlyAuthError(signUpError, "signup"));
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <AuthCard title={CHECK_EMAIL_TITLE}>
        <p className="text-sm text-text-secondary">{CHECK_EMAIL_INTRO}</p>
        <p className="mt-1 break-all text-sm font-medium text-text-primary">{email}</p>
        <p className="mt-3 text-sm text-text-secondary">{CHECK_EMAIL_NEXT}</p>
        <div className="mt-6">
          <ResendConfirmation email={email} onChangeEmail={() => setSubmitted(false)} />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" description="Set up your Monitriq workspace.">
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
        <FormField label="Password" htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-2 hover:text-text-primary">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
