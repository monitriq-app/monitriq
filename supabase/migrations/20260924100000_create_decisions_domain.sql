-- Monatriq: Decisions engine, scenario evaluation & decision journal
-- (P0-E2-S7)
--
-- Full design rationale in docs/architecture/FINANCIAL_DOMAIN_MODEL.md and
-- docs/reports/P0-E2-S7-decisions-engine-foundation.txt.
--
-- CORE PRODUCT PRINCIPLE: A Decision is a plan/scenario/intention/question
-- -- NEVER a transaction. Choosing "Proceed" never spends cash, receives
-- cash, creates an asset, sells an asset, changes cost basis, reduces
-- debt, increases debt, changes a goal, or changes an obligation. Actual
-- financial state changes only when a real domain operation is
-- separately recorded through Money/Assets/Liabilities/Goals/Obligations.
-- No function in this migration writes to any table outside the
-- decisions_* tables themselves.
--
-- DO NOT RECREATE ESTABLISHED CALCULATIONS: this migration treats every
-- prior domain's read functions as canonical and calls them directly --
-- asset_summary() for asset facts, liability_outstanding_principal() for
-- liability facts, and critically, the Safe-to-Deploy chain from
-- P0-E2-S6/S6A for every liquidity/rule-conflict figure. No second
-- Safe-to-Deploy formula, no second FX conversion, no re-derived cash
-- balance exists anywhere in this migration.
--
-- ONE SHARED HYPOTHETICAL-LIQUIDITY CALCULATION: P0-E2-S6A's
-- evaluate_proposed_cash_use() only ever modeled a SPEND (a positive
-- amount, always subtracted). Decisions also need to model an INFLOW
-- (asset-sale proceeds, loan proceeds) through the exact same rule-
-- relationship logic. Rather than forking that logic into a second
-- copy, this migration extracts it into a new, sign-agnostic shared
-- helper -- evaluate_hypothetical_bucket_liquidity(bucket, delta), which
-- accepts any sign of delta -- and evaluate_proposed_cash_use() becomes a
-- thin wrapper over it. evaluate_proposed_cash_use()'s public signature
-- and return shape are completely unchanged; the full P0-E2-S6/S6A test
-- suite (155 assertions) verifies this by continuing to pass unmodified.
--
-- SCENARIO INPUT ARCHITECTURE: neither a giant per-decision-type column
-- explosion nor a JSONB/EAV bag of authoritative numbers. decision_
-- scenarios has a moderate, deliberately-reused set of strongly-typed
-- NUMERIC(20,6) columns, each with ONE clear economic role shared across
-- every decision type that needs it (e.g. cash_required is "purchase
-- price" for buy_asset, "repair cost" for repair_improve_asset,
-- "investment amount" for business_investment, and "large purchase
-- amount" for large_personal_purchase -- one column, one meaning, reused
-- by name across types rather than duplicated per type). JSONB is used
-- ONLY for the immutable evaluation-snapshot audit trail
-- (decision_scenario_evaluations.snapshot), never as a source for any
-- arithmetic. See the phase report's "Input/assumption architecture"
-- section for the full column-to-decision-type mapping.
--
-- ALL SECURITY INVOKER, same discipline as every prior domain. No
-- elevated privilege anywhere in this migration.

-- ===========================================================================
-- 1. Decision types (extensible, descriptive registry)
-- ===========================================================================

create table public.decision_types (
  code text primary key,
  display_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.decision_types is
  'Descriptive category registry (buy_asset, sell_asset, ...). Public reference data, like currencies/liability_types/goal_types.';

alter table public.decision_types enable row level security;
revoke all on public.decision_types from anon, authenticated;
grant select on public.decision_types to authenticated;

create policy "decision_types_readable"
  on public.decision_types for select to authenticated using (true);

insert into public.decision_types (code, display_name, sort_order) values
  ('buy_asset', 'Buy Asset', 0),
  ('sell_asset', 'Sell Asset', 1),
  ('repair_improve_asset', 'Repair or Improve Asset', 2),
  ('business_investment', 'Invest in Business', 3),
  ('large_personal_purchase', 'Large Personal Purchase', 4),
  ('use_savings', 'Use Savings', 5),
  ('take_debt', 'Take Loan or Debt', 6),
  ('pay_down_debt', 'Pay Down Debt', 7),
  ('start_new_venture', 'Start New Venture', 8),
  ('other', 'Other', 9);

-- ===========================================================================
-- 2. Decisions
-- ===========================================================================
-- Lifecycle (status) and the user's actual conclusion (choice, section 5)
-- are deliberately NOT the same column -- see decision_choices. linked_
-- asset_id/linked_liability_id give a Decision its subject "where
-- applicable" (a Sell Asset or Repair decision names the asset; a Pay
-- Down Debt decision names the liability) -- deliberately NOT hard-
-- enforced per decision_type_code, since which types benefit from a
-- link is a UI/product concern, not a database invariant, and "Other"
-- must remain genuinely flexible.

create table public.decisions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_type_code text not null references public.decision_types (code),
  name text not null check (char_length(name) between 1 and 150),
  description text check (description is null or char_length(description) <= 1000),
  linked_asset_id uuid references public.assets (id) on delete restrict,
  linked_liability_id uuid references public.liabilities (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.decisions is
  'A plan/scenario/intention/question -- NEVER a transaction. Choosing any user choice (decision_choices) never mutates any other domain. status is lifecycle only; the user''s actual conclusion is decision_choices, kept separate deliberately.';

create index decisions_linked_asset_id on public.decisions (linked_asset_id) where linked_asset_id is not null;
create index decisions_linked_liability_id on public.decisions (linked_liability_id) where linked_liability_id is not null;

create function public.touch_decision_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger decisions_touch_updated_at
  before update on public.decisions
  for each row
  execute function public.touch_decision_updated_at();

alter table public.decisions enable row level security;

revoke all on public.decisions from anon, authenticated;

grant select on public.decisions to authenticated;
grant insert (user_id, decision_type_code, name, description, linked_asset_id, linked_liability_id)
  on public.decisions to authenticated;
grant update (name, description, status, linked_asset_id, linked_liability_id)
  on public.decisions to authenticated;

create policy "decisions_select_own"
  on public.decisions for select to authenticated
  using (auth.uid () = user_id);

create policy "decisions_insert_own"
  on public.decisions for insert to authenticated
  with check (
    auth.uid () = user_id
    and (linked_asset_id is null or exists (select 1 from public.assets a where a.id = linked_asset_id and a.user_id = auth.uid ()))
    and (linked_liability_id is null or exists (select 1 from public.liabilities l where l.id = linked_liability_id and l.user_id = auth.uid ()))
  );

create policy "decisions_update_own"
  on public.decisions for update to authenticated
  using (auth.uid () = user_id)
  with check (
    auth.uid () = user_id
    and (linked_asset_id is null or exists (select 1 from public.assets a where a.id = linked_asset_id and a.user_id = auth.uid ()))
    and (linked_liability_id is null or exists (select 1 from public.liabilities l where l.id = linked_liability_id and l.user_id = auth.uid ()))
  );

-- ===========================================================================
-- 3. Decision scenarios
-- ===========================================================================
-- Column-to-decision-type mapping (see migration header for the full
-- rationale):
--   cash_required          -- buy_asset (purchase price), repair_improve_asset
--                              (repair cost), business_investment/
--                              start_new_venture (investment amount),
--                              large_personal_purchase/use_savings (amount)
--   acquisition_costs      -- buy_asset only
--   gross_proceeds         -- sell_asset (expected sale price), take_debt
--                              (proposed principal)
--   proceeds_costs         -- sell_asset (selling costs), take_debt (fees
--                              deducted from proceeds)
--   debt_principal_payment -- pay_down_debt only
--   debt_interest_payment  -- pay_down_debt only
--   debt_fee_payment       -- pay_down_debt only
--   interest_rate/term_months/monthly_payment_assumption/collateral_note
--                          -- take_debt only, purely recorded assumptions
--                              (no amortization model computed from them)
--   expected_value_assumption      -- buy_asset (expected initial value),
--                                      repair_improve_asset (value after
--                                      repair), business_investment/
--                                      start_new_venture (expected outcome)
--   expected_future_sale_value     -- repair_improve_asset only
--   capitalization_classification  -- repair_improve_asset only
--   sale_date_assumption           -- sell_asset only
--   holding_period_months          -- generic timing assumption (repair-
--                                      then-sell horizon, investment horizon)
-- total_cash_required and net_proceeds are DERIVED at evaluation time
-- (evaluate_decision_scenario()), never stored -- a scenario simply
-- populates whichever of the above are relevant to it; unused columns
-- stay null and contribute nothing to the derived totals.

create table public.decision_scenarios (
  id uuid primary key default gen_random_uuid (),
  decision_id uuid not null references public.decisions (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  currency_code text not null references public.currencies (code),
  source_bucket_id uuid references public.cash_buckets (id) on delete restrict,
  destination_bucket_id uuid references public.cash_buckets (id) on delete restrict,
  cash_required numeric(20, 6) check (cash_required is null or cash_required >= 0),
  acquisition_costs numeric(20, 6) check (acquisition_costs is null or acquisition_costs >= 0),
  gross_proceeds numeric(20, 6) check (gross_proceeds is null or gross_proceeds >= 0),
  proceeds_costs numeric(20, 6) check (proceeds_costs is null or proceeds_costs >= 0),
  debt_principal_payment numeric(20, 6) check (debt_principal_payment is null or debt_principal_payment >= 0),
  debt_interest_payment numeric(20, 6) check (debt_interest_payment is null or debt_interest_payment >= 0),
  debt_fee_payment numeric(20, 6) check (debt_fee_payment is null or debt_fee_payment >= 0),
  interest_rate numeric(7, 4) check (interest_rate is null or interest_rate >= 0),
  term_months integer check (term_months is null or term_months > 0),
  monthly_payment_assumption numeric(20, 6) check (monthly_payment_assumption is null or monthly_payment_assumption >= 0),
  collateral_note text check (collateral_note is null or char_length(collateral_note) <= 200),
  expected_value_assumption numeric(20, 6),
  expected_future_sale_value numeric(20, 6) check (expected_future_sale_value is null or expected_future_sale_value >= 0),
  capitalization_classification text check (capitalization_classification is null or capitalization_classification in ('capital_improvement', 'expense')),
  sale_date_assumption date,
  holding_period_months integer check (holding_period_months is null or holding_period_months > 0),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.decision_scenarios is
  'A user-created, user-named scenario under a Decision. All amount columns are user-entered ASSUMPTIONS, never facts -- see evaluate_decision_scenario(). currency_code is fixed at creation; source_bucket_id/destination_bucket_id, when set, must match it (same-currency-only, no implicit FX).';

create index decision_scenarios_decision_id on public.decision_scenarios (decision_id);

create function public.prepare_decision_scenario()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_decision_user_id uuid;
  v_source_currency text;
  v_dest_currency text;
  v_decimal_exponent smallint;
begin
  select user_id into v_decision_user_id from public.decisions where id = new.decision_id;
  if v_decision_user_id is null then
    raise exception 'decision % not found', new.decision_id;
  end if;
  new.user_id := v_decision_user_id;

  if new.source_bucket_id is not null then
    select currency_code into v_source_currency from public.cash_buckets where id = new.source_bucket_id;
    if v_source_currency is null then
      raise exception 'source bucket % not found', new.source_bucket_id;
    end if;
    if v_source_currency <> new.currency_code then
      raise exception 'source bucket currency % does not match scenario currency % -- cross-currency bucket links are not supported this phase',
        v_source_currency, new.currency_code;
    end if;
  end if;

  if new.destination_bucket_id is not null then
    select currency_code into v_dest_currency from public.cash_buckets where id = new.destination_bucket_id;
    if v_dest_currency is null then
      raise exception 'destination bucket % not found', new.destination_bucket_id;
    end if;
    if v_dest_currency <> new.currency_code then
      raise exception 'destination bucket currency % does not match scenario currency % -- cross-currency bucket links are not supported this phase',
        v_dest_currency, new.currency_code;
    end if;
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;

  if (new.cash_required is not null and round(new.cash_required, v_decimal_exponent) <> new.cash_required)
    or (new.acquisition_costs is not null and round(new.acquisition_costs, v_decimal_exponent) <> new.acquisition_costs)
    or (new.gross_proceeds is not null and round(new.gross_proceeds, v_decimal_exponent) <> new.gross_proceeds)
    or (new.proceeds_costs is not null and round(new.proceeds_costs, v_decimal_exponent) <> new.proceeds_costs)
    or (new.debt_principal_payment is not null and round(new.debt_principal_payment, v_decimal_exponent) <> new.debt_principal_payment)
    or (new.debt_interest_payment is not null and round(new.debt_interest_payment, v_decimal_exponent) <> new.debt_interest_payment)
    or (new.debt_fee_payment is not null and round(new.debt_fee_payment, v_decimal_exponent) <> new.debt_fee_payment)
    or (new.monthly_payment_assumption is not null and round(new.monthly_payment_assumption, v_decimal_exponent) <> new.monthly_payment_assumption)
    or (new.expected_value_assumption is not null and round(new.expected_value_assumption, v_decimal_exponent) <> new.expected_value_assumption)
    or (new.expected_future_sale_value is not null and round(new.expected_future_sale_value, v_decimal_exponent) <> new.expected_future_sale_value)
  then
    raise exception 'a scenario amount has more precision than % allows (% decimal place(s))', new.currency_code, v_decimal_exponent;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger decision_scenarios_prepare
  before insert or update on public.decision_scenarios
  for each row
  execute function public.prepare_decision_scenario();

alter table public.decision_scenarios enable row level security;

revoke all on public.decision_scenarios from anon, authenticated;
grant select on public.decision_scenarios to authenticated;
grant insert (
  decision_id, name, currency_code, source_bucket_id, destination_bucket_id,
  cash_required, acquisition_costs, gross_proceeds, proceeds_costs,
  debt_principal_payment, debt_interest_payment, debt_fee_payment,
  interest_rate, term_months, monthly_payment_assumption, collateral_note,
  expected_value_assumption, expected_future_sale_value,
  capitalization_classification, sale_date_assumption, holding_period_months, note
) on public.decision_scenarios to authenticated;
grant update (
  name, source_bucket_id, destination_bucket_id,
  cash_required, acquisition_costs, gross_proceeds, proceeds_costs,
  debt_principal_payment, debt_interest_payment, debt_fee_payment,
  interest_rate, term_months, monthly_payment_assumption, collateral_note,
  expected_value_assumption, expected_future_sale_value,
  capitalization_classification, sale_date_assumption, holding_period_months, note
) on public.decision_scenarios to authenticated;

create policy "decision_scenarios_select_own"
  on public.decision_scenarios for select to authenticated
  using (auth.uid () = user_id);

create policy "decision_scenarios_insert_own"
  on public.decision_scenarios for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.decisions d where d.id = decision_id and d.user_id = auth.uid ())
    and (source_bucket_id is null or exists (select 1 from public.cash_buckets b where b.id = source_bucket_id and b.user_id = auth.uid ()))
    and (destination_bucket_id is null or exists (select 1 from public.cash_buckets b where b.id = destination_bucket_id and b.user_id = auth.uid ()))
  );

create policy "decision_scenarios_update_own"
  on public.decision_scenarios for update to authenticated
  using (auth.uid () = user_id)
  with check (
    auth.uid () = user_id
    and (source_bucket_id is null or exists (select 1 from public.cash_buckets b where b.id = source_bucket_id and b.user_id = auth.uid ()))
    and (destination_bucket_id is null or exists (select 1 from public.cash_buckets b where b.id = destination_bucket_id and b.user_id = auth.uid ()))
  );

-- ===========================================================================
-- 4. Decision choices (append-only history)
-- ===========================================================================
-- The user's actual conclusion, kept deliberately separate from
-- decisions.status (lifecycle). The current choice is always the latest
-- row (by created_at) -- no is_current flag, same "derive, don't store
-- redundant state" discipline as every prior domain. Recording ANY
-- choice, including 'proceed', NEVER touches any other table -- this is
-- the central, explicitly-tested guarantee of this whole domain.

create table public.decision_choices (
  id uuid primary key default gen_random_uuid (),
  decision_id uuid not null references public.decisions (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  choice text not null check (choice in ('proceed', 'wait', 'decline', 'keep_reviewing')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.decision_choices is
  'Append-only. The current choice is the latest row. Recording a choice -- including proceed -- is intent only and creates no financial effect anywhere.';

create index decision_choices_decision_id on public.decision_choices (decision_id, created_at desc);

create function public.prepare_decision_choice()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.decisions where id = new.decision_id;
  if v_user_id is null then
    raise exception 'decision % not found', new.decision_id;
  end if;
  new.user_id := v_user_id;
  return new;
end;
$$;

create trigger decision_choices_prepare
  before insert on public.decision_choices
  for each row
  execute function public.prepare_decision_choice();

alter table public.decision_choices enable row level security;

revoke all on public.decision_choices from anon, authenticated;
grant select on public.decision_choices to authenticated;
grant insert (decision_id, choice, note) on public.decision_choices to authenticated;

create policy "decision_choices_select_own"
  on public.decision_choices for select to authenticated
  using (auth.uid () = user_id);

create policy "decision_choices_insert_own"
  on public.decision_choices for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.decisions d where d.id = decision_id and d.user_id = auth.uid ())
  );

-- ===========================================================================
-- 5. Decision scenario evaluations (append-only, immutable snapshots)
-- ===========================================================================
-- Created only when a scenario is intentionally "saved" -- evaluating a
-- scenario on screen (evaluate_decision_scenario()) is a pure, un-
-- persisted read; saving one calls that same read and freezes its result
-- into this immutable JSONB snapshot. A later re-evaluation appends a
-- NEW row rather than overwriting -- "current evaluation" is always the
-- latest by evaluated_at. The JSONB is a frozen audit record, never an
-- authoritative source for any subsequent arithmetic (mirrors cash_use_
-- overrides.conflicts_snapshot's exact discipline).

create table public.decision_scenario_evaluations (
  id uuid primary key default gen_random_uuid (),
  scenario_id uuid not null references public.decision_scenarios (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  evaluated_at timestamptz not null default now(),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.decision_scenario_evaluations is
  'Append-only, immutable. "What information did Monatriq use when I considered this?" The current evaluation is the latest row by evaluated_at.';

create index decision_scenario_evaluations_scenario_id on public.decision_scenario_evaluations (scenario_id, evaluated_at desc);

create function public.prepare_decision_scenario_evaluation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.decision_scenarios where id = new.scenario_id;
  if v_user_id is null then
    raise exception 'scenario % not found', new.scenario_id;
  end if;
  new.user_id := v_user_id;
  return new;
end;
$$;

create trigger decision_scenario_evaluations_prepare
  before insert on public.decision_scenario_evaluations
  for each row
  execute function public.prepare_decision_scenario_evaluation();

alter table public.decision_scenario_evaluations enable row level security;

revoke all on public.decision_scenario_evaluations from anon, authenticated;
grant select on public.decision_scenario_evaluations to authenticated;
grant insert (scenario_id, evaluated_at, snapshot) on public.decision_scenario_evaluations to authenticated;

create policy "decision_scenario_evaluations_select_own"
  on public.decision_scenario_evaluations for select to authenticated
  using (auth.uid () = user_id);

create policy "decision_scenario_evaluations_insert_own"
  on public.decision_scenario_evaluations for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.decision_scenarios s where s.id = scenario_id and s.user_id = auth.uid ())
  );

-- ===========================================================================
-- 6. Decision / scenario / choice creation RPCs
-- ===========================================================================

create function public.create_decision(
  p_decision_type_code text,
  p_name text,
  p_description text default null,
  p_linked_asset_id uuid default null,
  p_linked_liability_id uuid default null
)
returns public.decisions
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_decision public.decisions;
begin
  if not exists (select 1 from public.decision_types where code = p_decision_type_code) then
    raise exception 'unknown decision_type_code %', p_decision_type_code;
  end if;
  if p_linked_asset_id is not null and not exists (select 1 from public.assets where id = p_linked_asset_id and user_id = auth.uid ()) then
    raise exception 'asset % not found for current user', p_linked_asset_id;
  end if;
  if p_linked_liability_id is not null and not exists (select 1 from public.liabilities where id = p_linked_liability_id and user_id = auth.uid ()) then
    raise exception 'liability % not found for current user', p_linked_liability_id;
  end if;

  insert into public.decisions (user_id, decision_type_code, name, description, linked_asset_id, linked_liability_id)
    values (auth.uid (), p_decision_type_code, p_name, p_description, p_linked_asset_id, p_linked_liability_id)
    returning * into v_decision;

  return v_decision;
end;
$$;

create function public.create_decision_scenario(
  p_decision_id uuid,
  p_name text,
  p_currency_code text,
  p_source_bucket_id uuid default null,
  p_destination_bucket_id uuid default null,
  p_cash_required numeric default null,
  p_acquisition_costs numeric default null,
  p_gross_proceeds numeric default null,
  p_proceeds_costs numeric default null,
  p_debt_principal_payment numeric default null,
  p_debt_interest_payment numeric default null,
  p_debt_fee_payment numeric default null,
  p_interest_rate numeric default null,
  p_term_months integer default null,
  p_monthly_payment_assumption numeric default null,
  p_collateral_note text default null,
  p_expected_value_assumption numeric default null,
  p_expected_future_sale_value numeric default null,
  p_capitalization_classification text default null,
  p_sale_date_assumption date default null,
  p_holding_period_months integer default null,
  p_note text default null
)
returns public.decision_scenarios
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_scenario public.decision_scenarios;
begin
  if not exists (select 1 from public.decisions where id = p_decision_id and user_id = auth.uid ()) then
    raise exception 'decision % not found for current user', p_decision_id;
  end if;

  insert into public.decision_scenarios (
    decision_id, name, currency_code, source_bucket_id, destination_bucket_id,
    cash_required, acquisition_costs, gross_proceeds, proceeds_costs,
    debt_principal_payment, debt_interest_payment, debt_fee_payment,
    interest_rate, term_months, monthly_payment_assumption, collateral_note,
    expected_value_assumption, expected_future_sale_value,
    capitalization_classification, sale_date_assumption, holding_period_months, note
  )
  values (
    p_decision_id, p_name, p_currency_code, p_source_bucket_id, p_destination_bucket_id,
    p_cash_required, p_acquisition_costs, p_gross_proceeds, p_proceeds_costs,
    p_debt_principal_payment, p_debt_interest_payment, p_debt_fee_payment,
    p_interest_rate, p_term_months, p_monthly_payment_assumption, p_collateral_note,
    p_expected_value_assumption, p_expected_future_sale_value,
    p_capitalization_classification, p_sale_date_assumption, p_holding_period_months, p_note
  )
  returning * into v_scenario;

  return v_scenario;
end;
$$;

-- Recording ANY choice -- including 'proceed' -- inserts exactly one row
-- into decision_choices and touches nothing else. This is the entire
-- enforcement of "Proceed does not execute": there is simply no code
-- path here that could write to another table even if it wanted to.
create function public.record_decision_choice(
  p_decision_id uuid,
  p_choice text,
  p_note text default null
)
returns public.decision_choices
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_choice public.decision_choices;
begin
  if p_choice not in ('proceed', 'wait', 'decline', 'keep_reviewing') then
    raise exception 'unknown choice %', p_choice;
  end if;
  if not exists (select 1 from public.decisions where id = p_decision_id and user_id = auth.uid ()) then
    raise exception 'decision % not found for current user', p_decision_id;
  end if;

  insert into public.decision_choices (decision_id, choice, note)
    values (p_decision_id, p_choice, p_note)
    returning * into v_choice;

  return v_choice;
end;
$$;

revoke all on function public.create_decision(text, text, text, uuid, uuid) from public, anon;
grant execute on function public.create_decision(text, text, text, uuid, uuid) to authenticated;

revoke all on function public.create_decision_scenario(
  uuid, text, text, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, integer, numeric, text, numeric, numeric, text, date, integer, text
) from public, anon;
grant execute on function public.create_decision_scenario(
  uuid, text, text, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, integer, numeric, text, numeric, numeric, text, date, integer, text
) to authenticated;

revoke all on function public.record_decision_choice(uuid, text, text) from public, anon;
grant execute on function public.record_decision_choice(uuid, text, text) to authenticated;

-- ===========================================================================
-- 7. Shared hypothetical-bucket-liquidity calculation (extracted from
--    P0-E2-S6A's evaluate_proposed_cash_use(), now sign-agnostic)
-- ===========================================================================
-- This is the ENTIRE fix for "Decisions must reuse S6A, not fork it":
-- the exact rule-relationship logic evaluate_proposed_cash_use() already
-- used for a spend (a negative delta) is extracted here so Decisions can
-- call it directly with a POSITIVE delta for an inflow scenario (asset
-- sale proceeds, loan proceeds) -- one formula, two callers.
-- evaluate_proposed_cash_use()'s own public signature and return shape
-- are unchanged below; it is now a thin wrapper. The full P0-E2-S6/S6A
-- test suite verifies this by passing unmodified against the refactor.

create function public.evaluate_hypothetical_bucket_liquidity(p_bucket_id uuid, p_delta numeric)
returns table (
  bucket_id uuid,
  currency_code text,
  current_balance text,
  hypothetical_delta text,
  post_use_balance text,
  current_protected_allocation text,
  current_allocation_shortfall text,
  post_use_allocation_shortfall text,
  currency_safe_to_deploy_before text,
  currency_safe_to_deploy_after text,
  protected_goal_cash_after text,
  uncovered_protected_obligations_after text,
  protected_commitments_after text,
  minimum_cash_floor_status text,
  protected_goal_status text,
  protected_obligation_status text,
  retained_deficit_before text,
  retained_deficit_after text
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_bucket public.cash_buckets;
  v_balance numeric;
  v_protected_total numeric;
  v_post_balance numeric;
  v_before record;
  v_after record;
  v_uncovered_before numeric;
  v_uncovered_after numeric;
  v_pgc_before numeric;
  v_pgc_after numeric;
  v_floor_status text;
  v_obligation_status text;
begin
  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;

  select coalesce(sum(m.amount), 0::numeric(20, 6)) into v_balance
    from public.cash_movements m
    join public.financial_events e on e.id = m.event_id
    where m.bucket_id = p_bucket_id and e.voided_at is null;

  select coalesce(sum(a.amount), 0::numeric(20, 6)) into v_protected_total
    from public.goal_allocation_events a
    join public.goals g on g.id = a.goal_id
    where a.bucket_id = p_bucket_id and g.is_protected = true;

  v_post_balance := v_balance + p_delta;

  select * into v_before from public.safe_to_deploy_by_currency () s where s.currency_code = v_bucket.currency_code;
  select * into v_after from public.safe_to_deploy_by_currency (p_bucket_id, p_delta) s where s.currency_code = v_bucket.currency_code;

  v_uncovered_before := coalesce(v_before.uncovered_protected_obligations::numeric, 0::numeric(20, 6));
  v_uncovered_after := coalesce(v_after.uncovered_protected_obligations::numeric, 0::numeric(20, 6));
  v_pgc_before := coalesce(v_before.protected_goal_cash::numeric, 0::numeric(20, 6));
  v_pgc_after := coalesce(v_after.protected_goal_cash::numeric, 0::numeric(20, 6));

  if v_before is null or v_before.status = 'not_configured' then
    v_floor_status := 'not_configured';
  elsif (v_before.liquid_cash::numeric + p_delta) < v_before.minimum_cash_floor::numeric then
    v_floor_status := 'conflict';
  elsif v_after.safe_to_deploy::numeric < v_before.safe_to_deploy::numeric then
    v_floor_status := 'attention';
  else
    v_floor_status := 'aligned';
  end if;

  if v_uncovered_after > v_uncovered_before then
    v_obligation_status := 'conflict';
  elsif v_pgc_after < v_pgc_before then
    v_obligation_status := 'attention';
  else
    v_obligation_status := 'aligned';
  end if;

  return query select
    p_bucket_id,
    v_bucket.currency_code,
    v_balance::text,
    p_delta::text,
    v_post_balance::text,
    v_protected_total::text,
    greatest(v_protected_total - v_balance, 0::numeric(20, 6))::text,
    greatest(v_protected_total - v_post_balance, 0::numeric(20, 6))::text,
    v_before.safe_to_deploy,
    v_after.safe_to_deploy,
    v_after.protected_goal_cash,
    v_after.uncovered_protected_obligations,
    v_after.protected_commitments,
    v_floor_status,
    case when greatest(v_protected_total - v_post_balance, 0::numeric(20, 6)) > greatest(v_protected_total - v_balance, 0::numeric(20, 6))
      then 'conflict' else 'aligned' end,
    v_obligation_status,
    v_before.retained_deficit,
    v_after.retained_deficit;
end;
$$;

revoke all on function public.evaluate_hypothetical_bucket_liquidity(uuid, numeric) from public, anon;
grant execute on function public.evaluate_hypothetical_bucket_liquidity(uuid, numeric) to authenticated;

-- Unchanged public signature and return shape from P0-E2-S6A -- now a
-- thin wrapper (p_amount is always a positive spend, negated once here).
create or replace function public.evaluate_proposed_cash_use(p_bucket_id uuid, p_amount numeric)
returns table (
  bucket_id uuid,
  currency_code text,
  current_balance text,
  proposed_amount text,
  post_use_balance text,
  current_protected_allocation text,
  current_allocation_shortfall text,
  post_use_allocation_shortfall text,
  currency_safe_to_deploy_before text,
  currency_safe_to_deploy_after text,
  protected_goal_cash_after text,
  uncovered_protected_obligations_after text,
  protected_commitments_after text,
  minimum_cash_floor_status text,
  protected_goal_status text,
  protected_obligation_status text,
  retained_deficit_after text
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
begin
  if p_amount <= 0 then
    raise exception 'proposed amount must be positive';
  end if;

  return query
    select
      h.bucket_id, h.currency_code, h.current_balance, p_amount::text, h.post_use_balance,
      h.current_protected_allocation, h.current_allocation_shortfall, h.post_use_allocation_shortfall,
      h.currency_safe_to_deploy_before, h.currency_safe_to_deploy_after,
      h.protected_goal_cash_after, h.uncovered_protected_obligations_after, h.protected_commitments_after,
      h.minimum_cash_floor_status, h.protected_goal_status, h.protected_obligation_status, h.retained_deficit_after
    from public.evaluate_hypothetical_bucket_liquidity (p_bucket_id, -p_amount) h;
end;
$$;

-- ===========================================================================
-- 8. The Decisions evaluation boundary
-- ===========================================================================
-- One authoritative evaluation function per scenario. Every FACT is read
-- live from its owning domain (asset_summary(), liability_outstanding_
-- principal(), cash_movements via evaluate_hypothetical_bucket_liquidity());
-- every ASSUMPTION is echoed back from decision_scenarios exactly as the
-- user entered it; every DERIVED figure is computed here from those two
-- and clearly separated in the return shape. A missing required input
-- produces a null (surfaced via missing_information), never a fabricated
-- zero. Purely a read: nothing is written here.
--
-- Only ONE bucket's hypothetical liquidity is modeled per evaluation --
-- every one of the ten canonical decision types only ever needs one
-- (an outflow from a source bucket, XOR an inflow into a destination
-- bucket). A scenario naming BOTH a source and a genuinely different
-- destination bucket (realistic only for a generic "other" scenario) has
-- its source bucket's outflow evaluated as the primary liquidity concern;
-- the destination bucket's own balance is still shown as a fact, but a
-- combined simultaneous view across two different buckets is not
-- modeled this phase -- a documented, narrow scope limitation (see the
-- phase report), not a fabricated result.

create function public.evaluate_decision_scenario(p_scenario_id uuid)
returns table (
  scenario_id uuid,
  decision_id uuid,
  decision_type_code text,
  currency_code text,

  linked_asset_id uuid,
  linked_asset_cost_basis text,
  linked_asset_latest_value text,
  linked_asset_quick_sale_estimate text,
  linked_asset_target_value text,
  linked_liability_id uuid,
  linked_liability_outstanding_principal text,
  source_bucket_balance text,
  destination_bucket_balance text,

  cash_required text,
  acquisition_costs text,
  gross_proceeds text,
  proceeds_costs text,
  debt_principal_payment text,
  debt_interest_payment text,
  debt_fee_payment text,
  expected_value_assumption text,
  expected_future_sale_value text,

  total_cash_required text,
  net_proceeds text,
  net_immediate_cash_delta text,
  hypothetical_bucket_id uuid,
  bucket_balance_before text,
  bucket_balance_after text,
  currency_safe_to_deploy_before text,
  currency_safe_to_deploy_after text,
  retained_deficit_before text,
  retained_deficit_after text,
  projected_gross_profit_loss text,
  hypothetical_liability_outstanding_after text,
  basis_after_capitalized_improvement text,

  minimum_cash_floor_status text,
  protected_goal_status text,
  protected_obligation_status text,
  overall_status text,

  missing_information text[]
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_scenario public.decision_scenarios;
  v_decision public.decisions;
  v_total_cash_required numeric;
  v_net_proceeds numeric;
  v_net_delta numeric;
  v_effective_bucket_id uuid;
  v_effective_delta numeric;
  v_hyp record;
  v_asset record;
  v_liability_outstanding numeric;
  v_missing text[] := '{}';
  v_has_outflow_input boolean;
  v_overall text;
  v_projected_profit_loss numeric;
  v_liability_after numeric;
  v_basis_after numeric;
begin
  select * into v_scenario from public.decision_scenarios where id = p_scenario_id and user_id = auth.uid ();
  if not found then
    raise exception 'scenario % not found for current user', p_scenario_id;
  end if;

  select * into v_decision from public.decisions where id = v_scenario.decision_id and user_id = auth.uid ();
  if not found then
    raise exception 'decision for scenario % not found for current user', p_scenario_id;
  end if;

  v_has_outflow_input := v_scenario.cash_required is not null or v_scenario.acquisition_costs is not null
    or v_scenario.debt_principal_payment is not null or v_scenario.debt_interest_payment is not null
    or v_scenario.debt_fee_payment is not null;

  if v_has_outflow_input then
    v_total_cash_required := coalesce(v_scenario.cash_required, 0::numeric(20, 6))
      + coalesce(v_scenario.acquisition_costs, 0::numeric(20, 6))
      + coalesce(v_scenario.debt_principal_payment, 0::numeric(20, 6))
      + coalesce(v_scenario.debt_interest_payment, 0::numeric(20, 6))
      + coalesce(v_scenario.debt_fee_payment, 0::numeric(20, 6));
  end if;

  if v_scenario.gross_proceeds is not null then
    v_net_proceeds := v_scenario.gross_proceeds - coalesce(v_scenario.proceeds_costs, 0::numeric(20, 6));
  end if;

  if v_total_cash_required is not null or v_net_proceeds is not null then
    v_net_delta := coalesce(v_net_proceeds, 0::numeric(20, 6)) - coalesce(v_total_cash_required, 0::numeric(20, 6));
  end if;

  if v_scenario.source_bucket_id is not null
    and (v_scenario.destination_bucket_id is null or v_scenario.destination_bucket_id = v_scenario.source_bucket_id) then
    v_effective_bucket_id := v_scenario.source_bucket_id;
    v_effective_delta := coalesce(v_net_proceeds, 0::numeric(20, 6)) - coalesce(v_total_cash_required, 0::numeric(20, 6));
  elsif v_scenario.destination_bucket_id is not null and v_scenario.source_bucket_id is null then
    v_effective_bucket_id := v_scenario.destination_bucket_id;
    v_effective_delta := coalesce(v_net_proceeds, 0::numeric(20, 6));
  elsif v_scenario.source_bucket_id is not null and v_scenario.destination_bucket_id is not null then
    v_effective_bucket_id := v_scenario.source_bucket_id;
    v_effective_delta := -coalesce(v_total_cash_required, 0::numeric(20, 6));
  else
    v_missing := array_append(v_missing, 'no_bucket_linked');
  end if;

  if v_total_cash_required is null and v_net_proceeds is null then
    v_missing := array_append(v_missing, 'no_amount_specified');
  end if;

  if v_decision.decision_type_code in ('sell_asset', 'repair_improve_asset') and v_decision.linked_asset_id is null then
    v_missing := array_append(v_missing, 'no_asset_linked');
  end if;

  if v_decision.decision_type_code = 'pay_down_debt' and v_decision.linked_liability_id is null then
    v_missing := array_append(v_missing, 'no_liability_linked');
  end if;

  -- Unconditional -- a plpgsql RECORD variable that a SELECT INTO never
  -- once touches has no defined row structure at all, and referencing
  -- any of its fields later raises "record is not assigned yet" (a
  -- different failure mode than a query that ran but matched zero rows,
  -- which correctly leaves every field NULL while still being a valid,
  -- readable record). asset_summary() itself never raises for an empty
  -- result, so running this unconditionally and letting `asset_id =
  -- null` naturally match zero rows is safe and gives v_asset a proper
  -- all-null shape when no asset is linked.
  select cost_basis, estimated_current_value, quick_sale_estimate, target_value
    into v_asset
    from public.asset_summary () where asset_id = v_decision.linked_asset_id;

  if v_decision.linked_liability_id is not null then
    v_liability_outstanding := public.liability_outstanding_principal (v_decision.linked_liability_id);
  end if;

  -- evaluate_hypothetical_bucket_liquidity() DOES raise an exception for
  -- a bucket it can't find, so (unlike v_asset above) it cannot simply be
  -- called unconditionally with a possibly-null id -- the else branch
  -- explicitly gives v_hyp the same all-null shape instead.
  if v_effective_bucket_id is not null then
    select * into v_hyp from public.evaluate_hypothetical_bucket_liquidity (v_effective_bucket_id, v_effective_delta) h;
  else
    -- Explicit column ALIASES are required here, not just a bare literal
    -- list: a record populated from unaliased literals has no named
    -- fields at all, and every v_hyp.<field> reference below would fail
    -- with "record has no field ..." even though v_hyp itself is now
    -- "assigned."
    select
      null::uuid as bucket_id, null::text as currency_code, null::text as current_balance,
      null::text as hypothetical_delta, null::text as post_use_balance,
      null::text as current_protected_allocation, null::text as current_allocation_shortfall,
      null::text as post_use_allocation_shortfall, null::text as currency_safe_to_deploy_before,
      null::text as currency_safe_to_deploy_after, null::text as protected_goal_cash_after,
      null::text as uncovered_protected_obligations_after, null::text as protected_commitments_after,
      null::text as minimum_cash_floor_status, null::text as protected_goal_status,
      null::text as protected_obligation_status, null::text as retained_deficit_before,
      null::text as retained_deficit_after
      into v_hyp;
  end if;

  if v_decision.decision_type_code = 'sell_asset' and v_net_proceeds is not null and v_asset.cost_basis is not null then
    v_projected_profit_loss := v_net_proceeds - v_asset.cost_basis::numeric;
  end if;

  if v_liability_outstanding is not null then
    v_liability_after := greatest(v_liability_outstanding - coalesce(v_scenario.debt_principal_payment, 0::numeric(20, 6)), 0::numeric(20, 6));
  end if;

  if v_scenario.capitalization_classification = 'capital_improvement' and v_asset.cost_basis is not null and v_scenario.cash_required is not null then
    v_basis_after := v_asset.cost_basis::numeric + v_scenario.cash_required;
  end if;

  if v_effective_bucket_id is null then
    v_overall := 'insufficient_information';
  elsif v_hyp.minimum_cash_floor_status = 'conflict' or v_hyp.protected_goal_status = 'conflict' or v_hyp.protected_obligation_status = 'conflict' then
    v_overall := 'conflict';
  elsif v_hyp.minimum_cash_floor_status = 'not_configured' and v_hyp.protected_goal_status = 'aligned' and v_hyp.protected_obligation_status = 'aligned' then
    v_overall := 'not_configured';
  elsif v_hyp.minimum_cash_floor_status = 'attention' or v_hyp.protected_goal_status = 'attention' or v_hyp.protected_obligation_status = 'attention' then
    v_overall := 'attention';
  else
    v_overall := 'aligned';
  end if;

  return query select
    v_scenario.id,
    v_scenario.decision_id,
    v_decision.decision_type_code,
    v_scenario.currency_code,

    v_decision.linked_asset_id,
    v_asset.cost_basis,
    v_asset.estimated_current_value,
    v_asset.quick_sale_estimate,
    v_asset.target_value,
    v_decision.linked_liability_id,
    v_liability_outstanding::text,
    case when v_scenario.source_bucket_id is not null then (
      select coalesce(sum(m.amount), 0::numeric(20, 6))::text
      from public.cash_movements m join public.financial_events e on e.id = m.event_id
      where m.bucket_id = v_scenario.source_bucket_id and e.voided_at is null
    ) end,
    case when v_scenario.destination_bucket_id is not null then (
      select coalesce(sum(m.amount), 0::numeric(20, 6))::text
      from public.cash_movements m join public.financial_events e on e.id = m.event_id
      where m.bucket_id = v_scenario.destination_bucket_id and e.voided_at is null
    ) end,

    v_scenario.cash_required::text,
    v_scenario.acquisition_costs::text,
    v_scenario.gross_proceeds::text,
    v_scenario.proceeds_costs::text,
    v_scenario.debt_principal_payment::text,
    v_scenario.debt_interest_payment::text,
    v_scenario.debt_fee_payment::text,
    v_scenario.expected_value_assumption::text,
    v_scenario.expected_future_sale_value::text,

    v_total_cash_required::text,
    v_net_proceeds::text,
    v_net_delta::text,
    v_effective_bucket_id,
    v_hyp.current_balance,
    v_hyp.post_use_balance,
    v_hyp.currency_safe_to_deploy_before,
    v_hyp.currency_safe_to_deploy_after,
    v_hyp.retained_deficit_before,
    v_hyp.retained_deficit_after,
    v_projected_profit_loss::text,
    v_liability_after::text,
    v_basis_after::text,

    v_hyp.minimum_cash_floor_status,
    v_hyp.protected_goal_status,
    v_hyp.protected_obligation_status,
    v_overall,

    v_missing;
end;
$$;

create function public.save_decision_scenario_evaluation(p_scenario_id uuid)
returns public.decision_scenario_evaluations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_eval record;
  v_snapshot jsonb;
  v_row public.decision_scenario_evaluations;
begin
  select * into v_eval from public.evaluate_decision_scenario (p_scenario_id);
  if not found then
    raise exception 'scenario % not found for current user', p_scenario_id;
  end if;

  v_snapshot := to_jsonb(v_eval);

  insert into public.decision_scenario_evaluations (scenario_id, snapshot)
    values (p_scenario_id, v_snapshot)
    returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.evaluate_decision_scenario(uuid) from public, anon;
grant execute on function public.evaluate_decision_scenario(uuid) to authenticated;

revoke all on function public.save_decision_scenario_evaluation(uuid) from public, anon;
grant execute on function public.save_decision_scenario_evaluation(uuid) to authenticated;

-- ===========================================================================
-- 9. Read models
-- ===========================================================================

create function public.decision_summary()
returns table (
  decision_id uuid,
  decision_type_code text,
  decision_type_label text,
  name text,
  description text,
  status text,
  linked_asset_id uuid,
  linked_asset_name text,
  linked_liability_id uuid,
  linked_liability_name text,
  scenario_count integer,
  current_choice text,
  current_choice_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    d.id,
    d.decision_type_code,
    dt.display_name,
    d.name,
    d.description,
    d.status,
    d.linked_asset_id,
    a.name,
    d.linked_liability_id,
    l.name,
    coalesce(sc.total, 0)::integer,
    ch.choice,
    ch.created_at,
    d.created_at
  from public.decisions d
  join public.decision_types dt on dt.code = d.decision_type_code
  left join public.assets a on a.id = d.linked_asset_id
  left join public.liabilities l on l.id = d.linked_liability_id
  left join lateral (
    select count(*) as total from public.decision_scenarios s where s.decision_id = d.id
  ) sc on true
  left join lateral (
    select choice, created_at from public.decision_choices c
    where c.decision_id = d.id
    order by c.created_at desc
    limit 1
  ) ch on true
  where d.user_id = auth.uid ();
$$;

create function public.decision_choice_history(p_decision_id uuid, p_limit integer default 50)
returns table (id uuid, choice text, note text, created_at timestamptz)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select c.id, c.choice, c.note, c.created_at
  from public.decision_choices c
  where c.decision_id = p_decision_id and c.user_id = auth.uid ()
  order by c.created_at desc
  limit greatest(p_limit, 0);
$$;

create function public.decision_scenario_evaluation_history(p_scenario_id uuid, p_limit integer default 50)
returns table (id uuid, evaluated_at timestamptz, snapshot jsonb, created_at timestamptz)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select e.id, e.evaluated_at, e.snapshot, e.created_at
  from public.decision_scenario_evaluations e
  where e.scenario_id = p_scenario_id and e.user_id = auth.uid ()
  order by e.evaluated_at desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.decision_summary() from public, anon;
grant execute on function public.decision_summary() to authenticated;

revoke all on function public.decision_choice_history(uuid, integer) from public, anon;
grant execute on function public.decision_choice_history(uuid, integer) to authenticated;

revoke all on function public.decision_scenario_evaluation_history(uuid, integer) from public, anon;
grant execute on function public.decision_scenario_evaluation_history(uuid, integer) to authenticated;
