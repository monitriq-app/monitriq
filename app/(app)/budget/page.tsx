import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getCurrentProfile } from "@/lib/supabase/get-current-profile";
import { createClient } from "@/lib/supabase/server";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { listMoneySpendingCategories } from "@/lib/domain/money/repository";
import { getBudgetCategoryStatus, getBudgetSummary, getBudgetUpcomingCommitments, listBudgets } from "@/lib/domain/budget/repository";
import { buildBudgetNav, resolveSelectedBudget, todayInTimezone } from "@/lib/domain/budget/presentation";
import { BudgetWorkspace } from "@/components/budget/BudgetWorkspace";

/**
 * Monitriq's Budget screen (P0-E5-S2). Every figure comes from the
 * canonical Budget read model (budget_summary, budget_category_status,
 * budget_upcoming_commitments); Money remains the only ledger and nothing
 * here totals Money events. Opening the page never creates a budget.
 */
export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ b?: string; quick?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { b, quick } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const today = todayInTimezone(profile?.timezone ?? "UTC");

  const [budgets, currencies, spendingCategories] = await Promise.all([listBudgets(supabase), listCurrencies(supabase), listMoneySpendingCategories(supabase)]);

  const selected = resolveSelectedBudget(budgets, { requestedId: b ?? null, today, preferredCurrency: profile?.preferred_currency ?? null });

  const detail = selected
    ? await Promise.all([getBudgetSummary(supabase, selected.id), getBudgetCategoryStatus(supabase, selected.id), getBudgetUpcomingCommitments(supabase, selected.id)])
    : null;

  return (
    <BudgetWorkspace
      nav={selected ? buildBudgetNav(budgets, selected) : null}
      summary={detail?.[0] ?? null}
      categories={detail?.[1] ?? []}
      commitments={detail?.[2] ?? []}
      currencies={currencies}
      spendingCategories={spendingCategories}
      defaultCurrencyCode={profile?.preferred_currency ?? null}
      today={today}
      openCreate={quick === "1"}
    />
  );
}
