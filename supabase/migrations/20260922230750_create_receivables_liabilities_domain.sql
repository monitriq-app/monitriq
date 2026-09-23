-- Monatriq: Receivables + Liabilities/Debt domain (P0-E2-S4)
--
-- Full design rationale in docs/architecture/FINANCIAL_DOMAIN_MODEL.md and
-- docs/reports/P0-E2-S4-receivables-liabilities-debt-foundation.txt.
--
-- CORE ARCHITECTURAL DECISION: a compound financial operation.
-- A debt payment can contain principal (not an expense), interest (an
-- expense), and fees (an expense) -- three different cash_flow_class
-- values from one user action. Forcing that into a single
-- financial_events row (one cash_flow_class each) would misclassify at
-- least two of the three components. Rather than restructure
-- financial_events, this migration adds the smallest durable grouping
-- construct: `financial_operations` (a lightweight parent row) plus a
-- nullable `financial_events.operation_id` pointing at it. A debt payment
-- creates one financial_operations row and up to three correctly-
-- classified financial_events rows sharing that operation_id, all in one
-- transaction. Ordinary single-component events (money_received,
-- transfer, receivable_recovery, loan_proceeds, ...) leave operation_id
-- null -- nothing about their shape changes. This is deliberately generic
-- enough to be reused by future compound operations (asset sale, asset
-- purchase, receivable settlement) without another schema change -- see
-- financial_operations.operation_type.
--
-- CORRECTION/VOIDING CONSISTENCY (a critical requirement this phase):
-- receivable_ledger_events(recovery) and liability_principal_events
-- (draw, repayment) rows -- the ones with a real cash effect -- carry a
-- nullable financial_event_id pointing at the financial_events row that
-- caused them. There is deliberately NO separate void/active flag on
-- these ledger tables. Every read model (outstanding amount, outstanding
-- principal) derives "is this ledger row still active" from the SAME
-- single source of truth Money already uses -- `financial_events.
-- voided_at` -- via a LEFT JOIN that excludes rows whose linked event is
-- voided. Voiding a receivable_recovery event through the existing,
-- unmodified voidFinancialEvent() mechanism therefore automatically and
-- consistently deactivates its receivable-ledger effect too: there is no
-- second flag that could independently drift out of sync with the first.
--
-- ALL SECURITY INVOKER, same discipline as Money and Assets. No elevated
-- privilege anywhere in this migration.

-- ===========================================================================
-- 1. Financial operations (compound-event grouping)
-- ===========================================================================

create table public.financial_operations (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_type text not null check (operation_type in ('debt_payment')),
  -- Future operation_type values (asset_sale, asset_purchase,
  -- receivable_settlement, ...) extend this list in a later migration
  -- once those domains exist -- the table itself needs no other change.
  occurred_at timestamptz not null,
  description text check (description is null or char_length(description) <= 500),
  idempotency_key uuid,
  created_at timestamptz not null default now()
);

comment on table public.financial_operations is
  'Groups multiple financial_events rows into one user-visible compound operation (e.g. a debt payment''s principal+interest+fee). See migration header.';

create unique index financial_operations_user_idempotency_key
  on public.financial_operations (user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.financial_operations enable row level security;

revoke all on public.financial_operations from anon, authenticated;
grant select on public.financial_operations to authenticated;
grant insert (user_id, operation_type, occurred_at, description, idempotency_key)
  on public.financial_operations to authenticated;

create policy "financial_operations_select_own"
  on public.financial_operations for select to authenticated
  using (auth.uid () = user_id);

create policy "financial_operations_insert_own"
  on public.financial_operations for insert to authenticated
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 2. Extend financial_events for the new event types + operation grouping
-- ===========================================================================

alter table public.financial_events
  add column operation_id uuid references public.financial_operations (id) on delete restrict;

create index financial_events_operation_id on public.financial_events (operation_id) where operation_id is not null;

-- The Money migration's INSERT column grant on financial_events predates
-- this column; column-level grants are additive in Postgres, so this adds
-- operation_id to the already-granted set rather than replacing it.
grant insert (operation_id) on public.financial_events to authenticated;

alter table public.financial_events
  drop constraint financial_events_event_type_check;

alter table public.financial_events
  add constraint financial_events_event_type_check check (
    event_type in (
      'opening_balance', 'money_received', 'money_spent', 'transfer', 'fx_transfer',
      'receivable_recovery', 'debt_principal_payment', 'debt_interest', 'debt_fee', 'loan_proceeds'
    )
  );

alter table public.financial_events
  drop constraint financial_events_category_matches_type;

alter table public.financial_events
  add constraint financial_events_category_matches_type check (
    (event_type = 'money_received' and received_category_code is not null and spending_category_code is null)
    or (event_type = 'money_spent' and spending_category_code is not null and received_category_code is null)
    or (
      event_type in (
        'opening_balance', 'transfer', 'fx_transfer', 'receivable_recovery',
        'debt_principal_payment', 'debt_interest', 'debt_fee', 'loan_proceeds'
      )
      and received_category_code is null
      and spending_category_code is null
    )
  );

create or replace function public.set_financial_event_classification()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_class text;
begin
  if new.event_type = 'opening_balance' then
    new.cash_flow_class := 'opening_balance';

  elsif new.event_type = 'money_received' then
    select cash_flow_class into v_class
      from public.money_received_categories
      where code = new.received_category_code;
    if v_class is null then
      raise exception 'unknown received category %', new.received_category_code;
    end if;
    new.cash_flow_class := v_class;

  elsif new.event_type = 'money_spent' then
    select cash_flow_class into v_class
      from public.money_spending_categories
      where code = new.spending_category_code;
    if v_class is null then
      raise exception 'unknown spending category %', new.spending_category_code;
    end if;
    new.cash_flow_class := v_class;

  elsif new.event_type in ('transfer', 'fx_transfer') then
    new.cash_flow_class := 'transfer';

  elsif new.event_type in ('receivable_recovery', 'loan_proceeds') then
    -- Cash inflow, deliberately NOT income: a receivable recovery converts
    -- an already-owned claim into cash, and loan proceeds are borrowed
    -- money, not earned. See FINANCIAL_DOMAIN_MODEL.md #14/#17.
    new.cash_flow_class := 'other_inflow';

  elsif new.event_type = 'debt_principal_payment' then
    -- Cash outflow, deliberately NOT an expense: principal repayment
    -- reduces a liability by the same amount cash decreases, net-worth
    -- neutral. See FINANCIAL_DOMAIN_MODEL.md #5.6.
    new.cash_flow_class := 'other_outflow';

  elsif new.event_type in ('debt_interest', 'debt_fee') then
    new.cash_flow_class := 'expense';

  else
    raise exception 'unrecognized event_type %', new.event_type;
  end if;

  return new;
end;
$$;

comment on function public.set_financial_event_classification() is
  'BEFORE INSERT on financial_events: derives cash_flow_class from event_type (+ category for money_received/money_spent). Extended P0-E2-S4 for receivable/debt event types. Client-supplied cash_flow_class, if any, is overwritten.';

-- ===========================================================================
-- 3. Receivables
-- ===========================================================================
-- No face_amount/recovered/outstanding columns on this table -- like
-- cash_buckets and assets, those are derived from an append-only ledger
-- (section 4), never a mutable field silently overwritten.

create table public.receivables (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  currency_code text not null references public.currencies (code),
  expected_payment_date timestamptz,
  last_follow_up_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.receivables is
  'Money owed TO the user by another party. Not automatically liquid cash. currency_code is fixed once ledger/estimate history exists.';

create function public.enforce_receivable_currency_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.currency_code is distinct from old.currency_code then
    if exists (select 1 from public.receivable_ledger_events e where e.receivable_id = old.id)
      or exists (select 1 from public.receivable_recoverable_estimates r where r.receivable_id = old.id)
    then
      raise exception 'cannot change currency of receivable % -- it already has ledger or estimate history', old.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- (trigger attached after receivable_ledger_events/receivable_recoverable_estimates exist, end of section 4)

alter table public.receivables enable row level security;

revoke all on public.receivables from anon, authenticated;

grant select on public.receivables to authenticated;
grant insert (user_id, name, description, currency_code, expected_payment_date)
  on public.receivables to authenticated;
grant update (name, description, expected_payment_date, last_follow_up_at, currency_code, is_archived)
  on public.receivables to authenticated;

create policy "receivables_select_own"
  on public.receivables for select to authenticated
  using (auth.uid () = user_id);

create policy "receivables_insert_own"
  on public.receivables for insert to authenticated
  with check (auth.uid () = user_id);

create policy "receivables_update_own"
  on public.receivables for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 4. Receivable ledger (face amount, adjustments, recoveries) + recoverable estimates
-- ===========================================================================
-- Outstanding = (opening_face + adjustments) - recoveries, computed by the
-- read models (section 9), never stored. opening_face and recovery are
-- always positive; adjustment may be either sign (a write-up or a
-- write-down of the claim itself -- NOT a recovery). recovery rows always
-- carry a financial_event_id (see migration header); opening_face and
-- adjustment never do, since they have no cash effect.

create table public.receivable_ledger_events (
  id uuid primary key default gen_random_uuid (),
  receivable_id uuid not null references public.receivables (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  ledger_event_type text not null check (ledger_event_type in ('opening_face', 'adjustment', 'recovery')),
  amount numeric(20, 6) not null check (amount <> 0),
  currency_code text not null references public.currencies (code),
  financial_event_id uuid references public.financial_events (id) on delete restrict,
  occurred_at timestamptz not null,
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  constraint receivable_ledger_financial_event_shape check (
    (ledger_event_type = 'recovery' and financial_event_id is not null)
    or (ledger_event_type in ('opening_face', 'adjustment') and financial_event_id is null)
  )
);

comment on table public.receivable_ledger_events is
  'Append-only: opening_face/adjustment (no cash effect) and recovery (cash effect, always linked to a financial_events row). Outstanding = opening_face + adjustments - recoveries. See receivable_summary().';

create index receivable_ledger_events_receivable_id on public.receivable_ledger_events (receivable_id);

create function public.prepare_receivable_ledger_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_currency text;
  v_decimal_exponent smallint;
begin
  select user_id, currency_code into v_user_id, v_currency from public.receivables where id = new.receivable_id;
  if v_user_id is null then
    raise exception 'receivable % not found', new.receivable_id;
  end if;
  new.user_id := v_user_id;

  if new.currency_code is distinct from v_currency then
    raise exception 'ledger event currency % does not match receivable currency %', new.currency_code, v_currency;
  end if;

  if new.ledger_event_type in ('opening_face', 'recovery') and new.amount <= 0 then
    raise exception '% amount must be positive', new.ledger_event_type;
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
  if round(new.amount, v_decimal_exponent) <> new.amount then
    raise exception 'amount % has more precision than % allows (% decimal place(s))',
      new.amount, new.currency_code, v_decimal_exponent;
  end if;

  return new;
end;
$$;

create trigger receivable_ledger_events_prepare
  before insert on public.receivable_ledger_events
  for each row
  execute function public.prepare_receivable_ledger_event();

alter table public.receivable_ledger_events enable row level security;

revoke all on public.receivable_ledger_events from anon, authenticated;
grant select on public.receivable_ledger_events to authenticated;
grant insert (receivable_id, ledger_event_type, amount, currency_code, financial_event_id, occurred_at, description)
  on public.receivable_ledger_events to authenticated;

create policy "receivable_ledger_events_select_own"
  on public.receivable_ledger_events for select to authenticated
  using (auth.uid () = user_id);

create policy "receivable_ledger_events_insert_own"
  on public.receivable_ledger_events for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.receivables r where r.id = receivable_id and r.user_id = auth.uid ())
  );

-- Estimated Recoverable Value: a single evolving concept (unlike Assets'
-- three valuation types), append-only, latest row wins. Never treated as
-- face value or as liquid cash by any read model -- see receivable_summary().
create table public.receivable_recoverable_estimates (
  id uuid primary key default gen_random_uuid (),
  receivable_id uuid not null references public.receivables (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  value numeric(20, 6) not null check (value > 0),
  currency_code text not null references public.currencies (code),
  estimated_at timestamptz not null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.receivable_recoverable_estimates is
  'Append-only. Latest row per receivable is the current estimate. Never fabricated, never automatically equal to outstanding.';

create index receivable_recoverable_estimates_receivable_id on public.receivable_recoverable_estimates (receivable_id, estimated_at desc);

create function public.prepare_receivable_recoverable_estimate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_currency text;
  v_decimal_exponent smallint;
begin
  select user_id, currency_code into v_user_id, v_currency from public.receivables where id = new.receivable_id;
  if v_user_id is null then
    raise exception 'receivable % not found', new.receivable_id;
  end if;
  new.user_id := v_user_id;

  if new.currency_code is distinct from v_currency then
    raise exception 'estimate currency % does not match receivable currency %', new.currency_code, v_currency;
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
  if round(new.value, v_decimal_exponent) <> new.value then
    raise exception 'value % has more precision than % allows (% decimal place(s))',
      new.value, new.currency_code, v_decimal_exponent;
  end if;

  return new;
end;
$$;

create trigger receivable_recoverable_estimates_prepare
  before insert on public.receivable_recoverable_estimates
  for each row
  execute function public.prepare_receivable_recoverable_estimate();

alter table public.receivable_recoverable_estimates enable row level security;

revoke all on public.receivable_recoverable_estimates from anon, authenticated;
grant select on public.receivable_recoverable_estimates to authenticated;
grant insert (receivable_id, value, currency_code, estimated_at, note)
  on public.receivable_recoverable_estimates to authenticated;

create policy "receivable_recoverable_estimates_select_own"
  on public.receivable_recoverable_estimates for select to authenticated
  using (auth.uid () = user_id);

create policy "receivable_recoverable_estimates_insert_own"
  on public.receivable_recoverable_estimates for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.receivables r where r.id = receivable_id and r.user_id = auth.uid ())
  );

create trigger receivables_set_metadata
  before update on public.receivables
  for each row
  execute function public.enforce_receivable_currency_immutable();

-- ===========================================================================
-- 5. Liability types + liabilities
-- ===========================================================================

create table public.liability_types (
  code text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.liability_types enable row level security;
revoke all on public.liability_types from anon, authenticated;
grant select on public.liability_types to authenticated;

create policy "liability_types_readable"
  on public.liability_types for select to authenticated using (true);

insert into public.liability_types (code, display_name) values
  ('loan', 'Loan'),
  ('credit_facility', 'Credit Facility'),
  ('mortgage', 'Mortgage'),
  ('personal_debt', 'Personal Debt'),
  ('business_debt', 'Business Debt'),
  ('other', 'Other');

create table public.liabilities (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  liability_type text not null references public.liability_types (code),
  name text not null check (char_length(name) between 1 and 100),
  counterparty text check (counterparty is null or char_length(counterparty) <= 100),
  currency_code text not null references public.currencies (code),
  -- A recorded rate only -- no amortization/schedule calculation this
  -- phase (no compounding convention, no term, no schedule). See
  -- FINANCIAL_DOMAIN_MODEL.md, "interest rate".
  interest_rate numeric(7, 4) check (interest_rate is null or interest_rate >= 0),
  opened_at timestamptz,
  maturity_date timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.liabilities is
  'Money the user owes. Not lender-integrated. currency_code is fixed once principal history exists.';

create function public.enforce_liability_currency_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.currency_code is distinct from old.currency_code then
    if exists (select 1 from public.liability_principal_events e where e.liability_id = old.id) then
      raise exception 'cannot change currency of liability % -- it already has principal history', old.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- (trigger attached after liability_principal_events exists, end of section 6)

alter table public.liabilities enable row level security;

revoke all on public.liabilities from anon, authenticated;

grant select on public.liabilities to authenticated;
grant insert (user_id, liability_type, name, counterparty, currency_code, interest_rate, opened_at, maturity_date)
  on public.liabilities to authenticated;
grant update (liability_type, name, counterparty, interest_rate, maturity_date, currency_code, is_archived)
  on public.liabilities to authenticated;

create policy "liabilities_select_own"
  on public.liabilities for select to authenticated
  using (auth.uid () = user_id);

create policy "liabilities_insert_own"
  on public.liabilities for insert to authenticated
  with check (auth.uid () = user_id);

create policy "liabilities_update_own"
  on public.liabilities for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 6. Liability principal ledger
-- ===========================================================================
-- Outstanding principal = sum(amount). opening_principal and draw are
-- positive (a draw is the principal side of a loan_proceeds operation);
-- repayment is negative (the principal side of a debt_payment operation);
-- adjustment may be either sign. draw and repayment always carry a
-- financial_event_id; opening_principal and adjustment never do.

create table public.liability_principal_events (
  id uuid primary key default gen_random_uuid (),
  liability_id uuid not null references public.liabilities (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  principal_event_type text not null check (
    principal_event_type in ('opening_principal', 'draw', 'repayment', 'adjustment')
  ),
  amount numeric(20, 6) not null check (amount <> 0),
  currency_code text not null references public.currencies (code),
  financial_event_id uuid references public.financial_events (id) on delete restrict,
  occurred_at timestamptz not null,
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  constraint liability_principal_financial_event_shape check (
    (principal_event_type in ('draw', 'repayment') and financial_event_id is not null)
    or (principal_event_type in ('opening_principal', 'adjustment') and financial_event_id is null)
  )
);

comment on table public.liability_principal_events is
  'Append-only. Outstanding principal = sum(amount). draw/repayment always linked to the financial_events row that moved cash; opening_principal/adjustment never are. See liability_summary().';

create index liability_principal_events_liability_id on public.liability_principal_events (liability_id);

create function public.prepare_liability_principal_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_currency text;
  v_decimal_exponent smallint;
begin
  select user_id, currency_code into v_user_id, v_currency from public.liabilities where id = new.liability_id;
  if v_user_id is null then
    raise exception 'liability % not found', new.liability_id;
  end if;
  new.user_id := v_user_id;

  if new.currency_code is distinct from v_currency then
    raise exception 'principal event currency % does not match liability currency %', new.currency_code, v_currency;
  end if;

  if new.principal_event_type in ('opening_principal', 'draw') and new.amount <= 0 then
    raise exception '% amount must be positive', new.principal_event_type;
  end if;
  if new.principal_event_type = 'repayment' and new.amount >= 0 then
    raise exception 'repayment amount must be negative';
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
  if round(new.amount, v_decimal_exponent) <> new.amount then
    raise exception 'amount % has more precision than % allows (% decimal place(s))',
      new.amount, new.currency_code, v_decimal_exponent;
  end if;

  return new;
end;
$$;

create trigger liability_principal_events_prepare
  before insert on public.liability_principal_events
  for each row
  execute function public.prepare_liability_principal_event();

alter table public.liability_principal_events enable row level security;

revoke all on public.liability_principal_events from anon, authenticated;
grant select on public.liability_principal_events to authenticated;
grant insert (liability_id, principal_event_type, amount, currency_code, financial_event_id, occurred_at, description)
  on public.liability_principal_events to authenticated;

create policy "liability_principal_events_select_own"
  on public.liability_principal_events for select to authenticated
  using (auth.uid () = user_id);

create policy "liability_principal_events_insert_own"
  on public.liability_principal_events for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.liabilities l where l.id = liability_id and l.user_id = auth.uid ())
  );

create trigger liabilities_set_metadata
  before update on public.liabilities
  for each row
  execute function public.enforce_liability_currency_immutable();

-- ===========================================================================
-- 7. Standalone additions to an EXISTING receivable/liability
-- ===========================================================================
-- Same rationale as record_asset_valuation()/record_asset_basis_event()
-- in the Assets migration: user_id is trigger-derived and excluded from
-- these tables' INSERT column grants, so a direct client insert would
-- need to supply a column the database will never accept just to satisfy
-- the generated TypeScript Insert type. These are thin ownership-checking
-- wrappers, not a permissions workaround -- the underlying grant+policy
-- are unchanged and still run regardless of path.

create function public.record_receivable_adjustment(
  p_receivable_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_description text default null
)
returns public.receivable_ledger_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_receivable public.receivables;
  v_event public.receivable_ledger_events;
begin
  select * into v_receivable from public.receivables where id = p_receivable_id and user_id = auth.uid ();
  if not found then
    raise exception 'receivable % not found for current user', p_receivable_id;
  end if;

  insert into public.receivable_ledger_events (receivable_id, ledger_event_type, amount, currency_code, occurred_at, description)
    values (p_receivable_id, 'adjustment', p_amount, v_receivable.currency_code, p_occurred_at, p_description)
    returning * into v_event;

  return v_event;
end;
$$;

create function public.record_recoverable_estimate(
  p_receivable_id uuid,
  p_value numeric,
  p_estimated_at timestamptz default now(),
  p_note text default null
)
returns public.receivable_recoverable_estimates
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_receivable public.receivables;
  v_estimate public.receivable_recoverable_estimates;
begin
  select * into v_receivable from public.receivables where id = p_receivable_id and user_id = auth.uid ();
  if not found then
    raise exception 'receivable % not found for current user', p_receivable_id;
  end if;

  insert into public.receivable_recoverable_estimates (receivable_id, value, currency_code, estimated_at, note)
    values (p_receivable_id, p_value, v_receivable.currency_code, p_estimated_at, p_note)
    returning * into v_estimate;

  return v_estimate;
end;
$$;

create function public.record_liability_adjustment(
  p_liability_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_description text default null
)
returns public.liability_principal_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_liability public.liabilities;
  v_event public.liability_principal_events;
begin
  select * into v_liability from public.liabilities where id = p_liability_id and user_id = auth.uid ();
  if not found then
    raise exception 'liability % not found for current user', p_liability_id;
  end if;

  insert into public.liability_principal_events (liability_id, principal_event_type, amount, currency_code, occurred_at, description)
    values (p_liability_id, 'adjustment', p_amount, v_liability.currency_code, p_occurred_at, p_description)
    returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.record_receivable_adjustment(uuid, numeric, timestamptz, text) from public, anon;
grant execute on function public.record_receivable_adjustment(uuid, numeric, timestamptz, text) to authenticated;

revoke all on function public.record_recoverable_estimate(uuid, numeric, timestamptz, text) from public, anon;
grant execute on function public.record_recoverable_estimate(uuid, numeric, timestamptz, text) to authenticated;

revoke all on function public.record_liability_adjustment(uuid, numeric, timestamptz, text) from public, anon;
grant execute on function public.record_liability_adjustment(uuid, numeric, timestamptz, text) to authenticated;

-- ===========================================================================
-- 8. Atomic creation + compound financial operations
-- ===========================================================================
-- SECURITY INVOKER throughout. Onboarding an existing receivable/liability
-- never touches financial_events/cash_movements (FINANCIAL_DOMAIN_MODEL.md,
-- "existing receivable/debt onboarding"). Recovery, debt payment, and loan
-- proceeds all validate every referenced bucket/receivable/liability
-- against auth.uid() explicitly, in addition to the RLS the inserts still
-- go through as the invoking user.

create function public.create_receivable(
  p_name text,
  p_currency_code text,
  p_face_amount numeric,
  p_description text default null,
  p_occurred_at timestamptz default now(),
  p_estimated_recoverable_value numeric default null,
  p_expected_payment_date timestamptz default null
)
returns public.receivables
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_receivable public.receivables;
begin
  if p_face_amount <= 0 then
    raise exception 'face amount must be positive';
  end if;

  insert into public.receivables (user_id, name, description, currency_code, expected_payment_date)
    values (auth.uid (), p_name, p_description, p_currency_code, p_expected_payment_date)
    returning * into v_receivable;

  insert into public.receivable_ledger_events (receivable_id, ledger_event_type, amount, currency_code, occurred_at, description)
    values (v_receivable.id, 'opening_face', p_face_amount, p_currency_code, p_occurred_at, 'Opening face amount');

  if p_estimated_recoverable_value is not null then
    insert into public.receivable_recoverable_estimates (receivable_id, value, currency_code, estimated_at)
      values (v_receivable.id, p_estimated_recoverable_value, p_currency_code, p_occurred_at);
  end if;

  return v_receivable;
end;
$$;

create function public.create_liability(
  p_name text,
  p_liability_type text,
  p_currency_code text,
  p_opening_principal numeric,
  p_counterparty text default null,
  p_interest_rate numeric default null,
  p_opened_at timestamptz default null,
  p_maturity_date timestamptz default null,
  p_occurred_at timestamptz default now()
)
returns public.liabilities
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_liability public.liabilities;
begin
  if p_opening_principal <= 0 then
    raise exception 'opening principal must be positive';
  end if;

  insert into public.liabilities (user_id, liability_type, name, counterparty, currency_code, interest_rate, opened_at, maturity_date)
    values (auth.uid (), p_liability_type, p_name, p_counterparty, p_currency_code, p_interest_rate, p_opened_at, p_maturity_date)
    returning * into v_liability;

  insert into public.liability_principal_events (liability_id, principal_event_type, amount, currency_code, occurred_at, description)
    values (v_liability.id, 'opening_principal', p_opening_principal, p_currency_code, coalesce(p_opened_at, p_occurred_at), 'Opening principal');

  return v_liability;
end;
$$;

-- Outstanding receivable amount, respecting voided recoveries -- shared
-- logic used by both the recovery-limit check below and receivable_summary().
create function public.receivable_outstanding_amount(p_receivable_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(
    case
      when e.ledger_event_type in ('opening_face', 'adjustment') then e.amount
      when e.ledger_event_type = 'recovery' then -e.amount
    end
  ), 0)
  from public.receivable_ledger_events e
  left join public.financial_events fe on fe.id = e.financial_event_id
  where e.receivable_id = p_receivable_id
    and (e.financial_event_id is null or fe.voided_at is null);
$$;

create function public.liability_outstanding_principal(p_liability_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(e.amount), 0)
  from public.liability_principal_events e
  left join public.financial_events fe on fe.id = e.financial_event_id
  where e.liability_id = p_liability_id
    and (e.financial_event_id is null or fe.voided_at is null);
$$;

create function public.record_receivable_recovery(
  p_receivable_id uuid,
  p_bucket_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.financial_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_receivable public.receivables;
  v_bucket public.cash_buckets;
  v_event public.financial_events;
  v_outstanding numeric;
begin
  if p_idempotency_key is not null then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'recovery amount must be positive';
  end if;

  select * into v_receivable from public.receivables where id = p_receivable_id and user_id = auth.uid ();
  if not found then
    raise exception 'receivable % not found for current user', p_receivable_id;
  end if;
  if v_receivable.is_archived then
    raise exception 'cannot record a recovery against an archived receivable';
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;
  if v_bucket.is_archived then
    raise exception 'cannot record activity on an archived bucket';
  end if;

  if v_bucket.currency_code <> v_receivable.currency_code then
    raise exception 'recovery bucket currency % does not match receivable currency % -- cross-currency settlement is not supported this phase',
      v_bucket.currency_code, v_receivable.currency_code;
  end if;

  v_outstanding := public.receivable_outstanding_amount (p_receivable_id);
  if p_amount > v_outstanding then
    raise exception 'recovery amount % exceeds outstanding amount %', p_amount, v_outstanding;
  end if;

  insert into public.financial_events (user_id, event_type, occurred_at, description, idempotency_key)
    values (auth.uid (), 'receivable_recovery', p_occurred_at, p_description, p_idempotency_key)
    returning * into v_event;

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_bucket_id, v_receivable.currency_code, p_amount);

  insert into public.receivable_ledger_events (receivable_id, ledger_event_type, amount, currency_code, financial_event_id, occurred_at, description)
    values (p_receivable_id, 'recovery', p_amount, v_receivable.currency_code, v_event.id, p_occurred_at, p_description);

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

create function public.record_loan_proceeds(
  p_liability_id uuid,
  p_bucket_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.financial_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_liability public.liabilities;
  v_bucket public.cash_buckets;
  v_event public.financial_events;
begin
  if p_idempotency_key is not null then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'loan proceeds amount must be positive';
  end if;

  select * into v_liability from public.liabilities where id = p_liability_id and user_id = auth.uid ();
  if not found then
    raise exception 'liability % not found for current user', p_liability_id;
  end if;
  if v_liability.is_archived then
    raise exception 'cannot record activity on an archived liability';
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;
  if v_bucket.is_archived then
    raise exception 'cannot record activity on an archived bucket';
  end if;

  if v_bucket.currency_code <> v_liability.currency_code then
    raise exception 'loan proceeds bucket currency % does not match liability currency % -- cross-currency draws are not supported this phase',
      v_bucket.currency_code, v_liability.currency_code;
  end if;

  insert into public.financial_events (user_id, event_type, occurred_at, description, idempotency_key)
    values (auth.uid (), 'loan_proceeds', p_occurred_at, p_description, p_idempotency_key)
    returning * into v_event;

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_bucket_id, v_liability.currency_code, p_amount);

  insert into public.liability_principal_events (liability_id, principal_event_type, amount, currency_code, financial_event_id, occurred_at, description)
    values (p_liability_id, 'draw', p_amount, v_liability.currency_code, v_event.id, p_occurred_at, p_description);

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

create function public.record_debt_payment(
  p_liability_id uuid,
  p_bucket_id uuid,
  p_principal_amount numeric default 0,
  p_interest_amount numeric default 0,
  p_fee_amount numeric default 0,
  p_occurred_at timestamptz default now(),
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.financial_operations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_liability public.liabilities;
  v_bucket public.cash_buckets;
  v_operation public.financial_operations;
  v_event public.financial_events;
  v_outstanding numeric;
  v_principal numeric := coalesce(p_principal_amount, 0);
  v_interest numeric := coalesce(p_interest_amount, 0);
  v_fee numeric := coalesce(p_fee_amount, 0);
begin
  if p_idempotency_key is not null then
    select * into v_operation from public.financial_operations
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_operation;
    end if;
  end if;

  if v_principal < 0 or v_interest < 0 or v_fee < 0 then
    raise exception 'principal, interest, and fee amounts must not be negative';
  end if;
  if v_principal + v_interest + v_fee <= 0 then
    raise exception 'a debt payment must include at least one positive component';
  end if;

  select * into v_liability from public.liabilities where id = p_liability_id and user_id = auth.uid ();
  if not found then
    raise exception 'liability % not found for current user', p_liability_id;
  end if;
  if v_liability.is_archived then
    raise exception 'cannot record a payment against an archived liability';
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;
  if v_bucket.is_archived then
    raise exception 'cannot record activity on an archived bucket';
  end if;

  if v_bucket.currency_code <> v_liability.currency_code then
    raise exception 'payment bucket currency % does not match liability currency % -- cross-currency debt payments are not supported this phase',
      v_bucket.currency_code, v_liability.currency_code;
  end if;

  if v_principal > 0 then
    v_outstanding := public.liability_outstanding_principal (p_liability_id);
    if v_principal > v_outstanding then
      raise exception 'principal payment % exceeds outstanding principal %', v_principal, v_outstanding;
    end if;
  end if;

  insert into public.financial_operations (user_id, operation_type, occurred_at, description, idempotency_key)
    values (auth.uid (), 'debt_payment', p_occurred_at, p_description, p_idempotency_key)
    returning * into v_operation;

  if v_principal > 0 then
    insert into public.financial_events (user_id, event_type, operation_id, occurred_at, description)
      values (auth.uid (), 'debt_principal_payment', v_operation.id, p_occurred_at, p_description)
      returning * into v_event;
    insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
      values (v_event.id, p_bucket_id, v_liability.currency_code, -v_principal);
    insert into public.liability_principal_events (liability_id, principal_event_type, amount, currency_code, financial_event_id, occurred_at, description)
      values (p_liability_id, 'repayment', -v_principal, v_liability.currency_code, v_event.id, p_occurred_at, p_description);
  end if;

  if v_interest > 0 then
    insert into public.financial_events (user_id, event_type, operation_id, occurred_at, description)
      values (auth.uid (), 'debt_interest', v_operation.id, p_occurred_at, p_description)
      returning * into v_event;
    insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
      values (v_event.id, p_bucket_id, v_liability.currency_code, -v_interest);
  end if;

  if v_fee > 0 then
    insert into public.financial_events (user_id, event_type, operation_id, occurred_at, description)
      values (auth.uid (), 'debt_fee', v_operation.id, p_occurred_at, p_description)
      returning * into v_event;
    insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
      values (v_event.id, p_bucket_id, v_liability.currency_code, -v_fee);
  end if;

  return v_operation;
exception
  when unique_violation then
    select * into v_operation from public.financial_operations
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_operation;
end;
$$;

revoke all on function public.create_receivable(text, text, numeric, text, timestamptz, numeric, timestamptz) from public, anon;
grant execute on function public.create_receivable(text, text, numeric, text, timestamptz, numeric, timestamptz) to authenticated;

revoke all on function public.create_liability(text, text, text, numeric, text, numeric, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_liability(text, text, text, numeric, text, numeric, timestamptz, timestamptz, timestamptz) to authenticated;

revoke all on function public.receivable_outstanding_amount(uuid) from public, anon;
grant execute on function public.receivable_outstanding_amount(uuid) to authenticated;

revoke all on function public.liability_outstanding_principal(uuid) from public, anon;
grant execute on function public.liability_outstanding_principal(uuid) to authenticated;

revoke all on function public.record_receivable_recovery(uuid, uuid, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_receivable_recovery(uuid, uuid, numeric, timestamptz, text, uuid) to authenticated;

revoke all on function public.record_loan_proceeds(uuid, uuid, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_loan_proceeds(uuid, uuid, numeric, timestamptz, text, uuid) to authenticated;

revoke all on function public.record_debt_payment(uuid, uuid, numeric, numeric, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_debt_payment(uuid, uuid, numeric, numeric, numeric, timestamptz, text, uuid) to authenticated;

-- ===========================================================================
-- 9. Read models
-- ===========================================================================
-- One shared, authoritative calculation per concept. Amounts cast to text
-- (see MULTI_CURRENCY_MODEL.md §6). Native totals never sum across
-- currencies. Target/estimate values are never conflated with outstanding.

create function public.receivable_summary()
returns table (
  receivable_id uuid,
  name text,
  currency_code text,
  face_amount text,
  recovered_amount text,
  outstanding_amount text,
  estimated_recoverable_value text,
  expected_payment_date timestamptz,
  last_follow_up_at timestamptz,
  is_archived boolean,
  latest_recovery_at timestamptz
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    r.id,
    r.name,
    r.currency_code,
    face.total::text,
    coalesce(recovered.total, 0)::text,
    (coalesce(face.total, 0) - coalesce(recovered.total, 0))::text,
    est.value::text,
    r.expected_payment_date,
    r.last_follow_up_at,
    r.is_archived,
    recovered.latest_at
  from public.receivables r
  left join lateral (
    select sum(e.amount) as total
    from public.receivable_ledger_events e
    where e.receivable_id = r.id and e.ledger_event_type in ('opening_face', 'adjustment')
  ) face on true
  left join lateral (
    select sum(e.amount) as total, max(e.occurred_at) as latest_at
    from public.receivable_ledger_events e
    left join public.financial_events fe on fe.id = e.financial_event_id
    where e.receivable_id = r.id and e.ledger_event_type = 'recovery' and fe.voided_at is null
  ) recovered on true
  left join lateral (
    select value
    from public.receivable_recoverable_estimates v
    where v.receivable_id = r.id
    order by v.estimated_at desc, v.created_at desc
    limit 1
  ) est on true
  where r.user_id = auth.uid ();
$$;

create function public.receivable_native_currency_totals()
returns table (currency_code text, total_outstanding text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select r.currency_code, sum(public.receivable_outstanding_amount (r.id))::text
  from public.receivables r
  where r.user_id = auth.uid () and r.is_archived = false
  group by r.currency_code;
$$;

create function public.receivable_ledger_history(p_limit integer default 50)
returns table (
  receivable_id uuid,
  ledger_event_id uuid,
  ledger_event_type text,
  amount text,
  currency_code text,
  occurred_at timestamptz,
  description text,
  voided boolean
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select e.receivable_id, e.id, e.ledger_event_type, e.amount::text, e.currency_code, e.occurred_at, e.description,
    coalesce(fe.voided_at is not null, false)
  from public.receivable_ledger_events e
  left join public.financial_events fe on fe.id = e.financial_event_id
  where e.user_id = auth.uid ()
  order by e.occurred_at desc, e.created_at desc
  limit greatest(p_limit, 0);
$$;

create function public.liability_summary()
returns table (
  liability_id uuid,
  name text,
  liability_type text,
  currency_code text,
  outstanding_principal text,
  principal_repaid text,
  interest_rate numeric,
  opened_at timestamptz,
  maturity_date timestamptz,
  is_archived boolean
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    l.id,
    l.name,
    l.liability_type,
    l.currency_code,
    public.liability_outstanding_principal (l.id)::text,
    coalesce(repaid.total, 0)::text,
    l.interest_rate,
    l.opened_at,
    l.maturity_date,
    l.is_archived
  from public.liabilities l
  left join lateral (
    select -sum(e.amount) as total
    from public.liability_principal_events e
    left join public.financial_events fe on fe.id = e.financial_event_id
    where e.liability_id = l.id and e.principal_event_type = 'repayment' and fe.voided_at is null
  ) repaid on true
  where l.user_id = auth.uid ();
$$;

create function public.liability_native_currency_totals()
returns table (currency_code text, total_outstanding text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select l.currency_code, sum(public.liability_outstanding_principal (l.id))::text
  from public.liabilities l
  where l.user_id = auth.uid () and l.is_archived = false
  group by l.currency_code;
$$;

create function public.liability_principal_history(p_limit integer default 50)
returns table (
  liability_id uuid,
  principal_event_id uuid,
  principal_event_type text,
  amount text,
  currency_code text,
  occurred_at timestamptz,
  description text,
  voided boolean
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select e.liability_id, e.id, e.principal_event_type, e.amount::text, e.currency_code, e.occurred_at, e.description,
    coalesce(fe.voided_at is not null, false)
  from public.liability_principal_events e
  left join public.financial_events fe on fe.id = e.financial_event_id
  where e.user_id = auth.uid ()
  order by e.occurred_at desc, e.created_at desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.receivable_summary () from public, anon;
grant execute on function public.receivable_summary () to authenticated;

revoke all on function public.receivable_native_currency_totals () from public, anon;
grant execute on function public.receivable_native_currency_totals () to authenticated;

revoke all on function public.receivable_ledger_history (integer) from public, anon;
grant execute on function public.receivable_ledger_history (integer) to authenticated;

revoke all on function public.liability_summary () from public, anon;
grant execute on function public.liability_summary () to authenticated;

revoke all on function public.liability_native_currency_totals () from public, anon;
grant execute on function public.liability_native_currency_totals () to authenticated;

revoke all on function public.liability_principal_history (integer) from public, anon;
grant execute on function public.liability_principal_history (integer) to authenticated;
