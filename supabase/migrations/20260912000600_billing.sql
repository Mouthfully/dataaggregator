-- BILLING: the subscription a tenant is on, and nothing Stripe already owns.
--
-- WHAT THIS TABLE IS FOR, AND WHY IT IS SMALL. Stripe holds the authoritative record of a
-- subscription: its price, its schedule, its invoices, its payment methods, its tax treatment and
-- its dunning. None of that is copied here. What is here is the minimum needed to answer one
-- question without a network call -- "what may this organisation do right now" -- because that
-- question is asked on every page load and a plan gate that depends on a third party being
-- reachable fails open or fails slow, and both are wrong.
--
-- SO INVOICES ARE DELIBERATELY ABSENT. They are read from Stripe when the billing page asks for
-- them. An invoices table here would be a second copy of a fact Stripe keeps changing -- a refund,
-- a credit note, a tax correction -- and the copy would be the one customers quote back at us.
--
-- THE WRITE PATH IS THE WEBHOOK AND NOTHING ELSE. Note the policies below: members may READ their
-- organisation's subscription and there is NO insert, update or delete policy for any tenant role
-- at all. A client that could write this row could put itself on the agency plan for nothing, and
-- "the UI never does that" is not an access control. Stripe's webhook writes it through the
-- service role, which RLS does not apply to.

create type app.billing_plan as enum ('free', 'starter', 'growth', 'agency');

-- Mirrors Stripe's own subscription statuses, including the ones that are easy to forget.
-- `past_due` and `unpaid` are NOT the same: past_due is a failed charge that Stripe will retry,
-- unpaid is one it has given up on. A product that treats them alike either cuts off a customer
-- whose card will succeed on retry, or keeps serving one who has stopped paying.
create type app.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'
);

create type app.billing_interval as enum ('month', 'year');

-- The Stripe customer, in ITS OWN TABLE rather than a column on `organisations`.
--
-- THE COLUMN WAS THE FIRST DRAFT AND IT WAS A VULNERABILITY. `20260908000700_rls.sql` grants
-- `insert, update on public.organisations` to `authenticated` -- every column -- and
-- `organisations_update` lets any org ADMIN update their own row. A `stripe_customer_id` column
-- there would therefore be writable by any customer who is an admin of their own organisation,
-- and pointing it at somebody else's Stripe customer is then a single UPDATE.
--
-- Column-level grants could have narrowed it, but they would leave the next column added to that
-- table exposed by default and the protection invisible from the table definition. A separate
-- table with no tenant write policy cannot be got wrong by omission.
--
-- AGAINST THE ORGANISATION, not the user: an organisation is what has members, workspaces and
-- connections. Held against a user, a company's subscription would die with whoever signed up and
-- an ownership transfer would become a billing migration.
create table public.billing_customers (
  organisation_id     uuid primary key references public.organisations (id) on delete cascade,
  stripe_customer_id  text not null unique,
  created_at          timestamptz not null default now()
);

comment on table public.billing_customers is
  'Organisation to Stripe customer. Written only by the billing webhook through the service role; '
  'no tenant policy grants insert, update or delete.';

alter table public.billing_customers enable row level security;

create policy billing_customers_select on public.billing_customers
  for select to authenticated
  using (app.is_org_member(organisation_id));

grant select on public.billing_customers to authenticated;
revoke all on public.billing_customers from anon;

create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organisation_id         uuid not null unique references public.organisations (id) on delete cascade,

  -- Stripe's own identifiers. Kept so a support question can be answered without a search, and so
  -- a webhook can find the row it is about without trusting anything in its payload but the id.
  stripe_subscription_id  text not null unique,
  stripe_price_id         text not null,

  plan                    app.billing_plan not null,
  billing_interval        app.billing_interval not null,
  status                  app.subscription_status not null,

  -- When the current paid period ends. This is what a gate compares against, so it is not null:
  -- a null here would have to be read as "forever" or "never" and the two are opposite mistakes.
  current_period_end      timestamptz not null,

  -- Set when a customer cancels but has paid through the period. They keep the plan until
  -- current_period_end -- cutting access at the cancel click would be taking money for nothing.
  cancel_at_period_end    boolean not null default false,

  -- Stripe's event clock, not ours. Webhooks arrive OUT OF ORDER, and a late-delivered older event
  -- must not overwrite a newer state; the upsert compares this before writing. `created_at` cannot
  -- do that job because it is when WE saw it, not when it happened.
  stripe_event_at         timestamptz not null,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.subscriptions is
  'One row per organisation. Stripe is the source of truth; this is the cached answer to "what may '
  'this tenant do", written only by the billing webhook.';

create index subscriptions_status_idx on public.subscriptions (status, current_period_end);

alter table public.subscriptions enable row level security;

-- READ ONLY, AND ONLY YOUR OWN. `app.is_member_of_organisation` resolves through `members` against
-- app.current_user_id(), so a session reaches exactly the organisations it belongs to.
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (app.is_org_member(organisation_id));

-- NO insert/update/delete policy, deliberately. See the header. With RLS enabled and no permissive
-- policy for a command, that command is denied for every role RLS applies to -- which is the whole
-- point, and is asserted in supabase/tests/12_billing.sql rather than left as a comment.

grant select on public.subscriptions to authenticated;
revoke all on public.subscriptions from anon;

-- The plan an organisation is entitled to RIGHT NOW, as one answer.
--
-- Entitlement is not the same as the `plan` column, and this function is where that difference
-- lives so that no caller has to remember it: a canceled subscription still entitles its plan
-- until the period it was paid for runs out, and a subscription Stripe has given up collecting on
-- (`unpaid`) entitles nothing even though its period may not have ended.
create or replace function public.current_plan(p_organisation_id uuid)
returns app.billing_plan
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select s.plan
      from public.subscriptions s
      where s.organisation_id = p_organisation_id
        and s.status in ('trialing', 'active', 'past_due')
        and s.current_period_end > now()
      limit 1
    ),
    'free'::app.billing_plan
  );
$$;

comment on function public.current_plan(uuid) is
  'The plan in force now. `past_due` still entitles: Stripe retries a failed card for days, and '
  'cutting a customer off before those retries finish loses the ones whose payment would succeed.';

-- FROM `public`, NOT JUST FROM `anon`. PostgreSQL grants EXECUTE on a new function to PUBLIC by
-- default, and `anon` inherits that -- so revoking from `anon` alone leaves the function callable
-- by the internet. 07_anon_grants.sql caught exactly this on the first run of this migration; it
-- asserts the anon-executable set in `public` is exactly the two functions gated on an API key
-- hash, and a third had quietly joined them.
revoke all on function public.current_plan(uuid) from public, anon;
grant execute on function public.current_plan(uuid) to authenticated;
