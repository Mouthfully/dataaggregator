import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnv } from "./env";

/**
 * The server-side Supabase client, bound to this request's cookies.
 *
 * EVERY READ IN THIS APP GOES THROUGH HERE rather than through a browser client, and that is a
 * tenancy decision rather than a rendering one. The session cookie is the only thing that makes
 * `app.current_user_id()` resolve, and `app.can_read_workspace()` is written against it -- so a
 * query issued on the server with this client is already scoped to the signed-in member by the
 * database. Nothing in this app filters by workspace in application code; if it did, that filter
 * would be the second place tenancy is decided and the one that eventually disagrees.
 */
export async function supabaseServer() {
  const { url, anonKey } = supabaseEnv();
  const store = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // A Server Component cannot set cookies. The middleware refreshes the session on every
          // request, so the write here is the redundant half of the pair, not the load-bearing one.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null.
 *
 * `getUser()` and NOT `getSession()`. getSession reads the cookie and trusts it; getUser verifies
 * the token against the auth server. On a page that decides what a person may see, the difference
 * is whether a forged cookie is believed.
 */
export async function currentUser() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
