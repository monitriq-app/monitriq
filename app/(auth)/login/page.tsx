"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { friendlyAuthError } from "@/lib/auth/messages";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const linkFailed = useSearchParams().get("error") === "auth-callback-failed";
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setUnconfirmed(false);
    setPending(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(friendlyAuthError(signInError, "signin"));
        setUnconfirmed(signInError.code === "email_not_confirmed");
        return;
      }
      router.replace("/home");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="Sign in" description="Sign in to your Monitriq workspace.">
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        {linkFailed && !error ? (
          <p role="status" className="text-sm text-text-secondary">
            That link couldn&apos;t be used. Please request a new one.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {unconfirmed && email.trim() ? (
        <div className="mt-4">
          <ResendConfirmation email={email} buttonLabel="Send a new confirmation email" />
        </div>
      ) : null}
      <div className="mt-6 flex flex-col gap-1 text-sm text-text-secondary">
        <Link href="/forgot-password" className="underline underline-offset-2 hover:text-text-primary">
          Forgot your password?
        </Link>
        <p>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline underline-offset-2 hover:text-text-primary">
            Create one
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
