-- Monatriq: restrict assets.status_code to vehicle-type assets (P0-E3-S4R)
--
-- P0-E3-S4 introduced `assets.status_code` (the vehicle operational
-- lifecycle: awaiting_repair/repairing/ready_to_list/listed/
-- offer_received/under_negotiation) on the GENERIC `assets` table, with a
-- CHECK constraint limiting it to that vocabulary but with NO restriction
-- on which asset_type could hold it. Manual browser QA then found a
-- Financial Investment (and, by the same defect, every other non-vehicle
-- asset type) exposing the vehicle lifecycle status and "Record a repair
-- / improvement cost" form — the shared AssetActionSheet rendered both
-- unconditionally, and nothing in the database stopped a non-vehicle
-- asset from actually holding a vehicle status value either. See
-- docs/reports/P0-E3-S4R-asset-subtype-behavior-remediation.txt for the
-- full root-cause writeup; this migration is the database layer of that
-- remediation's required defense-in-depth (UI, domain/repository,
-- database must all independently agree).
--
-- Local Docker was inspected before writing this migration (a plain
-- `select ... where status_code is not null group by asset_type,
-- status_code` against supabase_db_Monatriq) and found ZERO existing
-- rows with status_code set at all -- local fixtures are cleaned up by
-- each test run's own teardown, so there was no legitimate data at risk
-- locally. The cleanup UPDATE below is still included, unconditionally
-- and idempotently, so this migration is also safe to apply later
-- against Monatriq Dev (or any future environment) without a separate
-- manual data-audit step first -- it only ever clears status_code itself
-- on a non-vehicle row, never asset_type, name, currency, cost basis, or
-- valuation history.

-- Defensive cleanup, applied before the constraint below so the
-- constraint can never fail to apply because of pre-existing data: any
-- non-vehicle asset with a status_code set is, by definition, exactly
-- the invalid state this migration eliminates.
update public.assets
set status_code = null
where status_code is not null and asset_type <> 'vehicle';

-- The vehicle-lifecycle vocabulary itself is still enforced by the
-- original column-level CHECK from 20260929090000 (status_code is null
-- or one of the six vehicle-status values) -- this is a SEPARATE,
-- additive table-level CHECK requiring the asset itself be a vehicle
-- whenever status_code is set. Postgres allows multiple CHECK
-- constraints on the same column; both must hold.
alter table public.assets
  add constraint assets_status_code_requires_vehicle
  check (status_code is null or asset_type = 'vehicle');

comment on constraint assets_status_code_requires_vehicle on public.assets is
  'The vehicle operational lifecycle (status_code) may only be set on a vehicle-type asset -- P0-E3-S4R remediation for vehicle-specific state leaking onto unrelated asset types.';
