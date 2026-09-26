import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/get-current-user";
import { getLanguageMode } from "@/lib/supabase/get-language-mode";
import { terminology } from "@/lib/domain/language/terms";
import { listCurrencies } from "@/lib/domain/currency/repository";
import { getFinancialRuleSummaries, getSafeToDeployByCurrency } from "@/lib/domain/rules/repository";
import { getObligationSummaries } from "@/lib/domain/obligations/repository";
import { getGoalSummaries, getGoalBucketShortfalls } from "@/lib/domain/goals/repository";
import { listBuckets } from "@/lib/domain/money/repository";
import { SafeToDeployCard } from "@/components/rules/SafeToDeployCard";
import { MinimumCashSection } from "@/components/rules/MinimumCashSection";
import { CommitmentsSection } from "@/components/rules/CommitmentsSection";
import { CashUseEvaluatorForm } from "@/components/rules/CashUseEvaluatorForm";
import { ShortfallBanner } from "@/components/goals/ShortfallBanner";
import { BackLink } from "@/components/layout/BackLink";
import { MoreDetails } from "@/components/ui/MoreDetails";

/**
 * Monitriq's production Rules & Obligations screen (P0-E4-S3A). Answers
 * two plain questions: "What money do I want to keep protected?" and
 * "What payments or commitments are coming up?" — not "edit your
 * database configuration." Every figure reads from the existing,
 * unmodified Rules/Obligations domain (`getSafeToDeployByCurrency()`,
 * `getFinancialRuleSummaries()`, `getObligationSummaries()`) — no
 * calculation happens in this file. Decisions links here via "Set
 * Financial Rules"; saving a rule or a commitment here and returning to
 * Decisions shows the updated Safe to Deploy/Protected Cash/rule
 * relationships through those same shared reads — nothing is duplicated
 * client-side.
 */
export default async function RulesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { add } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const terms = terminology(await getLanguageMode());

  const [currencies, ruleSummaries, safeToDeploy, obligations, goals, buckets, shortfalls] = await Promise.all([
    listCurrencies(supabase),
    getFinancialRuleSummaries(supabase),
    getSafeToDeployByCurrency(supabase),
    getObligationSummaries(supabase),
    getGoalSummaries(supabase),
    listBuckets(supabase),
    getGoalBucketShortfalls(supabase),
  ]);

  const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const activeBuckets = buckets.filter((bucket) => !bucket.is_archived);

  return (
    <div className="flex flex-col gap-3.5">
      <BackLink />
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-primary" aria-hidden="true" />
          Rules &amp; Commitments
        </p>
        <p className="text-sm text-text-secondary">What money do you want to keep protected, and what&apos;s coming up?</p>
      </div>

      <ShortfallBanner shortfalls={shortfalls} currencies={currenciesByCode} />

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold text-text-primary">{terms.t("your_cash_heading")}</h2>
        <SafeToDeployCard results={safeToDeploy} currencies={currenciesByCode} terms={terms} />
      </section>

      <section className="flex flex-col gap-2.5">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">{terms.t("money_to_keep")}</h2>
          <p className="text-xs text-text-muted">{terms.t("money_to_keep_help")}</p>
        </div>
        <MinimumCashSection ruleSummaries={ruleSummaries} currencies={currencies} />
      </section>

      <CommitmentsSection defaultAdding={add === "commitment"} obligations={obligations} goals={goals} currencies={currencies} currenciesByCode={currenciesByCode} />

      {activeBuckets.length > 0 ? (
        <MoreDetails label="Advanced: test a cash use">
          <div className="rounded-xl bg-surface-raised p-4">
            <p className="mb-3 text-xs text-text-muted">See what would happen to your protected cash if you spent a specific amount from an account — nothing here actually spends anything.</p>
            <CashUseEvaluatorForm buckets={activeBuckets} />
          </div>
        </MoreDetails>
      ) : null}
    </div>
  );
}
