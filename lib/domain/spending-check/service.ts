import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import { evaluateProposedCashUse, getSafeToDeployByCurrency } from "../rules/repository.ts";
import { getBudgetFactsForDate, listBudgets } from "../budget/repository.ts";
import { todayInTimezone } from "../budget/presentation.ts";
import { getProfile } from "../profile/repository.ts";
import { composeSpendingCheck } from "./policy.ts";
import type { SpendingCheckInput, SpendingCheckResult } from "./types.ts";

type Client = SupabaseClient<Database>;

/**
 * The single entry point for "Can I afford this?". Pure reads only — it
 * calls evaluate_proposed_cash_use() (which validates that the account
 * belongs to the caller and writes nothing), safe_to_deploy_by_currency()
 * and budget_facts_for_date(); it never records Money Spent, changes a
 * Budget, Goal, obligation or rule, or creates a Decision.
 */
export async function runSpendingCheck(client: Client, input: SpendingCheckInput): Promise<SpendingCheckResult> {
  const evaluation = await evaluateProposedCashUse(client, input.bucketId, input.amount);
  const currencyCode = evaluation.currencyCode;

  // Budget impact must come from the ACTIVE Budget only. budget_facts_for_date() returns any
  // non-archived Budget covering the date (active or closed) and does not expose its status, so the
  // status is read from the existing Budget repository and a closed Budget is ignored, never
  // silently used as if it were the current plan.
  const profile = await getProfile(client);
  const onDate = input.onDate ?? todayInTimezone(profile?.timezone ?? "UTC");

  const [safe, safeHypothetical, allFacts, budgets] = await Promise.all([
    getSafeToDeployByCurrency(client),
    getSafeToDeployByCurrency(client, { bucketId: input.bucketId, delta: `-${input.amount}` }),
    getBudgetFactsForDate(client, { currencyCode, onDate, categoryCode: input.categoryCode ?? undefined }),
    listBudgets(client),
  ]);

  const coveringId = allFacts[0]?.budgetId;
  const covering = coveringId ? budgets.find((b) => b.id === coveringId) : undefined;
  const isActive = covering?.status === "active";
  const budgetFacts = isActive ? allFacts : [];
  const inactiveBudget = covering && !isActive ? { id: covering.id, status: covering.status } : null;

  return composeSpendingCheck({
    currencyCode,
    amount: input.amount,
    categoryCode: input.categoryCode ?? null,
    categoryLabel: input.categoryLabel ?? null,
    evaluation,
    safeBefore: safe.find((s) => s.currencyCode === currencyCode) ?? null,
    safeAfter: safeHypothetical.find((s) => s.currencyCode === currencyCode) ?? null,
    budgetFacts,
    inactiveBudget,
  });
}
