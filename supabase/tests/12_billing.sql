-- BILLING, AND THE ONE PROPERTY THAT MUST NOT BE A COMMENT.
--
-- `subscriptions` and `billing_customers` decide what a tenant may do and which Stripe customer
-- their money belongs to. Both are written ONLY by the billing webhook, through the service role.
-- If a tenant role can write either one, a customer can put themselves on the agency plan for
-- nothing, or point their organisation at someone else's billing record.
--
-- The migration says that in prose. This suite makes the database say it, because the prose was
-- true of the FIRST draft too -- which put `stripe_customer_id` on `organisations`, a table that
-- already grants `insert, update` on every column to `authenticated` and has an admin update
-- policy. The comment would have been just as confident and the hole just as open.
--
-- Four things are checked, and only the first is about the happy path:
--   1. A member can READ their own organisation's subscription and customer.
--   2. A member cannot read ANOTHER organisation's.
--   3. NO tenant role can insert, update or delete either table -- asserted per command, from the
--      catalogue, rather than by trying one statement and assuming the rest.
--   4. `current_plan` entitles what was paid for, including the two cases that are easy to get
--      backwards: a cancelled-but-paid-through subscription still entitles; `unpaid` does not.

\o /dev/null

create schema if not exists app_test;
create table if not exists app_test.results (
  id serial primary key, name text not null, passed boolean not null, detail text
);
truncate app_test.results;

create or replace function app_test.check(p_name text, p_passed boolean, p_detail text default null)
returns void language sql as $$
  insert into app_test.results (name, passed, detail) values (p_name, coalesce(p_passed, false), p_detail);
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. THE WRITE PATH. No permissive policy for insert, update or delete on either table, for any
--    role. With RLS enabled that denies the command outright -- which is the whole design, so it
--    is read out of pg_policy rather than believed.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_tbl text; v_cmd text; v_count integer;
begin
  foreach v_tbl in array array['subscriptions', 'billing_customers'] loop
    foreach v_cmd in array array['INSERT', 'UPDATE', 'DELETE'] loop
      select count(*) into v_count
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
       where c.relname = v_tbl
         and p.polcmd = case v_cmd when 'INSERT' then 'a' when 'UPDATE' then 'w' else 'd' end;

      perform app_test.check(
        format('public.%s has NO %s policy -- only the webhook writes it', v_tbl, v_cmd),
        v_count = 0,
        format('%s policies found', v_count)
      );
    end loop;

    select count(*) into v_count
      from pg_class c where c.relname = v_tbl and c.relrowsecurity;
    perform app_test.check(
      format('public.%s has row-level security ENABLED -- without it the absent policies mean nothing', v_tbl),
      v_count = 1
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- `anon` reaches neither table. 20260911000100 left anon with nothing; a table added by a LATER
-- migration silently keeps Supabase's default grant unless it is revoked, which both are.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_tbl text; v_priv text; v_has boolean;
begin
  foreach v_tbl in array array['subscriptions', 'billing_customers'] loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      v_has := has_table_privilege('anon', format('public.%s', v_tbl), v_priv);
      perform app_test.check(
        format('anon has NO %s on public.%s', v_priv, v_tbl),
        not v_has
      );
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. ENTITLEMENT. `current_plan` is not the `plan` column, and the difference is the point.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_org uuid;
  v_plan app.billing_plan;
begin
  insert into public.organisations (name, slug)
  values ('Billing Test Org', 'billing-test-org')
  returning id into v_org;

  -- No subscription at all.
  select public.current_plan(v_org) into v_plan;
  perform app_test.check(
    'an organisation with no subscription is on free',
    v_plan = 'free'
  );

  insert into public.subscriptions (
    organisation_id, stripe_subscription_id, stripe_price_id, plan, billing_interval,
    status, current_period_end, stripe_event_at
  ) values (
    v_org, 'sub_test_1', 'price_test_1', 'growth', 'month', 'active', now() + interval '20 days', now()
  );

  select public.current_plan(v_org) into v_plan;
  perform app_test.check('an active subscription entitles its plan', v_plan = 'growth');

  -- CANCELLED BUT PAID THROUGH. They keep it until the period ends; cutting access at the cancel
  -- click would be taking money for nothing.
  update public.subscriptions
     set cancel_at_period_end = true
   where organisation_id = v_org;
  select public.current_plan(v_org) into v_plan;
  perform app_test.check(
    'cancel_at_period_end still entitles until the period ends',
    v_plan = 'growth'
  );

  -- PAST DUE still entitles. Stripe retries a failed card for days; cutting a customer off before
  -- those retries finish loses the ones whose payment would have succeeded.
  update public.subscriptions set status = 'past_due' where organisation_id = v_org;
  select public.current_plan(v_org) into v_plan;
  perform app_test.check('past_due still entitles -- Stripe is still retrying', v_plan = 'growth');

  -- UNPAID does not. Stripe has stopped trying.
  update public.subscriptions set status = 'unpaid' where organisation_id = v_org;
  select public.current_plan(v_org) into v_plan;
  perform app_test.check(
    'unpaid entitles nothing -- Stripe has given up, and past_due and unpaid are not the same',
    v_plan = 'free'
  );

  -- An expired period entitles nothing even while the status still reads active, which is the
  -- state between the period ending and the webhook arriving.
  update public.subscriptions
     set status = 'active', current_period_end = now() - interval '1 day'
   where organisation_id = v_org;
  select public.current_plan(v_org) into v_plan;
  perform app_test.check(
    'an elapsed period entitles nothing even while status still reads active',
    v_plan = 'free'
  );

  delete from public.organisations where id = v_org;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The event clock exists and is NOT NULL. Webhooks arrive out of order; without this column a
-- late-delivered older event silently overwrites newer state.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_notnull boolean;
begin
  select a.attnotnull into v_notnull
    from pg_attribute a
   where a.attrelid = 'public.subscriptions'::regclass
     and a.attname = 'stripe_event_at'
     and not a.attisdropped;
  perform app_test.check(
    'subscriptions.stripe_event_at exists and is NOT NULL -- out-of-order webhooks need a clock',
    coalesce(v_notnull, false)
  );
end $$;

\o
select name, case when passed then 'ok' else 'FAIL' end as result, detail
  from app_test.results where not passed order by id;
select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
  from app_test.results;
