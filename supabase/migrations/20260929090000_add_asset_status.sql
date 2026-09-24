-- Monatriq: Asset status (P0-E3-S4)
--
-- One small, non-financial, additive column: `assets.status_code`. This is
-- NOT a new financial concept — it never touches financial_events,
-- cash_movements, asset_basis_events, or asset_valuations, and it never
-- affects Net Worth, cost basis, or any valuation figure. It exists purely
-- so a user's own operational state (e.g. a vehicle held for resale moving
-- through "Awaiting Repair" -> "Repairing" -> "Ready to List" -> "Listed"
-- -> "Offer Received" -> "Under Negotiation") is real, user-driven, and
-- queryable, rather than perpetually "Status not set" or — worse —
-- inferred from valuation/repair data (explicitly forbidden: P0-E3-S4
-- brief, "Insight != status").
--
-- Deliberately EXCLUDES "Sold" from the settable vocabulary below. Setting
-- a status of "sold" with no real sale event behind it would be exactly
-- the kind of misleading lifecycle state this phase's own Asset Sale
-- section warns against (the asset must actually stop contributing to
-- current owned-asset value after a sale, per canonical lifecycle rules —
-- a status flag alone cannot do that safely). The real Asset Sale/
-- Disposal workflow is a separate, larger, deferred capability (see the
-- P0-E3-S4 report, "ASSET SALE DOMAIN GAP") that would set this
-- differently (or add its own lifecycle field) once implemented.
--
-- Uses an inline CHECK constraint, not a separate lookup table: this is a
-- small, closed, product-defined vocabulary (mirrors
-- receivable_ledger_events.ledger_event_type's own inline-CHECK
-- precedent), not an open registry users or a future migration need to
-- extend by inserting rows the way asset_types/money_received_categories
-- are.

alter table public.assets
  add column status_code text check (
    status_code is null or status_code in (
      'awaiting_repair', 'repairing', 'ready_to_list', 'listed', 'offer_received', 'under_negotiation'
    )
  );

comment on column public.assets.status_code is
  'Optional, user-driven operational status — never inferred from valuation/repair data, never affects Net Worth or any valuation figure. NULL means "Status not set". Deliberately excludes a "sold" value — see this migration''s own header comment and the P0-E3-S4 report''s Asset Sale section.';

-- The existing UPDATE grant already lists every user-settable assets
-- column (see 20260922221247_create_assets_domain.sql, section 2); this
-- adds status_code to that same additive grant. Column-level grants in
-- Postgres are additive, so this does not replace or narrow the existing
-- grant, exactly like P0-E3-S1A's own operation_id grant addition to
-- financial_events noted in its own migration.
grant update (status_code) on public.assets to authenticated;

-- asset_summary() (20260922221247) is extended to return status_code
-- alongside the existing valuation/basis columns, so the application
-- reads it from the same one already-authoritative combined read instead
-- of a second per-asset query. Every other column and the function's own
-- WHERE/JOIN structure is completely unchanged.
-- CREATE OR REPLACE cannot change a function's return type (adding
-- status_code to the output columns) — Postgres requires DROP + CREATE
-- for that, same as any other return-shape change. Nothing about this
-- drop/recreate touches the underlying tables or RLS.
drop function public.asset_summary ();

create function public.asset_summary()
returns table (
  asset_id uuid,
  asset_type text,
  name text,
  currency_code text,
  is_archived boolean,
  status_code text,
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

revoke all on function public.asset_summary () from public, anon;
grant execute on function public.asset_summary () to authenticated;
