-- Monatriq: Goals, Protected Allocations & Progress domain (P0-E2-S5)
--
-- Full design rationale in docs/architecture/FINANCIAL_DOMAIN_MODEL.md and
-- docs/reports/P0-E2-S5-goals-protected-allocations-foundation.txt.
--
-- CORE PRINCIPLE: GOALS DO NOT OWN CASH. Money owns cash; a goal allocation
-- assigns PURPOSE to cash that already exists in a bucket. Allocating,
-- releasing, or reallocating cash NEVER creates a financial_events or
-- cash_movements row -- not here, not indirectly. Zero Money integration is
-- a deliberate architectural boundary, not an oversight (contrast with
-- Receivables/Liabilities, which genuinely move cash).
--
-- ONE UNIT OF MONEY, ONE PURPOSE: enforced by construction, not convention.
-- Every allocate/release/reallocate RPC locks the target bucket row
-- (SELECT ... FOR UPDATE) before computing available-to-allocate capacity,
-- so two concurrent allocation attempts against the same bucket cannot both
-- read the same available balance and over-allocate it.
--
-- FOUR MEASUREMENT TYPES, ONE GOAL RECORD: cash_target, debt_balance_target,
-- monthly_income_target, milestone. goal_type_code (home_property,
-- emergency_reserve, relocation, ...) is a separate, orthogonal descriptive
-- registry -- measurement_type is what actually drives the math. A goal's
-- currency, liability link, and measurement_type are immutable after
-- creation (enforced by CHECK constraints + grant exclusion, see section 2),
-- because reinterpreting what a goal's numbers MEAN after the fact is
-- exactly the kind of silent history-rewrite this system avoids elsewhere.
--
-- APPEND-ONLY EVERYWHERE: goal_target_history (target changes preserve
-- history) and goal_allocation_events (current allocation = sum of signed
-- events) -- no mutable goal.current_saved-style column anywhere.
--
-- ALL SECURITY INVOKER, same discipline as every prior domain. No elevated
-- privilege anywhere in this migration.

-- ===========================================================================
-- 1. Goal types (extensible, descriptive registry -- not the math)
-- ===========================================================================

create table public.goal_types (
  code text primary key,
  display_name text not null,
  default_measurement_type text not null check (
    default_measurement_type in ('cash_target', 'debt_balance_target', 'monthly_income_target', 'milestone')
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.goal_types is
  'Descriptive category registry (home_property, emergency_reserve, ...). default_measurement_type is a creation-form hint only -- a goal''s ACTUAL measurement_type (goals.measurement_type) is independently chosen and drives all math. Public reference data, like currencies/liability_types.';

alter table public.goal_types enable row level security;
revoke all on public.goal_types from anon, authenticated;
grant select on public.goal_types to authenticated;

create policy "goal_types_readable"
  on public.goal_types for select to authenticated using (true);

insert into public.goal_types (code, display_name, default_measurement_type, sort_order) values
  ('home_property', 'Home / Property', 'cash_target', 0),
  ('emergency_reserve', 'Emergency Reserve', 'cash_target', 1),
  ('savings_target', 'Savings Target', 'cash_target', 2),
  ('relocation', 'Relocation', 'milestone', 3),
  ('recurring_income', 'Recurring Income', 'monthly_income_target', 4),
  ('debt_payoff', 'Debt Payoff', 'debt_balance_target', 5),
  ('business_capital', 'Business Capital', 'cash_target', 6),
  ('education', 'Education', 'cash_target', 7),
  ('vehicle', 'Vehicle', 'cash_target', 8),
  ('event', 'Event', 'cash_target', 9),
  ('retirement', 'Retirement', 'cash_target', 10),
  ('travel', 'Travel', 'cash_target', 11),
  ('custom', 'Custom', 'cash_target', 12);

-- ===========================================================================
-- 2. Goals
-- ===========================================================================
-- No target_value/target_amount/current_saved column here -- the current
-- target is always the latest row in goal_target_history (section 3);
-- allocated funding is always derived from goal_allocation_events
-- (section 5). currency_code, liability_id, and measurement_type are
-- immutable after creation: measurement_type/liability_id are simply never
-- in the UPDATE grant (no legitimate reason to reinterpret a goal's math
-- after the fact); currency_code IS grant-editable but blocked by trigger
-- once any allocation exists (same pattern as bucket/asset/receivable/
-- liability currency immutability).
--
-- starting_liability_balance is a ONE-TIME FROZEN SNAPSHOT taken at
-- creation (never updated afterward, never in the UPDATE grant) -- it is
-- NOT a duplicated, manually-synced debt balance. The live outstanding
-- balance always comes from liability_outstanding_principal() (section 8),
-- never from this column; this column exists purely to answer "how much
-- did I owe when I started this goal."

create table public.goals (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_type_code text not null references public.goal_types (code),
  measurement_type text not null check (
    measurement_type in ('cash_target', 'debt_balance_target', 'monthly_income_target', 'milestone')
  ),
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  currency_code text references public.currencies (code),
  liability_id uuid references public.liabilities (id) on delete restrict,
  starting_liability_balance numeric(20, 6) check (starting_liability_balance is null or starting_liability_balance >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  is_protected boolean not null default false,
  is_focus boolean not null default false,
  priority integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_currency_required_by_measurement check (
    (measurement_type = 'milestone') = (currency_code is null)
  ),
  constraint goals_liability_required_by_measurement check (
    (measurement_type = 'debt_balance_target') = (liability_id is not null)
  ),
  constraint goals_starting_balance_matches_measurement check (
    (measurement_type = 'debt_balance_target') = (starting_liability_balance is not null)
  )
);

comment on table public.goals is
  'A user-owned goal record. Does NOT own cash -- see goal_allocation_events. measurement_type drives all progress math; goal_type_code is descriptive only. Status transitions (including "completed") are always user-driven, never auto-flipped -- see docs/architecture/FINANCIAL_DOMAIN_MODEL.md, "Goal status strategy".';

-- At most one focus goal per user, regardless of insert path (direct
-- update or set_focus_goal()) -- the real invariant enforcement, not just
-- the RPC's convenience unset-then-set behavior.
create unique index goals_one_focus_per_user on public.goals (user_id) where is_focus;

create function public.enforce_goal_currency_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.currency_code is distinct from old.currency_code then
    if exists (select 1 from public.goal_allocation_events e where e.goal_id = old.id) then
      raise exception 'cannot change currency of goal % -- it already has allocation history', old.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- (trigger attached after goal_allocation_events exists, end of section 5)

alter table public.goals enable row level security;

revoke all on public.goals from anon, authenticated;

grant select on public.goals to authenticated;
grant insert (user_id, goal_type_code, measurement_type, name, description, currency_code, liability_id, starting_liability_balance, is_protected)
  on public.goals to authenticated;
grant update (name, description, status, is_protected, priority, currency_code, is_focus)
  on public.goals to authenticated;

create policy "goals_select_own"
  on public.goals for select to authenticated
  using (auth.uid () = user_id);

create policy "goals_insert_own"
  on public.goals for insert to authenticated
  with check (
    auth.uid () = user_id
    and (liability_id is null or exists (select 1 from public.liabilities l where l.id = liability_id and l.user_id = auth.uid ()))
  );

create policy "goals_update_own"
  on public.goals for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 3. Goal target history (append-only)
-- ===========================================================================
-- A new row is a new "version" of the target -- old targets are never
-- overwritten. target_value is structurally null for debt_balance_target
-- (target is always "outstanding principal = 0") and milestone (no numeric
-- target) goals; target_date is optional for every measurement type.

create table public.goal_target_history (
  id uuid primary key default gen_random_uuid (),
  goal_id uuid not null references public.goals (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  target_value numeric(20, 6) check (target_value is null or target_value > 0),
  currency_code text references public.currencies (code),
  target_date date,
  effective_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.goal_target_history is
  'Append-only. The current target for a goal is always the latest row (by effective_at). See goal_current_target().';

create index goal_target_history_goal_id on public.goal_target_history (goal_id, effective_at desc);

create function public.prepare_goal_target()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_measurement_type text;
  v_currency text;
  v_decimal_exponent smallint;
begin
  select user_id, measurement_type, currency_code
    into v_user_id, v_measurement_type, v_currency
    from public.goals where id = new.goal_id;
  if v_user_id is null then
    raise exception 'goal % not found', new.goal_id;
  end if;
  new.user_id := v_user_id;
  new.currency_code := v_currency;

  if new.target_value is not null and v_measurement_type in ('debt_balance_target', 'milestone') then
    raise exception 'a % goal does not carry a numeric target_value -- its target is structural (zero balance / milestone completion)', v_measurement_type;
  end if;

  if new.target_value is not null then
    select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
    if round(new.target_value, v_decimal_exponent) <> new.target_value then
      raise exception 'target_value % has more precision than % allows (% decimal place(s))',
        new.target_value, new.currency_code, v_decimal_exponent;
    end if;
  end if;

  return new;
end;
$$;

create trigger goal_target_history_prepare
  before insert on public.goal_target_history
  for each row
  execute function public.prepare_goal_target();

alter table public.goal_target_history enable row level security;

revoke all on public.goal_target_history from anon, authenticated;
grant select on public.goal_target_history to authenticated;
grant insert (goal_id, target_value, target_date, effective_at, note)
  on public.goal_target_history to authenticated;

create policy "goal_target_history_select_own"
  on public.goal_target_history for select to authenticated
  using (auth.uid () = user_id);

create policy "goal_target_history_insert_own"
  on public.goal_target_history for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid ())
  );

-- ===========================================================================
-- 4. Goal milestones (lightweight, non-financial)
-- ===========================================================================
-- Completing a milestone is a plain column update (completed_at) -- it
-- never creates cash, income, expense, or goal funding. on delete cascade
-- (unlike ledger tables' on delete restrict) because milestones carry no
-- financial/audit significance to preserve -- they are descriptive
-- sub-items, not a ledger.

create table public.goal_milestones (
  id uuid primary key default gen_random_uuid (),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  due_date date,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.goal_milestones is
  'Lightweight, optional, non-financial sub-steps for any goal. Completion has zero cash/income/expense/allocation effect.';

create index goal_milestones_goal_id on public.goal_milestones (goal_id, sort_order);

create function public.prepare_goal_milestone()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.goals where id = new.goal_id;
  if v_user_id is null then
    raise exception 'goal % not found', new.goal_id;
  end if;
  new.user_id := v_user_id;
  return new;
end;
$$;

create trigger goal_milestones_prepare
  before insert on public.goal_milestones
  for each row
  execute function public.prepare_goal_milestone();

create function public.touch_goal_milestone_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger goal_milestones_touch_updated_at
  before update on public.goal_milestones
  for each row
  execute function public.touch_goal_milestone_updated_at();

alter table public.goal_milestones enable row level security;

revoke all on public.goal_milestones from anon, authenticated;
grant select on public.goal_milestones to authenticated;
grant insert (goal_id, title, due_date, sort_order)
  on public.goal_milestones to authenticated;
grant update (title, due_date, completed_at, sort_order)
  on public.goal_milestones to authenticated;

create policy "goal_milestones_select_own"
  on public.goal_milestones for select to authenticated
  using (auth.uid () = user_id);

create policy "goal_milestones_insert_own"
  on public.goal_milestones for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid ())
  );

create policy "goal_milestones_update_own"
  on public.goal_milestones for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 5. Goal allocation events (append-only; PURPOSE only, never cash)
-- ===========================================================================
-- Current allocation = sum(amount). allocate is always positive, release is
-- always negative -- current allocated total derives from one SUM, exactly
-- like liability_principal_events. Reallocation (goal A -> goal B) is two
-- rows -- a release on A and an allocate on B -- written atomically by
-- record_goal_reallocation() in one transaction; only the release-side row
-- carries idempotency_key (see that function's comment for why one shared
-- key can't be used on both rows). NO financial_event_id column exists
-- here at all -- unlike receivable/liability ledgers, these events
-- structurally cannot have a cash effect, so there is nothing to link to
-- Money's voiding mechanism.

create table public.goal_allocation_events (
  id uuid primary key default gen_random_uuid (),
  goal_id uuid not null references public.goals (id) on delete restrict,
  bucket_id uuid not null references public.cash_buckets (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('allocate', 'release')),
  amount numeric(20, 6) not null check (amount <> 0),
  currency_code text not null references public.currencies (code),
  idempotency_key uuid,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.goal_allocation_events is
  'Append-only. Assigns PURPOSE to existing cash -- never moves it. No financial_events/cash_movements row is ever created from this table. allocate is positive, release is negative; current allocation = sum(amount). "One unit of money, one purpose" is enforced by allocation-capacity checks in the record_goal_* RPCs, not by this table alone.';

create index goal_allocation_events_goal_id on public.goal_allocation_events (goal_id);
create index goal_allocation_events_bucket_id on public.goal_allocation_events (bucket_id);

create unique index goal_allocation_events_user_idempotency_key
  on public.goal_allocation_events (user_id, idempotency_key)
  where idempotency_key is not null;

create function public.prepare_goal_allocation_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_goal_user_id uuid;
  v_goal_currency text;
  v_measurement_type text;
  v_bucket_currency text;
  v_decimal_exponent smallint;
begin
  select user_id, currency_code, measurement_type
    into v_goal_user_id, v_goal_currency, v_measurement_type
    from public.goals where id = new.goal_id;
  if v_goal_user_id is null then
    raise exception 'goal % not found', new.goal_id;
  end if;
  new.user_id := v_goal_user_id;

  if v_measurement_type not in ('cash_target', 'debt_balance_target') then
    raise exception 'a % goal does not accept cash allocations', v_measurement_type;
  end if;

  select currency_code into v_bucket_currency from public.cash_buckets where id = new.bucket_id;
  if v_bucket_currency is null then
    raise exception 'bucket % not found', new.bucket_id;
  end if;

  if new.currency_code is distinct from v_goal_currency or new.currency_code is distinct from v_bucket_currency then
    raise exception 'allocation currency % must match both goal currency % and bucket currency %',
      new.currency_code, v_goal_currency, v_bucket_currency;
  end if;

  if new.event_type = 'allocate' and new.amount <= 0 then
    raise exception 'allocate amount must be positive';
  end if;
  if new.event_type = 'release' and new.amount >= 0 then
    raise exception 'release amount must be negative';
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
  if round(new.amount, v_decimal_exponent) <> new.amount then
    raise exception 'amount % has more precision than % allows (% decimal place(s))',
      new.amount, new.currency_code, v_decimal_exponent;
  end if;

  return new;
end;
$$;

create trigger goal_allocation_events_prepare
  before insert on public.goal_allocation_events
  for each row
  execute function public.prepare_goal_allocation_event();

alter table public.goal_allocation_events enable row level security;

revoke all on public.goal_allocation_events from anon, authenticated;
grant select on public.goal_allocation_events to authenticated;
grant insert (goal_id, bucket_id, event_type, amount, currency_code, idempotency_key, note)
  on public.goal_allocation_events to authenticated;

-- The critical cross-tenant defense for this whole domain: BOTH the goal
-- and the bucket must be owned by the caller. A forged row with
-- user_id=A but goal_id=B, or user_id=A but bucket_id=B, or both=B with
-- user_id forged to A, all fail here regardless of what the RPCs already
-- checked.
create policy "goal_allocation_events_select_own"
  on public.goal_allocation_events for select to authenticated
  using (auth.uid () = user_id);

create policy "goal_allocation_events_insert_own"
  on public.goal_allocation_events for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid ())
    and exists (select 1 from public.cash_buckets b where b.id = bucket_id and b.user_id = auth.uid ())
  );

create trigger goals_set_metadata
  before update on public.goals
  for each row
  execute function public.enforce_goal_currency_immutable();

-- ===========================================================================
-- 6. Goal / target / milestone creation RPCs
-- ===========================================================================

create function public.create_goal(
  p_goal_type_code text,
  p_measurement_type text,
  p_name text,
  p_description text default null,
  p_currency_code text default null,
  p_liability_id uuid default null,
  p_target_value numeric default null,
  p_target_date date default null,
  p_is_protected boolean default false
)
returns public.goals
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_goal public.goals;
  v_liability public.liabilities;
  v_currency text := p_currency_code;
  v_starting_balance numeric;
begin
  if p_measurement_type not in ('cash_target', 'debt_balance_target', 'monthly_income_target', 'milestone') then
    raise exception 'unknown measurement_type %', p_measurement_type;
  end if;
  if not exists (select 1 from public.goal_types where code = p_goal_type_code) then
    raise exception 'unknown goal_type_code %', p_goal_type_code;
  end if;
  if p_measurement_type in ('debt_balance_target', 'milestone') and p_target_value is not null then
    raise exception 'a % goal does not carry a numeric target_value -- its target is structural', p_measurement_type;
  end if;

  if p_measurement_type = 'debt_balance_target' then
    if p_liability_id is null then
      raise exception 'a debt_balance_target goal must reference a liability';
    end if;
    select * into v_liability from public.liabilities where id = p_liability_id and user_id = auth.uid ();
    if not found then
      raise exception 'liability % not found for current user', p_liability_id;
    end if;
    -- Currency is derived from the liability, never independently chosen --
    -- a debt-payoff goal and its liability must speak the same currency by
    -- construction.
    v_currency := v_liability.currency_code;
    v_starting_balance := public.liability_outstanding_principal (p_liability_id);
  else
    if p_liability_id is not null then
      raise exception 'only a debt_balance_target goal may reference a liability';
    end if;
    v_starting_balance := null;
  end if;

  if p_measurement_type = 'milestone' then
    v_currency := null;
  elsif v_currency is null then
    raise exception 'a % goal requires a currency_code', p_measurement_type;
  end if;

  insert into public.goals (
    user_id, goal_type_code, measurement_type, name, description,
    currency_code, liability_id, starting_liability_balance, is_protected
  )
  values (
    auth.uid (), p_goal_type_code, p_measurement_type, p_name, p_description,
    v_currency, p_liability_id, v_starting_balance, coalesce(p_is_protected, false)
  )
  returning * into v_goal;

  if p_target_value is not null or p_target_date is not null then
    insert into public.goal_target_history (goal_id, target_value, target_date)
      values (v_goal.id, p_target_value, p_target_date);
  end if;

  return v_goal;
end;
$$;

create function public.record_goal_target(
  p_goal_id uuid,
  p_target_value numeric default null,
  p_target_date date default null,
  p_note text default null
)
returns public.goal_target_history
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_history public.goal_target_history;
begin
  if not exists (select 1 from public.goals where id = p_goal_id and user_id = auth.uid ()) then
    raise exception 'goal % not found for current user', p_goal_id;
  end if;

  insert into public.goal_target_history (goal_id, target_value, target_date, note)
    values (p_goal_id, p_target_value, p_target_date, p_note)
    returning * into v_history;

  return v_history;
end;
$$;

-- At-most-one-focus-goal is really enforced by the partial unique index in
-- section 2 (goals_one_focus_per_user), which applies regardless of path.
-- This RPC exists purely for the convenience of atomically switching focus
-- (unset the old one, set the new one) instead of the client having to
-- issue two separate update calls -- a direct update to is_focus=true
-- remains possible (it is in the UPDATE grant) but errors if another goal
-- already holds focus, which is the correct, honest behavior either way.
create function public.set_focus_goal(p_goal_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_goal_id is not null and not exists (select 1 from public.goals where id = p_goal_id and user_id = auth.uid ()) then
    raise exception 'goal % not found for current user', p_goal_id;
  end if;

  update public.goals set is_focus = false where user_id = auth.uid () and is_focus = true;

  if p_goal_id is not null then
    update public.goals set is_focus = true where id = p_goal_id and user_id = auth.uid ();
  end if;
end;
$$;

-- Same rationale as record_asset_valuation()/record_receivable_adjustment()
-- in prior migrations: user_id is trigger-derived and excluded from
-- goal_milestones' INSERT grant, so a direct client insert would need to
-- supply a column the database will never accept. This is a thin
-- ownership-checking wrapper, not a permissions workaround.
create function public.record_goal_milestone(
  p_goal_id uuid,
  p_title text,
  p_due_date date default null,
  p_sort_order integer default 0
)
returns public.goal_milestones
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_milestone public.goal_milestones;
begin
  if not exists (select 1 from public.goals where id = p_goal_id and user_id = auth.uid ()) then
    raise exception 'goal % not found for current user', p_goal_id;
  end if;

  insert into public.goal_milestones (goal_id, title, due_date, sort_order)
    values (p_goal_id, p_title, p_due_date, coalesce(p_sort_order, 0))
    returning * into v_milestone;

  return v_milestone;
end;
$$;

revoke all on function public.create_goal(text, text, text, text, text, uuid, numeric, date, boolean) from public, anon;
grant execute on function public.create_goal(text, text, text, text, text, uuid, numeric, date, boolean) to authenticated;

revoke all on function public.record_goal_target(uuid, numeric, date, text) from public, anon;
grant execute on function public.record_goal_target(uuid, numeric, date, text) to authenticated;

revoke all on function public.set_focus_goal(uuid) from public, anon;
grant execute on function public.set_focus_goal(uuid) to authenticated;

revoke all on function public.record_goal_milestone(uuid, text, date, integer) from public, anon;
grant execute on function public.record_goal_milestone(uuid, text, date, integer) to authenticated;

-- ===========================================================================
-- 7. Allocation capacity (concurrency-safe) + allocate/release/reallocate
-- ===========================================================================
-- available_to_allocate = bucket balance - current allocations from that
-- bucket (across ALL goals). Every RPC below locks the bucket row
-- (SELECT ... FOR UPDATE) before reading this figure, so two concurrent
-- allocation attempts against the same bucket serialize instead of both
-- reading the same available balance and over-allocating it -- this is the
-- actual "one unit of money, one purpose" enforcement mechanism, not
-- merely a client-side check.

create function public.goal_bucket_available_to_allocate(p_bucket_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    coalesce((
      select sum(m.amount)
      from public.cash_movements m
      join public.financial_events e on e.id = m.event_id
      where m.bucket_id = p_bucket_id and e.voided_at is null
    ), 0)
    -
    coalesce((
      select sum(a.amount)
      from public.goal_allocation_events a
      where a.bucket_id = p_bucket_id
    ), 0);
$$;

create function public.goal_bucket_allocated_total(p_bucket_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(a.amount), 0)
  from public.goal_allocation_events a
  where a.bucket_id = p_bucket_id;
$$;

create function public.goal_allocated_total(p_goal_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(a.amount), 0)
  from public.goal_allocation_events a
  where a.goal_id = p_goal_id;
$$;

create function public.record_goal_allocation(
  p_goal_id uuid,
  p_bucket_id uuid,
  p_amount numeric,
  p_note text default null,
  p_idempotency_key uuid default null
)
returns public.goal_allocation_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_goal public.goals;
  v_bucket public.cash_buckets;
  v_available numeric;
  v_event public.goal_allocation_events;
begin
  if p_idempotency_key is not null then
    select * into v_event from public.goal_allocation_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'allocation amount must be positive';
  end if;

  select * into v_goal from public.goals where id = p_goal_id and user_id = auth.uid ();
  if not found then
    raise exception 'goal % not found for current user', p_goal_id;
  end if;
  if v_goal.measurement_type not in ('cash_target', 'debt_balance_target') then
    raise exception 'a % goal does not accept cash allocations', v_goal.measurement_type;
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid () for update;
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;
  if v_bucket.is_archived then
    raise exception 'cannot allocate from an archived bucket';
  end if;

  if v_bucket.currency_code <> v_goal.currency_code then
    raise exception 'allocation bucket currency % does not match goal currency % -- cross-currency allocation is not supported this phase',
      v_bucket.currency_code, v_goal.currency_code;
  end if;

  v_available := public.goal_bucket_available_to_allocate (p_bucket_id);
  if p_amount > v_available then
    raise exception 'allocation amount % exceeds available-to-allocate balance % in bucket %', p_amount, v_available, p_bucket_id;
  end if;

  insert into public.goal_allocation_events (goal_id, bucket_id, event_type, amount, currency_code, idempotency_key, note)
    values (p_goal_id, p_bucket_id, 'allocate', p_amount, v_goal.currency_code, p_idempotency_key, p_note)
    returning * into v_event;

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.goal_allocation_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

create function public.record_goal_release(
  p_goal_id uuid,
  p_bucket_id uuid,
  p_amount numeric,
  p_note text default null,
  p_idempotency_key uuid default null
)
returns public.goal_allocation_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_goal public.goals;
  v_bucket public.cash_buckets;
  v_current numeric;
  v_event public.goal_allocation_events;
begin
  if p_idempotency_key is not null then
    select * into v_event from public.goal_allocation_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'release amount must be positive';
  end if;

  select * into v_goal from public.goals where id = p_goal_id and user_id = auth.uid ();
  if not found then
    raise exception 'goal % not found for current user', p_goal_id;
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid () for update;
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;

  select coalesce(sum(a.amount), 0) into v_current
    from public.goal_allocation_events a
    where a.goal_id = p_goal_id and a.bucket_id = p_bucket_id;

  if p_amount > v_current then
    raise exception 'release amount % exceeds current allocation % for this goal in this bucket', p_amount, v_current;
  end if;

  insert into public.goal_allocation_events (goal_id, bucket_id, event_type, amount, currency_code, idempotency_key, note)
    values (p_goal_id, p_bucket_id, 'release', -p_amount, v_goal.currency_code, p_idempotency_key, p_note)
    returning * into v_event;

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.goal_allocation_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

create function public.record_goal_reallocation(
  p_from_goal_id uuid,
  p_to_goal_id uuid,
  p_bucket_id uuid,
  p_amount numeric,
  p_note text default null,
  p_idempotency_key uuid default null
)
returns public.goal_allocation_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_from_goal public.goals;
  v_to_goal public.goals;
  v_bucket public.cash_buckets;
  v_current numeric;
  v_release_event public.goal_allocation_events;
begin
  if p_idempotency_key is not null then
    select * into v_release_event from public.goal_allocation_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_release_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'reallocation amount must be positive';
  end if;
  if p_from_goal_id = p_to_goal_id then
    raise exception 'source and destination goal must be different';
  end if;

  select * into v_from_goal from public.goals where id = p_from_goal_id and user_id = auth.uid ();
  if not found then
    raise exception 'goal % not found for current user', p_from_goal_id;
  end if;

  select * into v_to_goal from public.goals where id = p_to_goal_id and user_id = auth.uid ();
  if not found then
    raise exception 'goal % not found for current user', p_to_goal_id;
  end if;
  if v_to_goal.measurement_type not in ('cash_target', 'debt_balance_target') then
    raise exception 'a % goal does not accept cash allocations', v_to_goal.measurement_type;
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid () for update;
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;

  if v_bucket.currency_code <> v_from_goal.currency_code or v_bucket.currency_code <> v_to_goal.currency_code then
    raise exception 'reallocation requires the bucket and both goals to share one currency -- cross-currency reallocation is not supported this phase';
  end if;

  select coalesce(sum(a.amount), 0) into v_current
    from public.goal_allocation_events a
    where a.goal_id = p_from_goal_id and a.bucket_id = p_bucket_id;

  if p_amount > v_current then
    raise exception 'reallocation amount % exceeds current allocation % for source goal in this bucket', p_amount, v_current;
  end if;

  -- Only the release-side row carries the idempotency key. Both rows are
  -- written in this one transaction (either both commit or neither does),
  -- so a partial pair never exists on a genuine failure -- a RETRY is
  -- detected by the release row's key alone, which is sufficient because
  -- the pair is always written together.
  insert into public.goal_allocation_events (goal_id, bucket_id, event_type, amount, currency_code, idempotency_key, note)
    values (p_from_goal_id, p_bucket_id, 'release', -p_amount, v_from_goal.currency_code, p_idempotency_key, p_note)
    returning * into v_release_event;

  insert into public.goal_allocation_events (goal_id, bucket_id, event_type, amount, currency_code, note)
    values (p_to_goal_id, p_bucket_id, 'allocate', p_amount, v_to_goal.currency_code, p_note);

  return v_release_event;
exception
  when unique_violation then
    select * into v_release_event from public.goal_allocation_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_release_event;
end;
$$;

revoke all on function public.goal_bucket_available_to_allocate(uuid) from public, anon;
grant execute on function public.goal_bucket_available_to_allocate(uuid) to authenticated;

revoke all on function public.goal_bucket_allocated_total(uuid) from public, anon;
grant execute on function public.goal_bucket_allocated_total(uuid) to authenticated;

revoke all on function public.goal_allocated_total(uuid) from public, anon;
grant execute on function public.goal_allocated_total(uuid) to authenticated;

revoke all on function public.record_goal_allocation(uuid, uuid, numeric, text, uuid) from public, anon;
grant execute on function public.record_goal_allocation(uuid, uuid, numeric, text, uuid) to authenticated;

revoke all on function public.record_goal_release(uuid, uuid, numeric, text, uuid) from public, anon;
grant execute on function public.record_goal_release(uuid, uuid, numeric, text, uuid) to authenticated;

revoke all on function public.record_goal_reallocation(uuid, uuid, uuid, numeric, text, uuid) from public, anon;
grant execute on function public.record_goal_reallocation(uuid, uuid, uuid, numeric, text, uuid) to authenticated;

-- ===========================================================================
-- 8. Read models
-- ===========================================================================
-- One shared, authoritative calculation per concept -- never recalculated
-- independently per page. Amounts cast to text (MULTI_CURRENCY_MODEL.md
-- §6). Native totals never sum across currencies. Percentages are plain
-- numeric (a UI ratio, not a transportable monetary amount -- same
-- reasoning as interest_rate).

create function public.goal_current_target(p_goal_id uuid)
returns table (target_value numeric, currency_code text, target_date date, effective_at timestamptz)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select h.target_value, h.currency_code, h.target_date, h.effective_at
  from public.goal_target_history h
  where h.goal_id = p_goal_id
  order by h.effective_at desc, h.created_at desc
  limit 1;
$$;

-- Required Pace is a mathematical calculation, not advice -- see
-- docs/architecture/FINANCIAL_DOMAIN_MODEL.md, "Required pace". Monthly
-- cadence is approximated via average days-per-month (365.25 / 12 =
-- 30.4375); a partial final period rounds UP to a full period, so pace is
-- never understated. "Today" uses the caller's profile timezone where set
-- (falls back to UTC), not the database server's timezone.
create function public.goal_required_pace(p_goal_id uuid)
returns table (
  status text,
  amount text,
  currency_code text,
  periods_remaining integer
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_goal public.goals;
  v_target_value numeric;
  v_target_date date;
  v_remaining numeric;
  v_today date;
  v_timezone text;
  v_periods integer;
begin
  select * into v_goal from public.goals where id = p_goal_id;

  if v_goal.measurement_type not in ('cash_target', 'debt_balance_target') then
    return query select 'not_applicable'::text, null::text, v_goal.currency_code, null::integer;
    return;
  end if;

  select target_value, target_date into v_target_value, v_target_date
    from public.goal_current_target (p_goal_id);

  if v_target_date is null then
    return query select 'no_target_date'::text, null::text, v_goal.currency_code, null::integer;
    return;
  end if;

  if v_goal.measurement_type = 'cash_target' then
    if v_target_value is null then
      return query select 'no_target_amount'::text, null::text, v_goal.currency_code, null::integer;
      return;
    end if;
    v_remaining := greatest(v_target_value - public.goal_allocated_total (p_goal_id), 0);
  else
    v_remaining := greatest(public.liability_outstanding_principal (v_goal.liability_id), 0);
  end if;

  if v_remaining = 0 then
    return query select 'target_reached'::text, '0'::text, v_goal.currency_code, 0;
    return;
  end if;

  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_today := (now () at time zone coalesce(v_timezone, 'UTC'))::date;

  if v_target_date < v_today then
    return query select 'date_passed'::text, null::text, v_goal.currency_code, null::integer;
    return;
  end if;

  v_periods := greatest(ceil((v_target_date - v_today) / 30.4375), 1)::integer;

  return query select 'calculated'::text, round(v_remaining / v_periods, 6)::text, v_goal.currency_code, v_periods;
end;
$$;

create function public.goal_summary()
returns table (
  goal_id uuid,
  goal_type_code text,
  goal_type_label text,
  measurement_type text,
  name text,
  description text,
  currency_code text,
  status text,
  is_protected boolean,
  is_focus boolean,
  priority integer,
  target_value text,
  target_date date,
  allocated_total text,
  remaining text,
  percentage numeric,
  liability_id uuid,
  starting_liability_balance text,
  current_outstanding_principal text,
  debt_progress_percentage numeric,
  required_pace_status text,
  required_pace_amount text,
  required_pace_periods_remaining integer,
  milestone_completed_count integer,
  milestone_total_count integer,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    g.id,
    g.goal_type_code,
    gt.display_name,
    g.measurement_type,
    g.name,
    g.description,
    g.currency_code,
    g.status,
    g.is_protected,
    g.is_focus,
    g.priority,
    tgt.target_value::text,
    tgt.target_date,
    case when g.measurement_type in ('cash_target', 'debt_balance_target')
      then public.goal_allocated_total (g.id)::text
      else null end,
    case when g.measurement_type = 'cash_target' and tgt.target_value is not null
      then greatest(tgt.target_value - public.goal_allocated_total (g.id), 0)::text
      else null end,
    case when g.measurement_type = 'cash_target' and tgt.target_value is not null and tgt.target_value > 0
      then round(least(public.goal_allocated_total (g.id), tgt.target_value) / tgt.target_value * 100, 2)
      else null end,
    g.liability_id,
    g.starting_liability_balance::text,
    case when g.measurement_type = 'debt_balance_target'
      then public.liability_outstanding_principal (g.liability_id)::text
      else null end,
    case when g.measurement_type = 'debt_balance_target' and g.starting_liability_balance is not null and g.starting_liability_balance > 0
      then round((g.starting_liability_balance - public.liability_outstanding_principal (g.liability_id)) / g.starting_liability_balance * 100, 2)
      else null end,
    pace.status,
    pace.amount,
    pace.periods_remaining,
    coalesce(ms.completed_count, 0)::integer,
    coalesce(ms.total_count, 0)::integer,
    g.created_at
  from public.goals g
  join public.goal_types gt on gt.code = g.goal_type_code
  left join lateral (select * from public.goal_current_target (g.id)) tgt on true
  left join lateral (select * from public.goal_required_pace (g.id)) pace on true
  left join lateral (
    select
      count(*) filter (where completed_at is not null) as completed_count,
      count(*) as total_count
    from public.goal_milestones m
    where m.goal_id = g.id
  ) ms on true
  where g.user_id = auth.uid ();
$$;

create function public.goal_target_history_list(p_goal_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  target_value text,
  currency_code text,
  target_date date,
  effective_at timestamptz,
  note text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select h.id, h.target_value::text, h.currency_code, h.target_date, h.effective_at, h.note
  from public.goal_target_history h
  where h.goal_id = p_goal_id and h.user_id = auth.uid ()
  order by h.effective_at desc, h.created_at desc
  limit greatest(p_limit, 0);
$$;

create function public.goal_allocation_history(p_goal_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  bucket_id uuid,
  event_type text,
  amount text,
  currency_code text,
  note text,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select a.id, a.bucket_id, a.event_type, a.amount::text, a.currency_code, a.note, a.created_at
  from public.goal_allocation_events a
  where a.goal_id = p_goal_id and a.user_id = auth.uid ()
  order by a.created_at desc
  limit greatest(p_limit, 0);
$$;

-- Scoped to cash_target only: debt_balance_target's earmarked-but-unpaid
-- cash is a different concept (see FINANCIAL_DOMAIN_MODEL.md, "Debt-payoff
-- funding") and is deliberately not blended into this figure; income/
-- milestone goals hold no cash at all.
create function public.goal_native_currency_totals()
returns table (currency_code text, total_allocated text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select g.currency_code, sum(public.goal_allocated_total (g.id))::text
  from public.goals g
  where g.user_id = auth.uid ()
    and g.measurement_type = 'cash_target'
    and g.status <> 'archived'
  group by g.currency_code;
$$;

-- Feeds the future Financial Rules/override engine (P0-E2-S6) -- exposed
-- here, not consumed here. is_protected is purely a user-controlled flag;
-- this function does not itself block or warn about anything.
create function public.goal_protected_allocation_totals()
returns table (currency_code text, total_protected_allocated text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select g.currency_code, sum(public.goal_allocated_total (g.id))::text
  from public.goals g
  where g.user_id = auth.uid ()
    and g.is_protected = true
    and g.measurement_type in ('cash_target', 'debt_balance_target')
  group by g.currency_code;
$$;

-- If cash later leaves a bucket that has allocations attached (a normal
-- Money spend/transfer), allocations are NEVER silently rewritten. This
-- reports the resulting shortfall honestly instead. See
-- FINANCIAL_DOMAIN_MODEL.md, "Allocation shortfall".
create function public.goal_bucket_shortfalls()
returns table (
  bucket_id uuid,
  bucket_name text,
  currency_code text,
  balance text,
  allocated_total text,
  shortfall text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    b.id,
    b.name,
    b.currency_code,
    coalesce(bal.balance, 0)::text,
    public.goal_bucket_allocated_total (b.id)::text,
    greatest(public.goal_bucket_allocated_total (b.id) - coalesce(bal.balance, 0), 0)::text
  from public.cash_buckets b
  left join lateral (
    select sum(m.amount) as balance
    from public.cash_movements m
    join public.financial_events e on e.id = m.event_id
    where m.bucket_id = b.id and e.voided_at is null
  ) bal on true
  where b.user_id = auth.uid ()
    and exists (select 1 from public.goal_allocation_events a where a.bucket_id = b.id);
$$;

revoke all on function public.goal_current_target(uuid) from public, anon;
grant execute on function public.goal_current_target(uuid) to authenticated;

revoke all on function public.goal_required_pace(uuid) from public, anon;
grant execute on function public.goal_required_pace(uuid) to authenticated;

revoke all on function public.goal_summary() from public, anon;
grant execute on function public.goal_summary() to authenticated;

revoke all on function public.goal_target_history_list(uuid, integer) from public, anon;
grant execute on function public.goal_target_history_list(uuid, integer) to authenticated;

revoke all on function public.goal_allocation_history(uuid, integer) from public, anon;
grant execute on function public.goal_allocation_history(uuid, integer) to authenticated;

revoke all on function public.goal_native_currency_totals() from public, anon;
grant execute on function public.goal_native_currency_totals() to authenticated;

revoke all on function public.goal_protected_allocation_totals() from public, anon;
grant execute on function public.goal_protected_allocation_totals() to authenticated;

revoke all on function public.goal_bucket_shortfalls() from public, anon;
grant execute on function public.goal_bucket_shortfalls() to authenticated;
