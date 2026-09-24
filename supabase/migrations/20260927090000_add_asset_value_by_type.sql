-- Monatriq: asset value grouped by type (P0-E3-S2)
--
-- Home's "Where Your Capital Lives" needs current asset value grouped by
-- asset_type AND currency_code -- a genuinely missing capability
-- (asset_native_currency_totals() only groups by currency, combining
-- every type together). This is the smallest possible addition: the
-- exact same "latest estimated_current_value, non-archived, never
-- target_value/quick_sale_estimate" subquery asset_native_currency_
-- totals() already uses (see that function's own comment,
-- 20260922221247_create_assets_domain.sql), with one more GROUP BY key.
-- No new valuation formula; no independent current-value derivation.

create function public.asset_value_by_type()
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
    order by v.asset_id, v.valued_at desc, v.created_at desc
  ) latest
  group by latest.asset_type, latest.currency_code;
$$;

comment on function public.asset_value_by_type() is
  'Current (latest estimated_current_value) asset value grouped by asset_type and native currency, excluding archived assets -- the same semantics as asset_native_currency_totals(), with type added as a second grouping key. Added for Home''s "Where Your Capital Lives" (P0-E3-S2); never a second valuation formula.';

revoke all on function public.asset_value_by_type() from public, anon;
grant execute on function public.asset_value_by_type() to authenticated;
