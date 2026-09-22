import { getCurrentUser } from "@/lib/supabase/get-current-user";

/**
 * Temporary implementation scaffolding, not the final Home design (see
 * docs/product/PRODUCT_DEFINITION.md #3 — Home is an aggregation layer
 * over Money/Assets/Goals/Decisions, none of which exist yet).
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  const preferredName =
    (user?.user_metadata?.preferred_name as string | undefined) ?? user?.email ?? "there";

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold text-text-primary">Welcome, {preferredName}</h1>
      <p className="text-text-secondary">Your financial workspace is ready.</p>
      <p className="text-text-muted">No financial records yet.</p>
    </div>
  );
}
