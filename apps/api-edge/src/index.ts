/**
 * The API edge.
 *
 * `/health` proves the workerd target builds and runs. `/v1/performance` is the first real
 * endpoint; the remaining public surface (see `docs/marketplane/00-repo-map.md` section 4) lands
 * behind it.
 *
 * THE STORE AND THE AUTHENTICATOR ARE NOT BOUND HERE YET, and that is deliberate rather than
 * unfinished. `handlePerformance` takes both as ports (`src/performance.ts`), and whether rows
 * arrive over PostgREST with a minted workspace JWT or over a direct connection through Hyperdrive
 * is a decision that cannot be made honestly against a Supabase project that does not exist. Until
 * one does, the route answers 503 with the reason rather than pretending -- and the endpoint's
 * behaviour is fully tested against injected ports.
 */

import { handlePerformance } from "./performance.js";

export interface Env {
  readonly ENVIRONMENT?: string;
}

export default {
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      if (request.method !== "GET") {
        return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
      }
      return Response.json({ ok: true });
    }

    if (pathname === "/v1/performance") {
      // See the module note. A 503 naming the missing binding beats a 500 from a null store, and
      // beats an empty `data: []` that a caller would read as "no data" rather than "not wired".
      return Response.json(
        {
          ok: false,
          error: "not_configured",
          message:
            "`/v1/performance` has no store binding yet. The handler and its contract are " +
            "implemented and tested; the database connection is not configured on this deployment.",
        },
        { status: 503 },
      );
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export { handlePerformance };
