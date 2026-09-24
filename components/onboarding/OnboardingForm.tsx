"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateProfile } from "@/lib/domain/profile/repository";
import type { Currency } from "@/lib/domain/currency/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useSupportedTimezones, useDetectedTimezone } from "./useTimezoneOptions";

interface OnboardingFormValues {
  first_name: string;
  preferred_name: string;
  preferred_currency: string;
  timezone: string;
}

interface OnboardingFormProps {
  currencies: Currency[];
  initial: OnboardingFormValues;
}

export function OnboardingForm({ currencies, initial }: OnboardingFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const timezones = useSupportedTimezones();
  const detectedTimezone = useDetectedTimezone();
  // The browser-detected zone is only ever a starting suggestion, shown
  // once the real list has loaded — the user still explicitly confirms it
  // by submitting the form, it is never silently saved on their behalf.
  const timezoneValue =
    values.timezone || (timezones.includes(detectedTimezone) ? detectedTimezone : "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await updateProfile(supabase, {
        first_name: values.first_name.trim(),
        preferred_name: values.preferred_name.trim() || null,
        preferred_currency: values.preferred_currency,
        timezone: timezoneValue,
      });
      router.replace("/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="First name" htmlFor="first_name">
        <Input
          id="first_name"
          name="first_name"
          autoComplete="given-name"
          required
          maxLength={100}
          value={values.first_name}
          onChange={(event) => setValues((v) => ({ ...v, first_name: event.target.value }))}
        />
      </FormField>
      <FormField label="Preferred name (optional)" htmlFor="preferred_name">
        <Input
          id="preferred_name"
          name="preferred_name"
          autoComplete="nickname"
          maxLength={100}
          value={values.preferred_name}
          onChange={(event) => setValues((v) => ({ ...v, preferred_name: event.target.value }))}
        />
      </FormField>
      <FormField label="Preferred currency" htmlFor="preferred_currency">
        <Select
          id="preferred_currency"
          name="preferred_currency"
          required
          value={values.preferred_currency}
          onChange={(event) => setValues((v) => ({ ...v, preferred_currency: event.target.value }))}
        >
          <option value="" disabled>
            Select a currency
          </option>
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.display_name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Timezone" htmlFor="timezone">
        <Select
          id="timezone"
          name="timezone"
          required
          value={timezoneValue}
          onChange={(event) => setValues((v) => ({ ...v, timezone: event.target.value }))}
        >
          <option value="" disabled>
            Select a timezone
          </option>
          {timezoneValue && !timezones.includes(timezoneValue) ? (
            <option value={timezoneValue}>{timezoneValue}</option>
          ) : null}
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </FormField>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
