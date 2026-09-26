-- P0-E5-S1: Budget domain (Everyday Money foundation).
--
-- BUDGET DOES NOT OWN TRANSACTIONS. Money (financial_events / cash_movements)
-- remains the only spending ledger. A budget is a monthly PLAN (planned
-- amounts per canonical Money spending category, in ONE currency). "Actual
-- spent" is never stored: every read derives it live from
-- money_category_breakdown(), the same function that backs "Where Money
-- Went", so Budget cannot diverge from Money.
--
-- V1 model choices (documented in FINANCIAL_DOMAIN_MODEL.md):
--   * mutable allocations (no version history) -- updated_at is the only trace;
--   * one non-archived budget per (user, currency, month);
--   * categories are the fixed money_spending_categories registry (no custom
--     categories exist in Money, so none exist in Budget);
--   * no FX, no cross-currency aggregation;
--   * over-budget never blocks Money activity (Budget only observes).

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  currency_code text not null references public.currencies (code),
  period_start date not null,
  period_end date not null,
  status text not null default 'active' check (status in ('active', 'closed', 'archived')),
  -- Planning information only. Never a Money Received event, never counted
  -- as cash, never used to compute Remaining.
  expected_money_in numeric(20, 6) check (expected_money_in is null or expected_money_in >= 0),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- V1 is monthly. Explicit start/end columns are kept so the period model
  -- can be relaxed later without a data migration.
  constraint budgets_monthly_period check (
    period_start = date_trunc('month', period_start)::date
    and period_end = (date_trunc('month', period_start) + interval '1 month' - interval '1 day')::date
  ),
  unique (id, user_id)
);

comment on table public.budgets is
  'A monthly spending PLAN in exactly one currency. Owns no transactions; actual spending is derived from Money at read time (see budget_summary / budget_category_status).';

-- An archived budget frees its (user, currency, month) slot.
create unique index budgets_one_live_per_currency_month
  on public.budgets (user_id, currency_code, period_start)
  where status <> 'archived';

create index budgets_user_period on public.budgets (user_id, period_start desc);

create function public.prepare_budget()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_decimal_exponent smallint;
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id
       or new.currency_code <> old.currency_code
       or new.period_start <> old.period_start
       or new.period_end <> old.period_end then
      raise exception 'a budget''s owner, currency and period cannot be changed';
    end if;
  end if;

  if new.expected_money_in is not null then
    select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
    if round(new.expected_money_in, v_decimal_exponent) <> new.expected_money_in then
      raise exception 'expected money in % has more precision than % allows (% decimal place(s))',
        new.expected_money_in, new.currency_code, v_decimal_exponent;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger budgets_prepare
  before insert or update on public.budgets
  for each row
  execute function public.prepare_budget();

alter table public.budgets enable row level security;

create policy budgets_select_own on public.budgets
  for select to authenticated using (auth.uid () = user_id);
create policy budgets_insert_own on public.budgets
  for insert to authenticated with check (auth.uid () = user_id);
create policy budgets_update_own on public.budgets
  for update to authenticated using (auth.uid () = user_id) with check (auth.uid () = user_id);

revoke all on public.budgets from public, anon, authenticated;
grant select on public.budgets to authenticated;
grant insert (user_id, currency_code, period_start, period_end, expected_money_in, notes) on public.budgets to authenticated;
grant update (status, expected_money_in, notes) on public.budgets to authenticated;

-- ---------------------------------------------------------------------------
-- budget_category_allocations
-- ---------------------------------------------------------------------------

create table public.budget_category_allocations (
  id uuid primary key default gen_random_uuid (),
  budget_id uuid not null,
  user_id uuid not null,
  spending_category_code text not null references public.money_spending_categories (code),
  -- An explicit 0 is a real choice ("I plan to spend nothing here"). A
  -- category with no row at all is "Not budgeted". The two are different.
  planned_amount numeric(20, 6) not null check (planned_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK: the allocation's user_id must equal its budget's user_id,
  -- so a forged cross-user reference is impossible at the database level.
  foreign key (budget_id, user_id) references public.budgets (id, user_id) on delete cascade,
  unique (budget_id, spending_category_code)
);

comment on table public.budget_category_allocations is
  'Planned amount for one canonical Money spending category within one budget. Mutable in V1 (no version history). Absence of a row means "Not budgeted"; planned_amount = 0 is an explicit zero.';

create function public.prepare_budget_allocation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_budget_id uuid;
  v_status text;
  v_currency text;
  v_user_id uuid;
  v_decimal_exponent smallint;
begin
  v_budget_id := case when tg_op = 'DELETE' then old.budget_id else new.budget_id end;

  select status, currency_code, user_id into v_status, v_currency, v_user_id
    from public.budgets where id = v_budget_id;
  if v_status is null then
    raise exception 'budget % not found', v_budget_id;
  end if;
  if v_status <> 'active' then
    raise exception 'budget is % and cannot be edited; reactivate it first', v_status;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.user_id := v_user_id;
  elsif new.budget_id <> old.budget_id
     or new.spending_category_code <> old.spending_category_code
     or new.user_id <> old.user_id then
    raise exception 'an allocation''s budget and category cannot be changed';
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = v_currency;
  if round(new.planned_amount, v_decimal_exponent) <> new.planned_amount then
    raise exception 'planned amount % has more precision than % allows (% decimal place(s))',
      new.planned_amount, v_currency, v_decimal_exponent;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger budget_allocations_prepare
  before insert or update or delete on public.budget_category_allocations
  for each row
  execute function public.prepare_budget_allocation();

alter table public.budget_category_allocations enable row level security;

create policy budget_allocations_select_own on public.budget_category_allocations
  for select to authenticated using (auth.uid () = user_id);
create policy budget_allocations_insert_own on public.budget_category_allocations
  for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.budgets b where b.id = budget_id and b.user_id = auth.uid ())
  );
create policy budget_allocations_update_own on public.budget_category_allocations
  for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);
create policy budget_allocations_delete_own on public.budget_category_allocations
  for delete to authenticated using (auth.uid () = user_id);

revoke all on public.budget_category_allocations from public, anon, authenticated;
grant select on public.budget_category_allocations to authenticated;
grant insert (budget_id, spending_category_code, planned_amount) on public.budget_category_allocations to authenticated;
grant update (planned_amount) on public.budget_category_allocations to authenticated;
grant delete on public.budget_category_allocations to authenticated;

-- ---------------------------------------------------------------------------
-- Mutation RPCs (SECURITY INVOKER: RLS + triggers enforce ownership)
-- ---------------------------------------------------------------------------

-- Creates the budget for the month containing p_month (default: today) in the
-- caller's profile timezone. Never seeds allocations.
create function public.create_budget(
  p_currency_code text,
  p_month date default null,
  p_expected_money_in numeric default null,
  p_notes text default null
)
returns public.budgets
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_month_start date;
  v_row public.budgets;
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_timezone := coalesce(v_timezone, 'UTC');

  v_month_start := date_trunc('month', coalesce(p_month, (now () at time zone v_timezone)::date))::date;

  insert into public.budgets (user_id, currency_code, period_start, period_end, expected_money_in, notes)
  values (
    auth.uid (),
    p_currency_code,
    v_month_start,
    (v_month_start + interval '1 month' - interval '1 day')::date,
    p_expected_money_in,
    p_notes
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Upserts one category's planned amount (0 allowed). Refuses non-active budgets.
create function public.set_budget_category_amount(
  p_budget_id uuid,
  p_category_code text,
  p_planned_amount numeric
)
returns public.budget_category_allocations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_row public.budget_category_allocations;
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.budgets b where b.id = p_budget_id) then
    raise exception 'budget % not found', p_budget_id;
  end if;

  insert into public.budget_category_allocations (budget_id, spending_category_code, planned_amount)
  values (p_budget_id, p_category_code, p_planned_amount)
  on conflict (budget_id, spending_category_code)
  do update set planned_amount = excluded.planned_amount
  returning * into v_row;
  return v_row;
end;
$$;

-- Removing an allocation returns the category to "Not budgeted".
create function public.remove_budget_category_amount(p_budget_id uuid, p_category_code text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.budgets b where b.id = p_budget_id) then
    raise exception 'budget % not found', p_budget_id;
  end if;
  delete from public.budget_category_allocations
    where budget_id = p_budget_id and spending_category_code = p_category_code;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- active <-> closed <-> archived. The partial unique index rejects
-- reactivating/closing into a slot another live budget already holds.
create function public.set_budget_status(p_budget_id uuid, p_status text)
returns public.budgets
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_row public.budgets;
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  if p_status not in ('active', 'closed', 'archived') then
    raise exception 'invalid budget status %', p_status;
  end if;
  update public.budgets set status = p_status where id = p_budget_id returning * into v_row;
  if v_row.id is null then
    raise exception 'budget % not found', p_budget_id;
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read model. Actual spending is DERIVED from money_category_breakdown(),
-- never persisted. Amounts returned as text (exact decimal).
-- ---------------------------------------------------------------------------

create function public.budget_category_status(p_budget_id uuid)
returns table (
  category_code text,
  category_label text,
  planned text,
  spent text,
  remaining text,
  is_budgeted boolean,
  is_over boolean
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_currency text;
  v_start date;
  v_end date;
begin
  select b.currency_code, b.period_start, b.period_end into v_currency, v_start, v_end
    from public.budgets b where b.id = p_budget_id;
  if v_currency is null then
    raise exception 'budget % not found', p_budget_id;
  end if;

  return query
    with spent as (
      select mb.category_code, mb.amount::numeric as amount
        from public.money_category_breakdown (v_start, v_end) mb
       where mb.direction = 'spent' and mb.currency_code = v_currency
    ),
    alloc as (
      select a.spending_category_code as category_code, a.planned_amount
        from public.budget_category_allocations a
       where a.budget_id = p_budget_id
    ),
    merged as (
      select coalesce(a.category_code, s.category_code) as category_code,
             a.planned_amount as planned_amount,
             coalesce(s.amount, 0) as spent_amount
        from alloc a
        full outer join spent s on s.category_code = a.category_code
    )
    select m.category_code,
           c.display_name,
           m.planned_amount::text,
           m.spent_amount::text,
           (m.planned_amount - m.spent_amount)::text,
           m.planned_amount is not null,
           m.planned_amount is not null and m.spent_amount > m.planned_amount
      from merged m
      join public.money_spending_categories c on c.code = m.category_code
     order by (m.planned_amount is null), c.display_name;
end;
$$;

create function public.budget_summary(p_budget_id uuid)
returns table (
  budget_id uuid,
  currency_code text,
  period_start date,
  period_end date,
  status text,
  expected_money_in text,
  planned_total text,
  actual_spending_total text,
  budgeted_spent text,
  unbudgeted_spent text,
  remaining text,
  is_over boolean,
  budgeted_category_count integer,
  upcoming_commitments_total text,
  period_days integer,
  days_elapsed integer,
  period_state text
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_b public.budgets;
  v_timezone text;
  v_today date;
  v_planned numeric;
  v_count integer;
  v_actual numeric;
  v_budgeted_spent numeric;
  v_commit numeric;
begin
  select * into v_b from public.budgets b where b.id = p_budget_id;
  if v_b.id is null then
    raise exception 'budget % not found', p_budget_id;
  end if;

  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_timezone := coalesce(v_timezone, 'UTC');
  v_today := (now () at time zone v_timezone)::date;

  select sum(a.planned_amount), count(*) into v_planned, v_count
    from public.budget_category_allocations a where a.budget_id = p_budget_id;

  select coalesce(sum(s.spent::numeric), 0),
         coalesce(sum(s.spent::numeric) filter (where s.is_budgeted), 0)
    into v_actual, v_budgeted_spent
    from public.budget_category_status (p_budget_id) s;

  -- Informational only: never subtracted from Remaining, never counted as spending.
  select coalesce(sum(c.amount::numeric), 0) into v_commit
    from public.budget_upcoming_commitments (p_budget_id) c;

  return query select
    v_b.id,
    v_b.currency_code,
    v_b.period_start,
    v_b.period_end,
    v_b.status,
    v_b.expected_money_in::text,
    v_planned::text,
    v_actual::text,
    v_budgeted_spent::text,
    (v_actual - v_budgeted_spent)::text,
    -- No allocations => no plan => no Remaining (never a fake zero).
    case when v_planned is null then null else (v_planned - v_actual)::text end,
    v_planned is not null and v_actual > v_planned,
    v_count,
    v_commit::text,
    (v_b.period_end - v_b.period_start + 1),
    greatest(0, least(v_b.period_end, v_today) - v_b.period_start + 1),
    case when v_today < v_b.period_start then 'not_started'
         when v_today > v_b.period_end then 'ended'
         else 'in_progress' end;
end;
$$;

-- Active obligations (existing Obligations domain) in the budget currency due
-- inside the remaining part of the period. Shown for context; NEVER spending.
create function public.budget_upcoming_commitments(p_budget_id uuid)
returns table (
  obligation_id uuid,
  name text,
  amount text,
  due_date date,
  is_protected boolean
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_currency text;
  v_start date;
  v_end date;
  v_timezone text;
  v_from date;
begin
  select b.currency_code, b.period_start, b.period_end into v_currency, v_start, v_end
    from public.budgets b where b.id = p_budget_id;
  if v_currency is null then
    raise exception 'budget % not found', p_budget_id;
  end if;

  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_timezone := coalesce(v_timezone, 'UTC');
  v_from := greatest(v_start, (now () at time zone v_timezone)::date);

  return query
    select o.id, o.name, o.amount::text, o.due_date, o.is_protected
      from public.obligations o
     where o.status = 'active'
       and o.currency_code = v_currency
       and o.due_date is not null
       and o.due_date between v_from and v_end
     order by o.due_date, o.name;
end;
$$;

-- Future Decisions boundary: "if I spend X here, what happens to my budget?"
-- Returns the facts only (planned/spent/remaining), no advice and no
-- verdict. Zero rows when no non-archived budget covers the date+currency.
-- scope = 'total' row plus one 'category' row (when p_category_code given).
create function public.budget_facts_for_date(
  p_currency_code text,
  p_on_date date default null,
  p_category_code text default null
)
returns table (
  scope text,
  budget_id uuid,
  category_code text,
  planned text,
  spent text,
  remaining text
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_date date;
  v_budget_id uuid;
begin
  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_timezone := coalesce(v_timezone, 'UTC');
  v_date := coalesce(p_on_date, (now () at time zone v_timezone)::date);

  select b.id into v_budget_id
    from public.budgets b
   where b.currency_code = p_currency_code
     and b.status <> 'archived'
     and v_date between b.period_start and b.period_end
   order by (b.status = 'active') desc
   limit 1;

  if v_budget_id is null then
    return;
  end if;

  return query
    select 'total'::text, v_budget_id, null::text, s.planned_total, s.actual_spending_total, s.remaining
      from public.budget_summary (v_budget_id) s;

  if p_category_code is not null then
    return query
      select 'category'::text, v_budget_id, p_category_code,
             cs.planned, cs.spent, cs.remaining
        from public.budget_category_status (v_budget_id) cs
       where cs.category_code = p_category_code;
  end if;
end;
$$;

comment on function public.budget_category_status(uuid) is
  'Per-category planned / spent / remaining for one budget. Spent is derived from money_category_breakdown() (canonical Money); a category with spending but no allocation is returned with is_budgeted=false (Unbudgeted) and is never auto-allocated.';
comment on function public.budget_summary(uuid) is
  'Budget totals. remaining = planned_total - actual_spending_total in exact decimal, NULL when nothing is planned. Upcoming commitments are informational and never counted as spending or subtracted.';
comment on function public.budget_facts_for_date(text, date, text) is
  'Canonical read boundary for a future Decisions phase. Facts only -- no advice, no verdict.';

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_budget(text, date, numeric, text)',
    'public.set_budget_category_amount(uuid, text, numeric)',
    'public.remove_budget_category_amount(uuid, text)',
    'public.set_budget_status(uuid, text)',
    'public.budget_category_status(uuid)',
    'public.budget_summary(uuid)',
    'public.budget_upcoming_commitments(uuid)',
    'public.budget_facts_for_date(text, date, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
