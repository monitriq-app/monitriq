import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { createClient } from "@/lib/supabase/server";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { AuthCard } from "@/components/auth/AuthCard";
import { resolveLanguageMode } from "@/lib/domain/language/types";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

/**
 * Authenticated but not-yet-onboarded state. Distinct from the (app) route
 * group on purpose — a signed-in user without a complete profile has not
 * yet earned the full AppShell (see docs/product/PRODUCT_DEFINITION.md,
 * "Authenticated != fully onboarded").
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile();
  if (profile?.onboarding_completed) {
    redirect("/home");
  }

  const supabase = await createClient();
  const currencies = await listCurrencies(supabase);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <AuthCard
        title="Set up your workspace"
        description="A few details before you get started."
      >
        <OnboardingForm
          currencies={currencies}
          initial={{
            first_name: profile?.first_name ?? "",
            preferred_name: profile?.preferred_name ?? "",
            preferred_currency: profile?.preferred_currency ?? "",
            timezone: profile?.timezone ?? "",
            financial_language_mode: resolveLanguageMode(profile?.financial_language_mode),
          }}
        />
      </AuthCard>
    </div>
  );
}
