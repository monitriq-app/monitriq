import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { ResolvedReportingRate } from "@/lib/domain/currency/types";
import type { ReportingFinancialPosition } from "@/lib/domain/financial-position/aggregate";

interface ReportingPositionPanelProps {
  reportingCurrency: string | null;
  reportingPosition: ReportingFinancialPosition | null;
  rateContext: ResolvedReportingRate[];
  currencies: Map<string, Currency>;
}

/**
 * Makes the consolidated reporting Net Worth inspectable, not a mysterious
 * final number — shows exactly which currencies required conversion,
 * whether each rate was used direct or inverted, when it was recorded,
 * and its source (always "manual" this phase). Never implies live FX.
 */
export function ReportingPositionPanel({ reportingCurrency, reportingPosition, rateContext, currencies }: ReportingPositionPanelProps) {
  if (reportingCurrency === null) {
    return <p className="text-text-muted">Not set — no reporting currency configured (set a preferred currency during onboarding).</p>;
  }

  if (reportingPosition === null || reportingPosition.status === "not_calculated") {
    const missing = reportingPosition?.status === "not_calculated" ? reportingPosition.missingRates : [];
    return (
      <div>
        <p className="text-text-muted">
          Reporting Net Worth: Not calculated{missing.length > 0 ? ` — missing a manual rate for: ${missing.join(", ")}` : ""}.
        </p>
        {rateContext.length > 0 ? <RateContextList rateContext={rateContext} /> : null}
      </div>
    );
  }

  const currency = currencies.get(reportingCurrency);
  const formatted = currency ? formatCurrencyAmount(reportingPosition.netWorth, currency) : `${reportingCurrency} ${reportingPosition.netWorth}`;

  return (
    <div>
      <p className="tabular-figures text-lg font-semibold text-text-primary">Reporting Net Worth: {formatted}</p>
      <p className="mt-1 text-xs text-text-muted">Calculated {new Date(reportingPosition.asOf).toLocaleString()} from your own stored manual rates.</p>
      <RateContextList rateContext={rateContext} />
    </div>
  );
}

function RateContextList({ rateContext }: { rateContext: ResolvedReportingRate[] }) {
  if (rateContext.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1 text-xs text-text-muted">
      {rateContext.map((r) => (
        <li key={r.currencyCode}>
          {r.currencyCode}: {r.isInverse ? `1 ${r.storedQuoteCurrency} = ${r.storedRate} ${r.storedBaseCurrency} (inverse applied)` : `1 ${r.storedBaseCurrency} = ${r.storedRate} ${r.storedQuoteCurrency}`} — manual, as of{" "}
          {new Date(r.rateAsOf).toLocaleDateString()}
        </li>
      ))}
    </ul>
  );
}
