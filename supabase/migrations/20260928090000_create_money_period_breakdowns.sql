-- Monatriq: Money period breakdowns — weekly cash-flow buckets and
-- category breakdown (P0-E3-S3)
--
-- Two narrow, additive read functions for the production Money screen.
-- Neither introduces a new financial concept: both reuse EXACTLY the same
-- cash_flow_class-based classification money_period_summary() already
-- established (P0-E3-S1A) — opening_balance/transfer/fx_transfer are
-- still fully excluded from cash_in/cash_out, and receivable_recovery/
-- debt_principal_payment/loan_proceeds still classify as other_inflow/
-- other_outflow rather than income/expense. This migration only changes
-- how the SAME already-correct classification is grouped (by week, or by
-- category) — it is not a second source of financial truth.
--
-- money_weekly_summary(): per-week (Mon-start), per-native-currency
-- cash_in/cash_out within an explicit period — backs the Money screen's
-- real Cash Flow bar chart. Never blends currencies; a caller with
-- multiple active currencies gets one row per (week, currency) and
-- renders them separately, exactly like every other per-currency read
-- model in this codebase.
--
-- money_category_breakdown(): per-category (money_received_categories /
-- money_spending_categories only — never receivable_recovery/
-- debt_principal_payment/debt_interest/debt_fee/loan_proceeds, which are
-- not classified by those category tables at all and are deliberately
-- excluded here so this breakdown never silently re-labels a linked
-- Receivables/Liabilities event as a generic category), per-native-
-- currency total within an explicit period — backs "Where Money Went"
-- and "Cash In by Source".

create function public.money_weekly_summary(p_start date default null, p_end date default null)
returns table (
  week_start date,
  currency_code text,
  cash_in text,
  cash_out text
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
      date_trunc('week', (e.occurred_at at time zone v_timezone))::date as week_start,
      m.currency_code,
      coalesce(sum(m.amount) filter (where e.cash_flow_class in ('income', 'other_inflow')), 0::numeric(20, 6))::text,
      coalesce(sum(-m.amount) filter (where e.cash_flow_class in ('expense', 'other_outflow')), 0::numeric(20, 6))::text
    from public.cash_movements m
    join public.financial_events e on e.id = m.event_id
    where m.user_id = auth.uid ()
      and e.voided_at is null
      and (e.occurred_at at time zone v_timezone)::date between v_start and v_end
      and e.cash_flow_class in ('income', 'other_inflow', 'expense', 'other_outflow')
    group by date_trunc('week', (e.occurred_at at time zone v_timezone))::date, m.currency_code
    order by week_start, m.currency_code;
end;
$$;

comment on function public.money_weekly_summary(date, date) is
  'Per-week (Monday-start, caller profile timezone), per-native-currency cash_in/cash_out within [p_start, p_end] (defaults to the current calendar month via resolve_period_bounds()). Same cash_flow_class filter as money_period_summary() -- opening_balance/transfer/fx_transfer excluded, receivable_recovery/loan_proceeds/debt_principal_payment remain other_inflow/other_outflow, never income/expense. Backs the Money screen''s real weekly Cash Flow chart -- never a second source of financial truth.';

create function public.money_category_breakdown(p_start date default null, p_end date default null)
returns table (
  direction text,
  category_code text,
  category_label text,
  currency_code text,
  amount text
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
    select 'received'::text, e.received_category_code, c.display_name, m.currency_code, sum(m.amount)::text
      from public.cash_movements m
      join public.financial_events e on e.id = m.event_id
      join public.money_received_categories c on c.code = e.received_category_code
      where m.user_id = auth.uid ()
        and e.voided_at is null
        and e.event_type = 'money_received'
        and (e.occurred_at at time zone v_timezone)::date between v_start and v_end
      group by e.received_category_code, c.display_name, m.currency_code
    union all
    select 'spent'::text, e.spending_category_code, c.display_name, m.currency_code, sum(-m.amount)::text
      from public.cash_movements m
      join public.financial_events e on e.id = m.event_id
      join public.money_spending_categories c on c.code = e.spending_category_code
      where m.user_id = auth.uid ()
        and e.voided_at is null
        and e.event_type = 'money_spent'
        and (e.occurred_at at time zone v_timezone)::date between v_start and v_end
      group by e.spending_category_code, c.display_name, m.currency_code
    order by 1, 5 desc;
end;
$$;

comment on function public.money_category_breakdown(date, date) is
  'Per-category, per-native-currency totals within [p_start, p_end], split by direction (received/spent). Deliberately scoped to event_type in (money_received, money_spent) only -- receivable_recovery, debt_principal_payment/interest/fee, and loan_proceeds are linked Receivables/Liabilities events with their own real record (a specific receivable or liability), not a generic category, and are never re-labeled as one here. Backs "Where Money Went" and "Cash In by Source" on the Money screen.';

revoke all on function public.money_weekly_summary(date, date) from public, anon;
grant execute on function public.money_weekly_summary(date, date) to authenticated;

revoke all on function public.money_category_breakdown(date, date) from public, anon;
grant execute on function public.money_category_breakdown(date, date) to authenticated;
