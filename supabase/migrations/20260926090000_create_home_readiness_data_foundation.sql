-- Monatriq: Home readiness — Money period summary, reporting FX context,
-- liquidity completeness (P0-E3-S1A)
--
-- Three independent, narrow additions closing the remaining gaps before
-- Home can be built. No new product domain, no redesign of any existing
-- foundation screen. All three reuse existing tables/classification —
-- this migration adds functions only, plus zero new tables.
--
-- PART A — MONEY PERIOD SUMMARY
-- financial_events.cash_flow_class already distinguishes income/
-- other_inflow/expense/other_outflow/transfer/opening_balance (P0-E2-S2,
-- extended P0-E2-S4) — see set_financial_event_classification(). This is
-- exactly the semantic layer "This Month" needs, so money_period_summary()
-- filters by cash_flow_class, never by hand-enumerating event_type values.
-- This makes it automatically correct for any FUTURE event type as long as
-- its cash_flow_class is set correctly (e.g. a future asset-sale-proceeds
-- event type would need no change here at all).
--
-- TIMEZONE STRATEGY: identical to obligation_summary()/upcoming_
-- obligations() (P0-E2-S6) — coalesce(profiles.timezone, 'UTC'), never the
-- database server's own timezone. resolve_period_bounds() centralizes the
-- "what dates does 'this month' mean for this user, right now" resolution
-- so it's computed in exactly one place and remains correct even when a
-- period has zero activity (money_period_summary() would otherwise return
-- zero rows with no way to know which period was actually evaluated).
--
-- PART B — REPORTING FX CONTEXT
-- Reuses public.fx_rates (P0-E2-S2) exactly as designed: its own comment
-- already anticipated "source=manual rows are standalone user notes."
-- record_manual_reporting_rate() is a thin, self-documenting entry point
-- (source is always 'manual', event_id is always null) — no schema change,
-- no second FX subsystem. Transaction-actual rates (source=
-- 'transaction_actual', tied to a real fx_transfer event) remain
-- completely separate rows with a different meaning and are NEVER
-- selected by reporting_fx_rates() (which filters source = 'manual'
-- explicitly) — Financial Position reporting conversion never silently
-- reuses an old transaction's actual rate as a current valuation rate.
--
-- Direct/inverse resolution deliberately happens in TypeScript
-- (lib/domain/currency/reporting-rates.ts), not SQL: reporting_fx_rates()
-- returns only the user's own latest-per-(base,quote)-pair manual rows
-- touching the reporting currency, in EITHER direction, unmodified; the
-- inversion arithmetic itself uses decimal.js, consistent with every
-- other exact-decimal combination step in this codebase (see
-- convertFinancialPositionToReportingCurrency in
-- lib/domain/financial-position/aggregate.ts, which this phase reuses
-- unchanged).
--
-- PART C — LIQUIDITY COMPLETENESS
-- asset_quicksale_coverage() / receivable_recoverability_coverage() read
-- from asset_summary()/receivable_summary() (already the canonical
-- source for these values in financial_position_by_currency()) — never a
-- second raw-table query. They add COUNTS and a coverage_status
-- ('not_set'|'partial'|'complete') alongside the same sums
-- financial_position_by_currency() already exposes, so Home can tell
-- "2 of 4 assets have a quick-sale estimate" from "NGN 20M is the total
-- of every asset." financial_position_by_currency() itself is NOT
-- modified by this migration — zero regression risk to the 33/33 passing
-- P0-E3-S1 suite.

-- ===========================================================================
-- PART A. Money period summary
-- ===========================================================================

create function public.resolve_period_bounds(p_start date default null, p_end date default null)
returns table (period_start date, period_end date)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_now_local timestamp;
begin
  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_timezone := coalesce(v_timezone, 'UTC');
  v_now_local := now () at time zone v_timezone;

  return query
    select
      coalesce(p_start, date_trunc('month', v_now_local)::date),
      coalesce(p_end, (date_trunc('month', v_now_local) + interval '1 month' - interval '1 day')::date);
end;
$$;

comment on function public.resolve_period_bounds(date, date) is
  'Resolves an explicit [p_start, p_end] or, when either is omitted, the current calendar month in the caller''s profile timezone (falls back to UTC). The single source of "what period does This Month mean" -- called both directly (Home can always know the resolved bounds even with zero activity) and internally by money_period_summary().';

create function public.money_period_summary(p_start date default null, p_end date default null)
returns table (
  currency_code text,
  cash_in text,
  cash_out text,
  net_external_cash_flow text,
  earned_income text,
  expense text,
  transfer_in text,
  transfer_out text
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_start date;
  v_end date;
begin
  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_timezone := coalesce(v_timezone, 'UTC');

  select b.period_start, b.period_end into v_start, v_end
    from public.resolve_period_bounds (p_start, p_end) b;

  return query
    select
      m.currency_code,
      coalesce(sum(m.amount) filter (where e.cash_flow_class in ('income', 'other_inflow')), 0::numeric(20, 6))::text,
      coalesce(sum(-m.amount) filter (where e.cash_flow_class in ('expense', 'other_outflow')), 0::numeric(20, 6))::text,
      (
        coalesce(sum(m.amount) filter (where e.cash_flow_class in ('income', 'other_inflow')), 0::numeric(20, 6))
        - coalesce(sum(-m.amount) filter (where e.cash_flow_class in ('expense', 'other_outflow')), 0::numeric(20, 6))
      )::text,
      coalesce(sum(m.amount) filter (where e.cash_flow_class = 'income'), 0::numeric(20, 6))::text,
      coalesce(sum(-m.amount) filter (where e.cash_flow_class = 'expense'), 0::numeric(20, 6))::text,
      coalesce(sum(m.amount) filter (where e.cash_flow_class = 'transfer' and m.amount > 0), 0::numeric(20, 6))::text,
      coalesce(sum(-m.amount) filter (where e.cash_flow_class = 'transfer' and m.amount < 0), 0::numeric(20, 6))::text
    from public.cash_movements m
    join public.financial_events e on e.id = m.event_id
    where m.user_id = auth.uid ()
      and e.voided_at is null
      and (e.occurred_at at time zone v_timezone)::date between v_start and v_end
    group by m.currency_code;
end;
$$;

comment on function public.money_period_summary(date, date) is
  'Canonical Money period/"This Month" summary, per native currency. Classifies purely from financial_events.cash_flow_class (income/other_inflow/expense/other_outflow/transfer/opening_balance) -- never event_type -- so cashIn/cashOut are real EXTERNAL flows (opening_balance and transfer/fx_transfer excluded entirely), earnedIncome/expense stay distinct from cashIn/cashOut (receivable_recovery and loan_proceeds are cashIn but never earnedIncome; debt_principal_payment is cashOut but never expense), and transferIn/transferOut are exposed separately, never folded into external flow. Currencies with zero activity in the period are simply absent, matching every other per-currency read model''s convention.';

revoke all on function public.resolve_period_bounds(date, date) from public, anon;
grant execute on function public.resolve_period_bounds(date, date) to authenticated;

revoke all on function public.money_period_summary(date, date) from public, anon;
grant execute on function public.money_period_summary(date, date) to authenticated;

-- ===========================================================================
-- PART B. Reporting FX context (reuses public.fx_rates, P0-E2-S2)
-- ===========================================================================

create function public.record_manual_reporting_rate(
  p_base_currency text,
  p_quote_currency text,
  p_rate numeric,
  p_rate_as_of timestamptz default now()
)
returns public.fx_rates
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_rate public.fx_rates;
begin
  insert into public.fx_rates (user_id, base_currency, quote_currency, rate, rate_as_of, source)
    values (auth.uid (), p_base_currency, p_quote_currency, p_rate, p_rate_as_of, 'manual')
    returning * into v_rate;
  return v_rate;
end;
$$;

comment on function public.record_manual_reporting_rate(text, text, numeric, timestamptz) is
  'Records one append-only manual reporting/valuation rate row (source=manual, event_id=null) in the existing public.fx_rates table -- never overwrites a prior entry. "1 base = rate quote", the same base/quote direction convention P0-E2-S2 established. Ownership (user_id=auth.uid()) is set here AND re-checked by fx_rates_insert_own -- belt and suspenders, the same pattern used wherever a function sets an owner column itself.';

-- Latest manual rate per (base_currency, quote_currency) pair touching the
-- given reporting currency, in EITHER direction -- so the caller can
-- resolve a direct rate (quote_currency = reporting) or fall back to the
-- mathematical inverse of a rate stored the other way around
-- (base_currency = reporting). Returns the rate exactly as the user
-- recorded it; inversion is a TypeScript-layer concern (see the header
-- comment) so this function never fabricates a value the user didn't
-- explicitly enter.
create function public.reporting_fx_rates(p_reporting_currency text)
returns table (
  base_currency text,
  quote_currency text,
  rate text,
  rate_as_of timestamptz,
  source text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select distinct on (r.base_currency, r.quote_currency)
    r.base_currency, r.quote_currency, r.rate::text, r.rate_as_of, r.source
  from public.fx_rates r
  where r.user_id = auth.uid ()
    and r.source = 'manual'
    and (r.base_currency = p_reporting_currency or r.quote_currency = p_reporting_currency)
  order by r.base_currency, r.quote_currency, r.rate_as_of desc, r.created_at desc;
$$;

comment on function public.reporting_fx_rates(text) is
  'The user''s own latest manual reporting rate per currency pair touching p_reporting_currency, either direction. Deliberately filters source = ''manual'' only -- a transaction_actual rate (the rate actually applied to one past fx_transfer) is never selected here, so Financial Position reporting conversion never silently reuses it as a current valuation rate.';

revoke all on function public.record_manual_reporting_rate(text, text, numeric, timestamptz) from public, anon;
grant execute on function public.record_manual_reporting_rate(text, text, numeric, timestamptz) to authenticated;

revoke all on function public.reporting_fx_rates(text) from public, anon;
grant execute on function public.reporting_fx_rates(text) to authenticated;

-- ===========================================================================
-- PART C. Liquidity completeness (Assets, Receivables)
-- ===========================================================================

create function public.asset_quicksale_coverage()
returns table (
  currency_code text,
  active_asset_count integer,
  quicksale_estimate_count integer,
  quicksale_sum text,
  coverage_status text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    s.currency_code,
    count(*)::integer,
    count(*) filter (where s.quick_sale_estimate is not null)::integer,
    sum(s.quick_sale_estimate::numeric) filter (where s.quick_sale_estimate is not null)::text,
    case
      when count(*) filter (where s.quick_sale_estimate is not null) = 0 then 'not_set'
      when count(*) filter (where s.quick_sale_estimate is not null) = count(*) then 'complete'
      else 'partial'
    end
  from public.asset_summary () s
  where s.is_archived = false
  group by s.currency_code;
$$;

comment on function public.asset_quicksale_coverage() is
  'Per-currency quick-sale-estimate coverage metadata: how many active (non-archived) assets exist vs how many have a recorded quick_sale_estimate, plus the same sum financial_position_by_currency() exposes as assetQuickSalePotential. Reads asset_summary() (the same canonical source, never a second raw-table query) so the sum stays trivially consistent. coverage_status is not_set (zero estimates recorded), complete (every active asset estimated), or partial (some but not all) -- lets Home distinguish "the only number we have" from "the whole picture."';

create function public.receivable_recoverability_coverage()
returns table (
  currency_code text,
  active_receivable_count integer,
  recoverability_estimate_count integer,
  recoverable_sum text,
  coverage_status text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    s.currency_code,
    count(*)::integer,
    count(*) filter (where s.estimated_recoverable_value is not null)::integer,
    sum(s.estimated_recoverable_value::numeric) filter (where s.estimated_recoverable_value is not null)::text,
    case
      when count(*) filter (where s.estimated_recoverable_value is not null) = 0 then 'not_set'
      when count(*) filter (where s.estimated_recoverable_value is not null) = count(*) then 'complete'
      else 'partial'
    end
  from public.receivable_summary () s
  where s.is_archived = false
  group by s.currency_code;
$$;

comment on function public.receivable_recoverability_coverage() is
  'Per-currency recoverability-estimate coverage metadata, the same shape and reasoning as asset_quicksale_coverage() -- see that comment. Reads receivable_summary(), the same canonical source financial_position_by_currency() uses for receivablesEstimatedRecoverable.';

revoke all on function public.asset_quicksale_coverage() from public, anon;
grant execute on function public.asset_quicksale_coverage() to authenticated;

revoke all on function public.receivable_recoverability_coverage() from public, anon;
grant execute on function public.receivable_recoverability_coverage() to authenticated;
