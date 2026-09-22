-- Monatriq: Money domain (P0-E2-S2)
--
-- Full design rationale lives in docs/architecture/FINANCIAL_DOMAIN_MODEL.md,
-- docs/architecture/MULTI_CURRENCY_MODEL.md, and
-- docs/reports/P0-E2-S2-money-multicurrency-rls-foundation.txt. This header
-- covers only the decisions that shape every section below.
--
-- ONE SIGNED-AMOUNT CONVENTION: cash_movements.amount is positive (credit)
-- or negative (debit). No separate "direction" column anywhere that could
-- contradict the sign.
--
-- NO STORED BALANCE: cash_buckets has no balance column. The authoritative
-- balance is always sum(cash_movements.amount) for non-voided events --
-- see money_bucket_balances()/money_currency_totals() in section 8.
--
-- ALL SECURITY INVOKER: every function in this file runs as the calling
-- user (the default -- stated explicitly throughout for clarity). RLS
-- policies are written so that a correctly-authenticated user's own
-- read/write always succeeds through them; no SECURITY DEFINER is used
-- anywhere in the Money domain (contrast with the profiles signup trigger
-- from P0-E2-S1, which genuinely needed it).

-- ===========================================================================
-- 1. Currency registry
-- ===========================================================================
-- Not user-owned -- RLS is still enabled (every table exposed to the API
-- has RLS on), but a permissive USING (true) SELECT policy is correct here,
-- not a shortcut: this is public, non-sensitive lookup data. No
-- INSERT/UPDATE/DELETE grant exists for anyone but a future migration.

create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  display_name text not null,
  symbol text not null,
  decimal_exponent smallint not null check (decimal_exponent between 0 and 4),
  created_at timestamptz not null default now()
);

comment on table public.currencies is
  'Canonical currency registry. code is the identifier -- symbol is presentation metadata only, never used for identity. See docs/architecture/MULTI_CURRENCY_MODEL.md.';

alter table public.currencies enable row level security;
revoke all on public.currencies from anon, authenticated;
grant select on public.currencies to anon, authenticated;

create policy "currencies_readable_by_anyone"
  on public.currencies
  for select
  to anon, authenticated
  using (true);

insert into public.currencies (code, display_name, symbol, decimal_exponent) values
  ('AED', 'UAE Dirham', 'AED', 2),
  ('AUD', 'Australian Dollar', 'A$', 2),
  ('BRL', 'Brazilian Real', 'R$', 2),
  ('CAD', 'Canadian Dollar', 'C$', 2),
  ('CHF', 'Swiss Franc', 'CHF', 2),
  ('CNY', 'Chinese Yuan', 'CN¥', 2),
  ('DKK', 'Danish Krone', 'kr', 2),
  ('EGP', 'Egyptian Pound', 'E£', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'British Pound', '£', 2),
  ('GHS', 'Ghanaian Cedi', 'GH₵', 2),
  ('HKD', 'Hong Kong Dollar', 'HK$', 2),
  ('INR', 'Indian Rupee', '₹', 2),
  ('JPY', 'Japanese Yen', '¥', 0),
  ('KES', 'Kenyan Shilling', 'KSh', 2),
  ('KWD', 'Kuwaiti Dinar', 'KD', 3),
  ('MXN', 'Mexican Peso', 'MX$', 2),
  ('NGN', 'Nigerian Naira', '₦', 2),
  ('NOK', 'Norwegian Krone', 'kr', 2),
  ('NZD', 'New Zealand Dollar', 'NZ$', 2),
  ('PLN', 'Polish Zloty', 'zł', 2),
  ('SAR', 'Saudi Riyal', 'SAR', 2),
  ('SEK', 'Swedish Krona', 'kr', 2),
  ('SGD', 'Singapore Dollar', 'S$', 2),
  ('USD', 'US Dollar', '$', 2),
  ('ZAR', 'South African Rand', 'R', 2);

-- ===========================================================================
-- 2. Money-received / money-spent category registries
-- ===========================================================================
-- cash_flow_class here is what makes an event's classification derivable
-- from its category rather than guessed from the sign of an amount (see
-- docs/architecture/FINANCIAL_DOMAIN_MODEL.md #14/#17 -- income vs cash
-- received, spending vs cash out). receivable_recovery and asset_sale are
-- other_inflow, not income, per that document; debt_payment (section 3) is
-- other_outflow, not expense, for the same reason.

create table public.money_received_categories (
  code text primary key,
  display_name text not null,
  cash_flow_class text not null check (cash_flow_class in ('income', 'other_inflow')),
  created_at timestamptz not null default now()
);

alter table public.money_received_categories enable row level security;
revoke all on public.money_received_categories from anon, authenticated;
grant select on public.money_received_categories to authenticated;

create policy "money_received_categories_readable"
  on public.money_received_categories for select to authenticated using (true);

insert into public.money_received_categories (code, display_name, cash_flow_class) values
  ('business_income', 'Business Income', 'income'),
  ('salary', 'Salary', 'income'),
  ('freelance_contract', 'Freelance / Contract', 'income'),
  ('investment_income', 'Investment Income', 'income'),
  ('gift', 'Gift', 'income'),
  ('receivable_recovery', 'Receivable Recovery', 'other_inflow'),
  ('asset_sale', 'Asset Sale', 'other_inflow'),
  ('refund', 'Refund', 'other_inflow'),
  ('other', 'Other', 'other_inflow');

create table public.money_spending_categories (
  code text primary key,
  display_name text not null,
  cash_flow_class text not null check (cash_flow_class in ('expense', 'other_outflow')),
  created_at timestamptz not null default now()
);

alter table public.money_spending_categories enable row level security;
revoke all on public.money_spending_categories from anon, authenticated;
grant select on public.money_spending_categories to authenticated;

create policy "money_spending_categories_readable"
  on public.money_spending_categories for select to authenticated using (true);

insert into public.money_spending_categories (code, display_name, cash_flow_class) values
  ('housing', 'Housing', 'expense'),
  ('food', 'Food', 'expense'),
  ('transport_fuel', 'Transport / Fuel', 'expense'),
  ('vehicle_repair', 'Vehicle Repair', 'expense'),
  ('business_expense', 'Business Expense', 'expense'),
  ('education', 'Education', 'expense'),
  ('healthcare', 'Healthcare', 'expense'),
  ('subscriptions', 'Subscriptions', 'expense'),
  ('family', 'Family', 'expense'),
  ('entertainment', 'Entertainment', 'expense'),
  ('travel', 'Travel', 'expense'),
  ('debt_payment', 'Debt Payment', 'other_outflow'),
  ('professional_services', 'Professional Services', 'expense'),
  ('other', 'Other', 'expense');

-- ===========================================================================
-- 3. Cash buckets
-- ===========================================================================
-- No balance column (see file header). Prefer archive over delete: no
-- DELETE grant/policy exists.

create table public.cash_buckets (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  currency_code text not null references public.currencies (code),
  bucket_type text not null check (
    bucket_type in (
      'bank_account', 'cash_wallet', 'savings_account',
      'mobile_wallet', 'business_cash', 'other'
    )
  ),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cash_buckets is
  'A user-owned place cash is held. currency_code is fixed once movements exist -- see enforce_bucket_currency_immutable().';

create function public.enforce_bucket_currency_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.currency_code is distinct from old.currency_code then
    if exists (select 1 from public.cash_movements m where m.bucket_id = old.id) then
      raise exception 'cannot change currency of bucket % -- it already has financial movements', old.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.enforce_bucket_currency_immutable() is
  'BEFORE UPDATE on cash_buckets: blocks changing currency_code once the bucket has any cash_movements. Not SECURITY DEFINER.';

create trigger cash_buckets_set_metadata
  before update on public.cash_buckets
  for each row
  execute function public.enforce_bucket_currency_immutable();

alter table public.cash_buckets enable row level security;

revoke all on public.cash_buckets from anon, authenticated;

grant select on public.cash_buckets to authenticated;
grant insert (user_id, name, currency_code, bucket_type) on public.cash_buckets to authenticated;
grant update (name, currency_code, bucket_type, is_archived) on public.cash_buckets to authenticated;

create policy "cash_buckets_select_own"
  on public.cash_buckets for select to authenticated
  using (auth.uid () = user_id);

create policy "cash_buckets_insert_own"
  on public.cash_buckets for insert to authenticated
  with check (auth.uid () = user_id);

create policy "cash_buckets_update_own"
  on public.cash_buckets for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 4. Financial events
-- ===========================================================================
-- "What happened" -- see docs/architecture/FINANCIAL_DOMAIN_MODEL.md #3.
-- cash_flow_class is always DB-derived (set_financial_event_classification
-- below), never trusted from the client, and excluded from every
-- INSERT/UPDATE column grant. Immutable except voiding (voided_at) -- see
-- enforce_financial_event_void_only.

create table public.financial_events (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (
    -- Future event types (asset_purchase, asset_sale, receivable_recovery,
    -- debt_payment, goal_allocation, ...) extend this list in a later
    -- migration once their owning domain exists.
    event_type in ('opening_balance', 'money_received', 'money_spent', 'transfer', 'fx_transfer')
  ),
  cash_flow_class text not null check (
    cash_flow_class in ('income', 'other_inflow', 'expense', 'other_outflow', 'transfer', 'opening_balance')
  ),
  received_category_code text references public.money_received_categories (code),
  spending_category_code text references public.money_spending_categories (code),
  occurred_at timestamptz not null,
  description text check (description is null or char_length(description) <= 500),
  idempotency_key uuid,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_events_category_matches_type check (
    (event_type = 'money_received' and received_category_code is not null and spending_category_code is null)
    or (event_type = 'money_spent' and spending_category_code is not null and received_category_code is null)
    or (
      event_type in ('opening_balance', 'transfer', 'fx_transfer')
      and received_category_code is null
      and spending_category_code is null
    )
  )
);

comment on table public.financial_events is
  'What happened, when, classified. Immutable except voiding. One event has one or more cash_movements.';

create unique index financial_events_user_idempotency_key
  on public.financial_events (user_id, idempotency_key)
  where idempotency_key is not null;

create index financial_events_user_occurred_at
  on public.financial_events (user_id, occurred_at desc);

create function public.set_financial_event_classification()
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

  else
    raise exception 'unrecognized event_type %', new.event_type;
  end if;

  return new;
end;
$$;

comment on function public.set_financial_event_classification() is
  'BEFORE INSERT on financial_events: derives cash_flow_class from event_type + category. Client-supplied cash_flow_class, if any, is overwritten.';

create trigger financial_events_classify
  before insert on public.financial_events
  for each row
  execute function public.set_financial_event_classification();

create function public.enforce_financial_event_void_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.voided_at is not null then
    raise exception 'financial event % is already voided', old.id;
  end if;

  if new.voided_at is null then
    raise exception 'financial events cannot be un-voided';
  end if;

  if new.user_id is distinct from old.user_id
    or new.event_type is distinct from old.event_type
    or new.cash_flow_class is distinct from old.cash_flow_class
    or new.received_category_code is distinct from old.received_category_code
    or new.spending_category_code is distinct from old.spending_category_code
    or new.occurred_at is distinct from old.occurred_at
    or new.description is distinct from old.description
    or new.idempotency_key is distinct from old.idempotency_key
    or new.created_at is distinct from old.created_at
  then
    raise exception 'only voided_at may be changed on a financial event';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.enforce_financial_event_void_only() is
  'BEFORE UPDATE on financial_events: the only supported correction mechanism this phase is voiding once. See docs/architecture/FINANCIAL_DOMAIN_MODEL.md, "correction/voiding strategy".';

create trigger financial_events_void_only
  before update on public.financial_events
  for each row
  execute function public.enforce_financial_event_void_only();

alter table public.financial_events enable row level security;

revoke all on public.financial_events from anon, authenticated;

grant select on public.financial_events to authenticated;
grant insert (user_id, event_type, received_category_code, spending_category_code, occurred_at, description, idempotency_key)
  on public.financial_events to authenticated;
grant update (voided_at) on public.financial_events to authenticated;

create policy "financial_events_select_own"
  on public.financial_events for select to authenticated
  using (auth.uid () = user_id);

create policy "financial_events_insert_own"
  on public.financial_events for insert to authenticated
  with check (auth.uid () = user_id);

create policy "financial_events_update_own"
  on public.financial_events for update to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 5. Cash movements
-- ===========================================================================
-- user_id is denormalized from the parent event for a simple, join-free RLS
-- policy, but it is NEVER taken from client input -- prepare_cash_movement
-- below overwrites it from the event every time. Immutable once inserted:
-- no UPDATE grant/policy exists; a correction means voiding the event.

create table public.cash_movements (
  id uuid primary key default gen_random_uuid (),
  event_id uuid not null references public.financial_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_id uuid not null references public.cash_buckets (id) on delete restrict,
  currency_code text not null references public.currencies (code),
  amount numeric(20, 6) not null check (amount <> 0),
  created_at timestamptz not null default now()
);

comment on table public.cash_movements is
  'An actual change to one cash bucket. Signed amount: positive = credit, negative = debit. Created only via the record_* functions in section 7.';

create index cash_movements_bucket_id on public.cash_movements (bucket_id);
create index cash_movements_event_id on public.cash_movements (event_id);
create index cash_movements_user_currency on public.cash_movements (user_id, currency_code);

create function public.prepare_cash_movement()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_event_user_id uuid;
  v_bucket_currency text;
  v_decimal_exponent smallint;
begin
  select user_id into v_event_user_id from public.financial_events where id = new.event_id;
  if v_event_user_id is null then
    raise exception 'financial event % not found', new.event_id;
  end if;
  new.user_id := v_event_user_id;

  select currency_code into v_bucket_currency from public.cash_buckets where id = new.bucket_id;
  if v_bucket_currency is null then
    raise exception 'cash bucket % not found', new.bucket_id;
  end if;
  if new.currency_code is distinct from v_bucket_currency then
    raise exception 'movement currency % does not match bucket currency %', new.currency_code, v_bucket_currency;
  end if;

  select decimal_exponent into v_decimal_exponent from public.currencies where code = new.currency_code;
  if round(new.amount, v_decimal_exponent) <> new.amount then
    raise exception 'amount % has more precision than % allows (% decimal place(s))',
      new.amount, new.currency_code, v_decimal_exponent;
  end if;

  return new;
end;
$$;

comment on function public.prepare_cash_movement() is
  'BEFORE INSERT on cash_movements: derives user_id from the event (never trusts client input), validates currency matches the bucket, validates amount precision against the currency''s decimal_exponent.';

create trigger cash_movements_prepare
  before insert on public.cash_movements
  for each row
  execute function public.prepare_cash_movement();

alter table public.cash_movements enable row level security;

-- SELECT is granted (RLS below is the real ownership boundary) because the
-- balance/activity functions in section 8 are SECURITY INVOKER -- they run
-- as the calling user, so they need exactly the same privileges a direct
-- query would. The application (lib/domain/money/repository.ts) never
-- queries this table directly regardless: it always goes through those
-- functions, which cast amount to text at the query boundary (see
-- docs/architecture/MULTI_CURRENCY_MODEL.md, "decimal precision" --
-- PostgREST serializes `numeric` as a JSON number, risking float64
-- precision loss for large/precise values). A sophisticated caller could
-- still query this table directly and receive a raw numeric value; that is
-- an accepted, documented scope boundary for this phase, not something RLS
-- is meant to prevent -- RLS's job here is ownership, not response
-- encoding.
revoke all on public.cash_movements from anon, authenticated;
grant select on public.cash_movements to authenticated;
grant insert (event_id, bucket_id, currency_code, amount) on public.cash_movements to authenticated;

create policy "cash_movements_select_own"
  on public.cash_movements for select to authenticated
  using (auth.uid () = user_id);

create policy "cash_movements_insert_own"
  on public.cash_movements for insert to authenticated
  with check (
    auth.uid () = user_id
    and exists (select 1 from public.cash_buckets b where b.id = bucket_id and b.user_id = auth.uid ())
    and exists (select 1 from public.financial_events e where e.id = event_id and e.user_id = auth.uid ())
  );

-- ===========================================================================
-- 6. FX rates
-- ===========================================================================
-- Convention (fixed, documented once): rate = units of quote_currency
-- received for 1 unit of base_currency. base=USD, quote=NGN, rate=1610
-- means 1 USD = 1610 NGN. For an executed fx_transfer, base_currency is the
-- SOURCE bucket's currency, quote_currency is the DESTINATION bucket's
-- currency, rate = destination_amount / source_amount -- the actual rate
-- applied, never replaced by a later market rate.

create table public.fx_rates (
  id uuid primary key default gen_random_uuid (),
  -- null = a future global/provider-sourced rate (none seeded this phase --
  -- V1 is manual-first). Set = this user's own rate: either a standalone
  -- manual note (event_id null) or the rate actually applied to one of
  -- their own fx_transfer events (source = transaction_actual).
  user_id uuid references auth.users (id) on delete cascade,
  event_id uuid references public.financial_events (id) on delete cascade,
  base_currency text not null references public.currencies (code),
  quote_currency text not null references public.currencies (code),
  rate numeric(24, 12) not null check (rate > 0),
  rate_as_of timestamptz not null,
  source text not null check (source in ('manual', 'transaction_actual')),
  created_at timestamptz not null default now(),
  constraint fx_rates_base_quote_different check (base_currency <> quote_currency),
  constraint fx_rates_source_shape check (
    (source = 'manual' and event_id is null)
    or (source = 'transaction_actual' and event_id is not null)
  )
);

comment on table public.fx_rates is
  'Recorded exchange rates. source=transaction_actual rows are the immutable, actually-applied rate for one fx_transfer event. source=manual rows are standalone user notes. No live provider integration this phase.';

create index fx_rates_event_id on public.fx_rates (event_id);

create function public.validate_transaction_actual_fx_rate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.source = 'transaction_actual' then
    if not exists (
      select 1 from public.financial_events e
      where e.id = new.event_id
        and e.user_id = new.user_id
        and e.event_type = 'fx_transfer'
    ) then
      raise exception 'fx_rate.event_id must reference this user''s own fx_transfer event';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.validate_transaction_actual_fx_rate() is
  'BEFORE INSERT on fx_rates: a transaction_actual rate must point at the same user''s own fx_transfer event -- RLS/FK alone would not catch a rate pointing at the right owner but the wrong event type.';

create trigger fx_rates_validate
  before insert on public.fx_rates
  for each row
  execute function public.validate_transaction_actual_fx_rate();

alter table public.fx_rates enable row level security;

revoke all on public.fx_rates from anon, authenticated;
grant select on public.fx_rates to authenticated;
grant insert (user_id, event_id, base_currency, quote_currency, rate, rate_as_of, source)
  on public.fx_rates to authenticated;

create policy "fx_rates_select_own_or_global"
  on public.fx_rates for select to authenticated
  using (user_id is null or auth.uid () = user_id);

create policy "fx_rates_insert_own"
  on public.fx_rates for insert to authenticated
  with check (auth.uid () = user_id);

-- ===========================================================================
-- 7. Atomic financial-event creation
-- ===========================================================================
-- SECURITY INVOKER (the default, stated explicitly): each function runs as
-- the calling user, so every insert it performs is still checked by the
-- RLS policies above -- there is no elevated bypass anywhere in this
-- domain. Atomicity comes from running as a single PL/pgSQL function body,
-- which Postgres executes as one transaction: if any statement raises,
-- everything the function did is rolled back. This is why sequential
-- client-side inserts (explicitly disallowed) are not equivalent -- a
-- client crash between two separate REST calls cannot leave a half-created
-- transfer here.
--
-- None of these trust a caller-supplied owner id: every bucket referenced
-- is checked against auth.uid() explicitly, in addition to (not instead
-- of) the RLS policies the inserts still go through. A bucket that exists
-- but belongs to someone else and a bucket that does not exist at all
-- produce the identical error message -- deliberately, to avoid leaking
-- which UUIDs correspond to real accounts.

create function public.record_opening_balance(
  p_bucket_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.financial_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_bucket public.cash_buckets;
  v_event public.financial_events;
begin
  if p_idempotency_key is not null then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'opening balance amount must be positive';
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;
  if v_bucket.is_archived then
    raise exception 'cannot record activity on an archived bucket';
  end if;

  insert into public.financial_events (user_id, event_type, occurred_at, description, idempotency_key)
    values (auth.uid (), 'opening_balance', p_occurred_at, p_description, p_idempotency_key)
    returning * into v_event;

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_bucket_id, v_bucket.currency_code, p_amount);

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

create function public.record_money_received(
  p_bucket_id uuid,
  p_amount numeric,
  p_category_code text,
  p_occurred_at timestamptz default now(),
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.financial_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_bucket public.cash_buckets;
  v_event public.financial_events;
begin
  if p_idempotency_key is not null then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'money received amount must be positive';
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;
  if v_bucket.is_archived then
    raise exception 'cannot record activity on an archived bucket';
  end if;

  insert into public.financial_events
      (user_id, event_type, received_category_code, occurred_at, description, idempotency_key)
    values
      (auth.uid (), 'money_received', p_category_code, p_occurred_at, p_description, p_idempotency_key)
    returning * into v_event;

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_bucket_id, v_bucket.currency_code, p_amount);

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

create function public.record_money_spent(
  p_bucket_id uuid,
  p_amount numeric,
  p_category_code text,
  p_occurred_at timestamptz default now(),
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.financial_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_bucket public.cash_buckets;
  v_event public.financial_events;
begin
  if p_idempotency_key is not null then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'money spent amount must be positive';
  end if;

  select * into v_bucket from public.cash_buckets where id = p_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'bucket % not found for current user', p_bucket_id;
  end if;
  if v_bucket.is_archived then
    raise exception 'cannot record activity on an archived bucket';
  end if;

  insert into public.financial_events
      (user_id, event_type, spending_category_code, occurred_at, description, idempotency_key)
    values
      (auth.uid (), 'money_spent', p_category_code, p_occurred_at, p_description, p_idempotency_key)
    returning * into v_event;

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_bucket_id, v_bucket.currency_code, -p_amount);

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

create function public.record_transfer(
  p_source_bucket_id uuid,
  p_destination_bucket_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.financial_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_source public.cash_buckets;
  v_destination public.cash_buckets;
  v_event public.financial_events;
begin
  if p_idempotency_key is not null then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'transfer amount must be positive';
  end if;

  if p_source_bucket_id = p_destination_bucket_id then
    raise exception 'source and destination bucket must differ';
  end if;

  select * into v_source from public.cash_buckets where id = p_source_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'source bucket % not found for current user', p_source_bucket_id;
  end if;

  select * into v_destination from public.cash_buckets where id = p_destination_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'destination bucket % not found for current user', p_destination_bucket_id;
  end if;

  if v_source.is_archived or v_destination.is_archived then
    raise exception 'cannot record activity on an archived bucket';
  end if;

  if v_source.currency_code <> v_destination.currency_code then
    raise exception 'record_transfer requires matching currencies (got % and %) -- use record_fx_transfer for cross-currency transfers',
      v_source.currency_code, v_destination.currency_code;
  end if;

  insert into public.financial_events (user_id, event_type, occurred_at, description, idempotency_key)
    values (auth.uid (), 'transfer', p_occurred_at, p_description, p_idempotency_key)
    returning * into v_event;

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_source_bucket_id, v_source.currency_code, -p_amount);

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_destination_bucket_id, v_destination.currency_code, p_amount);

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

create function public.record_fx_transfer(
  p_source_bucket_id uuid,
  p_destination_bucket_id uuid,
  p_source_amount numeric,
  p_destination_amount numeric,
  p_occurred_at timestamptz default now(),
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.financial_events
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_source public.cash_buckets;
  v_destination public.cash_buckets;
  v_event public.financial_events;
  v_rate numeric(24, 12);
begin
  if p_idempotency_key is not null then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    if found then
      return v_event;
    end if;
  end if;

  if p_source_amount <= 0 or p_destination_amount <= 0 then
    raise exception 'fx transfer amounts must be positive';
  end if;

  if p_source_bucket_id = p_destination_bucket_id then
    raise exception 'source and destination bucket must differ';
  end if;

  select * into v_source from public.cash_buckets where id = p_source_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'source bucket % not found for current user', p_source_bucket_id;
  end if;

  select * into v_destination from public.cash_buckets where id = p_destination_bucket_id and user_id = auth.uid ();
  if not found then
    raise exception 'destination bucket % not found for current user', p_destination_bucket_id;
  end if;

  if v_source.is_archived or v_destination.is_archived then
    raise exception 'cannot record activity on an archived bucket';
  end if;

  if v_source.currency_code = v_destination.currency_code then
    raise exception 'record_fx_transfer requires different currencies -- use record_transfer for same-currency transfers';
  end if;

  v_rate := p_destination_amount / p_source_amount;

  insert into public.financial_events (user_id, event_type, occurred_at, description, idempotency_key)
    values (auth.uid (), 'fx_transfer', p_occurred_at, p_description, p_idempotency_key)
    returning * into v_event;

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_source_bucket_id, v_source.currency_code, -p_source_amount);

  insert into public.cash_movements (event_id, bucket_id, currency_code, amount)
    values (v_event.id, p_destination_bucket_id, v_destination.currency_code, p_destination_amount);

  insert into public.fx_rates
      (user_id, event_id, base_currency, quote_currency, rate, rate_as_of, source)
    values
      (auth.uid (), v_event.id, v_source.currency_code, v_destination.currency_code, v_rate, p_occurred_at, 'transaction_actual');

  return v_event;
exception
  when unique_violation then
    select * into v_event from public.financial_events
      where user_id = auth.uid () and idempotency_key = p_idempotency_key;
    return v_event;
end;
$$;

revoke all on function public.record_opening_balance(uuid, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_opening_balance(uuid, numeric, timestamptz, text, uuid) to authenticated;

revoke all on function public.record_money_received(uuid, numeric, text, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_money_received(uuid, numeric, text, timestamptz, text, uuid) to authenticated;

revoke all on function public.record_money_spent(uuid, numeric, text, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_money_spent(uuid, numeric, text, timestamptz, text, uuid) to authenticated;

revoke all on function public.record_transfer(uuid, uuid, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_transfer(uuid, uuid, numeric, timestamptz, text, uuid) to authenticated;

revoke all on function public.record_fx_transfer(uuid, uuid, numeric, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_fx_transfer(uuid, uuid, numeric, numeric, timestamptz, text, uuid) to authenticated;

-- ===========================================================================
-- 8. Balance / activity reads
-- ===========================================================================
-- One shared, authoritative calculation -- Home/Money/future Decisions all
-- call these, none independently re-sums cash_movements (docs/
-- architecture/SYSTEM_ARCHITECTURE.md #4). Amounts are cast to text (see
-- section 5's comment on cash_movements for why). Voided events are
-- excluded. Never sums across currencies.

create function public.money_bucket_balances()
returns table (bucket_id uuid, currency_code text, balance text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select m.bucket_id, m.currency_code, sum(m.amount)::text as balance
  from public.cash_movements m
  join public.financial_events e on e.id = m.event_id
  where m.user_id = auth.uid ()
    and e.voided_at is null
  group by m.bucket_id, m.currency_code;
$$;

create function public.money_currency_totals()
returns table (currency_code text, balance text)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select m.currency_code, sum(m.amount)::text as balance
  from public.cash_movements m
  join public.financial_events e on e.id = m.event_id
  where m.user_id = auth.uid ()
    and e.voided_at is null
  group by m.currency_code;
$$;

create function public.money_recent_activity(p_limit integer default 25)
returns table (
  event_id uuid,
  event_type text,
  cash_flow_class text,
  occurred_at timestamptz,
  description text,
  received_category_code text,
  spending_category_code text,
  voided_at timestamptz,
  movement_id uuid,
  bucket_id uuid,
  currency_code text,
  amount text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select
    e.id, e.event_type, e.cash_flow_class, e.occurred_at, e.description,
    e.received_category_code, e.spending_category_code, e.voided_at,
    m.id, m.bucket_id, m.currency_code, m.amount::text
  from public.financial_events e
  join public.cash_movements m on m.event_id = e.id
  where e.user_id = auth.uid ()
  order by e.occurred_at desc, e.created_at desc, m.id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.money_bucket_balances () from public, anon;
grant execute on function public.money_bucket_balances () to authenticated;

revoke all on function public.money_currency_totals () from public, anon;
grant execute on function public.money_currency_totals () to authenticated;

revoke all on function public.money_recent_activity (integer) from public, anon;
grant execute on function public.money_recent_activity (integer) to authenticated;
