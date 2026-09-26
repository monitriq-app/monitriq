"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createFinancialRule, recordFinancialRuleVersion } from "@/lib/domain/rules/repository";
import type { FinancialRuleSummary } from "@/lib/domain/rules/types";
import type { Currency } from "@/lib/domain/currency/types";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface MinimumCashSectionProps {
  ruleSummaries: FinancialRuleSummary[];
  currencies: Currency[];
}

/**
 * "Minimum cash to keep" — the production replacement for the old
 * foundation-level `MinimumCashFloorList` + `MinimumCashFloorForm` (one
 * giant always-visible form). One compact card per currency with an
 * active rule, an inline "Edit" that reveals just an amount field (never
 * a full-page form for a single-number change), and a progressively-
 * disclosed "Set for another currency" action for currencies with no
 * rule yet. Reuses `createFinancialRule()`/`recordFinancialRuleVersion()`
 * unchanged — this file only changes how the same two calls are
 * presented. An explicit 0 remains a fully valid, saveable choice (the
 * domain's own "0 is not the same as never configuring one" rule is
 * untouched); the UI simply doesn't lead with that as label text.
 */
export function MinimumCashSection({ ruleSummaries, currencies }: MinimumCashSectionProps) {
  const router = useRouter();
  const activeRules = ruleSummaries.filter((r) => r.status === "active");
  const configuredCodes = new Set(activeRules.map((r) => r.currencyCode));
  const unconfigured = currencies.filter((c) => !configuredCodes.has(c.code));
  const [addingNew, setAddingNew] = useState(false);

  async function saveThreshold(ruleId: string | null, currencyCode: string, thresholdValue: string) {
    const supabase = createClient();
    if (ruleId) {
      await recordFinancialRuleVersion(supabase, { ruleId, thresholdValue });
    } else {
      await createFinancialRule(supabase, { ruleType: "minimum_cash_floor", currencyCode, thresholdValue });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {activeRules.map((rule) => (
        <MinimumCashRow key={rule.ruleId} rule={rule} currencies={currencies} onSave={(value) => saveThreshold(rule.ruleId, rule.currencyCode, value)} />
      ))}

      {addingNew ? (
        <MinimumCashAddForm
          currencies={unconfigured}
          onCancel={() => setAddingNew(false)}
          onSave={async (currencyCode, value) => {
            await saveThreshold(null, currencyCode, value);
            setAddingNew(false);
          }}
        />
      ) : unconfigured.length > 0 ? (
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-semibold text-text-secondary hover:text-text-primary"
        >
          <Plus size={15} aria-hidden="true" />
          Set for another currency
        </button>
      ) : null}
    </div>
  );
}

function MinimumCashRow({ rule, currencies, onSave }: { rule: FinancialRuleSummary; currencies: Currency[]; onSave: (value: string) => Promise<void> }) {
  const currency = currencies.find((c) => c.code === rule.currencyCode);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rule.currentThreshold ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSave(value);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this amount.");
    } finally {
      setPending(false);
    }
  }

  const formatted = rule.currentThreshold !== null ? (currency ? formatCurrencyAmount(rule.currentThreshold, currency, { trimTrailingZeros: true }) : `${rule.currencyCode} ${rule.currentThreshold}`) : "Not set";

  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{rule.currencyCode}</p>
          <p className="text-xs text-text-muted">Minimum cash to keep</p>
          {!editing ? <p className="tabular-figures mt-0.5 text-lg font-semibold text-text-primary">{formatted}</p> : null}
        </div>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="min-h-12 rounded-full bg-surface-strong px-4 text-[13px] font-semibold text-accent-primary">
            Edit
          </button>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Input required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" autoFocus />
            <p className="mt-1 text-[11px] text-text-muted">An explicit 0 is a valid choice — it means you don&apos;t want any {rule.currencyCode} cash held back.</p>
          </div>
          <button type="submit" disabled={pending} className="min-h-12 shrink-0 rounded-full bg-accent-primary px-4 text-[13px] font-semibold text-background disabled:opacity-50">
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="min-h-12 shrink-0 rounded-full bg-surface-strong px-4 text-[13px] font-semibold text-text-secondary">
            Cancel
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MinimumCashAddForm({ currencies, onCancel, onSave }: { currencies: Currency[]; onCancel: () => void; onSave: (currencyCode: string, value: string) => Promise<void> }) {
  const [currencyCode, setCurrencyCode] = useState("");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSave(currencyCode, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this amount.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-surface-raised p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-floor-currency" className="text-sm font-medium text-text-secondary">
          Currency
        </label>
        <Select id="new-floor-currency" required value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
          <option value="" disabled>
            Select
          </option>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.display_name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-floor-value" className="text-sm font-medium text-text-secondary">
          Minimum cash to keep
        </label>
        <Input id="new-floor-value" required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
        <p className="text-[11px] text-text-muted">The amount you want to keep untouched before Monitriq treats other cash as available to use. 0 is a valid choice.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-12 flex-1 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 rounded-full bg-surface-strong px-4 text-sm font-semibold text-text-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
