import { brand, formatAddress } from "@repo/brand";
import { ENVELOPE_FIELDS, SPINE, claim, productName } from "./_content";

/**
 * The marketing site's first screen.
 *
 * EVERY SENTENCE HERE COMES FROM `claim()`. Structural words -- headings, labels, the step names --
 * are the only prose written in this file, and a test asserts that every claim-shaped string in the
 * rendered HTML traces back to `@repo/brand`. See `app/_content.ts` for why.
 *
 * `00-repo-map.md` section 7: roughly 40% of the artboard's copy survives section 11. What is here
 * is that 40% -- the spine, the connector list, the envelope, the two-unit pricing line -- and
 * nothing from the 60% that section 11 dropped. The competitors card, the 22-source count, the
 * write-side promises, "Frankfurt by default" and "pay as you go" are absent because the claims list
 * makes them unreachable, not because I remembered to leave them out.
 *
 * NO HEX VALUES. Every colour is a token utility resolved through `@theme inline` in globals.css to
 * `@repo/tokens/tokens.css`, which the tokens guard enforces.
 */
export default function Page() {
  const name = productName();

  return (
    <main className="text-ink font-body">
      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 sm:pt-32">
        <p className="text-ink-subtle font-mono text-xs tracking-widest uppercase">
          {/* The product name is unsettled, so the eyebrow says what it is, not what it is called. */}
          {name ?? "A marketing data plane"}
        </p>
        <h1 className="font-display text-ink mt-6 text-4xl leading-tight tracking-tight text-balance sm:text-6xl">
          {claim("tagline")}
        </h1>
        <p className="text-ink-muted mt-6 max-w-2xl text-lg text-pretty">{claim("positioning")}</p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <span className="bg-accent text-ink-on-accent rounded-pill px-5 py-2.5 text-sm font-medium">
            Connect a workspace
          </span>
          <span className="border-line text-ink-muted rounded-pill border px-5 py-2.5 text-sm">
            Read the API
          </span>
        </div>

        <p className="text-ink-subtle mt-6 max-w-2xl text-sm">{claim("read-only-oauth")}</p>
      </section>

      {/* --------------------------------------------------------------- spine */}
      <section className="border-line-soft border-t">
        <div className="mx-auto grid max-w-5xl gap-px px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {SPINE.map(({ step, claim: id }, index) => (
            <div key={step} className="pr-6">
              <span className="bg-surface-inset text-ink-subtle rounded-pill inline-flex h-7 w-7 items-center justify-center font-mono text-xs">
                {index + 1}
              </span>
              <h2 className="font-display text-ink mt-4 text-xl">{step}</h2>
              <p className="text-ink-muted mt-2 text-sm text-pretty">{claim(id)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ envelope */}
      <section className="bg-surface border-line-soft border-y">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-display text-ink text-3xl tracking-tight">
            Every row says what it knows about itself
          </h2>
          <p className="text-ink-muted mt-4 max-w-2xl text-pretty">
            {claim("freshness-fields")} {claim("attribution-required")}
          </p>

          <dl className="border-line-soft mt-10 grid gap-px border-t sm:grid-cols-2">
            {ENVELOPE_FIELDS.map(({ field, note }) => (
              <div key={field} className="border-line-soft flex gap-4 border-b py-4 pr-6">
                <dt className="text-ink font-mono text-sm">{field}</dt>
                <dd className="text-ink-subtle text-sm">{note}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <p className="text-ink-muted text-sm text-pretty">{claim("fx-on-row")}</p>
            <p className="text-ink-muted text-sm text-pretty">{claim("restatement-webhook")}</p>
            <p className="text-ink-muted text-sm text-pretty">{claim("time-travel")}</p>
            <p className="text-ink-muted text-sm text-pretty">{claim("second-pass")}</p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- your data is yours */}
      <section className="bg-surface-inverse text-ink-on-inverse">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-display text-ink-inverse-strong text-3xl tracking-tight">
            Your credentials, your data, your tenant
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            {[
              "byoc",
              "tenant-isolation",
              "no-pooling",
              "no-training",
              "audit-log",
              "agency-mode",
            ].map((id) => (
              <li key={id} className="flex gap-3 text-sm text-pretty">
                <span className="bg-accent-on-dark rounded-pill mt-2 h-1.5 w-1.5 shrink-0" />
                {claim(id)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------- sources */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="font-display text-ink text-3xl tracking-tight">What it reads</h2>
        {/* No count, and no grid of twenty-two marks: section 11.9 narrowed the scope, and the
            forbidden-claims list makes a number here unrenderable. */}
        <p className="text-ink-muted mt-4 max-w-2xl text-pretty">{claim("connectors")}</p>
        <p className="text-ink-subtle mt-3 max-w-2xl text-sm text-pretty">{claim("serp-bought")}</p>
        <p className="text-ink-muted mt-8 max-w-2xl text-pretty">{claim("one-shape")}</p>
      </section>

      {/* ------------------------------------------------------------- pricing */}
      <section className="border-line-soft border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-display text-ink text-3xl tracking-tight">How it is priced</h2>
          <p className="text-ink-muted mt-4 max-w-2xl text-pretty">{claim("pricing-two-units")}</p>
          <p className="text-ink-subtle mt-3 max-w-2xl text-sm text-pretty">
            {claim("billing-fairness")}
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------- footer */}
      <footer className="bg-surface-inverse text-ink-on-inverse">
        <div className="mx-auto max-w-5xl px-6 py-12 text-sm">
          <p className="text-ink-inverse-strong font-medium">{brand.legalEntity}</p>
          <p className="mt-2">{formatAddress()}</p>
          <p className="mt-2">
            <a
              className="text-accent-on-dark underline-offset-4 hover:underline"
              href={`mailto:${brand.supportEmail}`}
            >
              {brand.supportEmail}
            </a>
          </p>
          <p className="text-ink-on-inverse/70 mt-2">
            Company registration {brand.companyRegistration}
          </p>
          {/* Deliberately no data-region, GDPR or DPA line. Those claims are withheld until the
              brand file carries the facts behind them -- see app/_content.ts. */}
        </div>
      </footer>
    </main>
  );
}
