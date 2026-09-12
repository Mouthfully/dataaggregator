-- THE WAITING LIST, and the third anon-executable function in this schema.
--
-- The product is pre-launch. Every page offers to take an email address, and the person offering it
-- is by definition NOT authenticated -- so something reachable by the internet has to be able to
-- write this table. That is the property `07_anon_grants.sql` exists to police, so the change is
-- made deliberately and its expected set is updated with this reason rather than around it.
--
-- WHY A FUNCTION AND NOT AN `insert` GRANT ON THE TABLE. A grant would let anon write any column:
-- `created_at` backdated, a `source` naming another campaign, a duplicate row per keystroke. The
-- function takes ONE argument, normalises it, and is the only shape a stranger can produce.
--
-- WHAT ANON STILL CANNOT DO: read this table. Not one row, not a count. A waiting list is a list of
-- people interested in a product that does not exist yet, and a readable one is a competitor's
-- prospect list and a spammer's mailing list. `select` is granted to nobody but the service role,
-- which RLS does not apply to.

create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  -- Stored lowercased and trimmed by the function. Unique, so a person pressing the button twice
  -- is idempotent rather than two rows -- see the `on conflict` below.
  email       text not null unique check (position('@' in email) > 1),
  -- Which page they were on. Free text from the caller, capped: useful for knowing which page
  -- converts, never trusted, never rendered back to anyone.
  source      text check (source is null or length(source) <= 120),
  created_at  timestamptz not null default now()
);

comment on table public.waitlist is
  'Pre-launch sign-ups. Written only through public.join_waitlist; readable by no tenant role.';

alter table public.waitlist enable row level security;

-- NO POLICY AT ALL, for any command. With RLS enabled that denies every command to every role RLS
-- applies to, including the `authenticated` sessions of people who eventually sign up. The function
-- below is SECURITY DEFINER and therefore bypasses this, which is the entire point: one way in.
revoke all on public.waitlist from anon, authenticated;

-- The one way in.
--
-- SECURITY DEFINER, so it writes past the absent policies. `set search_path` is not decoration on a
-- definer function: without it a caller controlling the search path can shadow a function this body
-- calls and have it run as the owner.
create or replace function public.join_waitlist(p_email text, p_source text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  -- Shape only. The authoritative test of an address is whether mail to it arrives, and a stricter
  -- regex here would refuse real addresses -- plus-addressing, apostrophes, new TLDs -- at the one
  -- moment a stranger was willing to give us one.
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$' then
    raise exception 'join_waitlist: not an email address' using errcode = '22023';
  end if;

  if length(v_email) > 320 then
    raise exception 'join_waitlist: address too long' using errcode = '22023';
  end if;

  insert into public.waitlist (email, source)
  values (v_email, nullif(btrim(coalesce(p_source, '')), ''))
  -- IDEMPOTENT, AND SILENT ABOUT IT. Doing nothing on conflict means a second submission succeeds
  -- exactly as the first did -- so this function cannot be used to ask whether an address is
  -- already on the list, which a distinguishable error would allow.
  on conflict (email) do nothing;
end;
$$;

comment on function public.join_waitlist(text, text) is
  'The only write path to public.waitlist. Anon-executable by design: the people signing up are not '
  'authenticated. Idempotent and silent on conflict, so it cannot be used to test whether an '
  'address is already present.';

revoke all on function public.join_waitlist(text, text) from public;
grant execute on function public.join_waitlist(text, text) to anon, authenticated;
