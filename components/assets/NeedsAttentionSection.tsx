import { Zap, ArrowRight, Clock } from "lucide-react";
import { categoryMeta } from "@/lib/domain/assets/category-meta";
import type { AssetSummary, AssetTypeCode } from "@/lib/domain/assets/types";
import type { ReceivableSummary } from "@/lib/domain/receivables/types";

interface NeedsAttentionSectionProps {
  activeAssets: AssetSummary[];
  receivables: ReceivableSummary[];
}

/**
 * "Needs Attention" — every signal here is a real, factual gap in the
 * user's own recorded data, never an invented judgment ("urgent," "sell
 * now," "bad investment"). Two real, canonically-supported signals exist
 * today: an active asset with no current-value estimate at all (missing
 * valuation), and an active receivable with no follow-up ever logged
 * (`lastFollowUpAt` null — a real column, see receivables' own
 * ReceivableSummary). Neither is inferred from valuation/repair math —
 * both are a direct null-check on a real field. Other signal types the
 * approved reference shows (e.g. a vehicle ready to list) have no
 * canonical backing yet (no "ready" concept exists) and are not
 * reproduced — see the P0-E3-S4 report's "reference features
 * intentionally omitted" section.
 */
export function NeedsAttentionSection({ activeAssets, receivables }: NeedsAttentionSectionProps) {
  const missingValuation = activeAssets.filter((a) => a.estimatedCurrentValue === null);
  const missingFollowUp = receivables.filter((r) => !r.isArchived && r.lastFollowUpAt === null);
  const total = missingValuation.length + missingFollowUp.length;

  if (total === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold leading-6 text-text-primary">
          <Zap size={16} className="text-attention" aria-hidden="true" />
          Needs Attention
        </h2>
        <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold text-attention">
          {total} {total === 1 ? "Signal" : "Signals"}
        </span>
      </div>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
        {missingValuation.map((asset) => {
          const meta = categoryMeta(asset.assetType as AssetTypeCode);
          return (
            <div key={asset.assetId} className="flex w-64 shrink-0 flex-col justify-between rounded-xl bg-surface-raised p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="rounded-full bg-focus/10 px-2 py-0.5 text-[11px] font-semibold text-focus">No Valuation Set</span>
                <ArrowRight size={16} className="shrink-0 text-focus" aria-hidden="true" />
              </div>
              <p className="truncate text-sm font-semibold text-text-primary">{asset.name}</p>
              <p className="text-xs text-text-muted">{meta.sectionTitle} — needs a current-value estimate.</p>
            </div>
          );
        })}
        {missingFollowUp.map((receivable) => (
          <div key={receivable.receivableId} className="flex w-64 shrink-0 flex-col justify-between rounded-xl bg-surface-raised p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="rounded-full bg-attention/10 px-2 py-0.5 text-[11px] font-semibold text-attention">Follow-Up Not Set</span>
              <Clock size={16} className="shrink-0 text-attention" aria-hidden="true" />
            </div>
            <p className="truncate text-sm font-semibold text-text-primary">{receivable.name}</p>
            <p className="text-xs text-text-muted">Follow-up date not set. Set a follow-up to track this claim.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
