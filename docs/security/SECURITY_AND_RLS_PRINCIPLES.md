# Monatriq — Security & Row Level Security Principles

Status: Canonical. Established P0-E1-S1. This is a constitution for
data-layer phases — §10 records the first concrete implementation
(`profiles`, P0-E2-S1) as a reference pattern for the financial tables that
follow it.

## 1. Default posture: deny by default

Row Level Security is non-negotiable on every user-owned table. The default
posture is **deny by default**: a table with RLS enabled and no matching
policy returns no rows and permits no writes. Policies must explicitly
grant access only when an ownership check succeeds — never the inverse
(broad access with exceptions carved out).

## 2. Ownership model

Every user-owned financial table carries an explicit ownership column:

```sql
user_id uuid not null references auth.users(id)
```

RLS policies key off `auth.uid() = user_id`. There is no implicit
ownership inferred from joins, session state, or application logic — the
column and the policy are both mandatory, together, on every such table.

## 3. What isolation must NOT rely on

Financial data isolation must never depend on any of the following as the
sole or primary control:

- client-side filtering (e.g. a query that "happens" to filter by user)
- frontend route protection (e.g. a Next.js middleware redirect)
- hidden or guessable IDs (security by obscurity)
- application-only authorization checks with no matching database policy

These may exist as UX conveniences (e.g. redirecting a logged-out user), but
they are never the isolation boundary. The database is the isolation
boundary.

## 4. No multi-user switching

There is no normal UI feature, admin surface, or debug tooling that allows
User A to view or act on User B's financial records. If a future support or
admin use case requires cross-user visibility, it must be designed
explicitly as its own reviewed feature with its own audit trail — it is
never a side effect of a generic query path.

## 5. Service-role credential rules

- The Supabase **service-role key** must never be shipped to or reachable
  from browser/client code, under any circumstance.
- Service-role operations, if ever required (e.g. a scheduled job, an
  admin-only server action), must run strictly server-side, be explicitly
  justified in code review, and remain the exception rather than the norm.
- Ordinary application reads/writes use the authenticated user's session
  (anon key + user JWT via Supabase Auth), so RLS is always in effect for
  normal traffic.

## 6. Required testing per data-layer phase

A phase that introduces or modifies user-owned financial tables is **not
complete** until all of the following pass:

1. **RLS review** — every new/changed table has RLS enabled and policies
   reviewed against §1–§2.
2. **Cross-user isolation tests** — as User A, attempt to read/list records
   that belong to User B; must return empty/denied.
3. **Adversarial direct-query tests** — attempt to query or mutate another
   user's rows directly (e.g. by ID) using an authenticated-but-unrelated
   session; must fail at the database level, not merely at the UI level.
4. **Mutation isolation tests** — attempt INSERT/UPDATE/DELETE against
   another user's records (including attempts to set `user_id` to someone
   else's ID on insert); must fail.

These tests live alongside the migrations in `supabase/tests/` (see
`supabase/tests/rls/` for the `profiles` suite and its README) and must
actually run — against a local Supabase stack at minimum — before a
data-layer phase is marked complete in
[BUILD_STATE.md](../project/BUILD_STATE.md). If no usable Supabase
environment is available to run them, the phase is PARTIAL/BLOCKED, not
complete.

## 7. Audit trail as a security property

The financial event log described in
[FINANCIAL_DOMAIN_MODEL.md §3](../architecture/FINANCIAL_DOMAIN_MODEL.md#3-financial-event-architecture)
doubles as a security property: it lets the system show, per record, which
user owned it and what mutated it. Event rows are themselves user-owned and
subject to the same RLS rules as any other financial table.

## 8. Secrets and environment

- Supabase URL + anon key are the only Supabase credentials expected in
  client-reachable environment variables.
- Service-role key, if used, lives only in server-side environment
  configuration, never committed to the repository, never logged.
- This phase does not create any `.env` files or secrets; that happens when
  the Supabase project is actually provisioned in a later phase.

## 9. Repository root (resolved P0-E1-S2)

P0-E1-S1 flagged the git repository root as `/Users/datamatics` (the home
directory) rather than the project folder. A dedicated repository now
exists at `/Users/datamatics/Monatriq` — verified at the start of every
phase since (`git rev-parse --show-toplevel`). No further action needed.

## 10. Established pattern: `profiles` (P0-E2-S1)

The first user-owned table (`supabase/migrations/*_create_profiles.sql`)
is the reference implementation for every principle above. Future
user-owned tables (Money, Assets, Goals, Decisions, Financial Rules, …)
should follow the same pattern unless a specific reason is documented for
deviating:

- **Ownership column**: for a genuine 1:1-with-user table, the primary key
  itself is the auth user id (`id uuid primary key references
  auth.users(id) on delete cascade`) rather than a separate surrogate key
  plus a unique `user_id` column — simpler policies (`auth.uid() = id`, no
  join), same guarantee. A table with a different cardinality to the user
  (many rows per user, e.g. future `transactions`) still uses §2's
  `user_id uuid not null references auth.users(id)` shape.
- **Grants, not just policies**: RLS policies restrict which *rows* a
  role can see; Postgres table/column GRANTs restrict which *operations*
  it can attempt at all. Both are used together — `authenticated` gets
  `GRANT SELECT` on the whole table but `GRANT UPDATE` on only the
  columns users may actually edit (identity/audit columns like `id` and
  `created_at` are excluded from the grant entirely, not just protected
  by a policy check). `anon` gets no grants. No `INSERT`/`DELETE` grant
  exists at all until a phase actually needs one.
- **Row creation without a client-facing INSERT policy**: rather than
  grant `authenticated` an INSERT policy (which is exactly the surface
  "insert a row for another user" attacks target), a `SECURITY DEFINER`
  trigger on `auth.users` creates the owned row as part of the signup
  transaction. See §11 for the SECURITY DEFINER rules this follows.
- **Deny-by-default extends to capabilities nobody asked for yet**: there
  is no DELETE policy or grant on `profiles` at all — not "delete your
  own row is allowed", but simply absent, because no delete flow exists
  yet. Add the grant and policy only when a real delete flow is designed.

## 11. SECURITY DEFINER functions

Avoid `SECURITY DEFINER` unless a normal RLS-scoped operation genuinely
cannot do the job (as in §10's signup trigger, which must write a row
before/independent of any client request that could carry a session).
Every `SECURITY DEFINER` function in this codebase must, at minimum:

- pin `search_path` explicitly (e.g. `set search_path = pg_catalog, public`)
  so it cannot be redirected by a caller's session-level search_path;
- do the smallest possible fixed operation — no dynamic SQL, no
  client-controllable identifiers or filters;
- have `EXECUTE` revoked from `public`/`anon`/`authenticated` unless a
  specific reason requires a role to call it directly;
- be commented in the migration explaining why it needs elevated
  privilege and what its blast radius is if misused.

## 12. Service-role usage in testing

A service-role credential may be used by a server-side test harness to
create and delete temporary auth fixture users (see
`supabase/tests/shared/`, used by both `supabase/tests/rls/` and
`supabase/tests/money/`). Rules: it is never imported by anything under
`app/` or `components/`, never prefixed `NEXT_PUBLIC_`, never committed,
and named `SUPABASE_TEST_SERVICE_ROLE_KEY` (not `SUPABASE_SERVICE_ROLE_KEY`
— renamed P0-E2-S2 specifically so it reads as obviously test-only at a
glance). The harness itself refuses to run against anything other than a
local Supabase instance (127.0.0.1/localhost) — see
`supabase/tests/shared/env.ts`. This does not change §5: the *application*
still never uses a service-role key of any name, anywhere.

## 13. Established pattern: Money domain (P0-E2-S2)

`supabase/migrations/*_create_money_domain.sql` extends §10's pattern to a
domain with foreign-key relationships between user-owned tables
(`cash_buckets` ← `cash_movements` → `financial_events`), and to functions
that need to write to more than one table atomically. Two lessons that
weren't visible with `profiles` alone:

- **Cross-tenant reference protection needs an `EXISTS` check in the
  policy, not just an ownership column.** A row's own `user_id` matching
  `auth.uid()` is not enough when the row also references *other*
  user-owned rows (a movement references a bucket and an event). Every
  INSERT policy on such a table checks both:
  `auth.uid() = user_id` **and** `exists (select 1 from
  <referenced_table> r where r.id = <fk column> and r.user_id =
  auth.uid())` for every foreign reference. Without the second check, a
  user could satisfy the first by claiming their own `user_id` while
  still pointing `bucket_id`/`event_id` at someone else's row.
- **`SECURITY INVOKER` functions need the same GRANTs a direct query
  would need — there is no free lunch.** An earlier draft of this
  migration denied `SELECT` on `cash_movements` entirely, intending to
  force all reads through text-casting functions (§ on decimal precision
  in
  [MULTI_CURRENCY_MODEL.md](../architecture/MULTI_CURRENCY_MODEL.md)).
  Those functions are `SECURITY INVOKER` (per §11's preference for
  invoker over definer) — which means they run as the calling user and
  therefore need exactly the grants a direct query would need. Without
  `GRANT SELECT`, even the user's own legitimate read failed with
  "permission denied", caught by actually running the isolation suite
  (`supabase/tests/money/run.ts`) against a real database, not by
  reasoning about the design on paper. Fixed by granting `SELECT` (RLS
  ownership scoping is the real boundary; the precision protection is an
  application-layer discipline — `lib/domain/money/repository.ts` never
  queries the raw table — not a database-enforced one). The alternative
  (making the read functions `SECURITY DEFINER` to bypass the missing
  grant) was deliberately rejected: that is exactly the "use DEFINER to
  bypass permissions" pattern §11 warns against, for a problem that a
  correctly-scoped GRANT already solves without any elevated privilege.

## 14. Established pattern: Assets domain (P0-E2-S3)

`supabase/migrations/*_create_assets_domain.sql` applies §10/§13's
patterns to a second, independent domain (`assets` ← `asset_basis_events`,
`assets` ← `asset_valuations`) — confirming they generalize rather than
being Money-specific accidents. One new lesson:

- **A trigger-derived, grant-excluded `user_id` column doesn't compose
  cleanly with direct client inserts through a generated TypeScript
  client — wrap it in a narrow RPC instead of fighting the type
  generator.** `asset_valuations.user_id` and `asset_basis_events.user_id`
  are, like `cash_movements.user_id`, derived by a trigger from the
  parent row and deliberately outside the table's INSERT column grant
  (§10's "grants, not just policies" pattern). Money never hit the
  resulting friction because `cash_movements` is only ever written by its
  `record_*` RPCs, never a direct client insert. Assets initially tried
  direct `.from("asset_valuations").insert(...)` calls for the (genuinely
  single-table, no-atomicity-needed) case of adding one more valuation to
  an existing asset — but the generated `Insert` type still marks
  `user_id` as required, so satisfying TypeScript would have meant
  sending a column the database will never actually accept. Resolved by
  adding two narrow `SECURITY INVOKER` wrapper functions
  (`record_asset_valuation()`, `record_asset_basis_event()`) that look up
  the asset scoped to `auth.uid()` (never trusting a caller-supplied
  owner) and insert only the columns actually meant to be client-settable
  — the underlying trigger and RLS policy are unchanged and still run
  regardless of which path reached the table. This is not a permissions
  workaround (the table-level grant + policy alone were already
  correctly scoped, proven by `supabase/tests/assets/run.ts`'s raw-insert
  adversarial tests, which still target the table directly); it exists
  purely to keep the TypeScript application layer honest about what it's
  allowed to send.

## 15. Established pattern: Receivables/Liabilities domain and compound operations (P0-E2-S4)

`supabase/migrations/*_create_receivables_liabilities_domain.sql` extends
§13's cross-tenant-reference pattern to two more domains and adds two new
constructs. Three lessons:

- **A grouping table's ownership check is the same EXISTS pattern as any
  other cross-domain reference — it does not need a new kind of policy.**
  `financial_operations` is user-owned exactly like any other table (§2);
  the interesting check is on `financial_events.operation_id`, whose
  INSERT policy requires
  `exists (select 1 from financial_operations o where o.id = operation_id
  and o.user_id = auth.uid())`, the same shape §13 established for
  `bucket_id`/`event_id`. `record_debt_payment()` — the only function that
  writes `financial_operations` rows — derives `user_id` from `auth.uid()`
  the same way every other `record_*` function does; no caller ever
  supplies an owner. Tested by `supabase/tests/liabilities/run.ts`'s
  raw-insert adversarial cases: a forged `financial_events` row pointing
  `operation_id` at another user's operation is rejected at the database
  layer, not just hidden in the UI.
- **Column-level GRANTs are additive, not replaced, when a migration adds
  a column to an existing table — extending a table's shape means
  extending its grant, explicitly, in the same migration.** Adding
  `financial_events.operation_id` in this migration did not automatically
  make it insertable — P0-E2-S2's original `grant insert (user_id,
  event_type, ...)` on `financial_events` still only named its original
  column list, and Postgres column-level grants do not implicitly cover
  columns added later. `record_debt_payment()`'s inserts (which explicitly
  list `operation_id`) failed with "permission denied for table
  financial_events" until this migration added its own `grant insert
  (operation_id) on public.financial_events to authenticated;` alongside
  the `ALTER TABLE ... ADD COLUMN`. Caught by running
  `supabase/tests/liabilities/run.ts` against a real database, the same
  way §13's missing-grant lesson was caught, not by reasoning about the
  grant on paper. **Rule going forward: any migration that adds a
  client-insertable column to a table with an existing column-level INSERT
  grant must add a corresponding `grant insert (<new column>)` statement
  in the same migration** — it is easy to update the table and its RLS
  policy while forgetting the grant is a separate, non-overlapping
  permission surface.
- **Correction/voiding consistency across domains is enforced by deriving
  state from the owning `financial_events` row, never by a second,
  independently-toggled flag.** A ledger row with a real cash effect
  (`receivable_ledger_events.recovery`, `liability_principal_events.draw`/
  `repayment`) carries a nullable `financial_event_id`. Every read model
  that computes a domain balance (`receivable_outstanding_amount()`,
  `liability_outstanding_principal()`, and both summary functions) joins
  to `financial_events` and excludes rows where `voided_at is not null` —
  exactly the exclusion Money's balance functions already apply (§13).
  There is deliberately no `is_voided`/`is_active` column anywhere in
  `receivable_ledger_events` or `liability_principal_events`: a second
  flag would be a second source of truth that could independently drift
  from the financial event's actual voided state, which is precisely the
  failure mode this phase's brief called out as a hard requirement to
  avoid. Voiding a `receivable_recovery` or `debt_principal_payment` event
  through the existing, unmodified `voidFinancialEvent()` mechanism (no
  domain-specific voiding function was added) therefore automatically
  keeps cash and the domain balance consistent, verified explicitly in
  both `supabase/tests/receivables/run.ts` and
  `supabase/tests/liabilities/run.ts`. See
  [FINANCIAL_DOMAIN_MODEL.md §23](../architecture/FINANCIAL_DOMAIN_MODEL.md#23-compound-financial-operations-and-voiding-consistency-p0-e2-s4)
  for the architectural rationale.
