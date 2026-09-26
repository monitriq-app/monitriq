-- P0-E5-S5: adaptive financial language. ONE financial engine, three
-- explanation styles: the user's preference changes wording only, never a
-- calculation, permission or feature.
--
-- Smallest safe change: one constrained column on the existing profiles
-- table (no new table). The stored value is a stable canonical code, never
-- a display label.
--   simple   = "Keep it simple"   (everyday words, clear explanations)
--   balanced = "Balanced"         (simple explanations, terms when useful)
--   financial = "Financial terms" (traditional financial wording, more detail)
--
-- NOT NULL DEFAULT 'simple': new users get 'simple' from handle_new_user()'s
-- insert (which never names this column), and every existing profile row is
-- backfilled to 'simple' by the default, so no existing user can be blocked
-- by this migration and no profile can ever hold a missing value.

alter table public.profiles
  add column financial_language_mode text not null default 'simple';

alter table public.profiles
  add constraint profiles_financial_language_mode_check
  check (financial_language_mode in ('simple', 'balanced', 'financial'));

comment on column public.profiles.financial_language_mode is
  'How the user wants Monitriq to explain money: simple | balanced | financial. Presentation only -- never changes a calculation, permission or feature. Defaults to simple.';

-- Ownership is unchanged: profiles_update_own (auth.uid() = id) still
-- governs every update. Only the column-level UPDATE grant needs extending,
-- so the established profile boundary (updateProfile) can write it. anon has
-- no grants on profiles at all, so anonymous callers still cannot read or
-- update it.
grant update (financial_language_mode) on public.profiles to authenticated;
