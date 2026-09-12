"use server";

import { createClient } from "@supabase/supabase-js";

import { isAuthConfigured, supabaseEnv } from "../_auth/env";

/**
 * JOINING THE WAITING LIST.
 *
 * Uses the ANON key with no session, deliberately. `public.join_waitlist` is one of exactly three
 * anon-executable functions in the schema, and `07_anon_grants.sql` enumerates and defends that
 * set -- the people signing up are by definition not authenticated, so this is the one write that
 * genuinely belongs to a stranger.
 *
 * It does NOT use the service-role key. That key exists in this app in exactly one route, the
 * Stripe webhook, and a second holder would be a second place where a bug becomes a write nothing
 * constrains. The database function is narrow enough that anon is the right caller.
 *
 * A NOT-YET-CREATED ADDRESS AND AN ALREADY-PRESENT ONE GET THE SAME ANSWER. The function does
 * nothing on conflict, so this returns success either way; distinguishing them would turn a
 * waiting-list form into a way to ask whether an address is on it.
 */

export interface WaitlistState {
  readonly ok?: boolean;
  readonly error?: string;
}

const GENERIC_FAILURE = "That did not go through. Try again in a moment.";
const NOT_AN_ADDRESS = "Enter an email address we can reach you at.";

export async function joinWaitlist(
  _previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim();
  const source = String(formData.get("source") ?? "").slice(0, 120);

  // Shape only, and the same shape the database function enforces. A stricter test here would
  // refuse real addresses at the one moment a stranger was willing to hand one over.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    return { error: NOT_AN_ADDRESS };
  }

  if (!isAuthConfigured()) return { error: GENERIC_FAILURE };

  const { url, anonKey } = supabaseEnv();
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.rpc("join_waitlist", {
    p_email: email,
    p_source: source || null,
  });

  // The database's message is not surfaced. It would name the function and its errcode, and a
  // stranger is not its reader.
  return error ? { error: GENERIC_FAILURE } : { ok: true };
}
