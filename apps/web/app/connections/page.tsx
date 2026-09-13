import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAuthConfigured } from "../_auth/env";
import { currentUser } from "../_auth/server";
import { currentWorkspace } from "../_auth/workspace";
import { Footer, SiteHeader } from "../_chrome";
import { CONNECTIONS } from "../_content";
import { workspaceConnections } from "./_connections";
import { OAUTH_ONLY_PROVIDERS } from "./_providers";
import { ConnectionTable } from "./_table";
import { ConnectForm } from "./form";

/**
 * THE SCREEN A CUSTOMER USES TO ATTACH A SOURCE ITSELF.
 *
 * Until this route existed nothing in this app created a connection at all: a paying customer could
 * sign in, see an empty dashboard, and have no way to give us a single row of data. Everything
 * underneath was built -- the vault, `connections`, the connectors, the scheduler and
 * `POST /v1/connections` -- and the only missing piece was a form.
 *
 * TWO HALVES, AND THEY READ THROUGH DIFFERENT DOORS ON PURPOSE. The list is a PostgREST select as
 * the signed-in person, with no workspace predicate, because `connections_select` decides which
 * rows exist for this session. The form posts to the Worker, because the key that seals a
 * credential lives there and must not be on this deploy target. See `_connections.ts` and
 * `actions.ts`; each says why at the point where it would be tempting to do otherwise.
 *
 * WHY IT IS `force-dynamic`, the same reason the dashboard is: with no Supabase variables set at
 * BUILD time this page never touches cookies and Next would prerender it, so a deployment that
 * later sets them would serve a cached, signed-out page to a signed-in person -- a difference that
 * only appears in production.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connections",
  description: CONNECTIONS.lead,
  // A signed-in surface that collects credentials has no business in a search result.
  robots: { index: false, follow: false },
};

export default async function ConnectionsPage() {
  if (!isAuthConfigured()) redirect("/signin");

  // The middleware already refuses an unauthenticated request to this path. This is the second
  // check and it is not redundant: a matcher edit can turn the first one off, and a page that
  // renders credentials-adjacent state must not depend on a routing rule for its access decision.
  const user = await currentUser();
  if (!user) redirect("/signin?next=%2Fconnections");

  const workspace = await currentWorkspace();
  const connections = workspace.kind === "ready" ? await workspaceConnections() : null;

  return (
    <>
      <SiteHeader />

      <main id="main" className="bg-ground min-h-[calc(100dvh-94px)]">
        <div className="mx-auto max-w-[960px] px-8 pt-12 pb-16">
          <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
            {CONNECTIONS.eyebrow}
          </span>
          <h1 className="font-display text-ink mt-3 text-[clamp(30px,3.4vw,40px)] leading-[1.1] font-semibold tracking-[-0.04em]">
            {CONNECTIONS.heading}
          </h1>
          <p className="text-ink-muted mt-4 max-w-[620px] leading-relaxed">{CONNECTIONS.lead}</p>

          {workspace.kind === "ready" ? null : (
            <p className="border-line bg-surface text-ink-muted mt-8 rounded-lg border border-dashed px-5 py-4 text-sm leading-relaxed">
              {workspace.kind === "needsOrganisation"
                ? CONNECTIONS.needsWorkspace
                : CONNECTIONS.workspaceUnavailable}
            </p>
          )}

          {connections === null ? null : (
            <section className="border-line bg-surface mt-8 rounded-xl border p-6">
              <h2 className="font-display text-ink text-xl font-semibold tracking-[-0.02em]">
                {CONNECTIONS.listHeading}
              </h2>
              <p className="text-ink-subtle mt-2 text-xs leading-relaxed">{CONNECTIONS.listNote}</p>

              {connections.kind === "unavailable" ? (
                <p className="text-ink-muted mt-4 text-sm leading-relaxed">
                  {CONNECTIONS.listUnavailable}
                </p>
              ) : connections.rows.length === 0 ? (
                <p className="text-ink-muted mt-4 text-sm leading-relaxed">
                  {CONNECTIONS.listEmpty}
                </p>
              ) : (
                <ConnectionTable rows={connections.rows} />
              )}
            </section>
          )}

          {workspace.kind === "ready" ? (
            <section className="border-line bg-surface mt-6 rounded-xl border p-6">
              <h2 className="font-display text-ink text-xl font-semibold tracking-[-0.02em]">
                {CONNECTIONS.formHeading}
              </h2>
              <div className="mt-4">
                <ConnectForm />
              </div>
            </section>
          ) : null}

          {/* OAUTH SOURCES ARE NAMED AND MARKED, NEVER OFFERED. `/v1/connections` refuses
              `credential_lane: oauth` by design -- an authorisation arrives at a redirect URI as a
              code to exchange -- so a button here would start a flow that does not exist. A
              customer who sees nothing cannot tell "coming" from "never supported". */}
          <section className="border-line mt-6 rounded-xl border border-dashed p-6">
            <h2 className="font-display text-ink text-xl font-semibold tracking-[-0.02em]">
              {CONNECTIONS.oauthHeading}
            </h2>
            <p className="text-ink-muted mt-2 max-w-[620px] text-sm leading-relaxed">
              {CONNECTIONS.oauthNote}
            </p>
            <ul className="mt-4 flex flex-wrap gap-3">
              {OAUTH_ONLY_PROVIDERS.map((id) => (
                <li
                  key={id}
                  className="border-line text-ink-muted flex items-center gap-3 rounded-[10px] border px-4 py-2 text-sm"
                >
                  {CONNECTIONS.providerNames[id] ?? id}
                  <span className="text-ink-faint text-xs">{CONNECTIONS.oauthBadge}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
