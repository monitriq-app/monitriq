import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { CONFIRM_INVALID_BODY, CONFIRM_INVALID_TITLE } from "@/lib/auth/messages";

export const metadata: Metadata = { title: "Confirmation link", robots: { index: false, follow: false } };

/** Shown when /auth/confirm cannot verify a link. Never echoes provider errors. */
export default async function LinkInvalidPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const key = reason === "missing" || reason === "expired" ? reason : "invalid";

  return (
    <AuthCard title={CONFIRM_INVALID_TITLE} description={CONFIRM_INVALID_BODY[key]}>
      <ResendConfirmation buttonLabel="Send a new confirmation email" />
      <p className="mt-6 text-sm text-text-secondary">
        <Link href="/login" className="inline-flex min-h-12 items-center underline underline-offset-2 hover:text-text-primary">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
