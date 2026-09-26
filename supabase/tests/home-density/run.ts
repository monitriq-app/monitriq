/**
 * Home card density + action emphasis (P0-E5-S5B). Layout is verified in a
 * real browser (see the report); these tests guard what must NOT change:
 * structure, the CTA, content-driven sizing (no brittle pixel heights), the
 * canonical figures and every language mode / warning state.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert } from "../shared/assert.ts";
import { createBucket, recordOpeningBalance } from "../../../lib/domain/money/repository.ts";
import { createFinancialRule, getSafeToDeployByCurrency } from "../../../lib/domain/rules/repository.ts";
import { cashStatus, cashStatusSentence, type CashStatus } from "../../../lib/domain/rules/cash-status.ts";
import { terminology } from "../../../lib/domain/language/terms.ts";
import { LANGUAGE_MODES } from "../../../lib/domain/language/types.ts";
import { todayInTimezone } from "../../../lib/domain/budget/presentation.ts";

const src = (f: string) => readFileSync(f, "utf8");
const visible = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const AT = `${todayInTimezone("UTC").slice(0, 7)}-01T12:00:00Z`;

async function main() {
  const env = loadTestEnv();
  const fx = await setupFixtures(env, "home-density");
  const c = fx.userA.client;
  const runner = new TestRunner();
  try {
    console.log("Monitriq Home card density + action emphasis\n");

    await runner.run("Home structure is unchanged: cash card, then Net Worth + Available row, then 'Can I afford this?', then the capital distribution", async () => {
      const home = visible("app/(app)/home/page.tsx");
      const order = ["<PositionSection", "<SpendingCheckCard", "<CapitalDistributionSection", "<YourMovesSection"].map((t) => home.indexOf(t));
      assert(order.every((i) => i >= 0) && order.join() === [...order].sort((a, b) => a - b).join(), `section order ${order.join()}`);
      const ps = visible("components/home/PositionSection.tsx");
      const ordered = [terminology("simple").t("cash") && 'terms.t("cash")', "Net Worth", 'terms.t("available_above_alone")'].map((t) => ps.indexOf(t as string));
      assert(ordered.every((i) => i > 0) && ordered[0] < ordered[1] && ordered[1] < ordered[2], "cash, then net worth, then available above");
      assert(/grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.25fr\)\]/.test(ps), "two-card row kept (content-weighted columns)");
    });

    await runner.run("'Can I afford this?' is still present with icon, title, copy, chevron and route, and is slightly more prominent (larger padding and icon, larger title)", async () => {
      const card = visible("components/home/SpendingCheckCard.tsx");
      assert(/href="\/spending-check"/.test(card) && /<ShoppingBag/.test(card) && /<ChevronRight/.test(card) && /HOME_CTA\.title/.test(card) && /HOME_CTA\.body/.test(card), "content preserved");
      assert(/min-h-12/.test(card) && /py-\[1\.125rem\]/.test(card) && /h-10 w-10/.test(card) && /text-\[15px\]/.test(card) && /border border-accent-primary\/25/.test(card), "more presence: 48px minimum kept, +padding, +icon, +title, thin teal-tinted border (no glow or gradient)");
      assert(!/gradient|shadow|blur|glow|backdrop/.test(card), "no gradients, glow or glass on the action card");
      assert(/Can I afford this\?/.test(src("lib/domain/spending-check/presentation.ts")), "copy unchanged");
    });

    await runner.run("density comes from spacing, not fixed heights: no pixel heights on the Home cards, content-driven sizing, wrapping allowed", async () => {
      for (const f of ["components/home/PositionSection.tsx", "components/home/SpendingCheckCard.tsx", "components/rules/AvailableExplanation.tsx"]) {
        const t = visible(f);
        assert(!/(?:^|[\s"'`])(?:min-|max-)?h-\[\d+(?:px|rem)\]/.test(t.replace(/py-\[1\.125rem\]/g, "")), `${f}: fixed pixel/rem height`);
        assert(!/style=\{\{[^}]*height/.test(t), `${f}: inline height`);
      }
      const ps = visible("components/home/PositionSection.tsx");
      assert(/px-4 py-3\.5/.test(ps) && /rounded-xl bg-surface-raised p-3/.test(ps), "tighter shared padding (cash card 14px, row cards 12px)");
      assert(/flex-wrap/.test(ps) && /break-words/.test(ps) && /min-w-0/.test(ps), "wrapping and min-width safety kept");
      assert(/before:-inset-y-2\.5/.test(ps) && /h-7/.test(ps), "setup link is compact but keeps a 48px effective hit area");
      assert(/flex-\[1_1_12rem\]/.test(ps), "helper text and reserve pill share a row only when they fit");
    });

    await runner.run("multi-currency stays complete: every currency keeps its own amount, status, sentence and setup action (first currency prominent, others secondary)", async () => {
      const ps = visible("components/home/PositionSection.tsx");
      assert(/withRules\.map\(\(p, index\)/.test(ps) && /positions\.map\(\(p, index\)/.test(ps), "one block per currency");
      assert(/index === 0 \?/.test(ps) && /text-\[32px\]/.test(ps) && /text-xl font-semibold/.test(ps), "headline size for the first currency, secondary size for others");
      assert(/border-t border-border pt-2/.test(ps), "currency blocks are visually separated");
      assert(!/Decimal|parseFloat|toFixed|\.plus\(|\.minus\(/.test(ps) && (ps.match(/Number\(/g) ?? []).length === 1 && /Number\(p\.allocationShortfall\) > 0/.test(ps), "no arithmetic in the Home cards (the only Number() is the existing shortfall > 0 comparison)");
    });

    // canonical rows for every state, then every mode renders them
    const world = async (code: string, cash: string, floor: string | null) => {
      const b = (await createBucket(c, { name: `${code} Bank`, currencyCode: code, bucketType: "bank_account" })).id;
      await recordOpeningBalance(c, { bucketId: b, amount: cash, occurredAt: AT });
      if (floor !== null) await createFinancialRule(c, { ruleType: "minimum_cash_floor", currencyCode: code, thresholdValue: floor });
    };
    await world("AUD", "850200", "500000"); // comfortable
    await world("NGN", "580000", "500000"); // getting close
    await world("ZAR", "500000", "500000"); // at limit
    await world("EUR", "460000", "500000"); // below limit
    await world("USD", "1200", null); // needs setup

    await runner.run("all five warning states still render in every language mode from real canonical rows (same state and tone; only wording differs)", async () => {
      const rows = await getSafeToDeployByCurrency(c);
      const expected: Record<string, CashStatus> = { AUD: "comfortable", NGN: "getting_close", ZAR: "at_limit", EUR: "below_limit", USD: "needs_setup" };
      const seenSentences = new Set<string>();
      for (const [code, state] of Object.entries(expected)) {
        const r = rows.find((x) => x.currencyCode === code)!;
        const st = cashStatus({ status: r.status, liquidCash: r.liquidCash, requiredRetainedCash: r.requiredRetainedCash, safeToDeploy: r.safeToDeploy, retainedDeficit: r.retainedDeficit });
        assert(st.state === state, `${code}: ${st.state}`);
        for (const m of LANGUAGE_MODES) {
          const s = cashStatusSentence(st, (v) => `${code} ${v}`, "home", m);
          assert(s.length > 0, `${code}/${m}: empty sentence`);
          seenSentences.add(`${state}|${s}`);
          assert(terminology(m).t("available_above_alone").length > 0 && terminology(m).t("cash").length > 0, `${m}: labels`);
        }
      }
      assert(seenSentences.size === 15, `five states x three wordings = 15 distinct sentences, got ${seenSentences.size}`);
      const long = LANGUAGE_MODES.map((m) => terminology(m).t("available_above_alone")).sort((a, b) => b.length - a.length)[0];
      assert(long.length <= 40, `longest tile title stays short enough to wrap safely: ${long}`);
    });

    await runner.run("no financial-value change: the Home cards read canonical fields verbatim, and no engine, domain or schema file was touched by this refinement", async () => {
      const ps = visible("components/home/PositionSection.tsx");
      for (const f of ["p.liquidCash", "p.safeToDeploy", "p.requiredRetainedCash", "p.protectedCommitments", "p.minimumCashFloor", "calculated.netWorth", "calculated.liquidCash"]) assert(ps.includes(f), `Home still reads ${f}`);
      const dirty = execSync("git status --porcelain -- lib/domain/rules lib/domain/financial-position lib/domain/budget lib/domain/goals lib/domain/money lib/domain/assets lib/domain/liabilities lib/domain/receivables supabase/migrations", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
      const allowed = (l: string) => /20261003090000_add_financial_language_mode\.sql|lib\/domain\/rules\/(cash-status|labels|repository)\.ts|lib\/domain\/(liabilities|receivables)\/presentation\.ts/.test(l);
      assert(dirty.every(allowed), `unexpected engine/domain changes: ${dirty.filter((l) => !allowed(l)).join(" ")}`);
    });

    await runner.run("scroll and safe area untouched: no page overflow hiding, bottom padding still clears the fixed nav", async () => {
      const css = src("app/globals.css");
      assert(!/(?:^|\n)\s*(?:html|body)\s*\{[^}]*overflow:\s*hidden/.test(css), "no page-level overflow:hidden");
      assert(/pb-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/.test(src("components/layout/AppShell.tsx")), "bottom padding reserved above the nav");
      assert(/@media \(max-width: 767\.98px\)[\s\S]*scrollbar-width: none/.test(css), "mobile scrollbar chrome still hidden");
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
main().catch((e) => { console.error("Home density suite crashed:", e); process.exitCode = 1; });
