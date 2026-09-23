-- Monatriq: Safe-to-Deploy evaluator consistency hardening (P0-E2-S6A)
--
-- Full design rationale in docs/architecture/FINANCIAL_DOMAIN_MODEL.md and
-- docs/reports/P0-E2-S6A-safe-to-deploy-evaluator-hardening.txt.
--
-- REMOVES the second-order limitation P0-E2-S6 documented and accepted:
-- evaluate_proposed_cash_use() previously patched protected_goal_cash
-- locally (this bucket's own delta only) while leaving
-- uncovered_protected_obligations UNCHANGED from the "before" state --
-- correct only when the affected goal is funded from a single bucket, and
-- silently wrong whenever it is funded from several.
--
-- ONE CALCULATION MODEL: rather than duplicating the Safe-to-Deploy
-- formula into a second "evaluator formula," every function in the
-- dependency chain (goal_backed_protected_allocation ->
-- rules_uncovered_protected_obligations -> safe_to_deploy_by_currency)
-- gains two optional parameters, p_hypothetical_bucket_id and
-- p_hypothetical_delta, defaulting to null/0. With no arguments, every
-- one of these functions computes EXACTLY the real current state, byte-
-- identical to P0-E2-S6's behavior -- verified by the full P0-E2-S6 test
-- suite still passing unmodified. evaluate_proposed_cash_use() now calls
-- safe_to_deploy_by_currency() TWICE: once with no arguments (the real
-- "before" state) and once with the proposed bucket and a negative delta
-- (the hypothetical "after" state) -- both calls run the identical SQL,
-- so there is no second formula to drift out of sync with the first.
--
-- The hypothetical override is applied at exactly one point: the balance
-- of ONE bucket, inside the innermost balance-computing subqueries. Every
-- downstream computation -- per-bucket protected backing, per-goal
-- pro-rata backed allocation (correctly reading every OTHER bucket
-- funding that same goal at its REAL, unmodified balance), per-goal
-- obligation coverage aggregated across every linked obligation, and the
-- final currency-level formula -- flows from that one adjusted number
-- through completely unmodified logic. This is what makes a goal funded
-- from multiple buckets, and multiple obligations sharing one goal, all
-- recompute correctly without any bespoke evaluator-side logic.
--
-- Because the hypothetical override changes a function's PARAMETER LIST
-- (not just its body), each affected function is DROPped and recreated
-- rather than CREATE OR REPLACEd -- Postgres identifies a function by
-- name+signature, and a bare CREATE OR REPLACE with different parameters
-- would create a second, ambiguously-overloaded function rather than
-- replace the first.
--
-- Every hypothetical-bucket lookup is independently scoped to
-- `user_id = auth.uid ()`, exactly like every other query in this
-- codebase -- pointing the override at a bucket that is not the caller's
-- own silently contributes nothing (never an error, never another
-- tenant's data), and the caller-facing entrypoint
-- (evaluate_proposed_cash_use()) already validates bucket ownership
-- before these helpers are ever invoked.
--
-- ALL SECURITY INVOKER, same discipline as every prior domain. No
-- elevated privilege anywhere in this migration. No table is added,
-- altered, or dropped -- this is a pure calculation-logic hardening.

-- ===========================================================================
-- 1. goal_backed_protected_allocation -- hypothetical-aware
-- ===========================================================================

drop function public.goal_backed_protected_allocation (uuid);

create function public.goal_backed_protected_allocation(
  p_goal_id uuid,
  p_hypothetical_bucket_id uuid default null,
  p_hypothetical_delta numeric default 0
)
returns numeric
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  with nominal as (
    select a.bucket_id, sum(a.amount) as nominal_amount
    from public.goal_allocation_events a
    join public.goals g on g.id = a.goal_id
    where a.goal_id = p_goal_id and g.is_protected = true
    group by a.bucket_id
  ),
  bucket_totals as (
    select
      n.bucket_id,
      -- The hypothetical delta applies ONLY to the one matching bucket;
      -- every other bucket funding this goal is read at its real,
      -- unmodified balance -- this is exactly what makes multi-bucket
      -- goal funding recompute correctly.
      greatest(
        coalesce((
          select sum(m.amount) from public.cash_movements m
          join public.financial_events e on e.id = m.event_id
          where m.bucket_id = n.bucket_id and e.voided_at is null
        ), 0::numeric(20, 6))
        + case when n.bucket_id = p_hypothetical_bucket_id then p_hypothetical_delta else 0::numeric(20, 6) end,
        0::numeric(20, 6)
      ) as balance,
      coalesce((
        select sum(a.amount) from public.goal_allocation_events a
        join public.goals g on g.id = a.goal_id
        where a.bucket_id = n.bucket_id and g.is_protected = true
      ), 0::numeric(20, 6)) as protected_total
    from nominal n
  )
  select coalesce(sum(
    case
      when bt.protected_total <= 0 then 0::numeric(20, 6)
      when bt.protected_total <= bt.balance then n.nominal_amount
      -- NUMERIC division intentionally produces MORE decimal digits than
      -- either operand (unlike multiplication/addition/subtraction, which
      -- preserve scale exactly) -- left unrounded, this silently expands
      -- to e.g. "1000.0000000000000000" once summed and cast to text,
      -- breaking the numeric(20,6) exact-decimal-string contract every
      -- other read function in this codebase relies on. round(..., 6)
      -- forces the result back to the same 6-decimal-place convention.
      else round(n.nominal_amount * least(bt.balance, bt.protected_total) / bt.protected_total, 6)
    end
  ), 0::numeric(20, 6))
  from nominal n
  join bucket_totals bt on bt.bucket_id = n.bucket_id;
$$;

revoke all on function public.goal_backed_protected_allocation(uuid, uuid, numeric) from public, anon;
grant execute on function public.goal_backed_protected_allocation(uuid, uuid, numeric) to authenticated;

-- ===========================================================================
-- 2. rules_uncovered_protected_obligations -- hypothetical-aware
-- ===========================================================================
-- Unchanged aggregate-per-goal-before-comparing-to-backing rule from
-- P0-E2-S6 (multiple obligations sharing one goal are still combined
-- first) -- only the backing figure now optionally reflects the
-- hypothetical bucket override, threaded straight through.

drop function public.rules_uncovered_protected_obligations ();

create function public.rules_uncovered_protected_obligations(
  p_hypothetical_bucket_id uuid default null,
  p_hypothetical_delta numeric default 0
)
returns table (currency_code text, uncovered_amount numeric)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  with linked_totals as (
    select o.currency_code, o.funding_goal_id, sum(o.amount) as linked_total
    from public.obligations o
    where o.user_id = auth.uid ()
      and o.is_protected = true
      and o.status = 'active'
      and o.funding_goal_id is not null
    group by o.currency_code, o.funding_goal_id
  ),
  linked_uncovered as (
    select
      l.currency_code,
      greatest(
        l.linked_total - public.goal_backed_protected_allocation (l.funding_goal_id, p_hypothetical_bucket_id, p_hypothetical_delta),
        0::numeric(20, 6)
      ) as uncovered
    from linked_totals l
  ),
  unlinked as (
    select o.currency_code, sum(o.amount) as uncovered
    from public.obligations o
    where o.user_id = auth.uid ()
      and o.is_protected = true
      and o.status = 'active'
      and o.funding_goal_id is null
    group by o.currency_code
  ),
  combined as (
    select * from linked_uncovered
    union all
    select * from unlinked
  )
  select currency_code, sum(uncovered) from combined group by currency_code;
$$;

revoke all on function public.rules_uncovered_protected_obligations(uuid, numeric) from public, anon;
grant execute on function public.rules_uncovered_protected_obligations(uuid, numeric) to authenticated;

-- ===========================================================================
-- 3. safe_to_deploy_by_currency -- the ONE shared authoritative formula
-- ===========================================================================
-- With no arguments (the default), this is byte-identical to P0-E2-S6's
-- real-state calculation -- verified by the unmodified P0-E2-S6 test
-- suite still passing. With p_hypothetical_bucket_id/p_hypothetical_delta
-- supplied, the SAME query computes the full, correct hypothetical state
-- for every currency (the caller filters to the one it needs) -- this is
-- the shared calculation evaluate_proposed_cash_use() now consumes
-- instead of hand-patching a second formula.

drop function public.safe_to_deploy_by_currency ();

create function public.safe_to_deploy_by_currency(
  p_hypothetical_bucket_id uuid default null,
  p_hypothetical_delta numeric default 0
)
returns table (
  currency_code text,
  status text,
  liquid_cash text,
  protected_goal_cash text,
  uncovered_protected_obligations text,
  protected_commitments text,
  minimum_cash_floor text,
  required_retained_cash text,
  safe_to_deploy text,
  retained_deficit text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  with real_cash as (
    select m.currency_code, sum(m.amount) as amount
    from public.cash_movements m
    join public.financial_events e on e.id = m.event_id
    where m.user_id = auth.uid () and e.voided_at is null
    group by m.currency_code
  ),
  -- Contributes the hypothetical delta to exactly the ONE bucket's own
  -- currency, scoped to the caller -- and contributes nothing at all
  -- when p_hypothetical_bucket_id is null or belongs to someone else.
  hypothetical_adjustment as (
    select b.currency_code, p_hypothetical_delta as amount
    from public.cash_buckets b
    where b.id = p_hypothetical_bucket_id and b.user_id = auth.uid ()
  ),
  cash as (
    select currency_code, sum(amount) as amount
    from (select * from real_cash union all select * from hypothetical_adjustment) combined_cash
    group by currency_code
  ),
  protected_backing as (
    select b.currency_code, sum(least(pt.protected_total, bal.balance)) as amount
    from public.cash_buckets b
    join lateral (
      select coalesce(sum(a.amount), 0::numeric(20, 6)) as protected_total
      from public.goal_allocation_events a
      join public.goals g on g.id = a.goal_id
      where a.bucket_id = b.id and g.is_protected = true
    ) pt on true
    join lateral (
      select greatest(
        coalesce(sum(m.amount), 0::numeric(20, 6))
        + case when b.id = p_hypothetical_bucket_id then p_hypothetical_delta else 0::numeric(20, 6) end,
        0::numeric(20, 6)
      ) as balance
      from public.cash_movements m
      join public.financial_events e on e.id = m.event_id
      where m.bucket_id = b.id and e.voided_at is null
    ) bal on true
    where b.user_id = auth.uid ()
    group by b.currency_code
  ),
  uncovered_obligations as (
    select * from public.rules_uncovered_protected_obligations (p_hypothetical_bucket_id, p_hypothetical_delta)
  ),
  floors as (
    select r.currency_code, v.threshold_value as amount
    from public.financial_rules r
    join lateral (
      select threshold_value from public.financial_rule_versions
      where rule_id = r.id
      order by effective_at desc, created_at desc
      limit 1
    ) v on true
    where r.user_id = auth.uid () and r.rule_type = 'minimum_cash_floor' and r.status = 'active'
  ),
  relevant_currencies as (
    select currency_code from cash
    union
    select currency_code from floors
  )
  select
    c.currency_code,
    case when f.amount is null then 'not_configured' else 'calculated' end,
    coalesce(cs.amount, 0::numeric(20, 6))::text,
    coalesce(pb.amount, 0::numeric(20, 6))::text,
    coalesce(uo.uncovered_amount, 0::numeric(20, 6))::text,
    (coalesce(pb.amount, 0::numeric(20, 6)) + coalesce(uo.uncovered_amount, 0::numeric(20, 6)))::text,
    case when f.amount is null then null else f.amount::text end,
    case when f.amount is null then null
      else greatest(f.amount, coalesce(pb.amount, 0::numeric(20, 6)) + coalesce(uo.uncovered_amount, 0::numeric(20, 6)))::text end,
    case when f.amount is null then null
      else greatest(
        coalesce(cs.amount, 0::numeric(20, 6)) - greatest(f.amount, coalesce(pb.amount, 0::numeric(20, 6)) + coalesce(uo.uncovered_amount, 0::numeric(20, 6))),
        0::numeric(20, 6)
      )::text end,
    case when f.amount is null then null
      else greatest(
        greatest(f.amount, coalesce(pb.amount, 0::numeric(20, 6)) + coalesce(uo.uncovered_amount, 0::numeric(20, 6))) - coalesce(cs.amount, 0::numeric(20, 6)),
        0::numeric(20, 6)
      )::text end
  from relevant_currencies c
  left join cash cs on cs.currency_code = c.currency_code
  left join protected_backing pb on pb.currency_code = c.currency_code
  left join uncovered_obligations uo on uo.currency_code = c.currency_code
  left join floors f on f.currency_code = c.currency_code;
$$;

revoke all on function public.safe_to_deploy_by_currency(uuid, numeric) from public, anon;
grant execute on function public.safe_to_deploy_by_currency(uuid, numeric) to authenticated;

-- ===========================================================================
-- 4. evaluate_proposed_cash_use -- now a thin before/after comparison
-- ===========================================================================
-- No independent formula left here at all: "before" is
-- safe_to_deploy_by_currency() with no arguments, "after" is the same
-- function with this bucket's proposed spend applied as a hypothetical
-- delta. Every returned figure is either read directly from one of those
-- two calls or a simple, bucket-local comparison (current/post-use
-- balance and this bucket's own allocation shortfall, which were never
-- part of the documented limitation). Still a pure read: this function
-- writes nothing anywhere, unchanged from P0-E2-S6.

drop function public.evaluate_proposed_cash_use (uuid, numeric);

create function public.evaluate_proposed_cash_use(p_bucket_id uuid, p_amount numeric)
returns table (
  bucket_id uuid,
  currency_code text,
  current_balance text,
  proposed_amount text,
  post_use_balance text,
  current_protected_allocation text,
  current_allocation_shortfall text,
  post_use_allocation_shortfall text,
  currency_safe_to_deploy_before text,
  currency_safe_to_deploy_after text,
  -- The full recomputed hypothetical state, exposed directly (not just
  -- folded into the neutral labels below) so the calculation stays
  -- inspectable and independently testable -- the same "make the
  -- calculation inspectable, not a mysterious final number" principle
  -- P0-E2-S6's Safe-to-Deploy panel already follows.
  protected_goal_cash_after text,
  uncovered_protected_obligations_after text,
  protected_commitments_after text,
  minimum_cash_floor_status text,
  protected_goal_status text,
  protected_obligation_status text,
  retained_deficit_after text
)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_bucket public.cash_buckets;
  v_balance numeric;
  v_protected_total numeric;
  v_post_balance numeric;
  v_before record;
  v_after record;
  v_uncovered_before numeric;
  v_uncovered_after numeric;
  v_pgc_before numeric;
  v_pgc_after numeric;
  v_floor_status text;
  v_obligation_status text;
begin
  if p_amount <= 0 then
    raise exception 'proposed amount must be positive';
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;

  select coalesce(sum(m.amount), 0::numeric(20, 6)) into v_balance
    from public.cash_movements m
    join public.financial_events e on e.id = m.event_id
    where m.bucket_id = p_bucket_id and e.voided_at is null;

  select coalesce(sum(a.amount), 0::numeric(20, 6)) into v_protected_total
    from public.goal_allocation_events a
    join public.goals g on g.id = a.goal_id
    where a.bucket_id = p_bucket_id and g.is_protected = true;

  v_post_balance := v_balance - p_amount;

  -- Aliased explicitly -- see the P0-E2-S6 lesson recorded in
  -- docs/security/SECURITY_AND_RLS_PRINCIPLES.md §17: this function's own
  -- RETURNS TABLE declares a currency_code output column, which plpgsql
  -- exposes as an implicit variable in scope.
  select * into v_before from public.safe_to_deploy_by_currency () s where s.currency_code = v_bucket.currency_code;
  select * into v_after from public.safe_to_deploy_by_currency (p_bucket_id, -p_amount) s where s.currency_code = v_bucket.currency_code;

  v_uncovered_before := coalesce(v_before.uncovered_protected_obligations::numeric, 0::numeric(20, 6));
  v_uncovered_after := coalesce(v_after.uncovered_protected_obligations::numeric, 0::numeric(20, 6));
  v_pgc_before := coalesce(v_before.protected_goal_cash::numeric, 0::numeric(20, 6));
  v_pgc_after := coalesce(v_after.protected_goal_cash::numeric, 0::numeric(20, 6));

  if v_before is null or v_before.status = 'not_configured' then
    v_floor_status := 'not_configured';
  elsif (v_before.liquid_cash::numeric - p_amount) < v_before.minimum_cash_floor::numeric then
    v_floor_status := 'conflict';
  elsif v_after.safe_to_deploy::numeric < v_before.safe_to_deploy::numeric then
    v_floor_status := 'attention';
  else
    v_floor_status := 'aligned';
  end if;

  -- protected_obligation_status now reflects the FULL, correctly
  -- recomputed hypothetical obligation-coverage result -- not the
  -- coarse "does this bucket fund some linked obligation" heuristic
  -- P0-E2-S6 used. conflict: the proposed use creates or worsens
  -- uncovered protected obligations (a direct coverage failure).
  -- attention: protected liquidity for this currency decreases without
  -- an outright coverage failure -- a factual, evidence-based signal
  -- (protected_goal_cash going down), never an invented percentage
  -- threshold. aligned: neither.
  if v_uncovered_after > v_uncovered_before then
    v_obligation_status := 'conflict';
  elsif v_pgc_after < v_pgc_before then
    v_obligation_status := 'attention';
  else
    v_obligation_status := 'aligned';
  end if;

  return query select
    p_bucket_id,
    v_bucket.currency_code,
    v_balance::text,
    p_amount::text,
    v_post_balance::text,
    v_protected_total::text,
    greatest(v_protected_total - v_balance, 0::numeric(20, 6))::text,
    greatest(v_protected_total - v_post_balance, 0::numeric(20, 6))::text,
    v_before.safe_to_deploy,
    v_after.safe_to_deploy,
    v_after.protected_goal_cash,
    v_after.uncovered_protected_obligations,
    v_after.protected_commitments,
    v_floor_status,
    case when greatest(v_protected_total - v_post_balance, 0::numeric(20, 6)) > greatest(v_protected_total - v_balance, 0::numeric(20, 6))
      then 'conflict' else 'aligned' end,
    v_obligation_status,
    v_after.retained_deficit;
end;
$$;

revoke all on function public.evaluate_proposed_cash_use(uuid, numeric) from public, anon;
grant execute on function public.evaluate_proposed_cash_use(uuid, numeric) to authenticated;
