"use client";

import { useMemo, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createDecision, createDecisionScenario } from "@/lib/domain/decisions/repository";
import { decisionTypePresentation } from "@/lib/domain/decisions/presentation";
import { assetCapabilities } from "@/lib/domain/assets/capabilities";
import type { DecisionType, DecisionTypeCode } from "@/lib/domain/decisions/types";
import type { AssetSummary } from "@/lib/domain/assets/types";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket } from "@/lib/domain/money/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoreDetails } from "@/components/ui/MoreDetails";

interface CreateDecisionSheetProps {
  decisionType: DecisionType;
  assets: AssetSummary[];
  liabilities: LiabilitySummary[];
  currencies: Currency[];
  buckets: CashBucket[];
  onClose: () => void;
  onCreated: (decisionId: string) => void;
}

/**
 * "What are you considering?" → "Add the relevant details" — steps 1-2 of
 * the canonical decision flow, collapsed into one sheet (creating a
 * Decision with zero scenarios has nothing to evaluate, so splitting
 * these into two separate screens the reference doesn't show either
 * would just add a click). Creates the Decision, then its first Scenario
 * — two real RPC calls, zero cash/asset/liability effect either way (a
 * Decision is a plan, never a transaction). Fields shown are driven
 * entirely by `decisionTypePresentation()` — never every field for every
 * type (progressive disclosure).
 */
export function CreateDecisionSheet({ decisionType, assets, liabilities, currencies, buckets, onClose, onCreated }: CreateDecisionSheetProps) {
  const typeCode = decisionType.code as DecisionTypeCode;
  const presentation = decisionTypePresentation(typeCode);

  const [name, setName] = useState("");
  const [linkedAssetId, setLinkedAssetId] = useState("");
  const [linkedLiabilityId, setLinkedLiabilityId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
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
  const [sourceBucketId, setSourceBucketId] = useState("");
  const [destinationBucketId, setDestinationBucketId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const assetCandidates = useMemo(() => {
    if (!presentation.showsAssetLink) return [];
    const active = assets.filter((a) => !a.isArchived && !a.isDisposed);
    if (!presentation.assetLinkCapability) return active;
    return active.filter((a) => assetCapabilities(a.assetType)[presentation.assetLinkCapability!]);
  }, [assets, presentation]);

  const linkedAsset = assetCandidates.find((a) => a.assetId === linkedAssetId) ?? null;
  const matchingBuckets = currencyCode ? buckets.filter((b) => b.currency_code === currencyCode) : buckets;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const decision = await createDecision(supabase, {
        decisionTypeCode: typeCode,
        name: name.trim(),
        linkedAssetId: linkedAssetId || undefined,
        linkedLiabilityId: linkedLiabilityId || undefined,
      });
      await createDecisionScenario(supabase, {
        decisionId: decision.id,
        name: "First scenario",
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
      });
      onCreated(decision.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this decision.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Consider ${decisionType.display_name}`}
      >
        <div className="mx-auto -mt-1 mb-2 h-1 w-12 rounded-full bg-surface-strong" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-6 text-text-primary">{decisionType.display_name}</h3>
            <p className="text-xs text-text-muted">See what this could change before you commit. This won&apos;t move any money.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-secondary before:absolute before:-inset-1.5 before:content-['']"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <FormField label="Name this decision" htmlFor="decision-name">
            <Input id="decision-name" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder={decisionType.display_name} />
          </FormField>

          {presentation.showsAssetLink ? (
            <FormField label={presentation.assetLinkRequired ? presentation.assetLinkLabel : `${presentation.assetLinkLabel} (optional)`} htmlFor="decision-asset">
              <Select id="decision-asset" required={presentation.assetLinkRequired} value={linkedAssetId} onChange={(e) => setLinkedAssetId(e.target.value)}>
                <option value="" disabled={presentation.assetLinkRequired}>
                  {assetCandidates.length === 0 ? "No eligible assets tracked yet" : "Select"}
                </option>
                {assetCandidates.map((a) => (
                  <option key={a.assetId} value={a.assetId}>
                    {a.name}
                  </option>
                ))}
              </Select>
              {presentation.assetLinkRequired && !linkedAssetId ? <p className="text-xs text-text-muted">{presentation.assetLinkRequiredMessage}</p> : null}
            </FormField>
          ) : null}

          {presentation.showsLiabilityLink ? (
            <FormField label={presentation.liabilityLinkRequired ? presentation.liabilityLinkLabel : `${presentation.liabilityLinkLabel} (optional)`} htmlFor="decision-liability">
              <Select id="decision-liability" required={presentation.liabilityLinkRequired} value={linkedLiabilityId} onChange={(e) => setLinkedLiabilityId(e.target.value)}>
                <option value="" disabled={presentation.liabilityLinkRequired}>
                  {liabilities.length === 0 ? "No debts tracked yet" : "Select"}
                </option>
                {liabilities.map((l) => (
                  <option key={l.liabilityId} value={l.liabilityId}>
                    {l.name}
                  </option>
                ))}
              </Select>
              {presentation.liabilityLinkRequired && !linkedLiabilityId ? <p className="text-xs text-text-muted">{presentation.liabilityLinkRequiredMessage}</p> : null}
            </FormField>
          ) : null}

          <FormField label="Currency" htmlFor="decision-currency">
            <Select
              id="decision-currency"
              required
              value={currencyCode}
              onChange={(e) => {
                setCurrencyCode(e.target.value);
                setSourceBucketId("");
                setDestinationBucketId("");
              }}
            >
              <option value="" disabled>
                {linkedAsset ? `Select (${linkedAsset.currencyCode} suggested — this asset's currency)` : "Select"}
              </option>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.display_name}
                </option>
              ))}
            </Select>
          </FormField>

          {presentation.cashRequiredLabel ? (
            <FormField label={presentation.cashRequiredLabel} htmlFor="decision-cash-required">
              <Input id="decision-cash-required" inputMode="decimal" value={cashRequired} onChange={(e) => setCashRequired(e.target.value)} placeholder="0.00" />
            </FormField>
          ) : null}

          {presentation.grossProceedsLabel ? (
            <FormField label={presentation.grossProceedsLabel} htmlFor="decision-gross-proceeds">
              <Input id="decision-gross-proceeds" inputMode="decimal" value={grossProceeds} onChange={(e) => setGrossProceeds(e.target.value)} placeholder="0.00" />
            </FormField>
          ) : null}

          {presentation.showsDebtPaymentSplit ? (
            <FormField label="Payment amount" htmlFor="decision-debt-principal">
              <Input id="decision-debt-principal" inputMode="decimal" value={debtPrincipalPayment} onChange={(e) => setDebtPrincipalPayment(e.target.value)} placeholder="0.00" />
            </FormField>
          ) : null}

          {presentation.allowsSourceBucket ? (
            <FormField label={presentation.sourceBucketLabel} htmlFor="decision-source-bucket">
              <Select id="decision-source-bucket" required={presentation.sourceBucketRequired} value={sourceBucketId} onChange={(e) => setSourceBucketId(e.target.value)}>
                <option value="" disabled={presentation.sourceBucketRequired}>
                  {presentation.sourceBucketRequired ? "Select" : "None"}
                </option>
                {matchingBuckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              {presentation.sourceBucketRequired && !sourceBucketId ? <p className="text-xs text-text-muted">{presentation.sourceBucketRequiredMessage}</p> : null}
            </FormField>
          ) : null}
          {presentation.allowsDestinationBucket ? (
            <FormField label={presentation.destinationBucketLabel} htmlFor="decision-destination-bucket">
              <Select id="decision-destination-bucket" value={destinationBucketId} onChange={(e) => setDestinationBucketId(e.target.value)}>
                <option value="">None</option>
                {matchingBuckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          {presentation.acquisitionCostsLabel || presentation.proceedsCostsLabel || presentation.showsLoanTerms || presentation.showsExpectedValue || presentation.showsRepairFields || presentation.showsDebtPaymentSplit ? (
            <MoreDetails label="More details">
              <div className="flex flex-col gap-4">
                {presentation.acquisitionCostsLabel ? (
                  <FormField label={presentation.acquisitionCostsLabel} htmlFor="decision-acquisition-costs">
                    <Input id="decision-acquisition-costs" inputMode="decimal" value={acquisitionCosts} onChange={(e) => setAcquisitionCosts(e.target.value)} placeholder="0.00" />
                  </FormField>
                ) : null}
                {presentation.proceedsCostsLabel ? (
                  <FormField label={presentation.proceedsCostsLabel} htmlFor="decision-proceeds-costs">
                    <Input id="decision-proceeds-costs" inputMode="decimal" value={proceedsCosts} onChange={(e) => setProceedsCosts(e.target.value)} placeholder="0.00" />
                  </FormField>
                ) : null}
                {presentation.showsDebtPaymentSplit ? (
                  <>
                    <FormField label="Interest portion (optional)" htmlFor="decision-debt-interest">
                      <Input id="decision-debt-interest" inputMode="decimal" value={debtInterestPayment} onChange={(e) => setDebtInterestPayment(e.target.value)} placeholder="0.00" />
                    </FormField>
                    <FormField label="Fees (optional)" htmlFor="decision-debt-fee">
                      <Input id="decision-debt-fee" inputMode="decimal" value={debtFeePayment} onChange={(e) => setDebtFeePayment(e.target.value)} placeholder="0.00" />
                    </FormField>
                  </>
                ) : null}
                {presentation.showsLoanTerms ? (
                  <>
                    <FormField label="Interest rate % (optional)" htmlFor="decision-interest-rate">
                      <Input id="decision-interest-rate" inputMode="decimal" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} placeholder="0.00" />
                    </FormField>
                    <FormField label="Term in months (optional)" htmlFor="decision-term-months">
                      <Input id="decision-term-months" inputMode="numeric" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
                    </FormField>
                  </>
                ) : null}
                {presentation.showsExpectedValue ? (
                  <FormField label={presentation.expectedValueLabel} htmlFor="decision-expected-value">
                    <Input id="decision-expected-value" inputMode="decimal" value={expectedValueAssumption} onChange={(e) => setExpectedValueAssumption(e.target.value)} placeholder="0.00" />
                  </FormField>
                ) : null}
                {presentation.showsRepairFields ? (
                  <FormField label="Target value after repair (optional)" htmlFor="decision-future-sale-value">
                    <Input id="decision-future-sale-value" inputMode="decimal" value={expectedFutureSaleValue} onChange={(e) => setExpectedFutureSaleValue(e.target.value)} placeholder="0.00" />
                  </FormField>
                ) : null}
              </div>
            </MoreDetails>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={
              pending ||
              !name.trim() ||
              !currencyCode ||
              (presentation.assetLinkRequired && !linkedAssetId) ||
              (presentation.liabilityLinkRequired && !linkedLiabilityId) ||
              (presentation.sourceBucketRequired && !sourceBucketId)
            }
            className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50"
          >
            {pending ? "Modeling…" : "See What This Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
