import { getCurrentProfile } from "@/lib/supabase/get-current-profile";

/**
 * Temporary implementation scaffolding, not the final Home design (see
 * docs/product/PRODUCT_DEFINITION.md #3 — Home is an aggregation layer
 * over Money/Assets/Goals/Decisions, none of which exist yet). By the time
 * a request reaches this page, app/(app)/layout.tsx has already guaranteed
 * a signed-in, onboarded user with a profile row.
 */
export default async function HomePage() {
  const profile = await getCurrentProfile();
  const preferredName = profile?.preferred_name || profile?.first_name || "there";

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold text-text-primary">Welcome, {preferredName}</h1>
      <p className="text-text-secondary">Your financial workspace is ready.</p>
      <p className="text-text-muted">No financial records yet.</p>
    </div>
  );
}
