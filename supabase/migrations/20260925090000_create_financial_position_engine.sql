-- Monatriq: Unified Financial Position & cross-domain aggregation engine
-- (P0-E3-S1)
--
-- Full design rationale in docs/architecture/FINANCIAL_DOMAIN_MODEL.md and
-- docs/reports/P0-E3-S1-unified-financial-position-engine.txt.
--
-- AGGREGATION, NOT OWNERSHIP: this migration adds exactly one new table-
-- free SQL function. Every figure it returns is composed by calling an
-- existing canonical domain function directly -- money_currency_totals(),
-- asset_native_currency_totals(), receivable_native_currency_totals(),
-- liability_native_currency_totals(), safe_to_deploy_by_currency(),
-- asset_summary(), receivable_summary(), goal_bucket_shortfalls() --
-- never a re-derived cash balance, asset value, receivable/liability
-- outstanding, or Safe-to-Deploy formula. No new table is created; there
-- is nothing here that could become a second, driftable source of truth.
--
-- NET WORTH is the one genuinely NEW calculation this migration defines
-- (every prior phase deferred it): for each native currency,
--   net_worth = liquid_cash + non_cash_asset_value
--               + receivables_outstanding - liabilities_outstanding
-- using ONLY the latest estimated_current_value for assets (never
-- target_value or quick_sale_estimate) and the current outstanding
-- receivable/liability amounts (never face amount, opening principal, or
-- estimated recoverable value). Goals, Obligations, and Decisions never
-- enter this formula at all -- see the migration header comments below
-- for why each is deliberately excluded.
--
-- QUERY STRATEGY (documented per the phase brief's explicit request):
-- a single SECURITY INVOKER SQL function, composing the per-currency
-- NUMERIC core (cash/assets/receivables/liabilities/net worth/Safe-to-
-- Deploy/protected cash/potential liquidity/allocation shortfall) via
-- CTEs that each call one canonical function and join on currency_code.
-- This is ONE round trip for the entire numeric core, avoiding an N+1
-- waterfall of per-domain client calls for what is fundamentally one
-- per-currency row set. Goals/Obligations/Decisions summaries are
-- list-shaped, not per-currency numeric aggregates, and are deliberately
-- NOT folded into this function -- they are fetched via their own
-- existing, unmodified read functions (goal_summary(), decision_
-- summary(), upcoming_obligations()) in parallel at the TypeScript
-- domain layer (lib/domain/financial-position/repository.ts), keeping
-- domain boundaries intact per the phase brief's explicit instruction.
--
-- SECURITY INVOKER throughout, no elevated privilege. No table is added,
-- altered, or dropped -- this is a pure read-composition function.

create function public.financial_position_by_currency()
returns table (
  currency_code text,

  -- NET WORTH components -- see migration header for the exact formula
  -- and exclusions (target_value, quick_sale_estimate, opening principal,
  -- future interest, and every non-cash domain's own transactions are
  -- all explicitly excluded).
  liquid_cash text,
  non_cash_asset_value text,
  receivables_outstanding text,
  liabilities_outstanding text,
  net_worth text,

  -- LIQUID / PROTECTED POSITION -- verbatim from safe_to_deploy_by_
  -- currency(), the one authoritative Rules formula. protected_goal_cash
  -- here IS "actual backed protected cash" (S6/S6A's LEAST(allocation,
  -- balance) figure), never the nominal allocation.
  protected_goal_cash text,
  protected_commitments text,
  minimum_cash_floor text,
  required_retained_cash text,
  safe_to_deploy text,
  safe_to_deploy_status text,
  retained_deficit text,

  -- POTENTIAL LIQUIDITY -- kept as separate, distinct categories (never
  -- summed into one "liquid total" with cash). null (not zero) when no
  -- asset/receivable in that currency has the relevant figure recorded
  -- at all -- see the phase report's "Empty / partial states" section.
  asset_quick_sale_potential text,
  receivables_estimated_recoverable text,
  receivables_recoverability_difference text,

  -- ALLOCATION SHORTFALL -- surfaced explicitly, never folded silently
  -- into Safe to Deploy (which already only ever counts the BACKED
  -- portion of protected allocations -- this column is the honest
  -- "how much protected purpose currently has no real cash behind it,"
  -- aggregated by currency from goal_bucket_shortfalls()).
  allocation_shortfall text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  with cash as (
    select * from public.money_currency_totals ()
  ),
  assets as (
    select * from public.asset_native_currency_totals ()
  ),
  receivables as (
    select * from public.receivable_native_currency_totals ()
  ),
  liabilities as (
    select * from public.liability_native_currency_totals ()
  ),
  rules as (
    select * from public.safe_to_deploy_by_currency ()
  ),
  quick_sale as (
    select currency_code, sum(quick_sale_estimate::numeric) as total
    from public.asset_summary ()
    where quick_sale_estimate is not null and is_archived = false
    group by currency_code
  ),
  recoverable as (
    select currency_code, sum(estimated_recoverable_value::numeric) as total
    from public.receivable_summary ()
    where estimated_recoverable_value is not null and is_archived = false
    group by currency_code
  ),
  shortfalls as (
    select currency_code, sum(shortfall::numeric) as total
    from public.goal_bucket_shortfalls ()
    group by currency_code
  ),
  relevant_currencies as (
    select currency_code from cash
    union select currency_code from assets
    union select currency_code from receivables
    union select currency_code from liabilities
    union select currency_code from rules
    union select currency_code from quick_sale
    union select currency_code from recoverable
    union select currency_code from shortfalls
  )
  select
    c.currency_code,
    coalesce(cs.balance::numeric, 0::numeric(20, 6))::text,
    coalesce(a.total_estimated_value::numeric, 0::numeric(20, 6))::text,
    coalesce(r.total_outstanding::numeric, 0::numeric(20, 6))::text,
    coalesce(l.total_outstanding::numeric, 0::numeric(20, 6))::text,
    (
      coalesce(cs.balance::numeric, 0::numeric(20, 6))
      + coalesce(a.total_estimated_value::numeric, 0::numeric(20, 6))
      + coalesce(r.total_outstanding::numeric, 0::numeric(20, 6))
      - coalesce(l.total_outstanding::numeric, 0::numeric(20, 6))
    )::text,

    ru.protected_goal_cash,
    ru.protected_commitments,
    ru.minimum_cash_floor,
    ru.required_retained_cash,
    ru.safe_to_deploy,
    coalesce(ru.status, 'not_configured'),
    ru.retained_deficit,

    qs.total::text,
    rc.total::text,
    case when rc.total is not null
      then (rc.total - coalesce(r.total_outstanding::numeric, 0::numeric(20, 6)))::text
      else null end,

    coalesce(sf.total, 0::numeric(20, 6))::text
  from relevant_currencies c
  left join cash cs on cs.currency_code = c.currency_code
  left join assets a on a.currency_code = c.currency_code
  left join receivables r on r.currency_code = c.currency_code
  left join liabilities l on l.currency_code = c.currency_code
  left join rules ru on ru.currency_code = c.currency_code
  left join quick_sale qs on qs.currency_code = c.currency_code
  left join recoverable rc on rc.currency_code = c.currency_code
  left join shortfalls sf on sf.currency_code = c.currency_code;
$$;

comment on function public.financial_position_by_currency() is
  'The one canonical per-currency Financial Position composition. Every column is read from an existing domain function -- see the migration header. Net Worth is the only new calculation this function introduces.';

revoke all on function public.financial_position_by_currency() from public, anon;
grant execute on function public.financial_position_by_currency() to authenticated;
