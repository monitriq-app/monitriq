# Monatriq — Security & Row Level Security Principles

Status: Canonical. Established P0-E1-S1. This is a constitution for future
data-layer phases, not an implementation record — no tables or policies
exist yet.

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

These tests are expected to live alongside the migrations in
`supabase/tests/` (per the proposed layout in
[SYSTEM_ARCHITECTURE.md §2](../architecture/SYSTEM_ARCHITECTURE.md#2-repository-layout-proposed-for-future-phases))
and run before a data-layer phase is marked complete in
[BUILD_STATE.md](../project/BUILD_STATE.md).

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

## 9. Known repository risk (flagged this phase, not fixed)

The git repository root for this project was found to be `/Users/datamatics`
(the user's home directory), not `/Users/datamatics/Monatriq`. See
[BUILD_STATE.md — Risks](../project/BUILD_STATE.md) and the phase report for
detail. This is a source-control hygiene risk (a broad `git add`/`commit -a`
from home could sweep in unrelated files or secrets from other projects) —
it is not itself an application security defect, but it is recorded here
because any future `.env`/secrets handling must account for it until
resolved.
