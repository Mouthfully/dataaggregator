/**
 * Meta Ads -> backfill.
 *
 * The third file of the connector unit (specification section 13.3), and the one that joins the
 * other two: `planBackfill` in @repo/extract decides WHICH days to pull, `client.ts` fetches them,
 * `normalize.ts` turns them into envelope rows. This is the orchestration, and it owns four
 * decisions neither neighbour can make.
 *
 * ONE: THIS ONE DOES GO THROUGH `planBackfill`, AND THAT IS A READ RATHER THAN A HABIT.
 * `RESTATEMENT_CLOCKS.meta_ads.windowDays` is 28 -- a published window, not a null -- so the
 * tiered D-0/D-1/D-3/D-7/D-28 ladder is exactly the shape this source needs, and the planner
 * already enforces the 10-per-ad-account cap section 9 names. `woocommerce/backfill.ts` drives
 * its own windows because its clock is null and no window ever closes; copying that here would
 * throw away a ladder the platform's own restatement window justifies.
 *
 * TWO: THE TIMEZONE IS FETCHED ONCE, BEFORE THE FIRST INSIGHTS REQUEST, AND `getAdAccount` IS THE
 * ONLY PLACE IT CAN COME FROM. The insights edge returns `account_currency` and NO timezone, while
 * every `date_start` it reports is a day boundary in the ad account's own zone. So the ingest date
 * of every row in this run depends on one field of one response, and a default of UTC would move a
 * Bangkok advertiser's day by seven hours and still parse -- rows attributed to the wrong day,
 * which no downstream check can detect. Each source answers this question from the one place that
 * knows: GA4 reads `metadata.timeZone` off its own report, WooCommerce is handed the store's zone
 * from `public.connections.timezone` and refuses to run without it, Search Console has a
 * documented constant. Meta's answer is the account node, so the account node is read first and
 * reused for the whole run rather than per window.
 *
 * THREE: ONE BATCH PER PAGE, WHERE GA4 YIELDS ONE PER WINDOW. GA4 accumulates a window's rows
 * because a day of one property is small. Here the fan-out is `1 + attributionWindows.length`
 * envelope rows per insights row, and `client.ts` has already done the arithmetic: at ad level
 * with seven windows a page of 500 insights rows is 4,000 envelope rows, "already the size at
 * which the caller must be streaming rather than accumulating". Buffering a window would spend
 * that page bound on nothing.
 *
 * FOUR: A THROTTLE STOP ENDS THE WHOLE PLAN, NOT THE WINDOW. Two ceilings sit behind one pull and
 * both are shared: the per-ad-account insights quota is the CUSTOMER'S, and the application
 * throttle score is OURS AND SHARED ACROSS EVERY TENANT (section 3.2). Moving to the next window
 * after a stop spends the same exhausted allowance on both. So the refusal propagates, the pages
 * that arrived have already been handed over -- they are yielded as they are read -- and the
 * remainder is a job for the next sweep. Nothing is salvaged from a page that failed, because a
 * page only reaches the normaliser after `getInsightsPage` has accepted its body and its `data`
 * array; a response this connector does not model never becomes a batch at all.
 *
 * AND `first_seen_at` IS NOT THIS UNIT'S TO GUARANTEE, in the same words as `ga4/backfill.ts`
 * because it is the same fact. A connector has no store and cannot know whether a row already
 * exists, so every row is emitted with `first_seen_at = fetched_at` -- correct for a first sighting
 * and wrong for a re-pull -- and THE UPSERT MUST PRESERVE THE EXISTING VALUE on conflict, along
 * with `restates_until` and the 28-day clock derived from it.
 */

import type { EnvelopeRow } from "@repo/contract";
import type { BackfillWindow } from "@repo/extract";
import {
  type MetaAdAccount,
  type MetaClientOptions,
  type MetaUsage,
  getAdAccount,
  getInsightsPages,
} from "./client.ts";
import {
  META_ACTION_WINDOWS,
  META_METRIC_MAP,
  META_STRUCTURAL_FIELDS,
  type MetaActionWindow,
  type MetaLevel,
  metaAccountId,
  normalizeMetaInsights,
} from "./normalize.ts";

/** The level, the fields and the windows one pull asks for. */
export interface MetaReportDefinition {
  readonly level: MetaLevel;
  /** Insights fields. Every one must be structural or carry a dictionary entry. */
  readonly fields: readonly string[];
  /** One envelope row per window per insights row. Never empty. */
  readonly attributionWindows: readonly MetaActionWindow[];
}

/**
 * The default report.
 *
 * IT ASKS FOR EVERY SELECTABLE WINDOW, and that is the opposite of GA4's default, which asks for
 * the smallest metric set it can. The reason the two differ is that they are charged differently:
 * GA4 prices a request by query complexity, so an extra metric is quota spent, while
 * `action_attribution_windows` costs ONE REQUEST whatever it lists -- the windows arrive as extra
 * keys inside the action entries of a response that was being fetched anyway. What a narrower list
 * would cost is the other way round: a window not asked for today cannot be reconstructed later
 * from anything stored, so recovering it means re-pulling history against the 10-per-day cap. The
 * fan-out is the price, and `normalize.ts` trap 1 is why it is the right price: the same conversion
 * arrives under several windows, and the window is a dimension rather than a footnote.
 *
 * The field list is the smallest that satisfies the normaliser at campaign level. `account_currency`
 * is not optional -- a row without it is refused rather than defaulted, because guessing would
 * label a THB account's spend as USD. `date_start` and `date_stop` are not listed because Meta
 * returns them for a `time_increment` request; they are structural, so they are accepted if they
 * arrive and the normaliser refuses the row if they do not.
 */
export const META_DEFAULT_REPORT: MetaReportDefinition = {
  level: "campaign",
  fields: [
    "account_id",
    "account_currency",
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "clicks",
    "actions",
    "action_values",
  ],
  attributionWindows: META_ACTION_WINDOWS,
};

/**
 * How this unit refuses.
 *
 * Separate from `MetaClientError` and `MetaNormalizeError` for the reason WooCommerce's is separate
 * from both: the three refuse about different things, and a caller mapping them to what an
 * advertiser should DO needs to tell a bad report definition from a bad credential from a bad row.
 */
export type MetaBackfillErrorCode = "bad_report" | "account_mismatch";

export class MetaBackfillError extends Error {
  constructor(
    message: string,
    readonly code: MetaBackfillErrorCode,
  ) {
    super(message);
    this.name = "MetaBackfillError";
  }
}

/** One page of one window, normalised. */
export interface MetaBackfillBatch {
  readonly window: BackfillWindow;
  /** 1-based, within this window. */
  readonly page: number;
  readonly rows: readonly EnvelopeRow[];
  /** What Meta reported about the ceilings this page spent. Null utilisation is "it did not say". */
  readonly usage: MetaUsage;
  /**
   * The account node these rows were dated against. Carried on the batch because it is the sole
   * provenance of `dimensions.timezone` for every row in the run, and a caller metering a pull
   * should be able to see which zone it was run in without reading a row.
   */
  readonly account: MetaAdAccount;
}

export interface MetaBackfillOptions {
  readonly client: MetaClientOptions;
  /** From `planBackfill`. Newest first, and that ordering is load-bearing -- see below. */
  readonly windows: readonly BackfillWindow[];
  /** RFC3339. One value for the whole run, so every row from it agrees on when it was pulled. */
  readonly fetchedAt: string;
  readonly report?: MetaReportDefinition;
  /**
   * The account node, when the caller already read it this run.
   *
   * `client.ts` says this call is "cached by the caller for the run's duration", and a workflow
   * pulling several windows in separate steps will have it in hand. It is CHECKED against the ad
   * account being pulled rather than trusted: a cached node for a different account carries a
   * different `timezone_name`, which is the wrong-day bug arriving through the door marked
   * optimisation.
   */
  readonly account?: MetaAdAccount;
  /** Rows per page. Defaults to the client's page size. */
  readonly limit?: number;
  /** Which action types count as a conversion for this account. Defaults to the normaliser's. */
  readonly conversionActions?: readonly string[];
}

/**
 * Refuse a report the normaliser would refuse -- BEFORE the request, where a refusal is free.
 *
 * MOST of these duplicate a check the normaliser makes, and the duplication is the point: the
 * normaliser runs AFTER the response, so its refusal arrives with the customer's insights quota
 * already spent on a page that can never be stored. The field and currency checks read
 * `META_STRUCTURAL_FIELDS` and `META_METRIC_MAP` -- the same tables the normaliser reads, not a
 * copy of them -- so those two cannot drift apart.
 *
 * TWO ARE STRICTER THAN THE NORMALISER, AND SAYING SO MATTERS because a reader who believes this
 * function only mirrors the normaliser will not look for a refusal it alone can raise.
 *   * The `${level}_id` requirement. At ad, adset and campaign grain the normaliser does read that
 *     column, so the check mirrors it. At ACCOUNT grain it does not: `normalize.ts` takes the
 *     entity id from the client's own `adAccountId`, so a report omitting `account_id` normalises
 *     perfectly well and is refused here anyway. That is a false refusal, not a missed one -- it
 *     costs a caller a field it did not need rather than costing a customer a quota -- but it is
 *     this function's rule, not the envelope's.
 *   * The attribution-window requirement. The normaliser has no opinion on an empty list; Meta
 *     does, and it is undocumented.
 *
 * Exported for the tests, which assert the default report satisfies it rather than inferring that
 * from a run that happens to pass.
 */
export function assertMetaReport(report: MetaReportDefinition): void {
  if (report.fields.length === 0) {
    throw new MetaBackfillError(
      "meta_ads: a report with no fields returns rows with no metrics on them, which is a " +
        "request spent for nothing.",
      "bad_report",
    );
  }

  for (const field of report.fields) {
    if (META_STRUCTURAL_FIELDS.has(field) || Object.hasOwn(META_METRIC_MAP, field)) continue;
    throw new MetaBackfillError(
      `meta_ads: ${JSON.stringify(field)} is neither a structural field nor a dictionary metric, ` +
        "so the normaliser would refuse every row of the response it appears on. Section 13.3 " +
        "rule 2 wants the dictionary entry first; catching it here means the refusal costs no " +
        "quota.",
      "bad_report",
    );
  }

  if (report.attributionWindows.length === 0) {
    throw new MetaBackfillError(
      "meta_ads: a report with no attribution windows asks Meta to pick, and which one it picks " +
        "is not stated anywhere we can cite. A window not asked for cannot be reconstructed " +
        "afterwards, so the run would have to be done again to learn what it was.",
      "bad_report",
    );
  }

  if (!report.fields.includes("account_currency")) {
    throw new MetaBackfillError(
      "meta_ads: account_currency is missing from the fields. The envelope requires a currency " +
        "on every row and the normaliser refuses rather than defaulting one, so the whole pull " +
        "would be fetched and then discarded.",
      "bad_report",
    );
  }

  // `${level}_id` is the id field for all four levels -- account_id, campaign_id, adset_id, ad_id
  // -- so this is derived rather than a second copy of the normaliser's LEVEL_SHAPE table, which
  // is exactly the sort of duplicate that goes stale when a fifth level appears.
  const idField = `${report.level}_id`;
  if (!report.fields.includes(idField)) {
    throw new MetaBackfillError(
      `meta_ads: a ${report.level}-level report must ask for ${idField}. It is half of the upsert ` +
        "key, and a row without it cannot be updated by the next pull.",
      "bad_report",
    );
  }
}

/**
 * The account node, read once.
 *
 * A cached node is verified against the account actually being pulled. The failure it prevents is
 * silent: `timezone_name` from another account produces rows that parse, validate and land on the
 * wrong calendar day.
 */
async function resolveAccount(options: MetaBackfillOptions): Promise<MetaAdAccount> {
  // `getAdAccount` raises its own refusal for a blank id, so an empty `adAccountId` is left to it
  // rather than being refused twice with two different messages.
  if (options.account === undefined) return getAdAccount(options.client);

  const wanted = metaAccountId(options.client.adAccountId);
  if (wanted === null || options.account.id !== wanted) {
    throw new MetaBackfillError(
      `meta_ads: the account node passed in is for ${options.account.id}, and this run pulls ` +
        `${String(wanted)}. Its timezone_name is the only thing that dates every row in the run, ` +
        "so reusing it here would file this account's days in another account's zone.",
      "account_mismatch",
    );
  }
  return options.account;
}

/**
 * Run a plan, yielding one batch per page.
 *
 * Windows arrive newest first from `planBackfill`, and that ordering is load-bearing: a run cut
 * short by the throttle has already done the days most likely to have changed.
 *
 * The account node is read BEFORE the first window, not inside the loop. Two reasons, and the
 * second is the one that matters: a per-window call would multiply the cheapest call in the
 * connector by the plan length against ceilings this client exists to spend carefully, and a run
 * that read the zone twice could in principle date two windows of the same run differently.
 */
export async function* runMetaBackfill(
  options: MetaBackfillOptions,
): AsyncGenerator<MetaBackfillBatch, void, undefined> {
  const report = options.report ?? META_DEFAULT_REPORT;
  assertMetaReport(report);

  // REFUSED BEFORE `resolveAccount`, WHICH IS THE WHOLE POINT OF THE ORDER. An empty plan used to
  // fall straight through the loop below and return normally, so a caller whose window planner had
  // produced nothing got a clean completion that had read nothing -- and it had still spent the
  // getAdAccount call to get there, against a ceiling this file is built to spend carefully.
  //
  // `orderSearchConsoleReports` in the sibling driver refuses its own empty input by name for the
  // same reason. A run that covers nothing is a caller bug, and it is worth more as a throw than
  // as a silent success that looks in every log exactly like a successful pull.
  if (options.windows.length === 0) {
    throw new MetaBackfillError(
      "meta_ads: a run with no windows reads nothing. A backfill that covers no dates is a " +
        "planning mistake in the caller, not a no-op worth reporting as a completed run.",
      "bad_report",
    );
  }

  const account = await resolveAccount(options);

  for (const window of options.windows) {
    let page = 0;

    for await (const insights of getInsightsPages(options.client, {
      level: report.level,
      fields: report.fields,
      // Meta's `time_range` is inclusive at both ends, which is also what `BackfillWindow` means,
      // so the two line up with no off-by-one to get wrong.
      since: window.from,
      until: window.to,
      attributionWindows: report.attributionWindows,
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    })) {
      page += 1;
      const rows = normalizeMetaInsights({
        rows: insights.rows,
        level: report.level,
        adAccountId: options.client.adAccountId,
        // The sole source. See decision two in the module note.
        timezone: account.timezoneName,
        // The windows the REQUEST asked for, so the rows emitted can only be the ones Meta was
        // asked to report. A different list here would label a key that was never requested.
        attributionWindows: report.attributionWindows,
        ...(options.conversionActions === undefined
          ? {}
          : { conversionActions: options.conversionActions }),
        fetchedAt: options.fetchedAt,
        // Correct for a row seen for the first time and wrong for a re-pull -- and a connector
        // cannot know which, because it has no store. See the module note.
        firstSeenAt: options.fetchedAt,
      });

      yield { window, page, rows, usage: insights.usage, account };
    }
  }
}
