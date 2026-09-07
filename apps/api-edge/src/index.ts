/**
 * Health check only. This Worker exists to prove the workerd target builds, typechecks
 * and tests inside this workspace -- it is not the real API. The public REST surface
 * (23 endpoints, see docs/marketplane/00-repo-map.md section 4) lands later.
 */

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

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
