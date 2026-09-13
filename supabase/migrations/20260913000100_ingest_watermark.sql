-- The ingest watermark, and the lease-ownership check the entry point recorded as a known gap.
--
-- 20260912000800_scheduler_entry_point.sql gave the scheduler an identity it can actually use.
-- Nothing has called it since, and wiring a caller surfaces two things that are wrong today. Both
-- are silent, both produce plausible numbers, and neither is reachable until something claims a
-- lease -- which is why they have survived.
--
-- ============================================================================================
-- ONE: `last_backfill_at` CANNOT BE THE WATERMARK, AND USING IT LEAVES A HOLE THE WIDTH OF THE RUN
-- ============================================================================================
--
-- A WooCommerce pull is a `modified_after` walk. To resume it you need the instant the last walk
-- reached. The obvious candidate is `last_backfill_at`, and it is wrong in a way that reads as
-- correct:
--
--   * `runIngest` pins `until = fetchedAt` at the START of the run, so the window it actually read
--     closes when the run BEGAN.
--   * `app.record_backfill` stamps `last_backfill_at = p_now` at the END.
--
-- So `last_backfill_at` is later than the window that was read, by exactly the duration of the run
-- -- up to the full fifteen-minute lease. Feeding it back in as the next `since` skips every order
-- modified while the run was in flight. Every night. The rows that go missing are the ones changed
-- during the pull, the totals stay plausible, and nothing ever errors.
--
-- `52-ingest-runtime.md` section 4 already recorded the shape of the fix -- "the watermark is not
-- persisted... storing it needs a security definer advance function" -- and this is that function.
-- The checkpoint is a SEPARATE COLUMN because it answers a different question from
-- `last_backfill_at`: "how far has the walk reached" rather than "was a pull completed for this
-- day". Collapsing them is what produces the hole.
--
-- ============================================================================================
-- TWO: CLOSING A LEASE DID NOT CHECK WHOSE IT WAS
-- ============================================================================================
--
-- 20260912000800's own comment names this, verbatim: "`app.record_backfill` does not check WHO
-- holds the lease, so an instance whose lease expired mid-run can still close the lease a different
-- instance has since taken." It was unreachable while nothing claimed. A caller makes it reachable,
-- and the consequence is not a lost update -- it is TWO INSTANCES PULLING THE SAME CONNECTION and
-- the second one's lease being released out from under it by the first, which spends a platform
-- quota shared across tenants twice and leaves whichever run finishes second writing rows nobody is
-- leasing for.
--
-- The check is one clause: `claimed_by = p_claimed_by`. Note what it does NOT do -- it does not
-- check `claimed_at`. An instance whose lease expired but which nobody displaced still owns the
-- row's `claimed_by`, and it should be allowed to close what it opened; the failure being prevented
-- is a DIFFERENT instance closing it, not a slow one closing its own.
--
-- ============================================================================================
-- THREE DECISIONS TAKEN HERE, each of which could have gone the other way
-- ============================================================================================
--
-- DECISION 1 -- THE FIRST WINDOW IS CHOSEN BY THE OPERATOR AT SEAL TIME, AND THIS IS A CORRECTION.
--
-- The sweep never invents a first `since` -- `52-ingest-runtime.md` section 4: "A default window on
-- a watermark walk is the worst kind: too short opens a silent hole, too long spends the merchant's
-- store on history it already has, and the operator learns neither." A cron has nobody to suggest a
-- number to, so a connection whose `ingest_checkpoint` is null is skipped and reported.
--
-- THE FIRST VERSION OF THIS DECISION SAID AN OPERATOR WOULD SEED IT THROUGH `POST /v1/ingest/run`,
-- AND THAT WAS A CLOSED LOOP. That route computes a checkpoint and RETURNS it in the response body;
-- it persists nothing (`apps/api-edge/src/index.ts`). This function only ever ADVANCES a checkpoint
-- that already exists. So nothing wrote the first one, every connection stayed
-- `awaiting_first_run` forever, and the nightly sweep could never pull a single row. It shipped
-- that way.
--
-- `scripts/seal-connection.ts` now takes a REQUIRED `--since` and writes `ingest_checkpoint` in the
-- INSERT. The operator sealing the connection is the one person who can answer the question, and
-- they are asked rather than defaulted to.
--
-- DECISION 2 -- THE CHECKPOINT ADVANCES ON PARTIAL PROGRESS, FORWARDS ONLY. This decision was taken
-- the other way first and was wrong, so it is recorded with its correction rather than rewritten.
--
-- The instinct was the house rule: do not trust the arithmetic of a run that failed for an unknown
-- reason. It does not apply here, because `runIngest` does not offer a checkpoint arrived at by
-- arithmetic -- it awaits the write of each page before pulling the next, so every page behind a
-- reported checkpoint is already in the database. That is the connector's own documented guarantee
-- and it is what makes a partial advance safe.
--
-- Holding it back cost something real: a walk longer than one fifteen-minute invocation would have
-- restarted from the same `since` every night, forever, reporting a failure each time and never
-- finishing. `greatest` keeps it monotonic, so a run that failed before completing a chunk cannot
-- drag the watermark backwards.
--
-- DECISION 3 -- WHOSE MIDNIGHT IS STILL OPEN, AND IS NOT SETTLED HERE. `app.due_connections` offers
-- a connection when `last_backfill_at < date_trunc('day', p_now)`. `date_trunc` truncates in the
-- SESSION's TimeZone, and nothing in this repository sets one -- not config.toml, not a migration,
-- not the shim. So the boundary deciding whether a Thai cafe is pulled today is a setting outside
-- this repository, and it is NOT `connections.timezone`, which exists and which this predicate does
-- not read. Making it timezone-aware means replacing this function's body and deciding what a null
-- timezone does there -- and 20260912000400's own rule forbids `coalesce(timezone, 'UTC')`, calling
-- a default "a guess wearing the costume of a fact". That is a founder decision with a cost, so the
-- predicate is untouched and the marketing copy that asserted a local read time is deleted instead.

-- ---------------------------------------------------------------------------------------------
-- The watermark column.
-- ---------------------------------------------------------------------------------------------
alter table public.connections
  add column if not exists ingest_checkpoint timestamptz;

comment on column public.connections.ingest_checkpoint is
  'How far the incremental walk has reached, as the instant the last completed window CLOSED. Null '
  'means never walked, and a null is refused by the sweep rather than filled in with a guessed '
  'first window. Distinct from last_backfill_at, which records that a pull finished and is stamped '
  'at the END of a run -- using that as the resume point skips every row modified during the run.';

-- ---------------------------------------------------------------------------------------------
-- The inner function, with the two new parameters.
--
-- A NEW ARITY AND THEN THE OLD ONE IS DROPPED, rather than both living side by side. A guard with a
-- door beside it is not a guard: leaving `app.record_backfill(uuid, boolean, timestamptz)` granted
-- would keep the anonymous-lease, no-checkpoint path reachable by exactly the role this change is
-- narrowing.
-- ---------------------------------------------------------------------------------------------
create or replace function app.record_backfill(
  p_connection_id uuid,
  p_succeeded boolean,
  p_now timestamptz,
  p_claimed_by text,
  p_checkpoint timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed boolean;
begin
  if p_claimed_by is null or btrim(p_claimed_by) = '' then
    raise exception
      'record_backfill: p_claimed_by must name the instance closing the lease. Without it the '
      'ownership check is a clause that always matches, which is the gap this parameter exists to '
      'close.'
      using errcode = '22023';
  end if;

  -- The same refusal `runIngest` makes about `until`, for the same reason and one layer down: a
  -- checkpoint in the future claims a window that was never read, and the next walk starts after
  -- rows nobody pulled. A clock skew between a Worker and the database is enough to produce it.
  if p_checkpoint is not null and p_checkpoint > p_now then
    raise exception
      'record_backfill: p_checkpoint (%) is after the recording instant (%). A checkpoint ahead of '
      'now claims a window that was never read, and the next walk would start past it.',
      p_checkpoint, p_now
      using errcode = '22023';
  end if;

  update public.connections
     set last_backfill_at =
           case when p_succeeded then p_now else last_backfill_at end,
         -- THE CHECKPOINT ADVANCES ON PARTIAL PROGRESS TOO, AND ONLY EVER FORWARDS.
         --
         -- This was "only on success", and that was wrong for this connector specifically. The
         -- generic instinct -- do not trust the arithmetic of a run that failed for an unknown
         -- reason -- does not apply, because `apps/api-edge/src/ingest.ts` does not offer a
         -- checkpoint arrived at by arithmetic. It awaits the WRITE of each page before pulling the
         -- next, and says so: "by the time a checkpoint is offered EVERY PAGE BEHIND IT IS ALREADY
         -- IN THE DATABASE". A failed run's checkpoint is the last chunk read in full, which is
         -- precisely where a resume is safe.
         --
         -- Holding it back had a cost that was not hypothetical: `last_backfill_at` does not
         -- advance on failure, so the connection is re-offered the next night -- and it would have
         -- restarted from the same `since` every night forever, never finishing a walk longer than
         -- one fifteen-minute invocation, while reporting a failure each time.
         --
         -- GREATEST, NOT ASSIGNMENT. A run that failed before completing a chunk reports the `since`
         -- it started from; assigning that would move the watermark BACKWARDS and re-walk rows
         -- already written. `greatest` ignores a null first argument, so a first advance still
         -- lands.
         ingest_checkpoint =
           case
             when p_checkpoint is not null then greatest(ingest_checkpoint, p_checkpoint)
             else ingest_checkpoint
           end,
         claimed_at = null,
         claimed_by = null
   where id = p_connection_id
     -- THE OWNERSHIP CHECK. Deliberately not also comparing `claimed_at`: an instance whose lease
     -- expired but which nobody displaced still owns this row and may close what it opened.
     and claimed_by = p_claimed_by
  returning true into v_closed;

  -- False is an OUTCOME, not an error: it means another instance holds this lease now, which a
  -- caller needs to know and must not treat as a failed pull.
  return coalesce(v_closed, false);
end;
$$;

-- The old arity goes, and its grants with it. Order matters: revoke, then drop.
revoke all on function app.record_backfill(uuid, boolean, timestamptz) from public, anon, authenticated;
drop function if exists app.record_backfill(uuid, boolean, timestamptz);

revoke all on function app.record_backfill(uuid, boolean, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function app.record_backfill(uuid, boolean, timestamptz, text, timestamptz)
  to app_scheduler;

-- ---------------------------------------------------------------------------------------------
-- The public forwarder, same posture as 20260912000800: SECURITY INVOKER, no clock parameter.
--
-- THE CLOCK STILL IS NOT A PARAMETER. Everything 20260912000800 said about that applies unchanged,
-- and the new checkpoint parameter makes it sharper rather than weaker: `p_checkpoint > p_now` is
-- the only thing standing between a caller and a watermark set in the future, and a caller-supplied
-- `p_now` would let the same caller defeat it by moving both.
--
-- IT RETURNS jsonb AND NOT timestamptz, which is a change from the two-argument form it replaces.
-- The caller now needs two facts -- the instant recorded, and whether the lease was still ours --
-- and a null timestamptz cannot carry both: null would mean "lease lost" and would be
-- indistinguishable from a transport failure at the adapter. `returns void` is still ruled out for
-- the reason the old comment gives: PostgREST answers it with 204 and an empty body, which the
-- store adapter reads as a non-JSON answer.
-- ---------------------------------------------------------------------------------------------
create or replace function public.record_backfill(
  p_connection_id uuid,
  p_succeeded boolean,
  p_claimed_by text,
  p_checkpoint timestamptz default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $fn$
declare
  -- Read once, then both passed and returned, so the value reported is the value recorded.
  v_now timestamptz := now();
  v_closed boolean;
begin
  if p_connection_id is null then
    raise exception 'record_backfill: p_connection_id is required'
      using errcode = '22023';
  end if;
  if p_succeeded is null then
    raise exception
      'record_backfill: p_succeeded must be true or false. A null is recorded as a FAILURE and the '
      'connection is pulled again tomorrow for data already stored.'
      using errcode = '22023';
  end if;

  v_closed := app.record_backfill(p_connection_id, p_succeeded, v_now, p_claimed_by, p_checkpoint);
  return jsonb_build_object('recorded_at', v_now, 'lease_closed', v_closed);
end;
$fn$;

-- The two-argument form goes. It had no ownership check and no checkpoint, so leaving it callable
-- would leave every property above optional.
revoke all on function public.record_backfill(uuid, boolean) from public, anon, authenticated;
drop function if exists public.record_backfill(uuid, boolean);

-- THE REVOKE, WHICH IS THE WHOLE SECURITY PROPERTY. PostgreSQL grants EXECUTE on a NEW function to
-- PUBLIC, and `alter default privileges` cannot revoke it -- 20260912000200_position.sql records an
-- incident in this schema where omitting exactly these lines made three assertions fail with
-- "POLICY BYPASS". `public` is named, not merely `anon`: anon and authenticated are members of
-- PUBLIC, so revoking from them while PUBLIC holds the grant changes nothing.
--
-- Without this line the anon key -- which is public by design and ships in browsers -- could close
-- any lease in the system and stamp any connection's watermark.
revoke all on function public.record_backfill(uuid, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_backfill(uuid, boolean, text, timestamptz) to app_scheduler;
