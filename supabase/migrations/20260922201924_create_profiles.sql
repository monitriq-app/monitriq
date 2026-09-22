-- Monatriq: profiles domain (P0-E2-S1)
--
-- Design decisions (see docs/reports/P0-E2-S1-profile-rls-foundation.txt
-- and docs/architecture/FINANCIAL_DOMAIN_MODEL.md for full rationale):
--
-- 1. profiles.id IS the auth user id (PK = FK to auth.users.id), not a
--    separate surrogate id plus a unique user_id column. A profile is a
--    genuine 1:1 extension of an auth user, so the identity IS the auth
--    user's id. This lets every RLS policy be the simplest possible
--    correct expression: `auth.uid() = id`, with no join.
--
-- 2. preferred_currency and timezone are NULLABLE with no default. A
--    profile row is created immediately at signup (see the trigger
--    below), before the user has told us anything about themselves.
--    Giving these a NOT NULL / default value at that point would force a
--    fabricated default (e.g. NGN, Africa/Lagos) onto every new user,
--    which docs/product/PRODUCT_DEFINITION.md and
--    docs/architecture/FINANCIAL_DOMAIN_MODEL.md explicitly forbid
--    ("unknown remains unknown until supplied"). Onboarding fills them in.
--
-- 3. onboarding_completed is a STORED GENERATED column, not a
--    hand-maintained boolean. It is derived purely from other columns on
--    the same row (first_name, preferred_currency, timezone all present),
--    so it can never drift out of sync with the fields it summarizes, and
--    it makes "required currency once onboarding is complete" true by
--    construction rather than a separately-enforced constraint.
--
-- 4. Profile rows are created exclusively by a SECURITY DEFINER trigger
--    on auth.users (see handle_new_user below). Authenticated users have
--    NO insert grant on public.profiles at all -- there is no INSERT
--    policy and no INSERT permission. This is deliberate: it makes
--    "insert a profile for another user" and "insert a profile with a
--    forged id" structurally impossible, not just something a policy
--    happens to reject.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  first_name text,
  preferred_name text,

  preferred_currency text,
  timezone text,

  onboarding_completed boolean generated always as (
    first_name is not null
    and preferred_currency is not null
    and timezone is not null
  ) stored not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_first_name_length check (
    first_name is null or char_length(first_name) between 1 and 100
  ),
  constraint profiles_preferred_name_length check (
    preferred_name is null or char_length(preferred_name) between 1 and 100
  ),
  -- ISO 4217-shaped currency code (three uppercase letters). This is a
  -- cheap DB-layer format backstop, not full ISO 4217 membership
  -- validation -- the canonical, maintainable currency list lives in the
  -- application layer (lib/domain will own it once Money exists), so it
  -- can be extended without a migration. See
  -- docs/architecture/FINANCIAL_DOMAIN_MODEL.md #6 (currency).
  constraint profiles_preferred_currency_format check (
    preferred_currency is null or preferred_currency ~ '^[A-Z]{3}$'
  )
);

comment on table public.profiles is
  'One row per authenticated user (1:1 with auth.users). Created automatically at signup by handle_new_user(); onboarding fields start null and are filled in by the user. See docs/architecture/FINANCIAL_DOMAIN_MODEL.md.';
comment on column public.profiles.id is
  'Equal to auth.users.id. Not a separate surrogate key.';
comment on column public.profiles.onboarding_completed is
  'Derived (generated) from first_name/preferred_currency/timezone. Never set directly.';

-- ---------------------------------------------------------------------
-- updated_at maintenance + timezone validation trigger
--
-- A single small BEFORE UPDATE trigger. Not SECURITY DEFINER -- it only
-- ever needs to act on the row already being written by the invoking
-- role, so it runs with the invoking user's own privileges (the default).
-- search_path is still pinned defensively, and all references are
-- schema-qualified, even though the elevated-privilege risk that
-- search_path pinning primarily guards against does not apply to a
-- non-SECURITY-DEFINER function.
--
-- IANA timezone validation: Postgres CHECK constraints cannot run
-- subqueries, so real IANA-name validity can't be expressed as a CHECK.
-- Instead this trigger asks Postgres's own timezone engine to resolve the
-- value (`now() at time zone new.timezone`); an unrecognised zone name
-- makes Postgres itself raise "time zone ... not recognized", aborting
-- the write. This is stricter and more current than a hand-maintained
-- regex or list. The application still validates the value before
-- sending it (see lib/domain), this is a backstop invariant.
-- ---------------------------------------------------------------------
create function public.set_profile_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.timezone is not null then
    perform now() at time zone new.timezone;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_profile_metadata() is
  'BEFORE UPDATE trigger for public.profiles: validates timezone against Postgres''s own tz database and refreshes updated_at. Runs as the invoking role (not SECURITY DEFINER).';

create trigger profiles_set_metadata
  before update on public.profiles
  for each row
  execute function public.set_profile_metadata();

-- Apply the same timezone validation on insert (the handle_new_user
-- trigger always inserts a null timezone today, but this keeps the
-- invariant true regardless of how a row is ever inserted in future).
create trigger profiles_validate_insert
  before insert on public.profiles
  for each row
  execute function public.set_profile_metadata();

-- ---------------------------------------------------------------------
-- Row Level Security: deny by default, minimum policies to let a user
-- manage their own profile.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Local Supabase's default template does not auto-expose new tables to
-- the Data API roles (see supabase/config.toml, auto_expose_new_tables).
-- These REVOKEs are still stated explicitly rather than relied upon
-- implicitly, so this migration is correct and self-documenting
-- regardless of what a future or differently-configured project defaults
-- to.
revoke all on public.profiles from anon, authenticated;

grant select on public.profiles to authenticated;

-- Column-level UPDATE grant: authenticated users may only ever write the
-- fields that are actually theirs to edit. id, created_at, and
-- onboarding_completed are excluded from the grant entirely -- a client
-- attempting to include them in an UPDATE's SET list fails with
-- "permission denied for column ..." before RLS is even evaluated. This
-- is defense in depth on top of the WITH CHECK clause below, specifically
-- against ownership-reassignment attacks (id) and audit-trail tampering
-- (created_at). updated_at is excluded too: it is maintained solely by
-- the trigger above.
grant update (first_name, preferred_name, preferred_currency, timezone)
  on public.profiles to authenticated;

-- No insert grant, no delete grant, nothing granted to anon. Deny by
-- default; only the two policies below exist.

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid () = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid () = id)
  with check (auth.uid () = id);

-- ---------------------------------------------------------------------
-- Profile creation: SECURITY DEFINER trigger on auth.users.
--
-- Why a trigger rather than a server-side flow (option A) or a
-- client-callable RPC (option C):
--   - Option A (create the profile from application code right after
--     signup) has a real failure mode: if the client crashes, loses
--     network, or the request is dropped between "auth user created" and
--     "profile insert call", the user is left permanently authenticated
--     with no profile row, and every later page load must handle that
--     missing-row case anyway.
--   - Option C (an RPC the client calls once, protected by RLS/ownership
--     checks) still depends on the client actually calling it, has the
--     same orphaned-user failure mode, and additionally needs its own
--     INSERT policy on profiles -- which is exactly the attack surface
--     ("insert a profile for another user") this design wants to close
--     entirely.
--   - Option B (this trigger) runs inside the same transaction Supabase
--     Auth uses to create the auth.users row. It cannot be skipped by a
--     dropped client request, and because authenticated users are never
--     granted INSERT on public.profiles, there is no other way a profile
--     row can be created at all.
--
-- Why SECURITY DEFINER is necessary and how its blast radius is limited:
--   - The trigger fires as part of Supabase Auth's own write to
--     auth.users, executed by the `supabase_auth_admin` role, which has
--     no grants on public.profiles. Without SECURITY DEFINER the insert
--     would simply fail for every signup.
--   - search_path is pinned to a fixed, schema-qualified value so the
--     function cannot be tricked by a session-level search_path into
--     resolving `public.profiles` to an attacker-created object.
--   - The function performs exactly one fixed-shape INSERT with no
--     dynamic SQL and no client-supplied values beyond the new auth
--     user's own id (NEW.id), which the function did not choose and
--     cannot be influenced by anything the inserting session sends
--     beyond signing up as themselves. ON CONFLICT DO NOTHING makes it
--     idempotent if it is ever invoked twice for the same user.
--   - EXECUTE on this function is not granted to anon or authenticated;
--     it is only ever invoked implicitly by the trigger mechanism.
-- ---------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'SECURITY DEFINER: creates a public.profiles row for every new auth.users row. Fixed single-statement insert, no client-controllable SQL. See migration file header for full rationale.';

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
