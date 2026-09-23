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

## 16. Established pattern: Goals domain and allocation-capacity concurrency (P0-E2-S5)

`supabase/migrations/*_create_goals_domain.sql` applies §13's cross-
tenant-reference pattern to a fifth domain and adds one new lesson about
concurrency, plus two applications of already-established patterns worth
calling out explicitly:

- **Row locking is required when a capacity check and a write must be
  atomic across concurrent callers — RLS and CHECK constraints alone
  don't provide this.** `record_goal_allocation()` computes
  `available_to_allocate = bucket balance − existing allocations` and
  must reject any amount exceeding it. Without locking, two concurrent
  calls against the same bucket could both read the same "available"
  figure before either commits, and both succeed — over-allocating the
  bucket (the same cash counted for two goals, exactly what "one unit of
  money, one purpose" forbids). Every allocate/release/reallocate RPC
  therefore issues `select ... for update` on the target `cash_buckets`
  row before computing capacity: the second concurrent transaction blocks
  until the first commits, then re-reads the now-current available
  balance and correctly rejects if it no longer fits. Proven by a
  dedicated test in `supabase/tests/goals/run.ts` that fires two
  concurrent over-allocating calls via `Promise.allSettled` and asserts
  exactly one succeeds — this is a concurrency property that a
  single-threaded sequential test cannot demonstrate by accident, so the
  test deliberately runs both calls in parallel.
- **The two-EXISTS-checks-in-one-policy pattern (§13) now governs a
  table with two independent cross-tenant references in a single row.**
  `goal_allocation_events`' INSERT policy checks EXISTS on both `goal_id`
  (against `goals`) and `bucket_id` (against `cash_buckets`), each scoped
  to `auth.uid()`. This is the same shape as `cash_movements` checking
  `bucket_id`/`event_id`, just with two references from a genuinely new
  domain (Goals) into two different existing domains (itself and Money)
  simultaneously — confirming the pattern generalizes to cross-domain
  references, not just within one domain's own tables.
- **A trigger-derived, grant-excluded `user_id` column composes cleanly
  with a direct client insert here (unlike Assets §14) precisely because
  the parent `goals` row does NOT require atomic creation with a child
  row the way `receivables`/`liabilities` do.** `goals` itself keeps
  `user_id` in its INSERT grant (like `receivables`/`liabilities`) because
  its owning RPC (`create_goal()`) explicitly supplies `auth.uid()` as the
  value and a raw direct insert remains safe too (the table's CHECK
  constraints enforce every measurement-type invariant regardless of
  insert path). `goal_milestones`, by contrast, repeats the Assets §14
  lesson exactly: `user_id` is trigger-derived and grant-excluded, so
  `record_goal_milestone()` exists as a narrow wrapper purely to keep the
  generated TypeScript `Insert` type honest about what the database will
  actually accept — not because the underlying grant+policy needed fixing.

## 17. Established pattern: Financial Rules, Obligations & Safe to Deploy (P0-E2-S6)

`supabase/migrations/*_create_rules_obligations_domain.sql` reuses every
established pattern from §10-16 (rule+version history, EXISTS-based
cross-tenant checks, SECURITY INVOKER throughout, column-grant discipline)
across a sixth domain, and surfaces two new lessons plus one deliberate
design choice worth recording:

- **A `RETURNS TABLE(...)` plpgsql function's own output-column names are
  implicitly in scope as variables inside its body — and can silently
  collide with an identically-named column from a query in that body.**
  `evaluate_proposed_cash_use()` declares `currency_code` as one of its
  output columns; inside the function, `select * from safe_to_deploy_by_
  currency() where currency_code = v_bucket.currency_code` raised
  "column reference \"currency_code\" is ambiguous" — Postgres could not
  tell whether the bare `currency_code` in the `WHERE` clause meant the
  function's own implicit output variable or the called function's result
  column of the same name. Caught by running the new test suite against a
  real database (four evaluator tests failed with this exact error), fixed
  by aliasing the inner query (`... s where s.currency_code = ...`).
  **Rule going forward: any `RETURNS TABLE` plpgsql function that queries
  another relation sharing one of its own output-column names must alias
  that relation and qualify the reference explicitly** — the ambiguity is
  invisible in a `LANGUAGE SQL` function (no implicit variables exist
  there) and only appears in `LANGUAGE plpgsql` functions with a `RETURNS
  TABLE` signature.
- **A bare-integer fallback in `coalesce`/`greatest`/`least` silently
  loses NUMERIC's display scale, and this only ever surfaces once the
  result is cast to text.** `coalesce(sum(numeric_20_6_column), 0)`
  returns exactly `0` (not `0.000000`) whenever the fallback fires,
  because the literal `0` carries no scale information the way a value
  computed from a `numeric(20,6)` column does — breaking the exact-decimal
  string-transport contract (§ established throughout
  `MULTI_CURRENCY_MODEL.md §6`) the instant that result is `::text`-cast
  and compared against an expected `"0.000000"`. This affected roughly a
  dozen expressions across `goal_backed_protected_allocation()`,
  `rules_uncovered_protected_obligations()`, `safe_to_deploy_by_currency()`,
  and `evaluate_proposed_cash_use()` simultaneously — caught the same way,
  by running the real test suite rather than reasoning about the SQL on
  paper. Fixed by casting every such fallback explicitly:
  `coalesce(..., 0::numeric(20, 6))`. **Rule going forward: any bare `0`
  literal used as a fallback/floor/ceiling in an expression that will be
  `::text`-cast for monetary display must be written `0::numeric(20, 6)`,
  never a bare literal.**
- **Deterministic, documented precedence instead of an invented one, for
  a genuinely underdetermined case.** When a cash bucket cannot fully back
  all of its protected goal allocations, `goal_backed_protected_
  allocation()` splits the bucket's actually-backed total across the
  competing protected goals by pro-rata share, not by an arbitrary
  priority order — a deliberate response to the phase brief's explicit
  "avoid inventing priority where possible" instruction. This is a
  product/financial-modeling decision, not a security control, but it is
  recorded here because it is exactly the kind of "smallest strong
  foundation, no invented heuristic" discipline this document's Financial
  Rules sections (§ established pattern list) already expect of RLS/grant
  design, applied to calculation design instead.

## 18. Established pattern: parameterized hypothetical-state functions (P0-E2-S6A)

`supabase/migrations/*_harden_safe_to_deploy_evaluator.sql` removes a
documented second-order limitation in `evaluate_proposed_cash_use()` by
giving `goal_backed_protected_allocation()`, `rules_uncovered_protected_
obligations()`, and `safe_to_deploy_by_currency()` two new optional
parameters (`p_hypothetical_bucket_id`, `p_hypothetical_delta`,
defaulting to `null`/`0`) rather than writing a second, evaluator-specific
formula. Two lessons:

- **Changing a function's parameter list requires DROP + CREATE, not
  CREATE OR REPLACE — Postgres identifies a function by name AND
  signature.** `CREATE OR REPLACE FUNCTION safe_to_deploy_by_currency(a
  uuid default null, b numeric default 0)` when a zero-argument
  `safe_to_deploy_by_currency()` already exists does not replace it — it
  creates a SECOND, overloaded function, and a bare `safe_to_deploy_by_
  currency()` call then becomes genuinely ambiguous between "call the
  zero-arg version" and "call the two-arg version with both defaults,"
  which Postgres correctly refuses to resolve. Every function whose
  signature changed this migration is explicitly `DROP FUNCTION`ed by its
  exact prior signature before being recreated, and re-granted from
  scratch (a dropped function's grants do not carry over to its
  replacement). **Rule going forward: adding a parameter to an existing
  function — even an optional, defaulted one — needs an explicit `DROP
  FUNCTION <name>(<old signature>);` in the same migration, not a bare
  `CREATE OR REPLACE`.**
- **A hypothetical-bucket lookup must be independently scoped to
  `auth.uid ()`, exactly like a real one, even though the calling
  function already validated ownership before reaching it.** Every place
  `p_hypothetical_bucket_id` is resolved to a currency or a balance (the
  `hypothetical_adjustment` CTE in `safe_to_deploy_by_currency()`, the
  `case when n.bucket_id = p_hypothetical_bucket_id` branch inside
  `goal_backed_protected_allocation()`) re-applies `b.user_id = auth.uid
  ()` or is scoped through a table that already carries that condition —
  so a hypothetical bucket ID belonging to another user (reachable only
  if some future caller invoked these helpers directly, bypassing
  `evaluate_proposed_cash_use()`'s own ownership check) silently
  contributes zero adjustment rather than leaking that user's balance or
  erroring. Defense-in-depth, not a substitute for the entrypoint's own
  check, which remains mandatory and unchanged.

A second, unrelated lesson surfaced by the same migration's test suite,
extending §17's NUMERIC-scale lesson: **NUMERIC division intentionally
produces MORE decimal digits than either operand, and this only surfaces
once the result is cast to text.** `goal_backed_protected_allocation()`'s
pro-rata branch (`nominal_amount * LEAST(balance, protected_total) /
protected_total`) produced values like `"1000.0000000000000000"` instead
of the codebase's `"1000.000000"` convention — caught by the new
worked-case tests, fixed by wrapping the division in `round(..., 6)`.
**Rule going forward: any NUMERIC division whose result will be
`::text`-cast for monetary display must be wrapped in `round(..., 6)`
(or the currency's actual decimal places, where known) — unlike
multiplication, addition, or subtraction, division does not preserve the
operands' scale.**

## 19. Established pattern: Decisions engine (P0-E2-S7)

`supabase/migrations/*_create_decisions_domain.sql` reuses every
established pattern from §10-18 across a seventh domain, and surfaces
one new plpgsql lesson:

- **A plpgsql `RECORD` variable that no `SELECT INTO` has ever touched
  has no defined row structure at all — referencing any of its fields
  raises "record is not assigned yet," a different failure mode from a
  query that ran but matched zero rows (which correctly leaves every
  field NULL while the record itself stays valid and readable).**
  `evaluate_decision_scenario()` conditionally populated `v_asset`/
  `v_hyp` only inside `if <condition> is not null then select ... into
  v_asset/v_hyp ... end if` blocks — when the condition was false (no
  linked asset, no bucket to evaluate), the variable was never assigned
  at all, and the function's own `RETURN QUERY SELECT` (which
  unconditionally reads `v_asset.cost_basis`, `v_hyp.minimum_cash_floor_
  status`, etc.) failed outright. Caught by the new test suite's cases
  with no linked asset/no bucket (four failures, all "record ... is not
  assigned yet"), fixed two different ways depending on whether the
  underlying call can safely run unconditionally: `v_asset` comes from
  `asset_summary()`, which never raises for a filter that matches zero
  rows, so removing its `if` guard entirely and letting `where asset_id
  = <possibly null>` naturally return no rows was sufficient. `v_hyp`
  comes from `evaluate_hypothetical_bucket_liquidity()`, which DOES
  raise an exception for a bucket it can't find (by design — see §12's
  ownership-check discipline), so it cannot be called unconditionally
  with a possibly-null id; its `else` branch instead assigns `v_hyp` an
  explicit all-null row via `SELECT null::uuid AS bucket_id, null::text
  AS currency_code, ... INTO v_hyp` — critically, WITH explicit column
  aliases matching the real function's output names exactly, since a
  record populated from unaliased literals has no named fields at all
  and every `v_hyp.<field>` reference would still fail, just with a
  different error ("record has no field ..."), caught by a second round
  of the same tests. **Rule going forward: any plpgsql `RECORD` variable
  that is only conditionally populated must have an unconditional
  fallback assignment (either by removing the guard when the source
  query is safe to run empty, or via an explicitly-column-aliased
  literal `SELECT ... INTO`) before any of its fields are referenced
  outside the block that populated it — a bare `IF ... THEN SELECT ...
  INTO v_x; END IF;` with no `ELSE` is never safe if `v_x` is read
  later unconditionally.**
