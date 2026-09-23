"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordDecisionChoice } from "@/lib/domain/decisions/repository";
import type { DecisionChoice, DecisionChoiceHistoryItem } from "@/lib/domain/decisions/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface DecisionJournalProps {
  decisionId: string;
  history: DecisionChoiceHistoryItem[];
}

const CHOICE_LABELS: Record<DecisionChoice, string> = {
  proceed: "Proceed",
  wait: "Wait",
  decline: "Decline",
  keep_reviewing: "Keep Reviewing",
};

/**
 * Recording ANY choice here — including Proceed — is intent only. It
 * never spends cash, creates an asset, changes a liability, or touches
 * any other domain. Choice history is append-only; every past entry
 * stays visible.
 */
export function DecisionJournal({ decisionId, history }: DecisionJournalProps) {
  const router = useRouter();
  const [choice, setChoice] = useState<DecisionChoice | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      await recordDecisionChoice(supabase, { decisionId, choice: choice as DecisionChoice, note: note.trim() || undefined });
      setChoice("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this choice.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {history.length === 0 ? (
        <p className="text-text-muted">No choice recorded yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {history.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2">
              <span className="text-text-primary">{CHOICE_LABELS[item.choice] ?? item.choice}</span>
              <span className="text-text-muted">
                {new Date(item.createdAt).toLocaleDateString()}
                {item.note ? ` — ${item.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Your choice" htmlFor="journal-choice">
            <Select id="journal-choice" required value={choice} onChange={(event) => setChoice(event.target.value as DecisionChoice)}>
              <option value="" disabled>
                Select
              </option>
              <option value="proceed">Proceed</option>
              <option value="wait">Wait</option>
              <option value="decline">Decline</option>
              <option value="keep_reviewing">Keep Reviewing</option>
            </Select>
          </FormField>
          <FormField label="Note (optional)" htmlFor="journal-note">
            <Input id="journal-note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record choice"}
        </Button>
      </form>
    </div>
  );
}
