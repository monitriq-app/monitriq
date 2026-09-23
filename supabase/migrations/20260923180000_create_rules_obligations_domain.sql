-- Monatriq: Financial Rules, Obligations, Protected-Fund Evaluation &
-- Safe-to-Deploy engine (P0-E2-S6)
--
-- Full design rationale in docs/architecture/FINANCIAL_DOMAIN_MODEL.md and
-- docs/reports/P0-E2-S6-financial-rules-obligations-safe-to-deploy.txt.
--
-- USER AGENCY: Monatriq never invents a financial threshold. Until a user
-- explicitly configures a rule, the relevant calculation reports
-- 'not_configured' -- never a silently-assumed 0%/3-months/generic
-- heuristic. An explicitly configured zero floor is a real, distinct state
-- from "no rule exists at all" -- see financial_rules/financial_rule_versions.
--
-- SAFE TO DEPLOY is a DERIVED READ MODEL, not a reservation system: it
-- reflects current state at the moment of calculation and can go stale the
-- instant another financial event occurs. This phase does not lock funds;
-- a future real spend still goes through Money and is subject to whatever
-- the state looks like AT THAT TIME.
--
-- SAFE-TO-DEPLOY FORMULA (per currency, exactly as specified):
--   protected_commitments   = protected_goal_cash + uncovered_protected_obligations
--   required_retained_cash  = MAX(minimum_cash_floor, protected_commitments)
--   safe_to_deploy           = MAX(liquid_cash - required_retained_cash, 0)
--   retained_deficit         = MAX(required_retained_cash - liquid_cash, 0)
-- This is intentional: floor and protected_commitments do NOT sum -- both
-- describe the same "how much must stay untouched" requirement, and the
-- larger one governs. Summing them would double-count retained cash.
--
-- BACKED PROTECTED CASH (bucket-level, for the Safe-to-Deploy formula):
-- a goal allocation can exceed real bucket cash after later spending, so
-- "nominal allocation" and "cash-backed allocation" are different.
-- backed_protected_total(bucket) = LEAST(protected_allocation_total(bucket),
-- bucket_balance) -- protected allocations have first claim on whatever
-- real cash the bucket actually holds, ahead of non-protected allocations,
-- because "protected" is specifically the signal for a higher-priority
-- claim. When a bucket cannot back all of ITS protected allocations
-- (multiple protected goals sharing one underfunded bucket), each protected
-- goal's own backed share is pro-rated by its share of that bucket's total
-- protected allocation -- a deterministic, priority-free split (see
-- goal_backed_protected_allocation()), used specifically for per-goal
-- obligation-coverage math, not for the currency-level formula (which only
-- needs the bucket-level LEAST(...) aggregate).
--
-- GOAL-LINKED OBLIGATION DOUBLE-COUNTING: a protected obligation that
-- funds from the same purpose as a protected goal allocation must not add
-- a second, separate retained-cash requirement on top of that goal's own
-- backed protected cash. uncovered_protected_obligations only counts the
-- portion of a linked obligation NOT already covered by its goal's backed
-- protected allocation -- aggregated PER GOAL first (so two obligations
-- sharing one goal don't each independently claim the goal's full backing),
-- then summed by currency. See rules_uncovered_protected_obligations().
--
-- ALL SECURITY INVOKER, same discipline as every prior domain. No elevated
-- privilege anywhere in this migration.

-- ===========================================================================
-- 1. Financial rules (identity + append-only versioned threshold)
-- ===========================================================================
-- "rule + rule versions": financial_rules is the identity/slot for one
-- (user, rule_type, currency) configuration; financial_rule_versions is
-- append-only history of its threshold over time -- old thresholds are
-- never overwritten, mirroring goal_target_history's pattern exactly.
-- Only 'minimum_cash_floor' actively participates in Safe-to-Deploy this
-- phase; rule_type is an extensible CHECK list so a future rule
-- (maximum_capital_per_asset, maximum_debt_payment_ratio, ...) can be
-- added without restructuring this table.

create table public.financial_rules (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_type text not null check (rule_type in ('minimum_cash_floor')),
  currency_code text not null references public.currencies (code),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.financial_rules is
  'User-configured financial rule identity (one per user/rule_type/currency). The actual threshold is versioned in financial_rule_versions -- never overwritten in place. Deactivating (status=inactive) preserves history; it is never hard-deleted.';

create unique index financial_rules_user_type_currency
  on public.financial_rules (user_id, rule_type, currency_code);

alter table public.financial_rules enable row level security;

revoke all on public.financial_rules from anon, authenticated;
grant select on public.financial_rules to authenticated;
grant insert (user_id, rule_type, currency_code) on public.financial_rules to authenticated;
grant update (status) on public.financial_rules to authenticated;

create policy "financial_rules_select_own"
  on public.financial_rules for select to authenticated
  using (auth.uid () = user_id);

create policy "financial_rules_insert_own"
  on public.financial_rules for insert to authenticated
  with check (auth.uid () = user_id);

create policy "financial_rules_update_own"
  on public.financial_rules for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

create function public.touch_financial_rule_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger financial_rules_touch_updated_at
  before update on public.financial_rules
  for each row
  execute function public.touch_financial_rule_updated_at();

-- A currency with NO row here at all is 'not_configured' (see
-- safe_to_deploy_by_currency()). A row with a version whose threshold is
-- exactly 0 is a real, explicitly-configured zero floor -- structurally
-- distinct from the absence of a row.
create table public.financial_rule_versions (
  id uuid primary key default gen_random_uuid (),
  rule_id uuid not null references public.financial_rules (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  threshold_value numeric(20, 6) not null check (threshold_value >= 0),
  effective_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.financial_rule_versions is
  'Append-only. The current threshold for a rule is always the latest row (by effective_at). See financial_rule_summary().';

create index financial_rule_versions_rule_id on public.financial_rule_versions (rule_id, effective_at desc);

create function public.prepare_financial_rule_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_currency text;
  v_decimal_exponent smallint;
begin
  select user_id, currency_code into v_user_id, v_currency from public.financial_rules where id = new.rule_id;
  if v_user_id is null then
    raise exception 'financial rule % not found', new.rule_id;
  end if;
  new.user_id := v_user_id;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = v_currency;
  if round(new.threshold_value, v_decimal_exponent) <> new.threshold_value then
    raise exception 'threshold_value % has more precision than % allows (% decimal place(s))',
      new.threshold_value, v_currency, v_decimal_exponent;
  end if;

  return new;
end;
$$;

create trigger financial_rule_versions_prepare
  before insert on public.financial_rule_versions
  for each row
  execute function public.prepare_financial_rule_version();

alter table public.financial_rule_versions enable row level security;

revoke all on public.financial_rule_versions from anon, authenticated;
grant select on public.financial_rule_versions to authenticated;
grant insert (rule_id, threshold_value, effective_at, note) on public.financial_rule_versions to authenticated;

create policy "financial_rule_versions_select_own"
  on public.financial_rule_versions for select to authenticated
  using (auth.uid () = user_id);

create policy "financial_rule_versions_insert_own"
  on public.financial_rule_versions for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.financial_rules r where r.id = rule_id and r.user_id = auth.uid ())
  );

-- ===========================================================================
-- 2. Obligations
-- ===========================================================================
-- A generic user-owned obligation. No status is ever inferred from Money
-- transactions or scraped from behavior -- every row is something the user
-- explicitly recorded. "Overdue" is derived (status/due_date/current date),
-- never stored -- no is_overdue column exists.

create table public.obligations (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  currency_code text not null references public.currencies (code),
  amount numeric(20, 6) not null check (amount > 0),
  due_date date,
  status text not null default 'active' check (status in ('active', 'paid', 'cancelled', 'archived')),
  -- Explicit user choice, never auto-true. See create_obligation()/
  -- CreateObligationForm.tsx: the UI defaults this checkbox to unchecked.
  is_protected boolean not null default false,
  funding_goal_id uuid references public.goals (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.obligations is
  'A financial commitment the user explicitly recorded -- never inferred from Money activity. Marking "paid" is organizational metadata only; it does not itself create a cash_movement (see FINANCIAL_DOMAIN_MODEL.md, "paid obligation").';

create index obligations_funding_goal_id on public.obligations (funding_goal_id) where funding_goal_id is not null;

create function public.prepare_obligation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_goal_user_id uuid;
  v_goal_currency text;
  v_goal_measurement_type text;
  v_decimal_exponent smallint;
begin
  if new.funding_goal_id is not null then
    select user_id, currency_code, measurement_type
      into v_goal_user_id, v_goal_currency, v_goal_measurement_type
      from public.goals where id = new.funding_goal_id;
    if v_goal_user_id is null then
      raise exception 'goal % not found', new.funding_goal_id;
    end if;
    if v_goal_user_id <> new.user_id then
      raise exception 'cannot link an obligation to another user''s goal';
    end if;
    if v_goal_measurement_type not in ('cash_target', 'debt_balance_target') then
      raise exception 'a % goal cannot be linked as a funding goal for an obligation', v_goal_measurement_type;
    end if;
    if new.currency_code <> v_goal_currency then
      raise exception 'obligation currency % does not match funding goal currency %', new.currency_code, v_goal_currency;
    end if;
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
  if round(new.amount, v_decimal_exponent) <> new.amount then
    raise exception 'amount % has more precision than % allows (% decimal place(s))',
      new.amount, new.currency_code, v_decimal_exponent;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger obligations_prepare
  before insert or update on public.obligations
  for each row
  execute function public.prepare_obligation();

alter table public.obligations enable row level security;

revoke all on public.obligations from anon, authenticated;

grant select on public.obligations to authenticated;
grant insert (user_id, name, description, currency_code, amount, due_date, is_protected, funding_goal_id)
  on public.obligations to authenticated;
grant update (name, description, currency_code, amount, due_date, status, is_protected, funding_goal_id)
  on public.obligations to authenticated;

create policy "obligations_select_own"
  on public.obligations for select to authenticated
  using (auth.uid () = user_id);

create policy "obligations_insert_own"
  on public.obligations for insert to authenticated
  with check (
    auth.uid () = user_id
    and (funding_goal_id is null or exists (select 1 from public.goals g where g.id = funding_goal_id and g.user_id = auth.uid ()))
  );

create policy "obligations_update_own"
  on public.obligations for update to authenticated
  using (auth.uid () = user_id)
  with check (
    auth.uid () = user_id
    and (funding_goal_id is null or exists (select 1 from public.goals g where g.id = funding_goal_id and g.user_id = auth.uid ()))
  );

-- ===========================================================================
-- 3. Rule/obligation creation RPCs
-- ===========================================================================

create function public.create_financial_rule(
  p_rule_type text,
  p_currency_code text,
  p_threshold_value numeric,
  p_note text default null
)
returns public.financial_rules
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_rule public.financial_rules;
  v_existing public.financial_rules;
begin
  if p_rule_type <> 'minimum_cash_floor' then
    raise exception 'unknown rule_type %', p_rule_type;
  end if;
  if p_threshold_value < 0 then
    raise exception 'threshold value must not be negative';
  end if;

  select * into v_existing from public.financial_rules
    where user_id = auth.uid () and rule_type = p_rule_type and currency_code = p_currency_code;

  if found then
    if v_existing.status = 'active' then
      raise exception 'an active % rule for % already exists -- use record_financial_rule_version() to change its threshold',
        p_rule_type, p_currency_code;
    end if;
    -- Reactivating a previously-deactivated rule preserves all prior
    -- version history rather than creating a duplicate identity row (the
    -- unique index on (user_id, rule_type, currency_code) would reject a
    -- second row anyway).
    update public.financial_rules set status = 'active' where id = v_existing.id returning * into v_rule;
    insert into public.financial_rule_versions (rule_id, threshold_value, note)
      values (v_rule.id, p_threshold_value, p_note);
    return v_rule;
  end if;

  insert into public.financial_rules (user_id, rule_type, currency_code)
    values (auth.uid (), p_rule_type, p_currency_code)
    returning * into v_rule;

  insert into public.financial_rule_versions (rule_id, threshold_value, note)
    values (v_rule.id, p_threshold_value, p_note);

  return v_rule;
end;
$$;

create function public.record_financial_rule_version(
  p_rule_id uuid,
  p_threshold_value numeric,
  p_note text default null
)
returns public.financial_rule_versions
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_version public.financial_rule_versions;
begin
  if p_threshold_value < 0 then
    raise exception 'threshold value must not be negative';
  end if;
  if not exists (select 1 from public.financial_rules where id = p_rule_id and user_id = auth.uid ()) then
    raise exception 'financial rule % not found for current user', p_rule_id;
  end if;

  insert into public.financial_rule_versions (rule_id, threshold_value, note)
    values (p_rule_id, p_threshold_value, p_note)
    returning * into v_version;

  return v_version;
end;
$$;

create function public.create_obligation(
  p_name text,
  p_currency_code text,
  p_amount numeric,
  p_description text default null,
  p_due_date date default null,
  p_is_protected boolean default false,
  p_funding_goal_id uuid default null
)
returns public.obligations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_obligation public.obligations;
begin
  insert into public.obligations (
    user_id, name, description, currency_code, amount, due_date, is_protected, funding_goal_id
  )
  values (
    auth.uid (), p_name, p_description, p_currency_code, p_amount, p_due_date,
    coalesce(p_is_protected, false), p_funding_goal_id
  )
  returning * into v_obligation;

  return v_obligation;
end;
$$;

revoke all on function public.create_financial_rule(text, text, numeric, text) from public, anon;
grant execute on function public.create_financial_rule(text, text, numeric, text) to authenticated;

revoke all on function public.record_financial_rule_version(uuid, numeric, text) from public, anon;
grant execute on function public.record_financial_rule_version(uuid, numeric, text) to authenticated;

revoke all on function public.create_obligation(text, text, numeric, text, date, boolean, uuid) from public, anon;
grant execute on function public.create_obligation(text, text, numeric, text, date, boolean, uuid) to authenticated;

-- ===========================================================================
-- 4. Backed protected cash + obligation coverage (double-counting prevention)
-- ===========================================================================

-- Per-goal backed protected allocation, pro-rated across the goal's own
-- buckets when any of them is underfunded relative to ALL protected goals
-- sharing it (see migration header). Returns 0 for a non-protected goal --
-- deliberately, since only protected allocations ever count as backing.
create function public.goal_backed_protected_allocation(p_goal_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  with nominal as (
    select a.bucket_id, sum(a.amount) as nominal_amount
    from public.goal_allocation_events a
    join public.goals g on g.id = a.goal_id
    where a.goal_id = p_goal_id and g.is_protected = true
    group by a.bucket_id
  ),
  bucket_totals as (
    select
      n.bucket_id,
      coalesce((
        select sum(m.amount) from public.cash_movements m
        join public.financial_events e on e.id = m.event_id
        where m.bucket_id = n.bucket_id and e.voided_at is null
      ), 0::numeric(20, 6)) as balance,
      coalesce((
        select sum(a.amount) from public.goal_allocation_events a
        join public.goals g on g.id = a.goal_id
        where a.bucket_id = n.bucket_id and g.is_protected = true
      ), 0::numeric(20, 6)) as protected_total
    from nominal n
  )
  -- Bare integer/numeric literal fallbacks are deliberately cast to
  -- numeric(20,6) throughout this migration: an untyped `0` fallback
  -- loses NUMERIC's display scale (renders as "0" instead of
  -- "0.000000" once cast to text), breaking the exact-decimal string-
  -- transport contract every other read function in this codebase
  -- relies on (MULTI_CURRENCY_MODEL.md §6).
  select coalesce(sum(
    case
      when bt.protected_total <= 0 then 0::numeric(20, 6)
      when bt.protected_total <= bt.balance then n.nominal_amount
      else n.nominal_amount * least(bt.balance, bt.protected_total) / bt.protected_total
    end
  ), 0::numeric(20, 6))
  from nominal n
  join bucket_totals bt on bt.bucket_id = n.bucket_id;
$$;

-- Protected obligations linked to the SAME goal are aggregated together
-- before comparing against that goal's backed protected allocation --
-- otherwise two obligations sharing one goal could each independently
-- claim up to the goal's full backing and double-count it. Obligations
-- with no funding_goal_id have no goal backing to draw on at all, so their
-- full amount is always uncovered.
create function public.rules_uncovered_protected_obligations()
returns table (currency_code text, uncovered_amount numeric)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  with linked_totals as (
    select o.currency_code, o.funding_goal_id, sum(o.amount) as linked_total
    from public.obligations o
    where o.user_id = auth.uid ()
      and o.is_protected = true
      and o.status = 'active'
      and o.funding_goal_id is not null
    group by o.currency_code, o.funding_goal_id
  ),
  linked_uncovered as (
    select
      l.currency_code,
      greatest(l.linked_total - public.goal_backed_protected_allocation (l.funding_goal_id), 0::numeric(20, 6)) as uncovered
    from linked_totals l
  ),
  unlinked as (
    select o.currency_code, sum(o.amount) as uncovered
    from public.obligations o
    where o.user_id = auth.uid ()
      and o.is_protected = true
      and o.status = 'active'
      and o.funding_goal_id is null
    group by o.currency_code
  ),
  combined as (
    select * from linked_uncovered
    union all
    select * from unlinked
  )
  select currency_code, sum(uncovered) from combined group by currency_code;
$$;

revoke all on function public.goal_backed_protected_allocation(uuid) from public, anon;
grant execute on function public.goal_backed_protected_allocation(uuid) to authenticated;

revoke all on function public.rules_uncovered_protected_obligations() from public, anon;
grant execute on function public.rules_uncovered_protected_obligations() to authenticated;

-- ===========================================================================
-- 5. Safe to Deploy (the authoritative per-currency read model)
-- ===========================================================================
-- Exactly the specified formula (see migration header). A currency with
-- cash but no ACTIVE minimum_cash_floor rule (with at least one version)
-- reports status='not_configured' and every downstream figure is null --
-- never a silently-assumed zero floor.

create function public.safe_to_deploy_by_currency()
returns table (
  currency_code text,
  status text,
  liquid_cash text,
  protected_goal_cash text,
  uncovered_protected_obligations text,
  protected_commitments text,
  minimum_cash_floor text,
  required_retained_cash text,
  safe_to_deploy text,
  retained_deficit text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  with cash as (
    select m.currency_code, sum(m.amount) as amount
    from public.cash_movements m
    join public.financial_events e on e.id = m.event_id
    where m.user_id = auth.uid () and e.voided_at is null
    group by m.currency_code
  ),
  protected_backing as (
    select b.currency_code, sum(least(pt.protected_total, bal.balance)) as amount
    from public.cash_buckets b
    join lateral (
      select coalesce(sum(a.amount), 0::numeric(20, 6)) as protected_total
      from public.goal_allocation_events a
      join public.goals g on g.id = a.goal_id
      where a.bucket_id = b.id and g.is_protected = true
    ) pt on true
    join lateral (
      select coalesce(sum(m.amount), 0::numeric(20, 6)) as balance
      from public.cash_movements m
      join public.financial_events e on e.id = m.event_id
      where m.bucket_id = b.id and e.voided_at is null
    ) bal on true
    where b.user_id = auth.uid ()
    group by b.currency_code
  ),
  uncovered_obligations as (
    select * from public.rules_uncovered_protected_obligations ()
  ),
  floors as (
    select r.currency_code, v.threshold_value as amount
    from public.financial_rules r
    join lateral (
      select threshold_value from public.financial_rule_versions
      where rule_id = r.id
      order by effective_at desc, created_at desc
      limit 1
    ) v on true
    where r.user_id = auth.uid () and r.rule_type = 'minimum_cash_floor' and r.status = 'active'
  ),
  relevant_currencies as (
    select currency_code from cash
    union
    select currency_code from floors
  )
  select
    c.currency_code,
    case when f.amount is null then 'not_configured' else 'calculated' end,
    coalesce(cs.amount, 0::numeric(20, 6))::text,
    coalesce(pb.amount, 0::numeric(20, 6))::text,
    coalesce(uo.uncovered_amount, 0::numeric(20, 6))::text,
    (coalesce(pb.amount, 0::numeric(20, 6)) + coalesce(uo.uncovered_amount, 0::numeric(20, 6)))::text,
    case when f.amount is null then null else f.amount::text end,
    case when f.amount is null then null
      else greatest(f.amount, coalesce(pb.amount, 0::numeric(20, 6)) + coalesce(uo.uncovered_amount, 0::numeric(20, 6)))::text end,
    case when f.amount is null then null
      else greatest(
        coalesce(cs.amount, 0::numeric(20, 6)) - greatest(f.amount, coalesce(pb.amount, 0::numeric(20, 6)) + coalesce(uo.uncovered_amount, 0::numeric(20, 6))),
        0::numeric(20, 6)
      )::text end,
    case when f.amount is null then null
      else greatest(
        greatest(f.amount, coalesce(pb.amount, 0::numeric(20, 6)) + coalesce(uo.uncovered_amount, 0::numeric(20, 6))) - coalesce(cs.amount, 0::numeric(20, 6)),
        0::numeric(20, 6)
      )::text end
  from relevant_currencies c
  left join cash cs on cs.currency_code = c.currency_code
  left join protected_backing pb on pb.currency_code = c.currency_code
  left join uncovered_obligations uo on uo.currency_code = c.currency_code
  left join floors f on f.currency_code = c.currency_code;
$$;

revoke all on function public.safe_to_deploy_by_currency() from public, anon;
grant execute on function public.safe_to_deploy_by_currency() to authenticated;

-- ===========================================================================
-- 6. Proposed cash-use evaluator
-- ===========================================================================
-- Answers "what happens to protected liquidity if I use X from this
-- bucket" with neutral, factual labels (aligned/attention/conflict/
-- not_configured/insufficient_information) -- never approve/reject/
-- recommend semantics. Purely a read: no row is written here. Scope
-- limitation, documented: the "after" recomputation reflects this
-- bucket's own contribution to protected backing and currency liquid
-- cash; it does not recursively re-derive obligation coverage that
-- depends on OTHER buckets funding the same goal (a genuine second-order
-- effect explicitly out of scope this phase -- see the phase report).

create function public.evaluate_proposed_cash_use(p_bucket_id uuid, p_amount numeric)
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
declare
  v_bucket public.cash_buckets;
  v_balance numeric;
  v_protected_total numeric;
  v_post_balance numeric;
  v_before record;
  v_floor numeric;
  v_liquid_before numeric;
  v_pgc_before numeric;
  v_uo_before numeric;
  v_before_backing numeric;
  v_post_backing numeric;
  v_delta numeric;
  v_after_pgc numeric;
  v_after_commitments numeric;
  v_after_required numeric;
  v_after_safe numeric;
  v_after_deficit numeric;
  v_funds_linked_obligation boolean;
begin
  if p_amount <= 0 then
    raise exception 'proposed amount must be positive';
  end if;

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

  v_post_balance := v_balance - p_amount;

  -- Aliased explicitly: this function's own RETURNS TABLE declares a
  -- currency_code output column, which plpgsql exposes as an implicit
  -- variable in scope -- an unqualified "currency_code" in the query
  -- below is ambiguous between that and safe_to_deploy_by_currency()'s
  -- result column of the same name.
  select * into v_before from public.safe_to_deploy_by_currency () s where s.currency_code = v_bucket.currency_code;

  select exists (
    select 1 from public.goal_allocation_events a
    join public.obligations o on o.funding_goal_id = a.goal_id
    where a.bucket_id = p_bucket_id and o.is_protected = true and o.status = 'active'
  ) into v_funds_linked_obligation;

  if v_before is null or v_before.status = 'not_configured' then
    return query select
      p_bucket_id,
      v_bucket.currency_code,
      v_balance::text,
      p_amount::text,
      v_post_balance::text,
      v_protected_total::text,
      greatest(v_protected_total - v_balance, 0::numeric(20, 6))::text,
      greatest(v_protected_total - v_post_balance, 0::numeric(20, 6))::text,
      null::text,
      null::text,
      'not_configured'::text,
      case when greatest(v_protected_total - v_post_balance, 0::numeric(20, 6)) > greatest(v_protected_total - v_balance, 0::numeric(20, 6))
        then 'conflict' else 'aligned' end,
      'insufficient_information'::text,
      null::text;
    return;
  end if;

  v_floor := v_before.minimum_cash_floor::numeric;
  v_liquid_before := v_before.liquid_cash::numeric;
  v_pgc_before := v_before.protected_goal_cash::numeric;
  v_uo_before := v_before.uncovered_protected_obligations::numeric;

  v_before_backing := least(v_protected_total, greatest(v_balance, 0::numeric(20, 6)));
  v_post_backing := least(v_protected_total, greatest(v_post_balance, 0::numeric(20, 6)));
  v_delta := v_post_backing - v_before_backing;

  v_after_pgc := greatest(v_pgc_before + v_delta, 0::numeric(20, 6));
  v_after_commitments := v_after_pgc + v_uo_before;
  v_after_required := greatest(v_floor, v_after_commitments);
  v_after_safe := greatest((v_liquid_before - p_amount) - v_after_required, 0::numeric(20, 6));
  v_after_deficit := greatest(v_after_required - (v_liquid_before - p_amount), 0::numeric(20, 6));

  return query select
    p_bucket_id,
    v_bucket.currency_code,
    v_balance::text,
    p_amount::text,
    v_post_balance::text,
    v_protected_total::text,
    greatest(v_protected_total - v_balance, 0::numeric(20, 6))::text,
    greatest(v_protected_total - v_post_balance, 0::numeric(20, 6))::text,
    v_before.safe_to_deploy,
    v_after_safe::text,
    case
      when (v_liquid_before - p_amount) < v_floor then 'conflict'
      when v_after_safe < v_before.safe_to_deploy::numeric then 'attention'
      else 'aligned'
    end,
    case when v_delta < 0 and v_post_backing < v_protected_total then 'conflict' else 'aligned' end,
    case when v_delta < 0 and v_funds_linked_obligation then 'attention' else 'aligned' end,
    v_after_deficit::text;
end;
$$;

revoke all on function public.evaluate_proposed_cash_use(uuid, numeric) from public, anon;
grant execute on function public.evaluate_proposed_cash_use(uuid, numeric) to authenticated;

-- ===========================================================================
-- 7. Override audit (append-only, immutable)
-- ===========================================================================
-- Recording an override acknowledges conflicts at a point in time -- it
-- NEVER creates a cash_movement, alters a goal, or alters an obligation.
-- No UPDATE/DELETE grant exists at all: these rows are immutable under
-- every normal user flow.

create table public.cash_use_overrides (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_id uuid not null references public.cash_buckets (id) on delete restrict,
  currency_code text not null references public.currencies (code),
  proposed_amount numeric(20, 6) not null check (proposed_amount > 0),
  -- Immutable audit snapshot of evaluate_proposed_cash_use()'s conflict
  -- labels/figures at override time -- never re-derived from this JSON,
  -- never the source of any subsequent arithmetic. See migration header.
  conflicts_snapshot jsonb not null,
  safe_to_deploy_before numeric(20, 6),
  safe_to_deploy_after numeric(20, 6),
  context_type text check (context_type is null or char_length(context_type) <= 50),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.cash_use_overrides is
  'Append-only audit record: "the user acknowledged these conflicts." Never moves money, never alters a goal or obligation -- actual execution belongs to Money/Decisions.';

create index cash_use_overrides_bucket_id on public.cash_use_overrides (bucket_id);

alter table public.cash_use_overrides enable row level security;

revoke all on public.cash_use_overrides from anon, authenticated;
grant select on public.cash_use_overrides to authenticated;
grant insert (
  user_id, bucket_id, currency_code, proposed_amount, conflicts_snapshot,
  safe_to_deploy_before, safe_to_deploy_after, context_type, note
) on public.cash_use_overrides to authenticated;

create policy "cash_use_overrides_select_own"
  on public.cash_use_overrides for select to authenticated
  using (auth.uid () = user_id);

create policy "cash_use_overrides_insert_own"
  on public.cash_use_overrides for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.cash_buckets b where b.id = bucket_id and b.user_id = auth.uid ())
  );

create function public.record_cash_use_override(
  p_bucket_id uuid,
  p_amount numeric,
  p_context_type text default null,
  p_note text default null
)
returns public.cash_use_overrides
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_bucket public.cash_buckets;
  v_eval record;
  v_override public.cash_use_overrides;
  v_snapshot jsonb;
begin
  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;

  select * into v_eval from public.evaluate_proposed_cash_use (p_bucket_id, p_amount);

  v_snapshot := jsonb_build_object(
    'minimum_cash_floor_status', v_eval.minimum_cash_floor_status,
    'protected_goal_status', v_eval.protected_goal_status,
    'protected_obligation_status', v_eval.protected_obligation_status,
    'current_allocation_shortfall', v_eval.current_allocation_shortfall,
    'post_use_allocation_shortfall', v_eval.post_use_allocation_shortfall,
    'retained_deficit_after', v_eval.retained_deficit_after
  );

  insert into public.cash_use_overrides (
    user_id, bucket_id, currency_code, proposed_amount, conflicts_snapshot,
    safe_to_deploy_before, safe_to_deploy_after, context_type, note
  )
  values (
    auth.uid (), p_bucket_id, v_bucket.currency_code, p_amount, v_snapshot,
    v_eval.currency_safe_to_deploy_before::numeric,
    v_eval.currency_safe_to_deploy_after::numeric,
    p_context_type, p_note
  )
  returning * into v_override;

  return v_override;
end;
$$;

revoke all on function public.record_cash_use_override(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_cash_use_override(uuid, numeric, text, text) to authenticated;

-- ===========================================================================
-- 8. Additional read models
-- ===========================================================================

create function public.financial_rule_summary()
returns table (
  rule_id uuid,
  rule_type text,
  currency_code text,
  status text,
  current_threshold text,
  effective_at timestamptz
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select r.id, r.rule_type, r.currency_code, r.status, v.threshold_value::text, v.effective_at
  from public.financial_rules r
  left join lateral (
    select threshold_value, effective_at
    from public.financial_rule_versions
    where rule_id = r.id
    order by effective_at desc, created_at desc
    limit 1
  ) v on true
  where r.user_id = auth.uid ();
$$;

create function public.financial_rule_history(p_rule_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  threshold_value text,
  effective_at timestamptz,
  note text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select v.id, v.threshold_value::text, v.effective_at, v.note
  from public.financial_rule_versions v
  where v.rule_id = p_rule_id and v.user_id = auth.uid ()
  order by v.effective_at desc, v.created_at desc
  limit greatest(p_limit, 0);
$$;

-- Overdue is derived here (active + due_date < "today" in the caller's
-- profile timezone), never stored -- no is_overdue column exists anywhere.
create function public.obligation_summary()
returns table (
  obligation_id uuid,
  name text,
  description text,
  currency_code text,
  amount text,
  due_date date,
  status text,
  is_protected boolean,
  funding_goal_id uuid,
  is_overdue boolean,
  created_at timestamptz
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_today date;
begin
  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_today := (now () at time zone coalesce(v_timezone, 'UTC'))::date;

  return query
    select
      o.id, o.name, o.description, o.currency_code, o.amount::text, o.due_date, o.status,
      o.is_protected, o.funding_goal_id,
      (o.status = 'active' and o.due_date is not null and o.due_date < v_today),
      o.created_at
    from public.obligations o
    where o.user_id = auth.uid ();
end;
$$;

-- Default 30-day horizon when the caller does not supply one -- documented
-- domain default, not an arbitrary hidden magic number (a future caller,
-- e.g. Home, may always pass its own explicit start/end).
create function public.upcoming_obligations(p_start date default null, p_end date default null)
returns table (
  obligation_id uuid,
  name text,
  currency_code text,
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
  v_timezone text;
  v_today date;
  v_start date;
  v_end date;
begin
  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = auth.uid ();
  v_today := (now () at time zone coalesce(v_timezone, 'UTC'))::date;
  v_start := coalesce(p_start, v_today);
  v_end := coalesce(p_end, v_today + 30);

  return query
    select o.id, o.name, o.currency_code, o.amount::text, o.due_date, o.is_protected
    from public.obligations o
    where o.user_id = auth.uid ()
      and o.status = 'active'
      and o.due_date is not null
      and o.due_date between v_start and v_end
    order by o.due_date;
end;
$$;

revoke all on function public.financial_rule_summary() from public, anon;
grant execute on function public.financial_rule_summary() to authenticated;

revoke all on function public.financial_rule_history(uuid, integer) from public, anon;
grant execute on function public.financial_rule_history(uuid, integer) to authenticated;

revoke all on function public.obligation_summary() from public, anon;
grant execute on function public.obligation_summary() to authenticated;

revoke all on function public.upcoming_obligations(date, date) from public, anon;
grant execute on function public.upcoming_obligations(date, date) to authenticated;
