/**
 * Everyday money language + cash warning states (P0-E5-S4A). Pure policy
 * tests for the centralized warning policy, DB-backed tests proving the
 * statuses are derived from the UNCHANGED canonical Rules engine (real
 * safe_to_deploy_by_currency() rows, per currency), and source-level checks
 * for wording, colour semantics and "no second calculation".
 */
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { Decimal } from "decimal.js";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert } from "../shared/assert.ts";
import { updateProfile } from "../../../lib/domain/profile/repository.ts";
import { listCurrencies } from "../../../lib/domain/currency/repository.ts";
import { createBucket, recordOpeningBalance } from "../../../lib/domain/money/repository.ts";
import { createGoal, recordGoalAllocation } from "../../../lib/domain/goals/repository.ts";
import { createFinancialRule, getSafeToDeployByCurrency } from "../../../lib/domain/rules/repository.ts";
import { runSpendingCheck } from "../../../lib/domain/spending-check/service.ts";
import { presentSpendingCheck, SUGGESTION_TONE } from "../../../lib/domain/spending-check/presentation.ts";
import { formatAmount } from "../../../lib/domain/common/presentation.ts";
import { WARNING_ZONE_FRACTION, cashStatus, cashStatusSentence, type CashStatusInput } from "../../../lib/domain/rules/cash-status.ts";
import * as L from "../../../lib/domain/rules/labels.ts";
import { terminology } from "../../../lib/domain/language/terms.ts";
import { todayInTimezone } from "../../../lib/domain/budget/presentation.ts";

const AT = `${todayInTimezone("UTC").slice(0, 7)}-01T12:00:00Z`;
const src = (f: string) => readFileSync(f, "utf8");
const D = (v: string | null | undefined) => new Decimal(v ?? "NaN");
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));
const visible = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const row = (required: string | null, safe: string | null, deficit: string | null, liquid = "0", status = "calculated"): CashStatusInput => ({ status, liquidCash: liquid, requiredRetainedCash: required, safeToDeploy: safe, retainedDeficit: deficit });
const fmtN = (v: string) => `NGN ${new Decimal(v).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

async function main() {
  const env = loadTestEnv();
  const fx = await setupFixtures(env, "cash-status");
  const c = fx.userA.client;
  const runner = new TestRunner();
  try {
    console.log("Monitriq everyday language + cash warning states\n");
    await updateProfile(c, { timezone: "UTC", preferred_currency: "NGN" });
    const currencies = new Map((await listCurrencies(c)).map((x) => [x.code, x]));

    // ---------------- POLICY (pure) ----------------
    await runner.run("1/2/3/4/5 the five states: comfortable, getting close, at your limit, below your limit (retained deficit), needs setup", async () => {
      assert(cashStatus(row("500000", "350200", "0", "850200")).state === "comfortable", "comfortable");
      const close = cashStatus(row("500000", "80000", "0", "580000"));
      assert(close.state === "getting_close" && close.tone === "attention" && close.label === "Getting close" && close.headroom === "80000", JSON.stringify(close));
      const limit = cashStatus(row("500000", "0", "0", "500000"));
      assert(limit.state === "at_limit" && limit.tone === "attention" && limit.label === "At your limit", "at limit");
      const below = cashStatus(row("500000", "0", "40000", "460000"));
      assert(below.state === "below_limit" && below.tone === "danger" && below.shortfall === "40000" && below.label === "Below your limit", "below");
      const none = cashStatus(row(null, null, null, "850200", "not_configured"));
      assert(none.state === "needs_setup" && none.tone === "attention" && none.headroom === null && none.label === "Needs setup", "needs setup");
      assert(cashStatus(row("500000", "0", "40000", "460000")).state === "below_limit" && cashStatus(row("500000", "0", "1", "499999")).state === "below_limit", "any retained deficit is below the limit");
    });

    await runner.run("8/9/10 the 25% boundary: at or below 25% of the protected amount is 'Getting close'; just above is 'Comfortable'; just below stays 'Getting close'", async () => {
      assert(WARNING_ZONE_FRACTION === "0.25", "single documented constant");
      const at = cashStatus(row("500000", "125000", "0", "625000"));
      const above = cashStatus(row("500000", "125000.01", "0", "625000.01"));
      const below = cashStatus(row("500000", "124999.99", "0", "624999.99"));
      assert(at.state === "getting_close", "exactly 25% is inside the warning zone");
      assert(above.state === "comfortable", "just above 25% is comfortable");
      assert(below.state === "getting_close", "just below 25% is getting close");
      assert(cashStatus(row("500000", "625000", "0", "1125000")).state === "comfortable", "well above");
      assert(cashStatus(row("500000", "80000", "0"), "0.5").state === "getting_close" && cashStatus(row("500000", "200000", "0"), "0.5").state === "getting_close" && cashStatus(row("500000", "260000", "0"), "0.5").state === "comfortable", "the zone comes from one policy constant that can become configurable");
    });

    await runner.run("7 an explicit zero amount to keep: no percentage zone; positive cash neutral, zero cash attention, negative cash factual", async () => {
      const pos = cashStatus(row("0", "125000", "0", "125000"));
      assert(pos.state === "comfortable" && pos.tone === "neutral" && pos.nothingProtected, JSON.stringify(pos));
      assert(/haven't asked Monitriq to protect/.test(cashStatusSentence(pos, fmtN)), "plain sentence, not 'comfortably above the amount you keep'");
      const zero = cashStatus(row("0", "0", "0", "0"));
      assert(zero.state === "at_limit" && zero.tone === "attention" && zero.nothingProtected, "zero cash is worth attention");
      const negative = cashStatus(row("0", "0", "3000", "-3000"));
      assert(negative.state === "below_limit" && negative.tone === "danger" && negative.shortfall === "3000", "negative cash stays factual (red)");
    });

    await runner.run("11/12/13 per currency: NGN comfortable and USD needs setup are independent; nothing is combined", async () => {
      const ngn = cashStatus(row("500000", "350200", "0", "850200"));
      const usd = cashStatus(row(null, null, null, "1200", "not_configured"));
      assert(ngn.state === "comfortable" && usd.state === "needs_setup", "independent statuses");
      assert(/export function cashStatus\(input: CashStatusInput,/.test(src("lib/domain/rules/cash-status.ts")), "the policy takes ONE currency's row");
      assert(!/reduce|sum\(|\.plus\(|\.minus\(/.test(visible("lib/domain/rules/cash-status.ts")), "no cross-currency aggregation and no protection arithmetic");
    });

    await runner.run("14/17 no wealth-based status: the same relative situation gives the same status at any scale; big balances can be below limit, small ones comfortable", async () => {
      const small = cashStatus(row("500", "100", "0", "600"));
      const huge = cashStatus(row("5000000000", "1000000000", "0", "6000000000"));
      assert(small.state === "getting_close" && huge.state === "getting_close", "same ratio, same status");
      assert(cashStatus(row("50000000", "0", "1000000", "49000000")).state === "below_limit", "NGN 49M can still be below the user's own limit");
      assert(cashStatus(row("1000", "99000", "0", "100000")).state === "comfortable" && cashStatus(row("10", "100", "0", "110")).state === "comfortable", "small amounts can be comfortable");
      assert(!/liquidCash/.test(visible("lib/domain/rules/cash-status.ts").replace(/liquidCash: string;/g, "").replace(/\/\*[\s\S]*?\*\//g, "")), "liquid cash itself never drives the state");
    });

    await runner.run("Sentences match the spec, including the Home warning example and the after-purchase variants", async () => {
      const close = cashStatus(row("500000", "80000", "0", "580000"));
      assert(cashStatusSentence(close, fmtN) === "You have NGN 80,000 left before reaching the amount you're keeping protected.", "default");
      assert(cashStatusSentence(close, fmtN, "home") === "Only NGN 80,000 remains before you reach the amount you're keeping protected.", "home example");
      assert(cashStatusSentence(cashStatus(row("500000", "350200", "0")), fmtN) === "You're comfortably above the amount you want to keep protected.", "comfortable");
      assert(cashStatusSentence(cashStatus(row("500000", "0", "0")), fmtN) === "Your cash has reached the amount you're keeping protected.", "at limit");
      assert(cashStatusSentence(cashStatus(row("500000", "0", "40000")), fmtN) === "Your cash is NGN 40,000 below the amount you chose to keep protected.", "below");
      assert(cashStatusSentence(cashStatus(row(null, null, null, "0", "not_configured")), fmtN) === "Choose the minimum amount of cash you want to keep so Monitriq can warn you before you reach it.", "needs setup");
      assert(cashStatusSentence(close, fmtN, "after_purchase") === "This would leave NGN 80,000 above the amount you want to keep protected.", "after purchase, getting close");
      assert(cashStatusSentence(cashStatus(row("500000", "0", "20000")), fmtN, "after_purchase") === "This purchase would leave you NGN 20,000 below the amount you chose to keep.", "after purchase, below");
      assert(!/spend freely|safe to spend|emergency/i.test(["comfortable", "at_limit", "below_limit"].map((k) => cashStatusSentence(cashStatus(k === "comfortable" ? row("500000", "350200", "0") : k === "at_limit" ? row("500000", "0", "0") : row("500000", "0", "1")), fmtN)).join(" ")), "no permission or alarm language");
      assert(L.AVAILABLE_ABOVE_HELP === "Money left above the amount currently being protected." && !/safely spend/i.test(L.AVAILABLE_ABOVE_HELP), "Available above that never promises it is safe to spend");
    });

    // ---------------- CANONICAL ENGINE (DB) ----------------
    const world = async (code: string, cash: string, floor: string | null) => {
      const b = (await createBucket(c, { name: `${code} Bank`, currencyCode: code, bucketType: "bank_account" })).id;
      await recordOpeningBalance(c, { bucketId: b, amount: cash, occurredAt: AT });
      if (floor !== null) await createFinancialRule(c, { ruleType: "minimum_cash_floor", currencyCode: code, thresholdValue: floor });
      return b;
    };
    const canonical = async (code: string) => (await getSafeToDeployByCurrency(c)).find((r) => r.currencyCode === code)!;
    const statusOf = async (code: string) => {
      const r = await canonical(code);
      return { r, s: cashStatus({ status: r.status, liquidCash: r.liquidCash, requiredRetainedCash: r.requiredRetainedCash, safeToDeploy: r.safeToDeploy, retainedDeficit: r.retainedDeficit }) };
    };

    const ngn = await world("NGN", "580000", "500000");
    await runner.run("Home warning example from real canonical rows: cash 580,000, protecting 500,000 -> Available above that 80,000, Getting close (amber)", async () => {
      const { r, s } = await statusOf("NGN");
      assert(D(r.liquidCash).eq(580000) && D(r.requiredRetainedCash).eq(500000) && D(r.safeToDeploy).eq(80000), JSON.stringify(r));
      assert(s.state === "getting_close" && s.tone === "attention" && s.headroom === r.safeToDeploy, "status from the engine's own figures");
    });

    await runner.run("6/16/20/21 the engine's math is unchanged and nothing is double counted: required = MAX(minimum, goals + uncovered), available = MAX(cash - required, 0)", async () => {
      const goal = await createGoal(c, { goalTypeCode: "emergency_reserve", measurementType: "cash_target", name: "Reserve", currencyCode: "NGN", targetValue: "1000000", isProtected: true });
      await recordGoalAllocation(c, { goalId: goal.id, bucketId: ngn, amount: "300000" });
      let r = await canonical("NGN");
      assert(D(r.protectedCommitments).eq(300000) && D(r.requiredRetainedCash).eq(500000), `minimum 500,000 already covers 300,000 of goals: required stays 500,000 (not 800,000), got ${r.requiredRetainedCash}`);
      assert(D(r.safeToDeploy).eq(80000), "available unchanged by covered goals");
      await recordGoalAllocation(c, { goalId: goal.id, bucketId: ngn, amount: "250000" });
      r = await canonical("NGN");
      const expectedRequired = Decimal.max(D(r.minimumCashFloor), D(r.protectedCommitments));
      assert(D(r.requiredRetainedCash).eq(expectedRequired) && D(r.requiredRetainedCash).eq(550000), `required = max(500,000, 550,000) = 550,000, got ${r.requiredRetainedCash}`);
      assert(D(r.safeToDeploy).eq(Decimal.max(D(r.liquidCash).minus(expectedRequired), 0)) && D(r.safeToDeploy).eq(30000), "available = max(cash - required, 0)");
      assert(D(r.retainedDeficit).eq(Decimal.max(expectedRequired.minus(D(r.liquidCash)), 0)) && D(r.retainedDeficit).eq(0), "deficit = max(required - cash, 0)");
      const s = (await statusOf("NGN")).s;
      assert(s.state === "getting_close" && s.headroom === "30000.000000", "status follows the canonical figures");
    });

    await world("USD", "1200", null);
    await world("ZAR", "500", "500");
    await world("EUR", "300", "500");
    await world("AUD", "2000", "500");
    await runner.run("1/3/4/6/11/12/13 each currency has its own status from its own canonical row: AUD comfortable, ZAR at limit, EUR below limit (deficit), USD needs setup, NGN getting close", async () => {
      const st = Object.fromEntries(await Promise.all(["NGN", "USD", "ZAR", "EUR", "AUD"].map(async (k) => [k, (await statusOf(k)).s]))) as Record<string, Awaited<ReturnType<typeof statusOf>>["s"]>;
      assert(st.AUD.state === "comfortable" && st.ZAR.state === "at_limit" && st.EUR.state === "below_limit" && st.USD.state === "needs_setup" && st.NGN.state === "getting_close", Object.entries(st).map(([k, v]) => `${k}:${(v as { state: string }).state}`).join(" "));
      assert(D(st.EUR.shortfall).eq(200), "EUR shortfall is the engine's retained deficit");
      assert(st.USD.headroom === null, "USD without a rule shows no amount and never 'Comfortable'");
    });

    // ---------------- SPENDING CHECK ----------------
    const zar = await world("SEK", "580000", "500000");
    await runner.run("17 Spending Check: same policy on the canonical hypothetical row - cash 580,000, keep 500,000, spend 40,000 -> Getting close, 'would leave 40,000 above'; crossing the limit -> Below your limit", async () => {
      const ok = await runSpendingCheck(c, { bucketId: zar, amount: "40000", description: "Phone" });
      assert(ok.protection.statusAfter.state === "getting_close" && D(ok.protection.protectingAfter).eq(500000) && D(ok.protection.statusAfter.headroom).eq(40000), JSON.stringify(ok.protection.statusAfter));
      const v = presentSpendingCheck(ok, "Phone", currencies);
      const prow = v.rows.find((x) => x.key === "protected")!;
      assert(prow.cashStatus?.result.label === "Getting close" && /This would leave SEK 40,000 above the amount you want to keep protected\./.test(prow.cashStatus?.sentence ?? ""), prow.cashStatus?.sentence ?? "");
      assert(prow.lines.some((l) => l.label === "Money Monitriq is protecting (after)" && l.value === "SEK 500,000") && prow.lines.some((l) => l.label === "All your SEK cash after this purchase" && l.value === "SEK 540,000"), JSON.stringify(prow.lines));
      const cross = await runSpendingCheck(c, { bucketId: zar, amount: "100000", description: "Laptop" });
      assert(cross.protection.statusAfter.state === "below_limit" && D(cross.protection.statusAfter.shortfall).eq(20000), JSON.stringify(cross.protection.statusAfter));
      const cv = presentSpendingCheck(cross, "Laptop", currencies).rows.find((x) => x.key === "protected")!;
      assert(/This purchase would leave you SEK 20,000 below the amount you chose to keep\./.test(cv.cashStatus!.sentence) && cv.lines.find((l) => l.label === "Available above that (after)")!.tone === "danger", "below-limit wording and red value");
      const safeAfter = (await getSafeToDeployByCurrency(c, { bucketId: zar, delta: "-100000" })).find((r) => r.currencyCode === "SEK")!;
      assert(D(safeAfter.retainedDeficit).eq(20000), "the canonical hypothetical row is the source of the status");
    });

    await runner.run("Spending Check without an amount to keep: 'Needs setup' with the plain sentence and the 'Set amount to keep' action; the suggestion policy is unchanged", async () => {
      const usdBucket = (await c.from("cash_buckets").select("id").eq("currency_code", "USD").single()).data!.id;
      const r = await runSpendingCheck(c, { bucketId: usdBucket, amount: "100" });
      assert(r.protection.statusAfter.state === "needs_setup" && r.suggestion.state === "review", "same review-first outcome as before");
      const prow = presentSpendingCheck(r, "", currencies).rows.find((x) => x.key === "protected")!;
      assert(prow.status === "Needs setup" && prow.action?.label === "Set amount to keep" && /Choose the minimum amount of cash you want to keep/.test(prow.note ?? ""), JSON.stringify(prow));
      assert(SUGGESTION_TONE.wait === "danger" && SUGGESTION_TONE.review === "attention" && SUGGESTION_TONE.proceed === "positive", "tones");
    });

    // ---------------- LANGUAGE / SURFACES ----------------
    await runner.run("1/2/3 everyday terms are defined once, exactly as specified; the protecting-whichever-is-higher sentence is present", async () => {
      assert(L.CASH_YOU_HAVE === "Cash you have" && L.MONEY_YOU_WANT_TO_KEEP === "Money you want to keep" && L.MONEY_YOU_WANT_TO_KEEP_HELP === "The lowest amount you want your cash to reach.", "cash / keep");
      assert(L.MONEY_MONITRIQ_IS_PROTECTING === "Money Monitriq is protecting" && L.AVAILABLE_ABOVE_THAT === "Available above that" && L.AVAILABLE_ABOVE_WHATS_PROTECTED === "Available above what's protected", "protecting / available");
      assert(L.MONEY_SET_ASIDE_FOR_GOALS === "Money set aside for goals" && L.MONEY_SET_ASIDE_FOR_GOALS_AND_PAYMENTS === "Money set aside for goals and upcoming payments", "set aside");
      assert(L.PROTECTION_EXPLAINER === "Monitriq protects whichever amount is higher, so the same money is not counted twice." && L.SET_AMOUNT_TO_KEEP_ACTION === "Set amount to keep" && L.HOW_WORKED_OUT === "See how this is worked out", "explainer / action");
    });

    await runner.run("18/19 no 'Safe to Deploy', 'Available after protections', 'cash buffer', 'cash floor', 'liquidity reserve', 'illiquid assets', 'Minimum Cash Floor', 'Required Retained Cash', 'Protected Commitments' or foundation-level copy in user-facing screens or the simple vocabulary (technical wording lives only in the Financial-terms vocabulary, tested in the language suite)", async () => {
      const files = [...walk("app/(app)"), ...walk("components"), "lib/domain/decisions/presentation.ts", "lib/domain/rules/labels.ts"];
      const literal = /(["'`>])[^"'`<>\n]*(Safe to [Dd]eploy|Available after protections|cash buffer|cash floor|liquidity reserve|illiquid|Minimum Cash Floor|Minimum Cash to Keep|Required Retained|Retained Cash|Protected Commitments|deployable|Foundation-level|not the final design)[^"'`<>\n]*/i;
      for (const f of files) assert(!literal.test(visible(f).replace(/safeToDeploy\w*|safe_to_deploy\w*|SafeToDeploy\w*/g, "")), `${f}: technical wording in user-facing text`);
      assert(/safe_to_deploy_by_currency/.test(src("lib/domain/rules/repository.ts")), "canonical internal names unchanged");
    });

    await runner.run("15 Home: 'Available above what's protected' (Simple), the amount in the status colour, a status chip with a sentence, 'Set amount to keep' when not configured, and the explanation from canonical fields", async () => {
      const h = src("components/home/PositionSection.tsx");
      assert(/terms\.t\("available_above_alone"\)/.test(h) && /terms\.t\("cash"\)/.test(h) && /<CashStatusBadge/.test(h) && /cashStatusSentence\(st, fmtHere, "home", terms\.mode\)/.test(h) && /terms\.t\("set_amount_action"\)/.test(h), "tile wording comes from the vocabulary");
      assert(/moneyYouWantToKeep=\{p\.minimumCashFloor/.test(h) && /setAside=\{fmtHere\(p\.protectedCommitments/.test(h) && /protecting=\{fmtHere\(p\.requiredRetainedCash/.test(h) && /available=\{fmtHere\(p\.safeToDeploy/.test(h), "canonical fields");
      const ex = src("components/rules/AvailableExplanation.tsx");
      assert(/availableExplanationCopy/.test(ex) && /MoreDetails/.test(ex) && !/Decimal|Math\.max|\.plus\(|\.minus\(|Number\(/.test(ex), "explanation is text over canonical values, no MAX() for normal users");
      assert(L.AVAILABLE_ABOVE_WHATS_PROTECTED === terminology("simple").t("available_above_alone") && L.CASH_YOU_HAVE === terminology("simple").t("cash") && L.SET_AMOUNT_TO_KEEP_ACTION === terminology("simple").t("set_amount_action"), "Simple vocabulary keeps the S4A wording");
    });

    await runner.run("16 Rules & Commitments: 'Your cash' with Cash you have / Money Monitriq is protecting / Available above that (Simple), a status chip, 'Money you want to keep' and 'Upcoming payments'", async () => {
      const card = src("components/rules/SafeToDeployCard.tsx");
      for (const t of ['terms.t("cash")', 'terms.t("protecting")', 'terms.t("available_above")', 'terms.t("available_help")', "CashStatusBadge", "AvailableExplanation"]) assert(card.includes(t), `rules card missing ${t}`);
      assert(/r\.requiredRetainedCash/.test(card) && !/Decimal|\.plus\(|\.minus\(/.test(card), "protecting figure is the canonical required retained cash");
      const page = src("app/(app)/rules/page.tsx");
      assert(/terms\.t\("your_cash_heading"\)/.test(page) && /terms\.t\("money_to_keep"\)/.test(page) && /terms\.t\("money_to_keep_help"\)/.test(page), "page headings from the vocabulary");
      assert(/terms\.t\("upcoming_payments"\)/.test(src("components/rules/CommitmentsSection.tsx")), "Upcoming payments from the vocabulary");
      const simple = terminology("simple");
      assert(simple.t("your_cash_heading") === "Your cash" && simple.t("money_to_keep_help") === "The lowest amount you want your cash to reach." && simple.t("upcoming_payments") === "Upcoming payments", "Simple wording");
    });

    await runner.run("14 Money: the cash card shows the warning state (not for 'Needs setup'), read from the canonical Rules rows", async () => {
      const m = src("components/money/AvailableCashSection.tsx");
      assert(/cashStatus\(/.test(m) && /"money"/.test(m) && /!== "needs_setup"/.test(m) && /CashStatusBadge/.test(m), "money card wiring");
      assert(/getSafeToDeployByCurrency/.test(src("app/(app)/money/page.tsx")) && /cashRules=\{cashRules\}/.test(src("app/(app)/money/page.tsx")), "page passes canonical rows");
    });

    await runner.run("Financial Overview: no foundation-level copy; labels come from the vocabulary with the technical concept kept as advanced detail", async () => {
      const page = src("app/(app)/financial-position/page.tsx");
      assert(!/Foundation-level view/.test(visible("app/(app)/financial-position/page.tsx")) && /Everything you have and owe, in one place\./.test(page), "foundation copy removed");
      const ov = src("components/financial-position/NativePositionList.tsx");
      for (const t of ['terms.t("non_cash_assets")', 'terms.t("debts_you_owe")', 'terms.t("money_owed_to_you_total")', 'terms.t("convertible_to_cash")', 'terms.t("protecting")', 'terms.t("available_above")', "cashStatus("]) assert(ov.includes(t), `overview missing ${t}`);
      assert(terminology("simple").t("non_cash_assets") === "Money tied up in assets" && terminology("simple").t("debts_you_owe") === "Debts you owe" && terminology("simple").t("convertible_to_cash").startsWith("Money that may be convertible to cash"), "Simple wording");
    });

    await runner.run("Home avoids 'illiquid assets' in Simple: tied-up wording, neutral cash, amber wrapping badge", async () => {
      const cd = src("components/home/CapitalDistributionSection.tsx");
      assert(/terms\.t\("tied_up_badge"\)/.test(cd) && /terms\.t\("tied_up_summary"\)/.test(cd) && /terms\.t\("cash_available"\)/.test(cd), "vocabulary");
      const simple = terminology("simple");
      assert(simple.t("tied_up_badge") === "{pct}% of your net worth is tied up in assets" && simple.t("tied_up_summary") === "Tied up in assets" && simple.t("cash_available") === "Cash available" && !/illiquid/i.test(simple.t("tied_up_badge")), "Simple wording");
      assert(/bg-attention\/15[^"]*text-attention/.test(cd) && /flex-wrap/.test(cd) && !/whitespace-nowrap/.test(cd), "amber, wraps");
    });

    await runner.run("Colour semantics: teal comfortable, amber getting close / at limit / needs setup, red only below limit; text label always present; cash and net worth stay neutral", async () => {
      assert(L.TONE_TEXT_CLASS.positive === "text-accent-primary" && L.TONE_TEXT_CLASS.attention === "text-attention" && L.TONE_TEXT_CLASS.danger === "text-danger" && L.TONE_TEXT_CLASS.neutral === "text-text-primary", "tokens");
      const tones = (["comfortable", "getting_close", "at_limit", "below_limit", "needs_setup"] as const).map((k) => [k, cashStatus(k === "comfortable" ? row("500000", "350200", "0") : k === "getting_close" ? row("500000", "80000", "0") : k === "at_limit" ? row("500000", "0", "0") : k === "below_limit" ? row("500000", "0", "1") : row(null, null, null, "0", "not_configured"))] as const);
      assert(tones.map(([k, r]) => `${k}:${r.tone}`).join() === "comfortable:positive,getting_close:attention,at_limit:attention,below_limit:danger,needs_setup:attention", "tone table");
      assert(tones.every(([, r]) => r.label.length > 0), "every state has a text label");
      const badge = src("components/rules/CashStatusBadge.tsx");
      assert(/\{result\.label\}/.test(badge) && /<Icon/.test(badge), "label and icon, colour only reinforces");
      const home = src("components/home/PositionSection.tsx");
      assert(/text-text-primary">\s*\{fmt\(calculated\.netWorth/.test(home) && /text-text-primary">\s*\{fmt\(calculated\.liquidCash/.test(home), "net worth and cash neutral");
    });

    await runner.run("20/21 no duplicated protection arithmetic in components, and no formula, schema, RLS or engine file changed", async () => {
      const surfaces = ["components/home/PositionSection.tsx", "components/rules/SafeToDeployCard.tsx", "components/rules/AvailableExplanation.tsx", "components/rules/CashStatusBadge.tsx", "components/money/AvailableCashSection.tsx", "components/decisions/DecisionPositionCard.tsx", "components/financial-position/NativePositionList.tsx", "components/spending-check/SpendingCheckWorkspace.tsx"];
      for (const f of surfaces) assert(!/Decimal|Math\.max|0\.25|\* ?0\.25|25%/.test(visible(f)), `${f}: threshold/arithmetic outside the central policy`);
      assert(/WARNING_ZONE_FRACTION = "0\.25"/.test(src("lib/domain/rules/cash-status.ts")) && !walk("components").some((f) => /WARNING_ZONE_FRACTION/.test(src(f))), "the threshold lives only in the central policy");
      const dirty = execSync("git status --porcelain -- lib/domain/rules/aggregate.ts lib/domain/financial-position lib/domain/budget lib/domain/goals lib/domain/money", { encoding: "utf8" });
      assert(dirty.trim() === "", `engine or domain files changed:\n${dirty}`);
      const migrations = execSync("git status --porcelain -- supabase/migrations", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
      assert(migrations.every((l) => l.includes("20261003090000_add_financial_language_mode.sql")), `only the profile language-preference migration may be new: ${migrations.join(" ")}`);
      const diff = execSync("git diff -U0 -- lib/domain/rules/repository.ts", { encoding: "utf8" });
      assert(!/^\+.*(Decimal|Math\.max|minus|plus)/m.test(diff), "the repository wrapper gained no arithmetic");
      void formatAmount;
    });
  } finally {
    await fx.cleanup();
  }
  const s = runner.summary();
  console.log(`\n${s.passed}/${s.total} passed`);
  if (s.failed > 0) {
    for (const r of s.results.filter((r) => !r.passed)) console.error(`  - ${r.name}: ${r.error}`);
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error("Cash status suite crashed:", e); process.exitCode = 1; });
