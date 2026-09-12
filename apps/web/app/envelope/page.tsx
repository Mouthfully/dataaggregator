import type { Metadata } from "next";

import { Footer, SiteHeader } from "../_chrome";
import {
  ACCEPTED_COUNT,
  CONVERSION_METRICS_PRESENT,
  LABELLED_ACCEPTED,
  LABELLED_ROW,
  type OfflineSource,
  REFUSAL_ISSUES,
  ROW_COUNT,
  SOURCES,
  UNLABELLED_ACCEPTED,
  UNLABELLED_ROW,
} from "./_offline";

/**
 * THE OFFLINE ENVELOPE PAGE -- step 10 of docs/marketplane/MVP-PLAN.md.
 *
 * Insurance. Every row on it was produced during this render by the five normalisers in
 * `@repo/connectors`, from the fixtures committed beside them, and then parsed by the real
 * `envelopeRowSchema`. No fetch is made, no database client is constructed and no credential is
 * read, so the page cannot fail because a token expired or a platform was slow -- which is the
 * whole reason it exists: it is the demo that still works when a live connector does not. See
 * `_offline.ts` for the exact shape of that claim.
 *
 * THE SECOND HALF IS THE POINT. One row's `attribution_window` is set to null and nothing else is
 * touched, and the schema's refusal is printed AS THE SCHEMA PRODUCED IT -- zod's issue list,
 * serialised, with its path and its message. It is not a hand-written sentence describing a
 * refusal, because a sentence would prove only that someone wrote one. A prettified error would be
 * a lie about what the system does.
 *
 * EVERY SENTENCE HERE IS A NAMED CONSTANT, which `scripts/check-copy.mjs` requires: prose typed
 * into the JSX renders exactly like reviewed prose and is exactly how an unreviewed promise ships.
 * Table headers, field names and the row values themselves are structural and stay inline.
 *
 * NO NUMBER ON THIS PAGE IS WRITTEN DOWN. The counts, the row values, the currencies, the
 * timezones and the verdicts are all read back out of the rows. A count typed into the copy would
 * be right the day it was typed and wrong the day a fixture gained a row, and a wrong number that
 * looks right is the worst thing this page could ship.
 */

const EYEBROW = "Offline demonstration";
const HEADING = "The envelope, without a network.";
const LEAD =
  "Five connector normalisers ran while this page was rendered, against the response fixtures committed next to them in the repository. Nothing was fetched, no database was read, and no credential exists anywhere in this page.";
// THE LAST CLAUSE USED TO READ "and every fixture file says so in its own header", which was a
// claim about the repository rather than about the data, and it was false: four of the five
// headers use the word "synthetic" (ga4, google_ads, meta_ads, search_console), and
// woocommerce/fixtures.ts uses it zero times -- it says "Shaped from the documented `wc/v3` order
// object" and "The names are invented", which means the same thing in different words.
//
// The substance held for all five and the sentence was still wrong, which is the failure this page
// exists to illustrate. It now says what is true of the fixtures and stops there.
const PROVENANCE =
  "The fixtures are synthetic. Each one was written from a documented response shape rather than recorded from a live account, because no credential for any of these five platforms exists in this repository.";

const SUMMARY_SOURCES = "Sources normalised";
const SUMMARY_ROWS = "Envelope rows produced";
const SUMMARY_ACCEPTED = "Rows the schema accepted";

const ROWS_HEADING = "What the normalisers produced";
const ROWS_NOTE =
  "Each panel names the normaliser that ran, the fixture it read and the options it was given. Those options are the ones that source's own contract test uses, because the fetch and first-seen clocks decide whether a row is still provisional.";

const REFUSAL_HEADING = "The refusal";
const REFUSAL_LEAD =
  "One row is taken from the GA4 panel above and one field on it is set to null. Nothing else about the row changes, and the schema is then asked to parse it again.";
const REFUSAL_WHY =
  "GA4 exposes no selectable attribution window, so the normaliser labels the row with the model the platform applied. Remove that label and what remains is a conversion count nobody can attribute to anything.";
const REFUSAL_OUTPUT =
  "Below is what the schema returned, serialised exactly as it produced it and not rewritten into a friendlier sentence.";
const REFUSAL_UNEXPECTED =
  "The schema accepted the unlabelled row, which is the failure this page was built to catch. Read the contract, not this page.";

const BEFORE_LABEL = "As the normaliser emitted it";
const AFTER_LABEL = "With the window nulled";
const VERDICT_ACCEPTED = "accepted";
const VERDICT_REFUSED = "refused";

const LIMITS_HEADING = "What this page does not show";
const LIMITS_BODY =
  "No row here came from a platform, a workspace or a customer, and nothing on this page has been written to a database. It demonstrates the normalisers and the schema, and it demonstrates them on invented responses.";

/** Distinct values a source put on its rows. Derived, so a second currency cannot hide. */
function distinct(values: readonly string[]): string {
  return [...new Set(values)].join(", ");
}

function metricList(metrics: Record<string, number | undefined>): string {
  return Object.entries(metrics)
    .map(([name, value]) => `${name} ${value}`)
    .join("   ");
}

function SourcePanel({ source }: { source: OfflineSource }) {
  const currencies = distinct(source.rows.map((r) => r.row.dimensions.currency));
  const timezones = distinct(source.rows.map((r) => r.row.dimensions.timezone));

  return (
    <section className="border-line bg-surface overflow-hidden rounded-[16px] border">
      <header className="border-line-soft flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-5 py-4">
        <h3 className="text-ink font-mono text-base font-bold">{source.id}</h3>
        <p className="text-ink-muted font-mono text-xs">
          {source.normaliser}
          {" · "}
          {source.fixture}
        </p>
        <p className="text-ink-subtle ml-auto font-mono text-xs">
          {currencies}
          {" · "}
          {timezones}
        </p>
      </header>

      <dl className="border-line-soft flex flex-wrap gap-x-6 gap-y-1 border-b px-5 py-3 font-mono text-xs">
        {source.inputs.map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <dt className="text-ink-faint">{key}</dt>
            <dd className="text-ink-muted">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left font-mono text-xs">
          <thead className="text-ink-faint">
            <tr className="border-line-soft border-b">
              <th className="px-5 py-2 font-normal">Date</th>
              <th className="px-5 py-2 font-normal">Entity</th>
              <th className="px-5 py-2 font-normal">Window</th>
              <th className="px-5 py-2 font-normal">Metrics</th>
              <th className="px-5 py-2 font-normal">Provisional</th>
              <th className="px-5 py-2 font-normal">Restates until</th>
              <th className="px-5 py-2 font-normal">Schema</th>
            </tr>
          </thead>
          <tbody className="text-ink-muted">
            {source.rows.map(({ row, accepted }, index) => (
              <tr
                // The upsert key is unique per row by construction: section 7's
                // (source, account_id, entity_id, date, attribution_window). The index guards the
                // one case it does not cover -- a fixture that emits the same key twice, which is
                // a bug worth seeing rather than a reason to drop a row.
                key={`${row.entity.id}-${row.dimensions.date}-${row.dimensions.attribution_window}-${index}`}
                className="border-line-soft border-b last:border-b-0"
              >
                <td className="text-ink px-5 py-2 whitespace-nowrap">{row.dimensions.date}</td>
                <td className="px-5 py-2 whitespace-nowrap">
                  {row.entity.type}
                  {" · "}
                  {row.entity.id}
                </td>
                <td className="px-5 py-2 whitespace-nowrap">
                  {row.dimensions.attribution_window ?? "null"}
                </td>
                <td className="text-ink px-5 py-2 whitespace-nowrap">{metricList(row.metrics)}</td>
                <td className="px-5 py-2">{String(row.is_provisional)}</td>
                <td className="px-5 py-2 whitespace-nowrap">{row.restates_until ?? "null"}</td>
                <td className="px-5 py-2">{accepted ? VERDICT_ACCEPTED : VERDICT_REFUSED}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowCard({
  label,
  row,
  accepted,
}: {
  label: string;
  row: typeof LABELLED_ROW;
  accepted: boolean;
}) {
  return (
    <div className="border-line bg-surface rounded-[16px] border p-5">
      <p className="text-ink-faint text-xs">{label}</p>
      <dl className="mt-3 grid gap-1 font-mono text-xs">
        <div className="flex gap-2">
          <dt className="text-ink-faint w-44 shrink-0">dimensions.date</dt>
          <dd className="text-ink-muted">{row.dimensions.date}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-faint w-44 shrink-0">dimensions.attribution_window</dt>
          <dd className="text-ink">{row.dimensions.attribution_window ?? "null"}</dd>
        </div>
        {CONVERSION_METRICS_PRESENT.map((name) => (
          <div key={name} className="flex gap-2">
            <dt className="text-ink-faint w-44 shrink-0">metrics.{name}</dt>
            <dd className="text-ink-muted">
              {String(row.metrics[name as keyof typeof row.metrics])}
            </dd>
          </div>
        ))}
        <div className="flex gap-2">
          <dt className="text-ink-faint w-44 shrink-0">envelopeRowSchema</dt>
          <dd className="text-ink">{accepted ? VERDICT_ACCEPTED : VERDICT_REFUSED}</dd>
        </div>
      </dl>
    </div>
  );
}

export const metadata: Metadata = {
  title: "The envelope, offline",
  description:
    "Five connector normalisers run against their committed fixtures, and the envelope schema refuses an unlabelled conversion count.",
  alternates: { canonical: "/envelope" },
};

export default function EnvelopePage() {
  return (
    <>
      <SiteHeader />

      <main className="bg-ground">
        <div className="mx-auto max-w-[1200px] px-8 py-16">
          <p className="text-ink-faint text-xs tracking-[0.08em] uppercase">{EYEBROW}</p>
          <h1 className="text-ink mt-3 max-w-[16ch] text-4xl leading-[1.05] font-bold md:text-5xl">
            {HEADING}
          </h1>
          <p className="text-ink-muted mt-5 max-w-[70ch] text-lg">{LEAD}</p>
          <p className="border-line bg-surface-inset text-ink-muted mt-5 max-w-[70ch] rounded-[10px] border p-4 text-sm">
            {PROVENANCE}
          </p>

          <dl className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              [SUMMARY_SOURCES, SOURCES.length],
              [SUMMARY_ROWS, ROW_COUNT],
              [SUMMARY_ACCEPTED, ACCEPTED_COUNT],
            ].map(([label, value]) => (
              <div key={String(label)} className="border-line bg-surface rounded-[16px] border p-5">
                <dt className="text-ink-muted text-sm">{label}</dt>
                <dd className="text-ink mt-2 font-mono text-3xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          <h2 className="text-ink mt-16 text-2xl font-bold">{ROWS_HEADING}</h2>
          <p className="text-ink-muted mt-3 max-w-[70ch] text-sm">{ROWS_NOTE}</p>

          <div className="mt-6 grid gap-5">
            {SOURCES.map((source) => (
              <SourcePanel key={source.id} source={source} />
            ))}
          </div>

          <h2 className="text-ink mt-16 text-2xl font-bold">{REFUSAL_HEADING}</h2>
          <p className="text-ink-muted mt-3 max-w-[70ch] text-sm">{REFUSAL_LEAD}</p>
          <p className="text-ink-muted mt-3 max-w-[70ch] text-sm">{REFUSAL_WHY}</p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <RowCard label={BEFORE_LABEL} row={LABELLED_ROW} accepted={LABELLED_ACCEPTED} />
            <RowCard label={AFTER_LABEL} row={UNLABELLED_ROW} accepted={UNLABELLED_ACCEPTED} />
          </div>

          <p className="text-ink-muted mt-6 max-w-[70ch] text-sm">
            {UNLABELLED_ACCEPTED ? REFUSAL_UNEXPECTED : REFUSAL_OUTPUT}
          </p>

          {REFUSAL_ISSUES === "" ? null : (
            <pre className="bg-surface-inverse text-ink-on-inverse mt-4 overflow-x-auto rounded-[16px] p-5 font-mono text-xs leading-relaxed">
              {REFUSAL_ISSUES}
            </pre>
          )}

          <h2 className="text-ink mt-16 text-2xl font-bold">{LIMITS_HEADING}</h2>
          <p className="text-ink-muted mt-3 max-w-[70ch] text-sm">{LIMITS_BODY}</p>
        </div>
      </main>

      <Footer />
    </>
  );
}
