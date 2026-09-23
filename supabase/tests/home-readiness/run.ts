/**
 * Home-readiness suite (P0-E3-S1A): Money period summary ("This Month"),
 * reporting FX context (manual rates, direct/inverse resolution), and
 * liquidity-estimate completeness (quick-sale / recoverability coverage),
 * plus their Financial Position summary integration.
 *
 * Same rules as every prior suite this session: LOCAL Supabase only, real
 * anon-key + PostgREST/RPC path for every assertion, one dedicated
 * currency per concern to keep arithmetic auditable and immune to
 * cross-block state bleed. Expected values for any non-trivial arithmetic
 * are computed with decimal.js in this file, never transcribed by hand —
 * a hand-transcription slip (1800-2000 written as -1000) was the one bug
 * found while building the P0-E3-S1 suite, and it was in the test, not
 * the migration.
 *
 * Usage: npm run db:start   (once)
 *        npm run test:home-readiness
 */
import { Decimal } from "decimal.js";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert, expectDenied } from "../shared/assert.ts";
import { updateProfile } from "../../../lib/domain/profile/repository.ts";
import {
  createBucket,
  recordMoneyReceived,
  recordMoneySpent,
  recordOpeningBalance,
  recordTransfer,
  recordFxTransfer,
  voidFinancialEvent,
  getMoneyPeriodSummary,
} from "../../../lib/domain/money/repository.ts";
import { createReceivable, recordRecovery, recordRecoverableEstimate, updateReceivable, getReceivableRecoverabilityCoverage } from "../../../lib/domain/receivables/repository.ts";
import { createLiability, recordLoanProceeds, recordDebtPayment } from "../../../lib/domain/liabilities/repository.ts";
import { createAsset, recordValuation, updateAsset, getAssetQuickSaleCoverage } from "../../../lib/domain/assets/repository.ts";
import { getFinancialPositionByCurrency, getFinancialPositionSummary } from "../../../lib/domain/financial-position/repository.ts";
import { convertFinancialPositionToReportingCurrency } from "../../../lib/domain/financial-position/aggregate.ts";
import { recordManualReportingRate, listManualReportingRates, getReportingFxRates } from "../../../lib/domain/currency/repository.ts";
import { resolveReportingRates, toRatesMap } from "../../../lib/domain/currency/reporting-rates.ts";

const D = "2026-03-15T12:00:00Z"; // a fixed, timezone-unambiguous mid-month instant reused across Sections A-C
const PERIOD_START = "2026-03-01";
const PERIOD_END = "2026-03-31";

async function main() {
  const env = loadTestEnv();
  const fixtures = await setupFixtures(env, "home-readiness-rls");
  const { userA, userB, anonClient } = fixtures;
  const runner = new TestRunner();

  try {
    console.log("Monatriq Home-readiness suite (Money period summary, reporting FX, liquidity completeness)\n");

    await runner.run("Setup: User A profile timezone=UTC, preferred_currency=BRL", async () => {
      await updateProfile(userA.client, { timezone: "UTC", preferred_currency: "BRL" });
    });

    // =========================================================================
    // PART A — MONEY PERIOD SUMMARY
    // =========================================================================

    let voidableEventId = "";
    await runner.run(
      "BRL: opening balance excluded, salary is cashIn+earnedIncome, expense is cashOut+expense, internal transfer excluded, voided spend excluded, net calculates exactly",
      async () => {
        const bucket1 = await createBucket(userA.client, { name: "BRL Wallet 1", currencyCode: "BRL", bucketType: "bank_account" });
        const bucket2 = await createBucket(userA.client, { name: "BRL Wallet 2", currencyCode: "BRL", bucketType: "bank_account" });

        await recordOpeningBalance(userA.client, { bucketId: bucket1.id, amount: "1000", occurredAt: D });
        await recordMoneyReceived(userA.client, { bucketId: bucket1.id, amount: "5000", categoryCode: "salary", occurredAt: D });
        await recordMoneySpent(userA.client, { bucketId: bucket1.id, amount: "1200", categoryCode: "housing", occurredAt: D });
        await recordTransfer(userA.client, { sourceBucketId: bucket1.id, destinationBucketId: bucket2.id, amount: "300", occurredAt: D });

        const voidedSpend = await recordMoneySpent(userA.client, { bucketId: bucket1.id, amount: "500", categoryCode: "food", occurredAt: D });
        voidableEventId = voidedSpend.id;
        await voidFinancialEvent(userA.client, voidableEventId);

        const summary = await getMoneyPeriodSummary(userA.client, PERIOD_START, PERIOD_END);
        const brl = summary.currencies.find((c) => c.currencyCode === "BRL");
        assert(brl?.cashIn === "5000.000000", `opening balance must be excluded and voided spend must not appear; expected cashIn 5000, got ${brl?.cashIn}`);
        assert(brl?.earnedIncome === "5000.000000", `expected earnedIncome 5000 (salary only), got ${brl?.earnedIncome}`);
        assert(brl?.cashOut === "1200.000000", `expected cashOut 1200 (voided 500 excluded), got ${brl?.cashOut}`);
        assert(brl?.expense === "1200.000000", `expected expense 1200, got ${brl?.expense}`);
        assert(brl?.transferIn === "300.000000", `expected transferIn 300, got ${brl?.transferIn}`);
        assert(brl?.transferOut === "300.000000", `expected transferOut 300, got ${brl?.transferOut}`);
        assert(brl?.netExternalCashFlow === "3800.000000", `expected net 5000-1200=3800, got ${brl?.netExternalCashFlow}`);
      },
    );

    await runner.run("GHS: receivable recovery and loan proceeds both contribute to cashIn but neither is earnedIncome", async () => {
      const bucket = await createBucket(userA.client, { name: "GHS Wallet", currencyCode: "GHS", bucketType: "bank_account" });
      const receivable = await createReceivable(userA.client, { name: "GHS Invoice", currencyCode: "GHS", faceAmount: "2000" });
      await recordRecovery(userA.client, { receivableId: receivable.id, bucketId: bucket.id, amount: "800", occurredAt: D });
      const liability = await createLiability(userA.client, { name: "GHS Loan", liabilityType: "loan", currencyCode: "GHS", openingPrincipal: "5000" });
      await recordLoanProceeds(userA.client, { liabilityId: liability.id, bucketId: bucket.id, amount: "3000", occurredAt: D });

      const summary = await getMoneyPeriodSummary(userA.client, PERIOD_START, PERIOD_END);
      const ghs = summary.currencies.find((c) => c.currencyCode === "GHS");
      assert(ghs?.cashIn === "3800.000000", `expected cashIn 800+3000=3800, got ${ghs?.cashIn}`);
      assert(ghs?.earnedIncome === "0.000000", `receivable recovery and loan proceeds must never be earnedIncome, got ${ghs?.earnedIncome}`);
    });

    await runner.run("MXN: debt principal is cashOut but not expense; debt interest and fee are both cashOut and expense", async () => {
      const bucket = await createBucket(userA.client, { name: "MXN Wallet", currencyCode: "MXN", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "10000", categoryCode: "salary", occurredAt: D });
      const liability = await createLiability(userA.client, { name: "MXN Loan", liabilityType: "loan", currencyCode: "MXN", openingPrincipal: "8000" });
      await recordDebtPayment(userA.client, { liabilityId: liability.id, bucketId: bucket.id, principalAmount: "1000", occurredAt: D });
      await recordDebtPayment(userA.client, { liabilityId: liability.id, bucketId: bucket.id, interestAmount: "200", feeAmount: "50", occurredAt: D });

      const summary = await getMoneyPeriodSummary(userA.client, PERIOD_START, PERIOD_END);
      const mxn = summary.currencies.find((c) => c.currencyCode === "MXN");
      assert(mxn?.cashIn === "10000.000000", `expected cashIn 10000, got ${mxn?.cashIn}`);
      assert(mxn?.cashOut === "1250.000000", `expected cashOut 1000+200+50=1250, got ${mxn?.cashOut}`);
      assert(mxn?.expense === "250.000000", `expected expense 200+50=250 (principal excluded), got ${mxn?.expense}`);
      assert(mxn?.netExternalCashFlow === "8750.000000", `expected net 10000-1250=8750, got ${mxn?.netExternalCashFlow}`);
    });

    await runner.run("HKD/AED: an FX transfer between the user's own buckets is excluded from external cashIn/cashOut on both legs", async () => {
      const bucketHkd = await createBucket(userA.client, { name: "HKD Wallet", currencyCode: "HKD", bucketType: "bank_account" });
      const bucketAed = await createBucket(userA.client, { name: "AED Wallet", currencyCode: "AED", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucketHkd.id, amount: "5000", categoryCode: "salary", occurredAt: D });
      await recordFxTransfer(userA.client, { sourceBucketId: bucketHkd.id, destinationBucketId: bucketAed.id, sourceAmount: "1000", destinationAmount: "450", occurredAt: D });

      const summary = await getMoneyPeriodSummary(userA.client, PERIOD_START, PERIOD_END);
      const hkd = summary.currencies.find((c) => c.currencyCode === "HKD");
      const aed = summary.currencies.find((c) => c.currencyCode === "AED");
      assert(hkd?.cashIn === "5000.000000", `FX transfer must not inflate HKD cashIn, expected 5000, got ${hkd?.cashIn}`);
      assert(hkd?.cashOut === "0.000000", `FX transfer must not become HKD spending, expected cashOut 0, got ${hkd?.cashOut}`);
      assert(hkd?.transferOut === "1000.000000", `expected HKD transferOut 1000, got ${hkd?.transferOut}`);
      assert((aed?.cashIn ?? "0") === "0.000000", `FX transfer must not become AED income, expected cashIn 0, got ${aed?.cashIn}`);
      assert(aed?.transferIn === "450.000000", `expected AED transferIn 450, got ${aed?.transferIn}`);
    });

    await runner.run(
      "SAR: profile timezone determines the resolved month boundary — the identical event falls in different periods under different timezones",
      async () => {
        await updateProfile(userA.client, { timezone: "Pacific/Kiritimati" }); // UTC+14
        const bucket = await createBucket(userA.client, { name: "SAR Wallet", currencyCode: "SAR", bucketType: "bank_account" });
        // 2026-01-31T23:30:00Z is still January 31 in UTC, but 2026-02-01 13:30 local in Pacific/Kiritimati (UTC+14) -- a different calendar month.
        await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "777", categoryCode: "salary", occurredAt: "2026-01-31T23:30:00Z" });

        const januaryUnderKiritimati = await getMoneyPeriodSummary(userA.client, "2026-01-01", "2026-01-31");
        assert(
          januaryUnderKiritimati.currencies.find((c) => c.currencyCode === "SAR") === undefined,
          "under Pacific/Kiritimati the event is locally February; it must not appear in the January period",
        );

        const februaryUnderKiritimati = await getMoneyPeriodSummary(userA.client, "2026-02-01", "2026-02-28");
        const sarFeb = februaryUnderKiritimati.currencies.find((c) => c.currencyCode === "SAR");
        assert(sarFeb?.cashIn === "777.000000", `under Pacific/Kiritimati the event should resolve into February, expected cashIn 777, got ${sarFeb?.cashIn}`);

        await updateProfile(userA.client, { timezone: "UTC" });
        const januaryUnderUtc = await getMoneyPeriodSummary(userA.client, "2026-01-01", "2026-01-31");
        const sarJan = januaryUnderUtc.currencies.find((c) => c.currencyCode === "SAR");
        assert(sarJan?.cashIn === "777.000000", `under UTC the SAME event should resolve into January, expected cashIn 777, got ${sarJan?.cashIn}`);
      },
    );

    await runner.run("ZAR: current-month convenience (no explicit period) resolves real bounds and includes real current activity", async () => {
      const bucket = await createBucket(userA.client, { name: "ZAR Wallet", currencyCode: "ZAR", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "250", categoryCode: "salary" }); // occurredAt omitted -> now()

      const summary = await getMoneyPeriodSummary(userA.client);
      assert(summary.periodStart.length > 0 && summary.periodEnd.length > 0, "expected non-empty resolved period bounds");
      const todayIso = new Date().toISOString().slice(0, 10);
      assert(summary.periodStart <= todayIso && todayIso <= summary.periodEnd, `expected today (${todayIso}) inside resolved period [${summary.periodStart}, ${summary.periodEnd}]`);
      const zar = summary.currencies.find((c) => c.currencyCode === "ZAR");
      assert(zar?.cashIn === "250.000000", `expected ZAR cashIn 250, got ${zar?.cashIn}`);
      assert(zar?.earnedIncome === "250.000000", `expected ZAR earnedIncome 250, got ${zar?.earnedIncome}`);
    });

    await runner.run("BRL and MXN period summaries remain separate rows -- multiple currencies never blended", async () => {
      const summary = await getMoneyPeriodSummary(userA.client, PERIOD_START, PERIOD_END);
      const brl = summary.currencies.find((c) => c.currencyCode === "BRL");
      const mxn = summary.currencies.find((c) => c.currencyCode === "MXN");
      assert(brl?.cashIn === "5000.000000", "BRL row must remain unaffected by MXN activity");
      assert(mxn?.cashIn === "10000.000000", "MXN row must remain unaffected by BRL activity");
    });

    // =========================================================================
    // PART B — REPORTING FX CONTEXT
    // =========================================================================

    let eurRateOldId = "";
    let eurRateNewId = "";
    await runner.run("EUR: user records own manual reporting rate; historical rate preserved; latest applicable rate resolves", async () => {
      const bucket = await createBucket(userA.client, { name: "EUR Wallet", currencyCode: "EUR", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "1000", categoryCode: "salary", occurredAt: D });

      const old = await recordManualReportingRate(userA.client, { baseCurrency: "EUR", quoteCurrency: "BRL", rate: "6.00", rateAsOf: "2026-01-01T00:00:00Z" });
      eurRateOldId = old.id;
      const fresh = await recordManualReportingRate(userA.client, { baseCurrency: "EUR", quoteCurrency: "BRL", rate: "6.20", rateAsOf: "2026-02-01T00:00:00Z" });
      eurRateNewId = fresh.id;

      const history = await listManualReportingRates(userA.client);
      const historyIds = history.map((r) => r.id);
      assert(historyIds.includes(eurRateOldId), "historical (older) manual rate must remain readable after a newer one is recorded");
      assert(historyIds.includes(eurRateNewId), "the newer manual rate must also be present");

      const raw = await getReportingFxRates(userA.client, "BRL");
      const eurRaw = raw.find((r) => r.baseCurrency === "EUR" && r.quoteCurrency === "BRL");
      assert(!!eurRaw && new Decimal(eurRaw.rate).equals("6.20"), `expected the latest applicable rate 6.20 to resolve, got ${eurRaw?.rate}`);

      const resolved = resolveReportingRates(raw, "BRL");
      const eurResolved = resolved.find((r) => r.currencyCode === "EUR");
      assert(!!eurResolved && new Decimal(eurResolved.rate).equals("6.20") && eurResolved.isInverse === false, `expected direct resolution at 6.20, got ${JSON.stringify(eurResolved)}`);
      assert(eurResolved?.storedBaseCurrency === "EUR" && eurResolved?.storedQuoteCurrency === "BRL", "expected FX transparency context to expose stored base/quote");
      assert(typeof eurResolved?.rateAsOf === "string" && eurResolved.rateAsOf.length > 0, "expected rate_as_of exposed");
      assert(eurResolved?.source === "manual", "expected source=manual exposed");
    });

    await runner.run("SEK: an explicit inverse-direction manual rate (reporting -> currency) resolves via exact mathematical inversion", async () => {
      const bucket = await createBucket(userA.client, { name: "SEK Wallet", currencyCode: "SEK", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "2000", categoryCode: "salary", occurredAt: D });
      await recordManualReportingRate(userA.client, { baseCurrency: "BRL", quoteCurrency: "SEK", rate: "1.90" });

      const raw = await getReportingFxRates(userA.client, "BRL");
      const resolved = resolveReportingRates(raw, "BRL");
      const sek = resolved.find((r) => r.currencyCode === "SEK");
      const expectedInverse = new Decimal(1).dividedBy("1.90").toString();
      assert(sek?.isInverse === true, "expected SEK to resolve via inversion (only reporting->SEK was stored)");
      assert(sek?.rate === expectedInverse, `expected exact inverse ${expectedInverse}, got ${sek?.rate}`);
      assert(sek?.storedBaseCurrency === "BRL" && sek?.storedQuoteCurrency === "SEK", "expected stored direction preserved in context even though inverted for use");
    });

    await runner.run("NOK: missing reporting rate makes both the aggregate function and the Financial Position summary explicitly not_calculated", async () => {
      const bucket = await createBucket(userA.client, { name: "NOK Wallet", currencyCode: "NOK", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucket.id, amount: "500", categoryCode: "salary", occurredAt: D });

      const positions = await getFinancialPositionByCurrency(userA.client);
      const raw = await getReportingFxRates(userA.client, "BRL");
      const resolved = resolveReportingRates(raw, "BRL");
      const direct = convertFinancialPositionToReportingCurrency(positions, "BRL", toRatesMap(resolved));
      assert(direct.status === "not_calculated", "expected not_calculated while NOK has no manual reporting rate");
      if (direct.status === "not_calculated") {
        assert(direct.missingRates.includes("NOK"), `expected NOK listed as missing, got ${JSON.stringify(direct.missingRates)}`);
      }

      const summary = await getFinancialPositionSummary(userA.client);
      assert(summary.reportingPosition?.status === "not_calculated", "expected the Financial Position summary's reportingPosition to also be not_calculated");
      if (summary.reportingPosition?.status === "not_calculated") {
        assert(summary.reportingPosition.missingRates.includes("NOK"), "expected NOK listed as missing at the summary level too");
      }
    });

    await runner.run("User B's own manual rate for the same currency pair is never consumed by User A's reporting resolution", async () => {
      await recordManualReportingRate(userB.client, { baseCurrency: "NOK", quoteCurrency: "BRL", rate: "0.50" });

      const raw = await getReportingFxRates(userA.client, "BRL");
      assert(raw.find((r) => r.baseCurrency === "NOK") === undefined, "User A's reporting_fx_rates must never return User B's NOK rate");

      const positions = await getFinancialPositionByCurrency(userA.client);
      const resolved = resolveReportingRates(raw, "BRL");
      const result = convertFinancialPositionToReportingCurrency(positions, "BRL", toRatesMap(resolved));
      assert(result.status === "not_calculated", "User A's own conversion must remain not_calculated despite User B recording exactly this pair");
    });

    await runner.run("EUR + SEK alone: complete manual rates allow an exact consolidated reporting Financial Position", async () => {
      const positions = await getFinancialPositionByCurrency(userA.client);
      const eur = positions.find((p) => p.currencyCode === "EUR")!;
      const sek = positions.find((p) => p.currencyCode === "SEK")!;
      const raw = await getReportingFxRates(userA.client, "BRL");
      const resolved = resolveReportingRates(raw, "BRL");
      const result = convertFinancialPositionToReportingCurrency([eur, sek], "BRL", toRatesMap(resolved));
      assert(result.status === "calculated", `expected calculated with both EUR and SEK rated, got ${result.status}`);
      if (result.status === "calculated") {
        const expected = new Decimal(eur.netWorth)
          .times("6.20")
          .plus(new Decimal(sek.netWorth).times(new Decimal(1).dividedBy("1.90")))
          .toString();
        assert(result.netWorth === expected, `expected exact combined net worth ${expected}, got ${result.netWorth}`);
      }
    });

    let chfBucketId = "";
    await runner.run("CHF: an auto-created transaction_actual FX rate is never selected as the reporting rate", async () => {
      const bucketChf = await createBucket(userA.client, { name: "CHF Wallet", currencyCode: "CHF", bucketType: "bank_account" });
      chfBucketId = bucketChf.id;
      await recordMoneyReceived(userA.client, { bucketId: bucketChf.id, amount: "543.21", categoryCode: "salary", occurredAt: D });

      const brlBucket = await createBucket(userA.client, { name: "BRL FX Destination", currencyCode: "BRL", bucketType: "bank_account" });
      await recordFxTransfer(userA.client, { sourceBucketId: chfBucketId, destinationBucketId: brlBucket.id, sourceAmount: "100", destinationAmount: "550", occurredAt: D });
      // record_fx_transfer() auto-creates a transaction_actual fx_rates row (base=CHF, quote=BRL, rate=5.5) -- verified directly here, not assumed.
      const { data: txActual, error: txActualError } = await userA.client.from("fx_rates").select("*").eq("base_currency", "CHF").eq("quote_currency", "BRL").eq("source", "transaction_actual").single();
      if (txActualError) throw txActualError;
      assert(Number(txActual.rate) === 5.5, `expected the auto-created transaction_actual rate 5.5, got ${txActual.rate}`);

      // Deliberately a different value from 5.5, so selecting the wrong rate would be visibly wrong.
      await recordManualReportingRate(userA.client, { baseCurrency: "CHF", quoteCurrency: "BRL", rate: "1.234567" });

      const raw = await getReportingFxRates(userA.client, "BRL");
      const chfRows = raw.filter((r) => r.baseCurrency === "CHF" || r.quoteCurrency === "CHF");
      assert(chfRows.length === 1, `expected exactly one CHF row (the manual one), got ${chfRows.length}`);
      assert(new Decimal(chfRows[0].rate).equals("1.234567") && chfRows[0].source === "manual", `expected only the manual rate 1.234567 to be selectable, got ${JSON.stringify(chfRows[0])}`);
    });

    await runner.run("CHF: non-round manual rate conversion remains exact (decimal.js, no binary-float drift)", async () => {
      const positions = await getFinancialPositionByCurrency(userA.client);
      const chf = positions.find((p) => p.currencyCode === "CHF")!;
      assert(chf.liquidCash === "443.210000", `expected CHF cash 543.21-100=443.21 after the fx transfer, got ${chf.liquidCash}`);

      const raw = await getReportingFxRates(userA.client, "BRL");
      const resolved = resolveReportingRates(raw, "BRL");
      const result = convertFinancialPositionToReportingCurrency([chf], "BRL", toRatesMap(resolved));
      assert(result.status === "calculated", "expected CHF alone to convert cleanly");
      if (result.status === "calculated") {
        const expected = new Decimal(chf.netWorth).times("1.234567").toString();
        assert(result.netWorth === expected, `expected exact non-round product ${expected}, got ${result.netWorth}`);
      }
    });

    await runner.run("JPY/KWD: currency conventions (0-decimal, 3-decimal) remain exact through reporting conversion", async () => {
      const bucketJpy = await createBucket(userA.client, { name: "JPY Wallet", currencyCode: "JPY", bucketType: "bank_account" });
      const bucketKwd = await createBucket(userA.client, { name: "KWD Wallet", currencyCode: "KWD", bucketType: "bank_account" });
      await recordMoneyReceived(userA.client, { bucketId: bucketJpy.id, amount: "100000", categoryCode: "salary", occurredAt: D });
      await recordMoneyReceived(userA.client, { bucketId: bucketKwd.id, amount: "50.123", categoryCode: "salary", occurredAt: D });
      await recordManualReportingRate(userA.client, { baseCurrency: "JPY", quoteCurrency: "BRL", rate: "0.034" });
      await recordManualReportingRate(userA.client, { baseCurrency: "KWD", quoteCurrency: "BRL", rate: "17.5" });

      const positions = await getFinancialPositionByCurrency(userA.client);
      const jpy = positions.find((p) => p.currencyCode === "JPY")!;
      const kwd = positions.find((p) => p.currencyCode === "KWD")!;
      const raw = await getReportingFxRates(userA.client, "BRL");
      const resolved = resolveReportingRates(raw, "BRL");
      const result = convertFinancialPositionToReportingCurrency([jpy, kwd], "BRL", toRatesMap(resolved));
      assert(result.status === "calculated", "expected JPY+KWD to convert cleanly");
      if (result.status === "calculated") {
        const expected = new Decimal(jpy.netWorth).times("0.034").plus(new Decimal(kwd.netWorth).times("17.5")).toString();
        assert(result.netWorth === expected, `expected exact JPY+KWD combined ${expected}, got ${result.netWorth}`);
      }
    });

    await runner.run("User A cannot read User B's manual reporting rate", async () => {
      const history = await listManualReportingRates(userA.client);
      const { data: crossRead, error } = await userA.client.from("fx_rates").select("*").eq("user_id", userB.id);
      assert(error === null && (crossRead ?? []).length === 0, "User A must not be able to read User B's fx_rates rows directly");
      assert(!history.some((r) => r.base_currency === "NOK" && r.quote_currency === "BRL"), "User A's own rate history must never include User B's NOK rate");
    });

    await runner.run("Anonymous cannot read or mutate reporting-rate data", async () => {
      expectDenied(await anonClient.rpc("reporting_fx_rates", { p_reporting_currency: "BRL" }), "anonymous reporting_fx_rates");
      expectDenied(
        await anonClient.rpc("record_manual_reporting_rate", { p_base_currency: "USD", p_quote_currency: "EUR", p_rate: 1.1 }),
        "anonymous record_manual_reporting_rate",
      );
      expectDenied(await anonClient.from("fx_rates").select("*"), "anonymous SELECT on fx_rates");
    });

    // =========================================================================
    // PART C — LIQUIDITY COMPLETENESS
    // =========================================================================

    await runner.run("PLN: zero assets in a currency never touched produces an appropriate empty state (no row), not a fabricated 0", async () => {
      const coverage = await getAssetQuickSaleCoverage(userA.client);
      assert(coverage.find((c) => c.currencyCode === "SGD") === undefined, "a currency with zero assets must simply be absent, not present with 0/not_set");
    });

    const plnAssetIds: string[] = [];
    await runner.run("PLN: active assets with no quick-sale estimate -> coverage not_set", async () => {
      const a1 = await createAsset(userA.client, { assetType: "vehicle", name: "PLN Asset 1", currencyCode: "PLN", estimatedCurrentValue: "1000" });
      const a2 = await createAsset(userA.client, { assetType: "vehicle", name: "PLN Asset 2", currencyCode: "PLN", estimatedCurrentValue: "2000" });
      plnAssetIds.push(a1.id, a2.id);

      const coverage = await getAssetQuickSaleCoverage(userA.client);
      const pln = coverage.find((c) => c.currencyCode === "PLN");
      assert(pln?.activeAssetCount === 2, `expected 2 active PLN assets, got ${pln?.activeAssetCount}`);
      assert(pln?.quickSaleEstimateCount === 0, `expected 0 estimated, got ${pln?.quickSaleEstimateCount}`);
      assert(pln?.quickSaleSum === null, `expected null (Not set) quick-sale sum, got ${pln?.quickSaleSum}`);
      assert(pln?.coverageStatus === "not_set", `expected not_set, got ${pln?.coverageStatus}`);
    });

    let plnNetWorthBefore = "";
    let plnSafeToDeployBefore: string | null = null;
    let plnSafeToDeployStatusBefore = "";
    await runner.run("PLN: some but not all active assets estimated -> coverage partial; sum stays exact", async () => {
      const a3 = await createAsset(userA.client, { assetType: "vehicle", name: "PLN Asset 3", currencyCode: "PLN", estimatedCurrentValue: "3000", quickSaleEstimate: "2800" });
      plnAssetIds.push(a3.id);

      const coverage = await getAssetQuickSaleCoverage(userA.client);
      const pln = coverage.find((c) => c.currencyCode === "PLN");
      assert(pln?.activeAssetCount === 3, `expected 3 active PLN assets, got ${pln?.activeAssetCount}`);
      assert(pln?.quickSaleEstimateCount === 1, `expected 1 estimated, got ${pln?.quickSaleEstimateCount}`);
      assert(pln?.quickSaleSum === "2800.000000", `expected exact sum 2800, got ${pln?.quickSaleSum}`);
      assert(pln?.coverageStatus === "partial", `expected partial, got ${pln?.coverageStatus}`);

      const positions = await getFinancialPositionByCurrency(userA.client);
      const plnPosition = positions.find((p) => p.currencyCode === "PLN")!;
      plnNetWorthBefore = plnPosition.netWorth;
      plnSafeToDeployBefore = plnPosition.safeToDeploy;
      plnSafeToDeployStatusBefore = plnPosition.safeToDeployStatus;
    });

    await runner.run(
      "PLN: completing coverage to 100% (not_set/partial -> complete) changes neither Net Worth nor Safe to Deploy",
      async () => {
        await recordValuation(userA.client, { assetId: plnAssetIds[0], valuationType: "quick_sale_estimate", value: "900" });
        await recordValuation(userA.client, { assetId: plnAssetIds[1], valuationType: "quick_sale_estimate", value: "1900" });

        const coverage = await getAssetQuickSaleCoverage(userA.client);
        const pln = coverage.find((c) => c.currencyCode === "PLN");
        assert(pln?.quickSaleEstimateCount === 3, `expected all 3 estimated, got ${pln?.quickSaleEstimateCount}`);
        const expectedSum = new Decimal("900").plus("1900").plus("2800").toString();
        assert(pln?.quickSaleSum === `${expectedSum}.000000`, `expected exact sum ${expectedSum}, got ${pln?.quickSaleSum}`);
        assert(pln?.coverageStatus === "complete", `expected complete, got ${pln?.coverageStatus}`);

        const positions = await getFinancialPositionByCurrency(userA.client);
        const plnPosition = positions.find((p) => p.currencyCode === "PLN")!;
        assert(plnPosition.netWorth === plnNetWorthBefore, `Net Worth must be unchanged by coverage completeness, before=${plnNetWorthBefore} after=${plnPosition.netWorth}`);
        assert(plnPosition.safeToDeploy === plnSafeToDeployBefore, "Safe to Deploy amount must be unchanged by coverage completeness");
        assert(plnPosition.safeToDeployStatus === plnSafeToDeployStatusBefore, "Safe to Deploy status must be unchanged by coverage completeness");
      },
    );

    await runner.run("PLN: an archived asset is excluded from coverage entirely -- it does not incorrectly lower a complete status", async () => {
      const a4 = await createAsset(userA.client, { assetType: "vehicle", name: "PLN Asset 4 (to archive)", currencyCode: "PLN", estimatedCurrentValue: "500" });

      let coverage = await getAssetQuickSaleCoverage(userA.client);
      let pln = coverage.find((c) => c.currencyCode === "PLN");
      assert(pln?.coverageStatus === "partial", `expected partial with the new unestimated asset present, got ${pln?.coverageStatus}`);

      await updateAsset(userA.client, a4.id, { isArchived: true });

      coverage = await getAssetQuickSaleCoverage(userA.client);
      pln = coverage.find((c) => c.currencyCode === "PLN");
      assert(pln?.activeAssetCount === 3, `expected the archived asset excluded from the active count, got ${pln?.activeAssetCount}`);
      assert(pln?.coverageStatus === "complete", `expected coverage restored to complete once the unestimated asset is archived, got ${pln?.coverageStatus}`);
    });

    const ngnReceivableIds: string[] = [];
    await runner.run("NGN: active receivables with no recoverability estimate -> coverage not_set", async () => {
      const r1 = await createReceivable(userA.client, { name: "NGN Invoice 1", currencyCode: "NGN", faceAmount: "10000" });
      const r2 = await createReceivable(userA.client, { name: "NGN Invoice 2", currencyCode: "NGN", faceAmount: "20000" });
      ngnReceivableIds.push(r1.id, r2.id);

      const coverage = await getReceivableRecoverabilityCoverage(userA.client);
      const ngn = coverage.find((c) => c.currencyCode === "NGN");
      assert(ngn?.activeReceivableCount === 2, `expected 2 active NGN receivables, got ${ngn?.activeReceivableCount}`);
      assert(ngn?.recoverabilityEstimateCount === 0, `expected 0 estimated, got ${ngn?.recoverabilityEstimateCount}`);
      assert(ngn?.recoverableSum === null, `expected null (Not set), got ${ngn?.recoverableSum}`);
      assert(ngn?.coverageStatus === "not_set", `expected not_set, got ${ngn?.coverageStatus}`);
    });

    await runner.run("NGN: some but not all receivables estimated -> coverage partial", async () => {
      const r3 = await createReceivable(userA.client, { name: "NGN Invoice 3", currencyCode: "NGN", faceAmount: "30000" });
      ngnReceivableIds.push(r3.id);
      await recordRecoverableEstimate(userA.client, { receivableId: r3.id, value: "25000" });

      const coverage = await getReceivableRecoverabilityCoverage(userA.client);
      const ngn = coverage.find((c) => c.currencyCode === "NGN");
      assert(ngn?.activeReceivableCount === 3, `expected 3 active NGN receivables, got ${ngn?.activeReceivableCount}`);
      assert(ngn?.recoverabilityEstimateCount === 1, `expected 1 estimated, got ${ngn?.recoverabilityEstimateCount}`);
      assert(ngn?.recoverableSum === "25000.000000", `expected exact sum 25000, got ${ngn?.recoverableSum}`);
      assert(ngn?.coverageStatus === "partial", `expected partial, got ${ngn?.coverageStatus}`);
    });

    await runner.run("NGN: every relevant receivable estimated -> coverage complete", async () => {
      await recordRecoverableEstimate(userA.client, { receivableId: ngnReceivableIds[0], value: "9000" });
      await recordRecoverableEstimate(userA.client, { receivableId: ngnReceivableIds[1], value: "18000" });

      const coverage = await getReceivableRecoverabilityCoverage(userA.client);
      const ngn = coverage.find((c) => c.currencyCode === "NGN");
      assert(ngn?.recoverabilityEstimateCount === 3, `expected all 3 estimated, got ${ngn?.recoverabilityEstimateCount}`);
      const expectedSum = new Decimal("9000").plus("18000").plus("25000").toString();
      assert(ngn?.recoverableSum === `${expectedSum}.000000`, `expected exact sum ${expectedSum}, got ${ngn?.recoverableSum}`);
      assert(ngn?.coverageStatus === "complete", `expected complete, got ${ngn?.coverageStatus}`);
    });

    await runner.run("NGN: an archived receivable is excluded from coverage entirely", async () => {
      const r4 = await createReceivable(userA.client, { name: "NGN Invoice 4 (to archive)", currencyCode: "NGN", faceAmount: "5000" });

      let coverage = await getReceivableRecoverabilityCoverage(userA.client);
      let ngn = coverage.find((c) => c.currencyCode === "NGN");
      assert(ngn?.coverageStatus === "partial", `expected partial with the new unestimated receivable present, got ${ngn?.coverageStatus}`);

      await updateReceivable(userA.client, r4.id, { isArchived: true });

      coverage = await getReceivableRecoverabilityCoverage(userA.client);
      ngn = coverage.find((c) => c.currencyCode === "NGN");
      assert(ngn?.activeReceivableCount === 3, `expected the archived receivable excluded from the active count, got ${ngn?.activeReceivableCount}`);
      assert(ngn?.coverageStatus === "complete", `expected coverage restored to complete once the unestimated receivable is archived, got ${ngn?.coverageStatus}`);
    });

    // =========================================================================
    // INTEGRATION
    // =========================================================================

    await runner.run("Financial Position summary includes the canonical monthly Money summary", async () => {
      const summary = await getFinancialPositionSummary(userA.client);
      assert(summary.thisMonth.periodStart.length > 0 && summary.thisMonth.periodEnd.length > 0, "expected resolved period bounds in the summary");
      const zar = summary.thisMonth.currencies.find((c) => c.currencyCode === "ZAR");
      assert(zar?.cashIn === "250.000000", `expected the summary's thisMonth to include the real current-dated ZAR activity, got ${zar?.cashIn}`);
    });

    await runner.run(
      "Financial Position summary produces a calculated reporting result from the user's own stored rates, without the caller building a rate map",
      async () => {
        await updateProfile(userB.client, { preferred_currency: "USD" });
        const bucket = await createBucket(userB.client, { name: "User B EUR Wallet", currencyCode: "EUR", bucketType: "bank_account" });
        await recordMoneyReceived(userB.client, { bucketId: bucket.id, amount: "2000", categoryCode: "salary" });
        await recordManualReportingRate(userB.client, { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.08" });

        const summary = await getFinancialPositionSummary(userB.client);
        assert(summary.reportingCurrency === "USD", `expected User B's reporting currency USD, got ${summary.reportingCurrency}`);
        assert(summary.reportingPosition?.status === "calculated", `expected a calculated reporting position, got ${summary.reportingPosition?.status}`);
        if (summary.reportingPosition?.status === "calculated") {
          const eur = summary.nativePositions.find((p) => p.currencyCode === "EUR")!;
          const expected = new Decimal(eur.netWorth).times("1.08").toString();
          assert(summary.reportingPosition.netWorth === expected, `expected exact reporting net worth ${expected}, got ${summary.reportingPosition.netWorth}`);
        }
      },
    );

    await runner.run("Cross-tenant: User A's Financial Position summary contains none of User B's coverage, rate, or period data", async () => {
      await createAsset(userB.client, { assetType: "vehicle", name: "User B NZD Asset", currencyCode: "NZD", estimatedCurrentValue: "1000", quickSaleEstimate: "900" });

      const summaryA = await getFinancialPositionSummary(userA.client);
      assert(summaryA.assetQuickSaleCoverage.find((c) => c.currencyCode === "NZD") === undefined, "User A's asset coverage must never include User B's NZD asset");
      assert(!summaryA.reportingRateContext.some((r) => r.storedBaseCurrency === "EUR" && r.storedQuoteCurrency === "USD"), "User A's rate context must never include User B's EUR->USD rate");
      assert(summaryA.thisMonth.currencies.find((c) => c.currencyCode === "USD") === undefined, "User A's this-month summary must never include User B's currency activity");
    });

  } finally {
    await fixtures.cleanup();
  }

  const summary = runner.summary();
  console.log(`\n${summary.passed}/${summary.total} passed`);

  if (summary.failed > 0) {
    console.error(`\n${summary.failed} test(s) FAILED:`);
    for (const r of summary.results.filter((r) => !r.passed)) {
      console.error(`  - ${r.name}: ${r.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Home-readiness suite crashed:", err);
  process.exitCode = 1;
});
