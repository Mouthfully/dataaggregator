/**
 * THE OFFLINE RUN. Five normalisers, their committed fixtures, and the envelope schema, executed
 * at render.
 *
 * BE PRECISE ABOUT WHAT "OFFLINE" MEANS HERE, because the loose version of the claim is false.
 * Nothing on this path opens a socket, constructs a database client or reads a credential: the
 * normalisers are pure functions over a literal, and the fixtures are literals. The barrel does
 * bring each source's `client.ts` into the module graph, and those modules contain the `fetch`
 * calls -- none of them is reached, and none could be, because no client function is called and no
 * credential exists to call one with.
 *
 * This is step 10 of docs/marketplane/MVP-PLAN.md, and its job is to be the demo that still works
 * when a live connector does not. Nothing here is transcribed: every row on the page is whatever
 * `packages/connectors` produced from whatever `fixtures.ts` holds, this render. If a normaliser
 * changes, the page changes with it, and if a normaliser breaks, the page breaks rather than
 * showing a number that was true last week.
 *
 * WHY THE FIXTURES ARE IMPORTED BY RELATIVE PATH AND THE NORMALISERS ARE NOT. `@repo/connectors`
 * declares `exports: { ".": "./src/index.ts" }`, so the barrel is the only subpath a bare specifier
 * can reach, and the barrel exports clients, normalisers and backfills -- never fixtures. The
 * alternative was to add a `./fixtures` export (or fixture re-exports) to that package, which is
 * owned by concurrent work; a relative path costs nothing at build time here, because
 * `transpilePackages` being non-empty already makes Next compile every file under `packages/`.
 * If that package later publishes a fixtures subpath, these five lines become bare imports.
 *
 * THE INPUTS ARE EACH SOURCE'S OWN CONTRACT-TEST INPUTS, not new ones invented for a page. The
 * clocks (`fetchedAt`, `firstSeenAt`) decide `is_provisional` and `restates_until`, so choosing
 * them casually would put a made-up freshness state on screen -- WooCommerce's orders are dated
 * after GA4's fetch, and a shared `fetchedAt` would have the shop's orders arriving before they
 * were placed.
 *
 * NOTHING HERE IS A RECORDING. Every `fixtures.ts` in the repository says so in its own header:
 * the responses are synthetic, written from documented response shapes, because no credential for
 * any of the five platforms exists in this tree. The page says it too, because a demo that looks
 * like production data and is not is exactly the quiet wrong number this product is sold against.
 */

import {
  normalizeGa4Report,
  normalizeGoogleAdsSearch,
  normalizeMetaInsights,
  normalizeSearchAnalytics,
  normalizeWooOrders,
} from "@repo/connectors";
import { CONVERSION_METRICS, type EnvelopeRow, envelopeRowSchema } from "@repo/contract";

import * as ga4Fixtures from "../../../../packages/connectors/src/sources/ga4/fixtures.ts";
import * as googleAdsFixtures from "../../../../packages/connectors/src/sources/google_ads/fixtures.ts";
import * as metaFixtures from "../../../../packages/connectors/src/sources/meta_ads/fixtures.ts";
import * as searchConsoleFixtures from "../../../../packages/connectors/src/sources/search_console/fixtures.ts";
import * as wooFixtures from "../../../../packages/connectors/src/sources/woocommerce/fixtures.ts";

/**
 * The fixture's exported NAME, read back out of the module rather than typed beside the import.
 *
 * A hand-written "DAILY_SESSIONS" label is the one thing on this page that could go stale without
 * anything failing: the import changes, the label does not, and the page then attributes one
 * fixture's numbers to another. Throwing is the correct failure here -- a page that cannot say
 * which fixture it ran should not render.
 */
function fixtureName(module: object, value: unknown): string {
  const found = Object.entries(module).find(([, exported]) => exported === value)?.[0];
  if (found === undefined) {
    throw new Error(
      "offline envelope: fixture is not an export of the module it was imported from",
    );
  }
  return found;
}

/** A normaliser option and the value it was given, for display. The payload itself is not one. */
export type Input = readonly [key: string, value: string];

function inputs(options: Record<string, unknown>): readonly Input[] {
  return Object.entries(options).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join(", ") : String(value),
  ]);
}

/** One row, with the schema's verdict on it. Both are computed; neither is asserted. */
export interface CheckedRow {
  readonly row: EnvelopeRow;
  readonly accepted: boolean;
}

export interface OfflineSource {
  /** The envelope's own `source` value, read off the first row rather than written here. */
  readonly id: string;
  /** The normaliser's function name, read off the function. */
  readonly normaliser: string;
  /** The fixture's export name, read off the fixture module. */
  readonly fixture: string;
  readonly inputs: readonly Input[];
  readonly rows: readonly CheckedRow[];
}

function check(rows: readonly EnvelopeRow[]): readonly CheckedRow[] {
  return rows.map((row) => ({ row, accepted: envelopeRowSchema.safeParse(row).success }));
}

function source(
  normaliser: { readonly name: string },
  module: object,
  fixture: unknown,
  options: Record<string, unknown>,
  rows: readonly EnvelopeRow[],
): OfflineSource {
  const [first] = rows;
  if (first === undefined) {
    throw new Error(`offline envelope: ${normaliser.name} produced no rows from its fixture`);
  }
  return {
    id: first.source,
    normaliser: normaliser.name,
    fixture: fixtureName(module, fixture),
    inputs: inputs(options),
    rows: check(rows),
  };
}

// ---------------------------------------------------------------------------------------------
// The five runs. Every option below is the one that source's own contract.test.ts passes.
// ---------------------------------------------------------------------------------------------

const GA4_INPUT = {
  propertyId: "properties/123456",
  fetchedAt: "2026-09-08T02:00:00Z",
  firstSeenAt: "2026-08-14T06:00:00Z",
};

const GOOGLE_ADS_INPUT = {
  level: "campaign",
  fetchedAt: "2026-09-08T02:00:00Z",
  firstSeenAt: "2026-08-14T06:00:00Z",
} as const;

/**
 * All six windows, because the fan-out IS the finding. One Meta insights row carries the same
 * purchase once per attribution window, so it becomes one delivery row with a null window plus one
 * row per window asked for -- see `sources/meta_ads/normalize.ts`, traps 1 and 2. Asking for one
 * window would hide the behaviour the page exists to show.
 */
const META_INPUT = {
  level: "campaign",
  adAccountId: metaFixtures.FIXTURE_ACCOUNT,
  timezone: "Asia/Bangkok",
  attributionWindows: ["1d_click", "7d_click", "28d_click", "1d_view", "7d_view", "28d_view"],
  fetchedAt: "2026-09-08T02:00:00Z",
  firstSeenAt: "2026-08-14T06:00:00Z",
} as const;

const SEARCH_CONSOLE_INPUT = {
  dimensions: ["date"],
  siteUrl: searchConsoleFixtures.FIXTURE_SITE_URL,
  fetchedAt: "2026-09-11T02:00:00Z",
  firstSeenAt: "2026-08-14T06:00:00Z",
} as const;

const WOO_INPUT = {
  storeUrl: "https://shop.example.com",
  timezone: "Asia/Bangkok",
  fetchedAt: "2026-09-10T02:00:00.000Z",
  firstSeenAt: "2026-09-10T02:00:00.000Z",
};

const GA4 = source(
  normalizeGa4Report,
  ga4Fixtures,
  ga4Fixtures.DAILY_SESSIONS,
  GA4_INPUT,
  normalizeGa4Report({ report: ga4Fixtures.DAILY_SESSIONS, ...GA4_INPUT }),
);

const GOOGLE_ADS = source(
  normalizeGoogleAdsSearch,
  googleAdsFixtures,
  googleAdsFixtures.DAILY_CAMPAIGNS,
  GOOGLE_ADS_INPUT,
  normalizeGoogleAdsSearch({
    response: googleAdsFixtures.DAILY_CAMPAIGNS,
    ...GOOGLE_ADS_INPUT,
  }),
);

const META_ADS = source(
  normalizeMetaInsights,
  metaFixtures,
  metaFixtures.DAILY_CAMPAIGN,
  META_INPUT,
  normalizeMetaInsights({ rows: metaFixtures.DAILY_CAMPAIGN, ...META_INPUT }),
);

const SEARCH_CONSOLE = source(
  normalizeSearchAnalytics,
  searchConsoleFixtures,
  searchConsoleFixtures.DAILY_TOTALS,
  SEARCH_CONSOLE_INPUT,
  normalizeSearchAnalytics({
    response: searchConsoleFixtures.DAILY_TOTALS,
    ...SEARCH_CONSOLE_INPUT,
  }).rows,
);

const WOOCOMMERCE = source(
  normalizeWooOrders,
  wooFixtures,
  wooFixtures.PAGE,
  WOO_INPUT,
  normalizeWooOrders({ orders: wooFixtures.PAGE, ...WOO_INPUT }),
);

export const SOURCES: readonly OfflineSource[] = [
  GA4,
  GOOGLE_ADS,
  META_ADS,
  SEARCH_CONSOLE,
  WOOCOMMERCE,
];

export const ROW_COUNT = SOURCES.reduce((total, s) => total + s.rows.length, 0);
export const ACCEPTED_COUNT = SOURCES.reduce(
  (total, s) => total + s.rows.filter((r) => r.accepted).length,
  0,
);

// ---------------------------------------------------------------------------------------------
// THE REFUSAL
//
// One row, one field, nulled. GA4 is the row to do it to: the platform exposes no selectable
// attribution window and adjusts at model level, so `model` is a label for what it actually did
// (`sources/ga4/normalize.ts`, trap 4). Remove the label and the count that remains is an
// unlabelled conversion count, which specification section 2 says the API refuses to emit.
//
// The error is rendered exactly as zod produced it. A prettier sentence in its place would be a
// claim ABOUT the refusal rather than the refusal, and the point of this page is that the schema
// is doing the refusing.
// ---------------------------------------------------------------------------------------------

const [labelled] = GA4.rows;
if (labelled === undefined) {
  throw new Error("offline envelope: GA4 produced no row to null the attribution window on");
}

/** The row as the normaliser emitted it, window intact. */
export const LABELLED_ROW: EnvelopeRow = labelled.row;

/** The same row with one field changed, and nothing else touched. */
export const UNLABELLED_ROW: EnvelopeRow = {
  ...LABELLED_ROW,
  dimensions: { ...LABELLED_ROW.dimensions, attribution_window: null },
};

const LABELLED_VERDICT = envelopeRowSchema.safeParse(LABELLED_ROW);
const UNLABELLED_VERDICT = envelopeRowSchema.safeParse(UNLABELLED_ROW);

/** Whether the schema took each row. Both are read from the parse, neither is asserted. */
export const LABELLED_ACCEPTED: boolean = LABELLED_VERDICT.success;
export const UNLABELLED_ACCEPTED: boolean = UNLABELLED_VERDICT.success;

/** zod's own issue list, serialised and not summarised. Empty only if the schema accepted it. */
export const REFUSAL_ISSUES: string = UNLABELLED_VERDICT.success
  ? ""
  : JSON.stringify(UNLABELLED_VERDICT.error.issues, null, 2);

/**
 * The conversion metrics that made the row refusable, read from the contract's own list rather
 * than named here. Hand-listing them is how a dictionary change stops being visible on the page.
 */
export const CONVERSION_METRICS_PRESENT: readonly string[] = CONVERSION_METRICS.filter(
  (name) => UNLABELLED_ROW.metrics[name] !== undefined,
);
