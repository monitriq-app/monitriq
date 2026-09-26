"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, HelpCircle, MinusCircle, PauseCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { runSpendingCheck } from "@/lib/domain/spending-check/service";
import { NO_ACCOUNT_TEXT, PAGE_SUBTITLE, PAGE_TITLE, SUGGESTION_TONE, presentSpendingCheck, purchaseCategories, type SpendingCheckView } from "@/lib/domain/spending-check/presentation";
import { TONE_TEXT_CLASS } from "@/lib/domain/rules/labels";
import { validateMoneyInput } from "@/lib/domain/common/presentation";
import type { SpendingCheckResult, SuggestionState } from "@/lib/domain/spending-check/types";
import type { Currency } from "@/lib/domain/currency/types";
import type { CashBucket, MoneySpendingCategory } from "@/lib/domain/money/types";
import { CashStatusBadge } from "@/components/rules/CashStatusBadge";
import { BackLink } from "@/components/layout/BackLink";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoreDetails } from "@/components/ui/MoreDetails";
import { useLanguageMode } from "@/components/language/LanguageProvider";
import { useQuickAdd } from "@/components/quick-add/QuickAddContext";

interface Props {
  currencies: Currency[];
  buckets: CashBucket[];
  categories: MoneySpendingCategory[];
  defaultCurrencyCode: string | null;
}

const ICONS: Record<SuggestionState, typeof CheckCircle2> = {
  proceed: CheckCircle2,
  reduce: MinusCircle,
  wait: PauseCircle,
  review: HelpCircle,
  setup: Clock,
};

interface Checked {
  result: SpendingCheckResult;
  view: SpendingCheckView;
  description: string;
  bucketId: string;
  categoryCode: string | null;
  amount: string;
}

export function SpendingCheckWorkspace({ currencies, buckets, categories, defaultCurrencyCode }: Props) {
  const { openSpent } = useQuickAdd();
  const languageMode = useLanguageMode();
  const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));
  const active = buckets.filter((b) => !b.is_archived);
  const startCurrency = defaultCurrencyCode && currenciesByCode.has(defaultCurrencyCode) ? defaultCurrencyCode : (active[0]?.currency_code ?? "");

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(startCurrency);
  const [bucketId, setBucketId] = useState(() => {
    const own = active.filter((b) => b.currency_code === startCurrency);
    return own.length === 1 ? own[0].id : "";
  });
  const [categoryCode, setCategoryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState<Checked | null>(null);

  const accounts = active.filter((b) => b.currency_code === currencyCode);
  // Currencies the user already tracks cash in come first; every supported currency stays available.
  const tracked = new Set(active.map((b) => b.currency_code));
  const orderedCurrencies = [...currencies.filter((c) => tracked.has(c.code)), ...currencies.filter((c) => !tracked.has(c.code))];
  const offered = purchaseCategories(categories);
  const exponent = currenciesByCode.get(currencyCode)?.decimal_exponent ?? 2;

  function pickCurrency(code: string) {
    setCurrencyCode(code);
    const own = active.filter((b) => b.currency_code === code);
    setBucketId(own.length === 1 ? own[0].id : "");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = validateMoneyInput(amount, exponent);
    if (problem) return setError(problem);
    if (!bucketId) return setError("Choose the account you would pay from.");
    setPending(true);
    try {
      const label = offered.find((c) => c.code === categoryCode)?.display_name ?? null;
      const trimmed = amount.trim();
      const result = await runSpendingCheck(createClient(), { bucketId, amount: trimmed, categoryCode: categoryCode || null, categoryLabel: label, description: description.trim() });
      setChecked({ result, view: presentSpendingCheck(result, description.trim(), currenciesByCode, languageMode), description: description.trim(), bucketId, categoryCode: categoryCode || null, amount: trimmed });
    } catch (err) {
      setError((err as { message?: string })?.message || "Could not check this purchase.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{PAGE_TITLE}</h1>
        <p className="text-sm text-text-secondary">{PAGE_SUBTITLE}</p>
      </div>

      {checked ? (
        <ResultView
          checked={checked}
          onEdit={() => setChecked(null)}
          onRecord={() => openSpent({ amount: checked.amount, bucketId: checked.bucketId, categoryCode: checked.categoryCode, description: checked.description })}
        />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl bg-surface-raised p-4" noValidate>
          <FormField label="What are you thinking about buying?" htmlFor="check-what">
            <Input id="check-what" maxLength={100} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Phone" />
          </FormField>
          <FormField label="Amount" htmlFor="check-amount">
            <Input id="check-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </FormField>
          <FormField label="Currency" htmlFor="check-currency">
            <Select id="check-currency" required value={currencyCode} onChange={(e) => pickCurrency(e.target.value)}>
              <option value="" disabled>
                Select
              </option>
              {orderedCurrencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.display_name}
                </option>
              ))}
            </Select>
          </FormField>
          {currencyCode && accounts.length === 0 ? (
            <div className="rounded-lg bg-surface-strong p-3 text-sm text-text-secondary">
              <p>{NO_ACCOUNT_TEXT}</p>
              <Link href="/money#create-bucket" className="flex min-h-12 items-center font-semibold text-accent-primary">
                Add cash account
              </Link>
            </div>
          ) : (
            <FormField label="Which account would you pay from?" htmlFor="check-account">
              <Select id="check-account" required value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {accounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.currency_code})
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Spending category (optional)" htmlFor="check-category">
            <Select id="check-category" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)}>
              <option value="">Not sure</option>
              {offered.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.display_name}
                </option>
              ))}
            </Select>
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending || !bucketId || amount.trim() === ""} className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background disabled:opacity-50">
            {pending ? "Checking…" : "Check this purchase"}
          </button>
          <p className="text-xs text-text-muted">Checking does not spend or change anything.</p>
        </form>
      )}

      <p className="text-xs text-text-muted">
        Need a more detailed comparison?{" "}
        <Link href="/decisions" className="inline-flex min-h-12 items-center font-semibold text-accent-primary">
          Open Decisions
        </Link>
      </p>
    </div>
  );
}

function ResultView({ checked, onEdit, onRecord }: { checked: Checked; onEdit: () => void; onRecord: () => void }) {
  const { view } = checked;
  const Icon = ICONS[view.suggestionState];
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface-raised p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Your purchase</p>
        <p className="tabular-figures break-words text-lg font-semibold text-text-primary">{view.purchaseLabel}</p>
      </div>

      <section aria-label="Suggested next step" className="rounded-xl bg-surface-raised p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Suggested next step</p>
        <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Icon size={20} className={`shrink-0 ${TONE_TEXT_CLASS[SUGGESTION_TONE[view.suggestionState]]}`} aria-hidden="true" />
          {view.suggestionLabel}
        </p>
        {view.suggestionState === "proceed" ? <p className="mt-1 text-sm text-text-secondary">{view.summary}</p> : null}
        {view.reasons.length > 0 ? (
          <div className="mt-2">
            <p className="text-xs font-semibold text-text-muted">Why</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-sm text-text-secondary">
              {view.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {view.caveats.length > 0 ? (
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs text-text-muted">
            {view.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-label="What would change" className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-text-primary">What would change</h2>
        {view.rows.map((row) => (
          <div key={row.key} className="rounded-xl bg-surface-raised p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-primary">{row.title}</p>
              <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-semibold text-text-secondary">{row.status}</span>
            </div>
            {row.lines.length > 0 ? (
              <dl className="mt-1.5 grid grid-cols-1 gap-1 text-sm">
                {row.lines.map((l) => (
                  <div key={l.label} className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0 text-text-muted">{l.label}</dt>
                    <dd className={`tabular-figures min-w-0 break-words text-right font-semibold ${l.tone ? TONE_TEXT_CLASS[l.tone] : "text-text-primary"}`}>{l.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {row.cashStatus && row.cashStatus.result.state !== "needs_setup" ? (
              <div className="mt-2 flex flex-col gap-1">
                <span>
                  <CashStatusBadge result={row.cashStatus.result} />
                </span>
                <p className="text-xs text-text-secondary">{row.cashStatus.sentence}</p>
              </div>
            ) : null}
            {row.note ? <p className="mt-1.5 text-xs text-text-muted">{row.note}</p> : null}
            {row.action ? (
              <Link href={row.action.href} className="flex min-h-12 items-center text-[13px] font-semibold text-accent-primary">
                {row.action.label}
              </Link>
            ) : null}
          </div>
        ))}
      </section>

      <MoreDetails label="How this was calculated">
        <dl className="flex flex-col gap-1.5 rounded-xl bg-surface-raised p-3.5 text-sm">
          {view.calc.map((c, i) => (
            <div key={`${c.tag}-${i}`} className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0">
                <span className="mr-2 text-[10px] font-semibold tracking-wide text-text-muted">{c.tag}</span>
                <span className="text-text-secondary">{c.label}</span>
              </dt>
              <dd className="tabular-figures min-w-0 break-words text-right font-semibold text-text-primary">{c.value}</dd>
            </div>
          ))}
        </dl>
      </MoreDetails>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={onEdit} className="h-12 rounded-full bg-accent-primary text-sm font-semibold text-background">
          Change amount
        </button>
        <button type="button" onClick={onRecord} className="h-12 rounded-full bg-surface-strong text-sm font-semibold text-text-primary">
          Record this purchase
        </button>
        <p className="text-center text-xs text-text-muted">Recording opens Money Spent so you can confirm it. Nothing is recorded until you save.</p>
      </div>
    </div>
  );
}
