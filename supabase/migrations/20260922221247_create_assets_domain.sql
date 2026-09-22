-- Monatriq: Assets domain (P0-E2-S3)
--
-- Full design rationale in docs/architecture/FINANCIAL_DOMAIN_MODEL.md and
-- docs/reports/P0-E2-S3-assets-multicurrency-foundation.txt. This header
-- covers the decisions that shape every section below.
--
-- ASSETS ARE NOT MONEY: creating an asset, or recording a valuation
-- against one, never touches financial_events/cash_movements. There is no
-- code path connecting them in this migration.
--
-- COST BASIS IS HISTORY, NOT A MUTABLE FIELD: asset_basis_events is an
-- append-only ledger (signed amounts, same philosophy as cash_movements)
-- so a future asset purchase, capital improvement, repair capitalization,
-- or partial disposal each just adds a row -- current basis is always
-- sum(asset_basis_events.amount), never an overwritten column.
--
-- VALUATION IS HISTORY, NOT A MUTABLE FIELD: asset_valuations is likewise
-- append-only. estimated_current_value, quick_sale_estimate, and
-- target_value are three structurally distinct valuation_type values,
-- never collapsed into one "value" column -- a correction is a new row
-- with a newer valued_at, not an edit to an old one.
--
-- ALL SECURITY INVOKER: create_asset() and every read function here run
-- as the calling user, exactly like the Money domain. No elevated
-- privilege anywhere in Assets.

-- ===========================================================================
-- 1. Asset type registry
-- ===========================================================================
-- A controlled vocabulary table (same pattern as money_received_categories/
-- money_spending_categories), not a bare CHECK-only enum scattered through
-- the schema and not an arbitrary client-supplied string -- extending the
-- supported types later is a migration that inserts a row.

create table public.asset_types (
  code text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.asset_types enable row level security;
revoke all on public.asset_types from anon, authenticated;
grant select on public.asset_types to authenticated;

create policy "asset_types_readable"
  on public.asset_types for select to authenticated using (true);

insert into public.asset_types (code, display_name) values
  ('vehicle', 'Vehicle'),
  ('property', 'Property'),
  ('business_interest', 'Business Interest'),
  ('financial_investment', 'Financial Investment'),
  ('equipment', 'Equipment'),
  ('inventory', 'Inventory'),
  ('collectible', 'Collectible'),
  ('other', 'Other');

-- Receivables get their own dedicated domain shortly (per this phase's
-- brief) -- deliberately not forced into this generic list.

-- ===========================================================================
-- 2. Assets
-- ===========================================================================
-- Generic on purpose: no vehicle-specific, property-specific, or any
-- single-subtype columns. currency_code is the asset's native valuation
-- currency, immutable once it has basis or valuation history (mirrors
-- cash_buckets' currency immutability -- see enforce_asset_currency_
-- immutable below). No status beyond is_archived -- operational statuses
-- (e.g. a vehicle-resale pipeline) belong to a future subtype workflow,
-- not here.

create table public.assets (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_type text not null references public.asset_types (code),
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  currency_code text not null references public.currencies (code),
  acquired_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assets is
  'Something a user owns/controls with financial value. Not cash (see cash_buckets), not a transaction. currency_code is fixed once basis/valuation history exists.';

create function public.enforce_asset_currency_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.currency_code is distinct from old.currency_code then
    if exists (select 1 from public.asset_basis_events e where e.asset_id = old.id)
      or exists (select 1 from public.asset_valuations v where v.asset_id = old.id)
    then
      raise exception 'cannot change currency of asset % -- it already has basis or valuation history', old.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.enforce_asset_currency_immutable() is
  'BEFORE UPDATE on assets: blocks changing currency_code once the asset has any basis event or valuation. Not SECURITY DEFINER.';

create trigger assets_set_metadata
  before update on public.assets
  for each row
  execute function public.enforce_asset_currency_immutable();

alter table public.assets enable row level security;

revoke all on public.assets from anon, authenticated;

grant select on public.assets to authenticated;
grant insert (user_id, asset_type, name, description, currency_code, acquired_at)
  on public.assets to authenticated;
grant update (asset_type, name, description, currency_code, is_archived)
  on public.assets to authenticated;

create policy "assets_select_own"
  on public.assets for select to authenticated
  using (auth.uid () = user_id);

create policy "assets_insert_own"
  on public.assets for insert to authenticated
  with check (auth.uid () = user_id);

create policy "assets_update_own"
  on public.assets for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 3. Asset basis events (cost basis, as append-only history)
-- ===========================================================================
-- current basis = sum(amount) for an asset. Signed, same convention as
-- cash_movements: initial_basis/capital_improvement are positive,
-- basis_reduction is negative -- enforced by prepare_asset_basis_event,
-- not left to client discipline. user_id is denormalized from the parent
-- asset but never trusted from client input -- the same trigger derives
-- it, mirroring prepare_cash_movement in the Money migration.

create table public.asset_basis_events (
  id uuid primary key default gen_random_uuid (),
  asset_id uuid not null references public.assets (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  basis_event_type text not null check (
    basis_event_type in ('initial_basis', 'capital_improvement', 'basis_reduction')
  ),
  amount numeric(20, 6) not null check (amount <> 0),
  currency_code text not null references public.currencies (code),
  occurred_at timestamptz not null,
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.asset_basis_events is
  'Append-only cost-basis ledger. Current basis = sum(amount) per asset -- see asset_current_basis(). Never edited or deleted; a correction is a new offsetting row.';

create index asset_basis_events_asset_id on public.asset_basis_events (asset_id);

create function public.prepare_asset_basis_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_currency text;
  v_decimal_exponent smallint;
begin
  select user_id, currency_code into v_user_id, v_currency from public.assets where id = new.asset_id;
  if v_user_id is null then
    raise exception 'asset % not found', new.asset_id;
  end if;
  new.user_id := v_user_id;

  if new.currency_code is distinct from v_currency then
    raise exception 'basis event currency % does not match asset currency %', new.currency_code, v_currency;
  end if;

  if new.basis_event_type in ('initial_basis', 'capital_improvement') and new.amount <= 0 then
    raise exception '% amount must be positive', new.basis_event_type;
  end if;
  if new.basis_event_type = 'basis_reduction' and new.amount >= 0 then
    raise exception 'basis_reduction amount must be negative';
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
  if round(new.amount, v_decimal_exponent) <> new.amount then
    raise exception 'amount % has more precision than % allows (% decimal place(s))',
      new.amount, new.currency_code, v_decimal_exponent;
  end if;

  return new;
end;
$$;

create trigger asset_basis_events_prepare
  before insert on public.asset_basis_events
  for each row
  execute function public.prepare_asset_basis_event();

alter table public.asset_basis_events enable row level security;

revoke all on public.asset_basis_events from anon, authenticated;
grant select on public.asset_basis_events to authenticated;
grant insert (asset_id, basis_event_type, amount, currency_code, occurred_at, description)
  on public.asset_basis_events to authenticated;

create policy "asset_basis_events_select_own"
  on public.asset_basis_events for select to authenticated
  using (auth.uid () = user_id);

create policy "asset_basis_events_insert_own"
  on public.asset_basis_events for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.assets a where a.id = asset_id and a.user_id = auth.uid ())
  );

-- ===========================================================================
-- 4. Asset valuations (append-only history, three distinct types)
-- ===========================================================================
-- estimated_current_value, quick_sale_estimate, and target_value are never
-- collapsed. Values are always positive (a valuation, not a signed delta).
-- Same user_id-derivation and currency-match trigger pattern as basis
-- events.

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid (),
  asset_id uuid not null references public.assets (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  valuation_type text not null check (
    valuation_type in ('estimated_current_value', 'quick_sale_estimate', 'target_value')
  ),
  value numeric(20, 6) not null check (value > 0),
  currency_code text not null references public.currencies (code),
  valued_at timestamptz not null,
  source text check (source is null or char_length(source) <= 200),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.asset_valuations is
  'Append-only valuation history. Latest row per (asset_id, valuation_type) is the current value -- see asset_latest_valuations()/asset_summary(). Never edited; a correction is a new row.';

create index asset_valuations_asset_type on public.asset_valuations (asset_id, valuation_type, valued_at desc);

create function public.prepare_asset_valuation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_currency text;
  v_decimal_exponent smallint;
begin
  select user_id, currency_code into v_user_id, v_currency from public.assets where id = new.asset_id;
  if v_user_id is null then
    raise exception 'asset % not found', new.asset_id;
  end if;
  new.user_id := v_user_id;

  if new.currency_code is distinct from v_currency then
    raise exception 'valuation currency % does not match asset currency %', new.currency_code, v_currency;
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
  if round(new.value, v_decimal_exponent) <> new.value then
    raise exception 'value % has more precision than % allows (% decimal place(s))',
      new.value, new.currency_code, v_decimal_exponent;
  end if;

  return new;
end;
$$;

create trigger asset_valuations_prepare
  before insert on public.asset_valuations
  for each row
  execute function public.prepare_asset_valuation();

alter table public.asset_valuations enable row level security;

revoke all on public.asset_valuations from anon, authenticated;
grant select on public.asset_valuations to authenticated;
grant insert (asset_id, valuation_type, value, currency_code, valued_at, source, note)
  on public.asset_valuations to authenticated;

create policy "asset_valuations_select_own"
  on public.asset_valuations for select to authenticated
  using (auth.uid () = user_id);

create policy "asset_valuations_insert_own"
  on public.asset_valuations for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.assets a where a.id = asset_id and a.user_id = auth.uid ())
  );

-- ===========================================================================
-- 5. Adding a single valuation or basis event to an EXISTING asset
-- ===========================================================================
-- Thin SECURITY INVOKER wrappers, not because a single-table insert is
-- unsafe on its own (the grant + RLS policy above already make a direct
-- client insert correctly scoped), but because user_id is trigger-derived
-- and deliberately outside both tables' INSERT column grant -- a direct
-- `.from(...).insert(...)` call from the generated TypeScript client would
-- need to supply `user_id` to satisfy the generated Insert type even
-- though the database will never let that value through. Wrapping the
-- insert in a function sidesteps that mismatch cleanly: the RPC looks up
-- the asset (auth.uid()-scoped, never trusting a caller-supplied owner)
-- and only ever inserts the columns that are actually meant to be
-- settable. The underlying trigger (prepare_asset_valuation /
-- prepare_asset_basis_event) still runs and still validates currency
-- match and precision regardless of which path reached the table.

create function public.record_asset_valuation(
  p_asset_id uuid,
  p_valuation_type text,
  p_value numeric,
  p_valued_at timestamptz default now(),
  p_source text default null,
  p_note text default null
)
returns public.asset_valuations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_asset public.assets;
  v_valuation public.asset_valuations;
begin
  select * into v_asset from public.assets where id = p_asset_id and user_id = auth.uid ();
  if not found then
    raise exception 'asset % not found for current user', p_asset_id;
  end if;

  insert into public.asset_valuations (asset_id, valuation_type, value, currency_code, valued_at, source, note)
    values (p_asset_id, p_valuation_type, p_value, v_asset.currency_code, p_valued_at, p_source, p_note)
    returning * into v_valuation;

  return v_valuation;
end;
$$;

create function public.record_asset_basis_event(
  p_asset_id uuid,
  p_basis_event_type text,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_description text default null
)
returns public.asset_basis_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_asset public.assets;
  v_event public.asset_basis_events;
begin
  select * into v_asset from public.assets where id = p_asset_id and user_id = auth.uid ();
  if not found then
    raise exception 'asset % not found for current user', p_asset_id;
  end if;

  insert into public.asset_basis_events (asset_id, basis_event_type, amount, currency_code, occurred_at, description)
    values (p_asset_id, p_basis_event_type, p_amount, v_asset.currency_code, p_occurred_at, p_description)
    returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.record_asset_valuation(uuid, text, numeric, timestamptz, text, text) from public, anon;
grant execute on function public.record_asset_valuation(uuid, text, numeric, timestamptz, text, text) to authenticated;

revoke all on function public.record_asset_basis_event(uuid, text, numeric, timestamptz, text) from public, anon;
grant execute on function public.record_asset_basis_event(uuid, text, numeric, timestamptz, text) to authenticated;

-- ===========================================================================
-- 6. Atomic asset creation
-- ===========================================================================
-- SECURITY INVOKER (the default, stated explicitly for clarity, same as
-- every Money record_* function). Bundles the "Add Asset" foundation
-- form's fields into one transaction: the asset itself, an optional
-- initial_basis event, and up to three optional initial valuations.
-- Nothing here touches financial_events or cash_movements -- creating an
-- asset never moves cash (docs/architecture/FINANCIAL_DOMAIN_MODEL.md,
-- "opening / existing assets").

create function public.create_asset(
  p_asset_type text,
  p_name text,
  p_currency_code text,
  p_description text default null,
  p_acquired_at timestamptz default null,
  p_initial_basis_amount numeric default null,
  p_estimated_current_value numeric default null,
  p_quick_sale_estimate numeric default null,
  p_target_value numeric default null,
  p_valued_at timestamptz default now()
)
returns public.assets
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_asset public.assets;
begin
  insert into public.assets (user_id, asset_type, name, description, currency_code, acquired_at)
    values (auth.uid (), p_asset_type, p_name, p_description, p_currency_code, p_acquired_at)
    returning * into v_asset;

  if p_initial_basis_amount is not null then
    insert into public.asset_basis_events (asset_id, basis_event_type, amount, currency_code, occurred_at)
      values (v_asset.id, 'initial_basis', p_initial_basis_amount, p_currency_code, coalesce(p_acquired_at, now ()));
  end if;

  if p_estimated_current_value is not null then
    insert into public.asset_valuations (asset_id, valuation_type, value, currency_code, valued_at)
      values (v_asset.id, 'estimated_current_value', p_estimated_current_value, p_currency_code, p_valued_at);
  end if;

  if p_quick_sale_estimate is not null then
    insert into public.asset_valuations (asset_id, valuation_type, value, currency_code, valued_at)
      values (v_asset.id, 'quick_sale_estimate', p_quick_sale_estimate, p_currency_code, p_valued_at);
  end if;

  if p_target_value is not null then
    insert into public.asset_valuations (asset_id, valuation_type, value, currency_code, valued_at)
      values (v_asset.id, 'target_value', p_target_value, p_currency_code, p_valued_at);
  end if;

  return v_asset;
end;
$$;

revoke all on function public.create_asset(
  text, text, text, text, timestamptz, numeric, numeric, numeric, numeric, timestamptz
) from public, anon;
grant execute on function public.create_asset(
  text, text, text, text, timestamptz, numeric, numeric, numeric, numeric, timestamptz
) to authenticated;

-- ===========================================================================
-- 7. Read models
-- ===========================================================================
-- One shared, authoritative calculation per concept -- future Home/Net
-- Worth consumers call these, none re-derives basis or "latest valuation"
-- independently. Amounts cast to text for the same reason as Money's
-- read functions (see docs/architecture/MULTI_CURRENCY_MODEL.md §6).
-- Never sums across currencies.

create function public.asset_current_basis()
returns table (asset_id uuid, currency_code text, basis text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select b.asset_id, a.currency_code, sum(b.amount)::text as basis
  from public.asset_basis_events b
  join public.assets a on a.id = b.asset_id
  where b.user_id = auth.uid ()
  group by b.asset_id, a.currency_code;
$$;

create function public.asset_latest_valuations()
returns table (
  asset_id uuid,
  valuation_type text,
  value text,
  currency_code text,
  valued_at timestamptz
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select distinct on (v.asset_id, v.valuation_type)
    v.asset_id, v.valuation_type, v.value::text, v.currency_code, v.valued_at
  from public.asset_valuations v
  where v.user_id = auth.uid ()
  order by v.asset_id, v.valuation_type, v.valued_at desc, v.created_at desc;
$$;

-- "Assets by Native Currency": the current-net-worth-relevant total per
-- currency, using only the latest estimated_current_value per asset
-- (never target_value, never quick_sale_estimate -- see
-- docs/architecture/FINANCIAL_DOMAIN_MODEL.md, "net worth preparation"),
-- excluding archived assets, never summing across currencies.
create function public.asset_native_currency_totals()
returns table (currency_code text, total_estimated_value text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select latest.currency_code, sum(latest.value)::text as total_estimated_value
  from (
    select distinct on (v.asset_id) a.currency_code, v.value
    from public.asset_valuations v
    join public.assets a on a.id = v.asset_id
    where v.user_id = auth.uid ()
      and v.valuation_type = 'estimated_current_value'
      and a.is_archived = false
    order by v.asset_id, v.valued_at desc, v.created_at desc
  ) latest
  group by latest.currency_code;
$$;

-- Convenience combined read: one row per asset with its type, native
-- currency, current basis, and latest value of each valuation type --
-- exactly the shape docs/reports/P0-E2-S3-assets-multicurrency-foundation
-- .txt's "asset summary" describes, so the application never re-joins
-- these three tables itself.
create function public.asset_summary()
returns table (
  asset_id uuid,
  asset_type text,
  name text,
  currency_code text,
  is_archived boolean,
  cost_basis text,
  estimated_current_value text,
  quick_sale_estimate text,
  target_value text,
  latest_valued_at timestamptz
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    a.id,
    a.asset_type,
    a.name,
    a.currency_code,
    a.is_archived,
    basis.total::text,
    ecv.value::text,
    qse.value::text,
    tv.value::text,
    greatest(ecv.valued_at, qse.valued_at, tv.valued_at)
  from public.assets a
  left join lateral (
    select sum(b.amount) as total
    from public.asset_basis_events b
    where b.asset_id = a.id
  ) basis on true
  left join lateral (
    select v.value, v.valued_at
    from public.asset_valuations v
    where v.asset_id = a.id and v.valuation_type = 'estimated_current_value'
    order by v.valued_at desc, v.created_at desc
    limit 1
  ) ecv on true
  left join lateral (
    select v.value, v.valued_at
    from public.asset_valuations v
    where v.asset_id = a.id and v.valuation_type = 'quick_sale_estimate'
    order by v.valued_at desc, v.created_at desc
    limit 1
  ) qse on true
  left join lateral (
    select v.value, v.valued_at
    from public.asset_valuations v
    where v.asset_id = a.id and v.valuation_type = 'target_value'
    order by v.valued_at desc, v.created_at desc
    limit 1
  ) tv on true
  where a.user_id = auth.uid ();
$$;

revoke all on function public.asset_current_basis () from public, anon;
grant execute on function public.asset_current_basis () to authenticated;

revoke all on function public.asset_latest_valuations () from public, anon;
grant execute on function public.asset_latest_valuations () to authenticated;

revoke all on function public.asset_native_currency_totals () from public, anon;
grant execute on function public.asset_native_currency_totals () to authenticated;

revoke all on function public.asset_summary () from public, anon;
grant execute on function public.asset_summary () to authenticated;
