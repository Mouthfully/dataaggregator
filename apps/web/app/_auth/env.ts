/**
 * THE SUPABASE BINDINGS, READ ONCE AND REFUSED LOUDLY.
 *
 * Two variables, both PUBLIC by design: the URL and the anon key are shipped to every browser that
 * loads the app, and they are not secrets. What protects a tenant's data is row-level security --
 * `app.can_read_workspace()` opens exactly the workspaces the signed-in user is a member of, and
 * an anon key with no session reaches no row at all, which
 * `20260911000100_anon_has_nothing.sql` asserts.
 *
 * THE SERVICE-ROLE KEY IS DELIBERATELY ABSENT FROM THIS APP, and must stay absent. It bypasses
 * every policy in the schema, so a single import of it into a Next route would turn a bug in that
 * route into a cross-tenant read. `20260908000800_api_key_verification.sql` already refuses the
 * same shortcut for the Worker; this is the same rule on the other surface.
 *
 * Missing configuration THROWS rather than degrading. A sign-in page that renders with no backend
 * behind it collects a person's email address and does nothing with it, which is worse than a page
 * that fails to build.
 */

export interface SupabaseEnv {
  readonly url: string;
  readonly anonKey: string;
}

export function supabaseEnv(env: Record<string, string | undefined> = process.env): SupabaseEnv {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    const missing = [
      url ? null : "NEXT_PUBLIC_SUPABASE_URL",
      anonKey ? null : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter((name): name is string => name !== null)
      .join(", ");
    throw new Error(
      `supabase: ${missing} is not set. Sign-in cannot work without it, and a sign-in form with ` +
        "no backend behind it takes an address and does nothing with it. Refusing to render.",
    );
  }
  return { url, anonKey };
}

/** Whether sign-in is configured at all, for surfaces that must render either way. */
export function isAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
