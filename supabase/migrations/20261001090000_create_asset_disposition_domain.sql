-- Monatriq: Asset Sale / Disposal domain foundation (P0-E4-S1)
--
-- Full design rationale in docs/architecture/FINANCIAL_DOMAIN_MODEL.md
-- and docs/reports/P0-E4-S1-asset-sale-disposal-domain-foundation.txt.
--
-- CORE PRINCIPLE: asset sale is NOT generic money received. Selling an
-- asset moves real cash (through the existing Money engine, exactly like
-- every other cash-affecting event), but it ALSO permanently changes
-- what the asset itself is -- it stops being an active, currently-owned
-- holding. Two genuinely different facts, recorded together atomically:
-- (1) a `financial_events` row (event_type='asset_sale') + one
-- `cash_movements` row for the actual net cash that arrived -- the SAME
-- generic Money engine every other cash event already uses, never a
-- second cash-balance mechanism; (2) one `asset_dispositions` row
-- capturing the full, immutable sale economics (gross proceeds, selling
-- costs, basis at the moment of sale, capital returned, realised
-- gain/loss) that Money's own event row has no room to express.
--
-- WHY A NEW TABLE, NOT A REUSE OF receivable_ledger_events' SHAPE: that
-- table only ever holds ONE signed amount per row (the fact IS the cash
-- effect). An asset sale has FIVE distinct numeric facts about ONE
-- event (gross/costs/basis/capital-returned/gain-loss) that must all
-- survive together, unlosable, even if the asset's own current basis
-- later changes (a future basis event must never retroactively rewrite
-- what a past sale's economics were) -- exactly the "immutable snapshot"
-- requirement the phase brief calls out. `basis_at_sale` is captured
-- once, at sale time, and never recomputed.
--
-- WHY SECURITY DEFINER, BREAKING FROM EVERY PRIOR DOMAIN'S SECURITY
-- INVOKER CONVENTION: every prior record_*() function in this codebase
-- is SECURITY INVOKER, relying on the calling user already holding the
-- necessary table grants (enforced by RLS). That is an accepted,
-- documented risk level for lower-stakes domain-specific ledger rows
-- (docs/security/SECURITY_AND_RLS_PRINCIPLES.md #15 notes
-- receivable_ledger_events' own INSERT grant to authenticated could in
-- principle be used to forge a ledger row pointing at an unrelated
-- existing financial_events row -- an accepted scope boundary for that
-- phase). This phase's own brief is explicitly STRICTER for asset
-- sale specifically: "sale/disposition tables should not permit the
-- client to bypass the RPC and forge realised gain/loss or
-- money-event linkage." The only way to honor that while keeping
-- gross_proceeds/selling_costs/basis_at_sale/realised_gain_loss
-- database-computed and un-forgeable is to grant NO direct client
-- INSERT/UPDATE on asset_dispositions at all, and have record_asset_
-- sale() run with elevated privilege so it can still write the row a
-- plain invoker function no longer could. Every DEFINER hardening rule
-- the brief itself lists is followed: search_path pinned, auth.uid()
-- explicitly validated non-null, every relation fully schema-qualified,
-- EXECUTE revoked from public/anon and granted only to authenticated,
-- and no ownership value is ever trusted from a parameter -- every
-- ownership check re-derives from auth.uid() against the actual table
-- rows, exactly like every SECURITY INVOKER record_*() function already
-- does; the only thing DEFINER changes here is that the table itself no
-- longer has to trust the CALLER's own grants.
--
-- GENERIC DISPOSITION, NOT A "SOLD" VEHICLE STATUS: `assets.status_code`
-- (P0-E3-S4/P0-E3-S4R) is, and remains, the VEHICLE-ONLY operational
-- lifecycle (awaiting_repair..under_negotiation) -- it deliberately has
-- no 'sold' value (see 20260929090000's own header comment) and this
-- migration does not add one. Disposition is a SEPARATE, GENERIC
-- concept that applies to every sellable asset type, derived purely
-- from whether an active (non-voided) asset_dispositions row exists for
-- the asset -- never a second is_sold flag on `assets` itself, for
-- exactly the reason SECURITY_AND_RLS_PRINCIPLES.md #15 already
-- documents for receivables/liabilities: a second, independently-
-- toggled flag is a second source of truth that can drift. Voiding an
-- asset_sale event through the existing, completely unmodified
-- voidFinancialEvent() mechanism therefore automatically and
-- consistently restores the asset's active state too -- no dedicated
-- "un-sell" function was written or is needed.
--
-- DOUBLE-SALE PREVENTION: `record_asset_sale()` takes `select ... for
-- update` on the target `assets` row before checking for an existing
-- active disposition, the same row-locking pattern the Goals domain
-- established for allocation-capacity races (SECURITY_AND_RLS_
-- PRINCIPLES.md #16) -- a hard UNIQUE constraint isn't expressible here
-- (uniqueness would need to be conditioned on the LINKED financial_
-- events row's voided_at, a different table, which a partial index
-- predicate cannot reference), so the same battle-tested
-- lock-then-check pattern already used for exactly this class of
-- concurrency problem is reused rather than inventing a new one.
--
-- CURRENCY: v1 requires asset currency = destination bucket currency,
-- exactly. No live/external FX rate is fetched or assumed; a mismatch
-- is a rejected, clearly-explained domain error, never a silent 1:1
-- conversion. Cross-currency asset sale is an explicit future
-- capability, not attempted here.

-- ===========================================================================
-- 1. Extend financial_events for the new event type
-- ===========================================================================

alter table public.financial_events
  drop constraint financial_events_event_type_check;

alter table public.financial_events
  add constraint financial_events_event_type_check check (
    event_type in (
      'opening_balance', 'money_received', 'money_spent', 'transfer', 'fx_transfer',
      'receivable_recovery', 'debt_principal_payment', 'debt_interest', 'debt_fee', 'loan_proceeds',
      'asset_sale'
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
        'debt_principal_payment', 'debt_interest', 'debt_fee', 'loan_proceeds', 'asset_sale'
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
    new.cash_flow_class := 'other_inflow';

  elsif new.event_type = 'debt_principal_payment' then
    new.cash_flow_class := 'other_outflow';

  elsif new.event_type in ('debt_interest', 'debt_fee') then
    new.cash_flow_class := 'expense';

  elsif new.event_type = 'asset_sale' then
    -- Cash inflow, deliberately NOT income: proceeds from disposing of
    -- an already-owned asset are not earned -- the same reasoning
    -- receivable_recovery/loan_proceeds already established. The
    -- realised gain/loss (if any) is a SEPARATE derived fact on the
    -- asset_dispositions row, never folded into this classification.
    new.cash_flow_class := 'other_inflow';

  else
    raise exception 'unrecognized event_type %', new.event_type;
  end if;

  return new;
end;
$$;

comment on function public.set_financial_event_classification() is
  'BEFORE INSERT on financial_events: derives cash_flow_class from event_type (+ category for money_received/money_spent). Extended P0-E4-S1 for asset_sale. Client-supplied cash_flow_class, if any, is overwritten.';

-- ===========================================================================
-- 2. Asset dispositions (the immutable sale-economics snapshot)
-- ===========================================================================
-- No client INSERT/UPDATE grant at all -- see migration header. Only
-- record_asset_sale() (SECURITY DEFINER, below) can create a row; RLS
-- SELECT remains the real read boundary. net_proceeds/realised_gain_
-- loss/capital_returned are GENERATED columns: the canonical formulas
-- are enforced by the database itself, not by application code, and
-- cannot be violated by any insert path whatsoever, including a future
-- one nobody has reasoned about yet.

create table public.asset_dispositions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete restrict,
  disposition_type text not null default 'sale' check (disposition_type = 'sale'),
  -- Single value today; a generic name (not "asset_sales") leaves room
  -- for a future non-sale disposition (written off, lost, donated)
  -- without another schema change -- the same "narrow vocabulary,
  -- extend later" convention financial_events.event_type/financial_
  -- operations.operation_type already use.
  occurred_at timestamptz not null,
  currency_code text not null references public.currencies (code),
  gross_proceeds numeric(20, 6) not null check (gross_proceeds > 0),
  selling_costs numeric(20, 6) not null default 0 check (selling_costs >= 0),
  net_proceeds numeric(20, 6) generated always as (gross_proceeds - selling_costs) stored,
  -- basis_at_sale is NULL, never zero, when the asset had no recorded
  -- basis history at the moment of sale -- see record_asset_sale()'s own
  -- lookup. A NULL here means every downstream figure that depends on
  -- it (realised_gain_loss, capital_returned) is also NULL: "Not
  -- calculated," never a fabricated profit or loss.
  basis_at_sale numeric(20, 6),
  realised_gain_loss numeric(20, 6) generated always as (
    case when basis_at_sale is null then null
    else (gross_proceeds - selling_costs) - basis_at_sale end
  ) stored,
  -- The portion of net proceeds that represents recovery of capital
  -- already invested, as opposed to gain: the full basis when proceeds
  -- exceed it (a gain), or all of net_proceeds when they fall short (a
  -- loss -- none of a shortfall is "gain"). Deliberately NOT `least()`
  -- directly: Postgres's least()/greatest() silently ignore NULL
  -- arguments rather than propagating them, which would have fabricated
  -- a non-null capital_returned even when basis_at_sale is unknown.
  capital_returned numeric(20, 6) generated always as (
    case when basis_at_sale is null then null
    else least(gross_proceeds - selling_costs, basis_at_sale) end
  ) stored,
  destination_bucket_id uuid not null references public.cash_buckets (id) on delete restrict,
  financial_event_id uuid not null references public.financial_events (id) on delete restrict,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.asset_dispositions is
  'Immutable snapshot of one completed asset sale -- gross proceeds, selling costs, and the cost basis AT THE TIME of sale, so later basis changes never rewrite historical realised gain/loss. Write access is RPC-only (record_asset_sale); see migration header for why this breaks from this codebase''s usual SECURITY INVOKER convention. "Active" (not voided) is derived from the linked financial_events row''s voided_at, never a second flag here.';

create unique index asset_dispositions_financial_event_id on public.asset_dispositions (financial_event_id);
create index asset_dispositions_asset_id on public.asset_dispositions (asset_id);
create index asset_dispositions_user_id on public.asset_dispositions (user_id);

alter table public.asset_dispositions enable row level security;

revoke all on public.asset_dispositions from anon, authenticated;
grant select on public.asset_dispositions to authenticated;
-- Deliberately NO insert/update grant to authenticated -- see migration
-- header. record_asset_sale() is SECURITY DEFINER and does not need one.

create policy "asset_dispositions_select_own"
  on public.asset_dispositions for select to authenticated
  using (auth.uid () = user_id);

-- ===========================================================================
-- 3. record_asset_sale() -- the one atomic, SECURITY DEFINER entry point
-- ===========================================================================

-- Returns a TABLE with every numeric column explicitly cast to text, NOT
-- `returns public.asset_dispositions` directly -- the same discipline
-- every other financial read function in this codebase already follows
-- (see e.g. asset_summary()'s own repository.ts comment): PostgREST
-- serializes a raw `numeric` as a JSON number, risking float64
-- precision loss for large/precise values. Returning the raw composite
-- type here would have been the one place in the whole domain layer
-- that silently reintroduced that risk.
create function public.record_asset_sale(
  p_asset_id uuid,
  p_destination_bucket_id uuid,
  p_gross_proceeds numeric,
  p_selling_costs numeric default 0,
  p_occurred_at timestamptz default now(),
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns table (
  id uuid,
  asset_id uuid,
  occurred_at timestamptz,
  currency_code text,
  gross_proceeds text,
  selling_costs text,
  net_proceeds text,
  basis_at_sale text,
  realised_gain_loss text,
  capital_returned text,
  destination_bucket_id uuid,
  financial_event_id uuid,
  notes text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
  v_asset public.assets;
  v_bucket public.cash_buckets;
  v_basis numeric;
  v_event public.financial_events;
  v_disposition public.asset_dispositions;
  v_net_proceeds numeric;
begin
  v_uid := auth.uid ();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if p_idempotency_key is not null then
    select d.* into v_disposition
      from public.asset_dispositions d
      join public.financial_events e on e.id = d.financial_event_id
      where e.user_id = v_uid and e.idempotency_key = p_idempotency_key;
    if found then
      return query select
        v_disposition.id, v_disposition.asset_id, v_disposition.occurred_at, v_disposition.currency_code,
        v_disposition.gross_proceeds::text, v_disposition.selling_costs::text, v_disposition.net_proceeds::text,
        v_disposition.basis_at_sale::text, v_disposition.realised_gain_loss::text, v_disposition.capital_returned::text,
        v_disposition.destination_bucket_id, v_disposition.financial_event_id, v_disposition.notes;
      return;
    end if;
  end if;

  if p_gross_proceeds <= 0 then
    raise exception 'gross proceeds must be positive';
  end if;
  if p_selling_costs < 0 then
    raise exception 'selling costs cannot be negative';
  end if;
  if p_selling_costs >= p_gross_proceeds then
    raise exception 'selling costs (%) cannot equal or exceed gross proceeds (%)', p_selling_costs, p_gross_proceeds;
  end if;
  v_net_proceeds := p_gross_proceeds - p_selling_costs;

  -- Row-locked: serializes any concurrent sale attempt against the SAME
  -- asset (double-click, two tabs, a retried request) so the "already
  -- disposed" check below is race-safe -- see migration header.
  -- Bare `id`/`asset_id` would be ambiguous here -- this function's own
  -- `returns table(...)` declares output columns of those exact names,
  -- which plpgsql implicitly scopes as variables throughout the function
  -- body (the same class of bug SECURITY_AND_RLS_PRINCIPLES.md #17
  -- documents for evaluate_proposed_cash_use()'s own currency_code) --
  -- every query below that touches a same-named column is explicitly
  -- table-aliased and qualified to avoid it.
  select * into v_asset from public.assets ast where ast.id = p_asset_id and ast.user_id = v_uid for update;
  if not found then
    raise exception 'asset % not found for current user', p_asset_id;
  end if;

  -- Lifecycle rule (documented, not guessed): an archived asset must be
  -- unarchived before it can be sold -- prevents the ambiguous "sell
  -- something I've already hidden as no-longer-relevant" combination.
  -- The reverse combination (archiving an asset that has ALREADY been
  -- sold) is harmless and left allowed: both is_archived and disposition
  -- are independent, orthogonal facts, and a sold asset is excluded from
  -- every active-value read regardless of its is_archived value.
  if v_asset.is_archived then
    raise exception 'cannot sell an archived asset -- unarchive it first';
  end if;

  if exists (
    select 1 from public.asset_dispositions d
    join public.financial_events e on e.id = d.financial_event_id
    where d.asset_id = p_asset_id and d.user_id = v_uid and e.voided_at is null
  ) then
    raise exception 'asset % has already been sold', p_asset_id;
  end if;

  select * into v_bucket from public.cash_buckets cb where cb.id = p_destination_bucket_id and cb.user_id = v_uid;
  if not found then
    raise exception 'cash bucket % not found for current user', p_destination_bucket_id;
  end if;
  if v_bucket.is_archived then
    raise exception 'cannot deposit sale proceeds into an archived cash bucket';
  end if;

  if v_bucket.currency_code <> v_asset.currency_code then
    raise exception 'destination bucket currency % does not match asset currency % -- cross-currency asset sale is not supported this phase',
      v_bucket.currency_code, v_asset.currency_code;
  end if;

  -- basis_at_sale: NULL (unknown), never zero, when this asset has no
  -- recorded basis history at all -- asset_current_basis() returns no
  -- row for it in that case, not a zero row.
  select acb.basis into v_basis from public.asset_current_basis () acb where acb.asset_id = p_asset_id;

  insert into public.financial_events (user_id, event_type, occurred_at, description, idempotency_key)
    values (v_uid, 'asset_sale', p_occurred_at, p_notes, p_idempotency_key)
    returning * into v_event;

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_destination_bucket_id, v_asset.currency_code, v_net_proceeds);

  insert into public.asset_dispositions (
    user_id, asset_id, occurred_at, currency_code, gross_proceeds, selling_costs,
    basis_at_sale, destination_bucket_id, financial_event_id, notes
  )
    values (
      v_uid, p_asset_id, p_occurred_at, v_asset.currency_code, p_gross_proceeds, p_selling_costs,
      v_basis, p_destination_bucket_id, v_event.id, p_notes
    )
    returning * into v_disposition;

  return query select
    v_disposition.id, v_disposition.asset_id, v_disposition.occurred_at, v_disposition.currency_code,
    v_disposition.gross_proceeds::text, v_disposition.selling_costs::text, v_disposition.net_proceeds::text,
    v_disposition.basis_at_sale::text, v_disposition.realised_gain_loss::text, v_disposition.capital_returned::text,
    v_disposition.destination_bucket_id, v_disposition.financial_event_id, v_disposition.notes;
  return;
exception
  when unique_violation then
    select d.* into v_disposition
      from public.asset_dispositions d
      join public.financial_events e on e.id = d.financial_event_id
      where e.user_id = v_uid and e.idempotency_key = p_idempotency_key;
    return query select
      v_disposition.id, v_disposition.asset_id, v_disposition.occurred_at, v_disposition.currency_code,
      v_disposition.gross_proceeds::text, v_disposition.selling_costs::text, v_disposition.net_proceeds::text,
      v_disposition.basis_at_sale::text, v_disposition.realised_gain_loss::text, v_disposition.capital_returned::text,
      v_disposition.destination_bucket_id, v_disposition.financial_event_id, v_disposition.notes;
end;
$$;

comment on function public.record_asset_sale(uuid, uuid, numeric, numeric, timestamptz, text, uuid) is
  'The ONLY way to sell an asset. SECURITY DEFINER (see migration header for why) -- fully re-validates ownership of both the asset and the destination bucket from auth.uid() itself, never trusts a client-supplied owner. Atomic: one financial_events row (asset_sale, cash_flow_class=other_inflow), one cash_movements row for the NET proceeds (the actual cash that arrived), one asset_dispositions row capturing the full gross/costs/basis/gain-loss snapshot. Requires asset currency = destination bucket currency exactly. Idempotent via idempotency_key.';

revoke all on function public.record_asset_sale (uuid, uuid, numeric, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_asset_sale (uuid, uuid, numeric, numeric, timestamptz, text, uuid) to authenticated;

-- ===========================================================================
-- 4. Read model updates -- disposed assets stop counting as active
-- ===========================================================================
-- asset_summary() gains two lean fields (isDisposed/disposedAt) so the
-- UI can label a sold asset without a second query; full sale economics
-- live in asset_disposition_summary() below, kept out of asset_
-- summary() itself so the common per-asset read stays lean (these
-- columns are null for the overwhelming majority of rows). CREATE OR
-- REPLACE cannot change a function's return shape -- same DROP+CREATE
-- requirement 20260929090000 already hit adding status_code.

drop function public.asset_summary ();

create function public.asset_summary()
returns table (
  asset_id uuid,
  asset_type text,
  name text,
  currency_code text,
  is_archived boolean,
  status_code text,
  is_disposed boolean,
  disposed_at timestamptz,
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
    a.status_code,
    disp.asset_id is not null,
    disp.occurred_at,
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
  left join lateral (
    select d.asset_id, d.occurred_at
    from public.asset_dispositions d
    join public.financial_events e on e.id = d.financial_event_id
    where d.asset_id = a.id and e.voided_at is null
    order by d.occurred_at desc, d.created_at desc
    limit 1
  ) disp on true
  where a.user_id = auth.uid ();
$$;

revoke all on function public.asset_summary () from public, anon;
grant execute on function public.asset_summary () to authenticated;

-- asset_native_currency_totals() and asset_value_by_type() (both
-- Net-Worth/Home-facing aggregates): add the same "exclude disposed"
-- condition already applied for is_archived. Return shape unchanged for
-- both, so CREATE OR REPLACE is sufficient here.

create or replace function public.asset_native_currency_totals()
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
      and not exists (
        select 1 from public.asset_dispositions d
        join public.financial_events e on e.id = d.financial_event_id
        where d.asset_id = a.id and e.voided_at is null
      )
    order by v.asset_id, v.valued_at desc, v.created_at desc
  ) latest
  group by latest.currency_code;
$$;

comment on function public.asset_native_currency_totals() is
  'Current (latest estimated_current_value) asset value grouped by native currency -- excludes archived AND disposed/sold assets (P0-E4-S1). A sold asset''s value now lives in Money (the cash it became), not here.';

create or replace function public.asset_value_by_type()
returns table (asset_type text, currency_code text, total_estimated_value text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select latest.asset_type, latest.currency_code, sum(latest.value)::text as total_estimated_value
  from (
    select distinct on (v.asset_id) a.asset_type, a.currency_code, v.value
    from public.asset_valuations v
    join public.assets a on a.id = v.asset_id
    where v.user_id = auth.uid ()
      and v.valuation_type = 'estimated_current_value'
      and a.is_archived = false
      and not exists (
        select 1 from public.asset_dispositions d
        join public.financial_events e on e.id = d.financial_event_id
        where d.asset_id = a.id and e.voided_at is null
      )
    order by v.asset_id, v.valued_at desc, v.created_at desc
  ) latest
  group by latest.asset_type, latest.currency_code;
$$;

comment on function public.asset_value_by_type() is
  'Current asset value grouped by asset_type and native currency -- excludes archived AND disposed/sold assets (P0-E4-S1), same semantics as asset_native_currency_totals().';

create or replace function public.asset_quicksale_coverage()
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
  where s.is_archived = false and s.is_disposed = false
  group by s.currency_code;
$$;

comment on function public.asset_quicksale_coverage() is
  'Per-currency quick-sale-estimate coverage for active (non-archived, non-disposed) assets only (P0-E4-S1) -- a sold asset''s quick-sale estimate no longer represents real potential liquidity.';

-- financial_position_by_currency(): only its inline quick_sale CTE reads
-- asset_summary() directly and needs the same disposed-exclusion; every
-- other column already flows through asset_native_currency_totals(),
-- already updated above. Return shape unchanged, CREATE OR REPLACE.

create or replace function public.financial_position_by_currency()
returns table (
  currency_code text,
  liquid_cash text,
  non_cash_asset_value text,
  receivables_outstanding text,
  liabilities_outstanding text,
  net_worth text,
  protected_goal_cash text,
  protected_commitments text,
  minimum_cash_floor text,
  required_retained_cash text,
  safe_to_deploy text,
  safe_to_deploy_status text,
  retained_deficit text,
  asset_quick_sale_potential text,
  receivables_estimated_recoverable text,
  receivables_recoverability_difference text,
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
    where quick_sale_estimate is not null and is_archived = false and is_disposed = false
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
  'The one canonical per-currency Financial Position composition. Every column is read from an existing domain function. Net Worth is the only new calculation this function introduces. Updated P0-E4-S1: asset_quick_sale_potential now excludes disposed assets, consistent with non_cash_asset_value (via asset_native_currency_totals()).';

revoke all on function public.financial_position_by_currency () from public, anon;
grant execute on function public.financial_position_by_currency () to authenticated;

-- ===========================================================================
-- 5. asset_disposition_summary() -- full sale economics, for a Sold view
-- ===========================================================================
-- Deliberately separate from asset_summary(): these 9 columns are null
-- for every active asset and only ever populated for a sold one, so
-- keeping them out of the common per-asset read keeps that query lean.
-- SECURITY INVOKER is sufficient here -- it is a pure read, gated by the
-- same RLS policy on asset_dispositions as any other select.

create function public.asset_disposition_summary()
returns table (
  disposition_id uuid,
  asset_id uuid,
  asset_name text,
  asset_type text,
  occurred_at timestamptz,
  currency_code text,
  gross_proceeds text,
  selling_costs text,
  net_proceeds text,
  basis_at_sale text,
  capital_returned text,
  realised_gain_loss text,
  destination_bucket_id uuid,
  financial_event_id uuid,
  notes text,
  is_voided boolean
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    d.id,
    d.asset_id,
    a.name,
    a.asset_type,
    d.occurred_at,
    d.currency_code,
    d.gross_proceeds::text,
    d.selling_costs::text,
    d.net_proceeds::text,
    d.basis_at_sale::text,
    d.capital_returned::text,
    d.realised_gain_loss::text,
    d.destination_bucket_id,
    d.financial_event_id,
    d.notes,
    e.voided_at is not null
  from public.asset_dispositions d
  join public.assets a on a.id = d.asset_id
  join public.financial_events e on e.id = d.financial_event_id
  where d.user_id = auth.uid ()
  order by d.occurred_at desc, d.created_at desc;
$$;

comment on function public.asset_disposition_summary() is
  'Every asset sale the user has ever recorded, including voided ones (is_voided reflects the linked financial_events.voided_at) -- history is never deleted. Full sale economics (gross/costs/net/basis/capital-returned/gain-loss) for the Sold/Disposed view. See record_asset_sale() for how each figure is derived.';

revoke all on function public.asset_disposition_summary () from public, anon;
grant execute on function public.asset_disposition_summary () to authenticated;
