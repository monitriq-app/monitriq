import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Shown instead of the authenticated shell when no Supabase project is
 * connected yet, so an unconfigured environment fails in a controlled way
 * rather than crashing (docs/security/SECURITY_AND_RLS_PRINCIPLES.md,
 * "no Supabase project assumption").
 */
export function ConfigurationNotice() {
  return (
    <div className="flex min-h-dvh items-center bg-background">
      <PageContainer className="max-w-lg text-center">
        <h1 className="text-lg font-semibold text-text-primary">Not configured</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Monitriq isn&apos;t connected to a Supabase project yet. Copy{" "}
          <code>.env.example</code> to <code>.env.local</code> and add your project
          URL and anon key to continue.
        </p>
      </PageContainer>
    </div>
  );
}
