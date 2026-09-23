"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createDecision } from "@/lib/domain/decisions/repository";
import type { DecisionType, DecisionTypeCode } from "@/lib/domain/decisions/types";
import type { AssetSummary } from "@/lib/domain/assets/types";
import type { LiabilitySummary } from "@/lib/domain/liabilities/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface CreateDecisionFormProps {
  decisionTypes: DecisionType[];
  assets: AssetSummary[];
  liabilities: LiabilitySummary[];
}

/**
 * A Decision is a question, never a transaction — creating one has zero
 * financial effect. linked_asset_id/linked_liability_id are optional
 * "where applicable" context (e.g. Sell Asset names the asset), never
 * type-enforced.
 */
export function CreateDecisionForm({ decisionTypes, assets, liabilities }: CreateDecisionFormProps) {
  const router = useRouter();
  const [decisionTypeCode, setDecisionTypeCode] = useState<DecisionTypeCode | "">("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkedAssetId, setLinkedAssetId] = useState("");
  const [linkedLiabilityId, setLinkedLiabilityId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await createDecision(supabase, {
        decisionTypeCode: decisionTypeCode as DecisionTypeCode,
        name: name.trim(),
        description: description.trim() || undefined,
        linkedAssetId: linkedAssetId || undefined,
        linkedLiabilityId: linkedLiabilityId || undefined,
      });
      setDecisionTypeCode("");
      setName("");
      setDescription("");
      setLinkedAssetId("");
      setLinkedLiabilityId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this decision.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="decision-name">
          <Input id="decision-name" required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} placeholder="Repair the car" />
        </FormField>
        <FormField label="Type" htmlFor="decision-type">
          <Select id="decision-type" required value={decisionTypeCode} onChange={(event) => setDecisionTypeCode(event.target.value as DecisionTypeCode)}>
            <option value="" disabled>
              Select
            </option>
            {decisionTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.display_name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Linked asset (optional)" htmlFor="decision-asset">
          <Select id="decision-asset" value={linkedAssetId} onChange={(event) => setLinkedAssetId(event.target.value)}>
            <option value="">None</option>
            {assets.map((asset) => (
              <option key={asset.assetId} value={asset.assetId}>
                {asset.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Linked liability (optional)" htmlFor="decision-liability">
          <Select id="decision-liability" value={linkedLiabilityId} onChange={(event) => setLinkedLiabilityId(event.target.value)}>
            <option value="">None</option>
            {liabilities.map((liability) => (
              <option key={liability.liabilityId} value={liability.liabilityId}>
                {liability.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Description (optional)" htmlFor="decision-description">
        <Input id="decision-description" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
      </FormField>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create decision"}
      </Button>
    </form>
  );
}
