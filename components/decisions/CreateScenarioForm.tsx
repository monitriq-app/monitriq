"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createDecisionScenario } from "@/lib/domain/decisions/repository";
import type { CapitalizationClassification, DecisionTypeCode } from "@/lib/domain/decisions/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface CreateScenarioFormProps {
  decisionId: string;
  decisionTypeCode: DecisionTypeCode;
  currencies: Currency[];
  buckets: CashBucket[];
}

const OUTFLOW_TYPES: DecisionTypeCode[] = [
  "buy_asset", "repair_improve_asset", "business_investment", "start_new_venture",
  "large_personal_purchase", "use_savings", "pay_down_debt", "other",
];
const INFLOW_TYPES: DecisionTypeCode[] = ["sell_asset", "take_debt", "other"];
const VALUE_ASSUMPTION_TYPES: DecisionTypeCode[] = ["buy_asset", "repair_improve_asset", "business_investment", "start_new_venture"];

/**
 * Every amount here is a user-entered ASSUMPTION, never a fact — visible
 * fields adapt to the decision type (per FINANCIAL_DOMAIN_MODEL.md,
 * "decision input architecture"), but nothing is auto-filled from
 * Assets/Liabilities facts. One scenario is a valid decision on its own.
 */
export function CreateScenarioForm({ decisionId, decisionTypeCode, currencies, buckets }: CreateScenarioFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [sourceBucketId, setSourceBucketId] = useState("");
  const [destinationBucketId, setDestinationBucketId] = useState("");
  const [cashRequired, setCashRequired] = useState("");
  const [acquisitionCosts, setAcquisitionCosts] = useState("");
  const [grossProceeds, setGrossProceeds] = useState("");
  const [proceedsCosts, setProceedsCosts] = useState("");
  const [debtPrincipalPayment, setDebtPrincipalPayment] = useState("");
  const [debtInterestPayment, setDebtInterestPayment] = useState("");
  const [debtFeePayment, setDebtFeePayment] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [expectedValueAssumption, setExpectedValueAssumption] = useState("");
  const [expectedFutureSaleValue, setExpectedFutureSaleValue] = useState("");
  const [capitalizationClassification, setCapitalizationClassification] = useState<CapitalizationClassification | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const matchingBuckets = currencyCode ? buckets.filter((b) => b.currency_code === currencyCode) : buckets;
  const showOutflow = OUTFLOW_TYPES.includes(decisionTypeCode) && decisionTypeCode !== "pay_down_debt";
  const showDebtPayment = decisionTypeCode === "pay_down_debt";
  const showInflow = INFLOW_TYPES.includes(decisionTypeCode);
  const showTakeDebtTerms = decisionTypeCode === "take_debt";
  const showValueAssumption = VALUE_ASSUMPTION_TYPES.includes(decisionTypeCode);
  const showRepairFields = decisionTypeCode === "repair_improve_asset";
  const showSourceBucket = OUTFLOW_TYPES.includes(decisionTypeCode);
  const showDestinationBucket = INFLOW_TYPES.includes(decisionTypeCode);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await createDecisionScenario(supabase, {
        decisionId,
        name: name.trim(),
        currencyCode,
        sourceBucketId: sourceBucketId || undefined,
        destinationBucketId: destinationBucketId || undefined,
        cashRequired: cashRequired || undefined,
        acquisitionCosts: acquisitionCosts || undefined,
        grossProceeds: grossProceeds || undefined,
        proceedsCosts: proceedsCosts || undefined,
        debtPrincipalPayment: debtPrincipalPayment || undefined,
        debtInterestPayment: debtInterestPayment || undefined,
        debtFeePayment: debtFeePayment || undefined,
        interestRate: interestRate ? Number(interestRate) : undefined,
        termMonths: termMonths ? Number(termMonths) : undefined,
        expectedValueAssumption: expectedValueAssumption || undefined,
        expectedFutureSaleValue: expectedFutureSaleValue || undefined,
        capitalizationClassification: capitalizationClassification || undefined,
      });
      setName("");
      setCurrencyCode("");
      setSourceBucketId("");
      setDestinationBucketId("");
      setCashRequired("");
      setAcquisitionCosts("");
      setGrossProceeds("");
      setProceedsCosts("");
      setDebtPrincipalPayment("");
      setDebtInterestPayment("");
      setDebtFeePayment("");
      setInterestRate("");
      setTermMonths("");
      setExpectedValueAssumption("");
      setExpectedFutureSaleValue("");
      setCapitalizationClassification("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this scenario.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Scenario name" htmlFor="scenario-name">
          <Input id="scenario-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Sell As-Is" />
        </FormField>
        <FormField label="Currency" htmlFor="scenario-currency">
          <Select id="scenario-currency" required value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.display_name}
              </option>
            ))}
          </Select>
        </FormField>

        {showSourceBucket ? (
          <FormField label="Source bucket (optional)" htmlFor="scenario-source-bucket">
            <Select id="scenario-source-bucket" value={sourceBucketId} onChange={(event) => setSourceBucketId(event.target.value)}>
              <option value="">None</option>
              {matchingBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {showDestinationBucket ? (
          <FormField label="Destination bucket (optional)" htmlFor="scenario-destination-bucket">
            <Select id="scenario-destination-bucket" value={destinationBucketId} onChange={(event) => setDestinationBucketId(event.target.value)}>
              <option value="">None</option>
              {matchingBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}

        {showOutflow ? (
          <FormField label="Cash required (optional)" htmlFor="scenario-cash-required">
            <Input id="scenario-cash-required" inputMode="decimal" value={cashRequired} onChange={(event) => setCashRequired(event.target.value)} placeholder="0.00" />
          </FormField>
        ) : null}
        {decisionTypeCode === "buy_asset" ? (
          <FormField label="Acquisition costs (optional)" htmlFor="scenario-acquisition-costs">
            <Input id="scenario-acquisition-costs" inputMode="decimal" value={acquisitionCosts} onChange={(event) => setAcquisitionCosts(event.target.value)} placeholder="0.00" />
          </FormField>
        ) : null}

        {showInflow ? (
          <>
            <FormField label={decisionTypeCode === "take_debt" ? "Proposed principal (optional)" : "Expected sale price (optional)"} htmlFor="scenario-gross-proceeds">
              <Input id="scenario-gross-proceeds" inputMode="decimal" value={grossProceeds} onChange={(event) => setGrossProceeds(event.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label={decisionTypeCode === "take_debt" ? "Fees deducted from proceeds (optional)" : "Selling costs (optional)"} htmlFor="scenario-proceeds-costs">
              <Input id="scenario-proceeds-costs" inputMode="decimal" value={proceedsCosts} onChange={(event) => setProceedsCosts(event.target.value)} placeholder="0.00" />
            </FormField>
          </>
        ) : null}

        {showDebtPayment ? (
          <>
            <FormField label="Principal payment (optional)" htmlFor="scenario-debt-principal">
              <Input id="scenario-debt-principal" inputMode="decimal" value={debtPrincipalPayment} onChange={(event) => setDebtPrincipalPayment(event.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Interest payment (optional)" htmlFor="scenario-debt-interest">
              <Input id="scenario-debt-interest" inputMode="decimal" value={debtInterestPayment} onChange={(event) => setDebtInterestPayment(event.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Fee payment (optional)" htmlFor="scenario-debt-fee">
              <Input id="scenario-debt-fee" inputMode="decimal" value={debtFeePayment} onChange={(event) => setDebtFeePayment(event.target.value)} placeholder="0.00" />
            </FormField>
          </>
        ) : null}

        {showTakeDebtTerms ? (
          <>
            <FormField label="Interest rate % (optional)" htmlFor="scenario-interest-rate">
              <Input id="scenario-interest-rate" inputMode="decimal" value={interestRate} onChange={(event) => setInterestRate(event.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Term in months (optional)" htmlFor="scenario-term-months">
              <Input id="scenario-term-months" inputMode="numeric" value={termMonths} onChange={(event) => setTermMonths(event.target.value)} />
            </FormField>
          </>
        ) : null}

        {showValueAssumption ? (
          <FormField label="Expected value assumption (optional)" htmlFor="scenario-expected-value">
            <Input id="scenario-expected-value" inputMode="decimal" value={expectedValueAssumption} onChange={(event) => setExpectedValueAssumption(event.target.value)} placeholder="0.00" />
          </FormField>
        ) : null}

        {showRepairFields ? (
          <>
            <FormField label="Expected future sale value (optional)" htmlFor="scenario-future-sale-value">
              <Input id="scenario-future-sale-value" inputMode="decimal" value={expectedFutureSaleValue} onChange={(event) => setExpectedFutureSaleValue(event.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Classify this spend" htmlFor="scenario-capitalization">
              <Select id="scenario-capitalization" value={capitalizationClassification} onChange={(event) => setCapitalizationClassification(event.target.value as CapitalizationClassification)}>
                <option value="">Not specified</option>
                <option value="capital_improvement">Capital improvement (adds to basis)</option>
                <option value="expense">Expense (does not change basis)</option>
              </Select>
            </FormField>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add scenario"}
      </Button>
    </form>
  );
}
