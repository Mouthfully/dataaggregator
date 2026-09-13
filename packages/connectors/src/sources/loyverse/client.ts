/**
 * Loyverse POS -> transport.
 *
 * The `client` half of the connector unit (specification 13.3). It builds requests, walks the
 * cursor and counts the rate budget; it does not normalise.
 *
 * THE SOURCE. Loyverse is a free point-of-sale used by small retailers and cafes. It is the pilot
 * connector for one reason, recorded in `58-plan-reconciliation.md` section 2.2: of every POS the
 * plan names, it is the only one where a Thai owner-operator can click a consent screen TODAY.
 * FoodStory answers 401 with no documentation, Ocha has no reachable API, StoreHub's docs are
 * password-gated behind "Ask WH for the password", and LINE MAN publishes nothing at all. Loyverse
 * is not the market leader. It is the one that is reachable.
 *
 * EVERY CONSTANT BELOW WAS READ OUT OF LOYVERSE'S OWN OpenAPI DOCUMENT, at
 * `https://developer.loyverse.com/docs/API-Reference__v1.0.yaml`, which its published reference
 * renders. That matters because `air4thai/client.ts` had to say the opposite about itself, and the
 * difference should be visible without diffing: no constant here is inferred from a third party's
 * SDK, and no field name here is a guess. The response SHAPES are still not recorded fixtures --
 * see `fixtures.ts` -- but the base URL, the endpoints, the query parameters, the scope names, the
 * paging mechanism, the error codes, the token lifetime and the rate limit are quoted from the
 * specification.
 *
 * ================================================================================================
 * DECISION 1. THE PERSONAL ACCESS TOKEN IS REFUSED, AND THIS CLIENT IS WHERE IT IS REFUSED.
 * ================================================================================================
 *
 * Loyverse offers two authorisation methods and describes the easier one like this, verbatim:
 *
 *     "Personal access tokens are a simple way to make calls to the API."
 *     "Be aware that personal access token gives unlimited access to the targeted account."
 *
 * On this API "unlimited" is enumerable, because the same document prints the permissions table:
 * it includes `RECEIPTS_WRITE`, `ITEMS_WRITE`, `INVENTORY_WRITE`, `TAXES_WRITE`,
 * `SUPPLIERS_WRITE`, `CUSTOMERS_WRITE` and `POS_DEVICES_WRITE`. A pasted personal token can create
 * receipts and edit the merchant's inventory. It would have been the shortest connect flow in this
 * repository -- one text field, no client registration, no redirect, no refresh -- and it is
 * refused anyway.
 *
 * IT IS REFUSED IN THREE PLACES AND THAT IS DELIBERATE, because each catches a different way in:
 *
 *   * `PROVIDER_LANES.loyverse` is `["oauth"]`, so `connectWithToken` rejects the provider before
 *     anything is sealed. That stops a token arriving through the product's own connect flow.
 *   * `assertReadOnlyCredential` below refuses a `bearer` credential BY NAME, at the top of every
 *     exported entry point. That stops one arriving through a caller that built its own options
 *     object -- a backfill script, a test harness, a future ingest path.
 *   * And it refuses an `oauth` grant that reports ANY `*_WRITE` scope, because a grant wider than
 *     the two this connector asks for did not come from this product's consent screen.
 *
 * The type accepts a `bearer` credential rather than excluding it, which looks backwards and is
 * not: a union that cannot express the refused case can only refuse it at the type level, and the
 * credential arrives from a database column as data. A refusal that only exists in TypeScript is
 * not a refusal at runtime, which is where the merchant's till is.
 *
 * ================================================================================================
 * DECISION 2. THE RATE BUDGET IS COUNTED HERE, BECAUSE NOTHING REPORTS IT.
 * ================================================================================================
 *
 * "The current limit is 300 requests per 300 sec per account." Over it, `429 RATE_LIMITED`.
 *
 * GA4 reports its property quota in the response body and Meta reports usage in a header, so both
 * of those clients read a number the platform computed. Loyverse reports NOTHING -- there is no
 * `X-RateLimit-Remaining`, no quota object, no retry-after in the documented error shape. So the
 * budget is a client-side reconstruction, it is per ACCOUNT rather than per app, and it is
 * threaded through every return value instead of being module state: two connections to two
 * merchants must not share a counter, and module state is exactly how they would.
 *
 * AND A FLOOR IS HELD BACK. `LOYVERSE_RATE_FLOOR` requests are never spent by this connector. The
 * limit is per ACCOUNT, not per application -- so every request this makes is one the merchant's
 * own integrations cannot make. A cafe whose till stops syncing because our nightly pull ate the
 * account's budget has been harmed by an analytics tool, which is not a trade anyone agreed to.
 *
 * ================================================================================================
 * DECISION 3. THE WINDOW'S UPPER BOUND IS PINNED BY THE CALLER, NOT EVALUATED PER REQUEST.
 * ================================================================================================
 *
 * `updated_at_max` is required, not optional. An open-ended window re-evaluated at each request
 * SLIDES: receipts rung during the walk enter a page the walk has already passed, so they are
 * never read -- and then the watermark advances past them, because the run completed. That hole is
 * permanent and invisible, since nothing will ever ask for that window again.
 *
 * ================================================================================================
 * DECISION 4. `updated_at`, NOT `created_at`, IS WHAT THE PULL FILTERS ON.
 * ================================================================================================
 *
 * Both filters exist. `created_at_min`/`created_at_max` would be cheaper and would be wrong, for
 * the reason `RESTATEMENT_CLOCKS.loyverse` sets out: a receipt carries `updated_at` and
 * `cancelled_at`, the `receipts.update` webhook fires on update as well as creation, and a refund
 * arrives as a SECOND receipt. A created-since walk sees the new refund receipt but never re-reads
 * a sale that was voided in place, so a cancelled sale stays counted forever.
 *
 * ONE CONSEQUENCE WORTH NAMING, because it is surprising and it is the platform's: `/receipts` is
 * documented as "sorted by created_at property in descending order" regardless of which filter was
 * used. So a walk filtered on `updated_at` comes back ordered by a DIFFERENT column. Nothing here
 * depends on the order -- the cursor is the only thing that advances the walk, and the normaliser
 * keys each row by receipt number -- but a future reader tempted to infer progress from the last
 * row's timestamp should not.
 */

import { type FetchOptions, fetchWithRetry } from "@repo/extract";

/** Documented as the server in the specification, version in the path. */
export const LOYVERSE_API_BASE = "https://api.loyverse.com/v1.0";

export const LOYVERSE_RECEIPTS_PATH = "/receipts";
/** Trailing slash, as the specification spells the path. */
export const LOYVERSE_MERCHANT_PATH = "/merchant/";

/** "Default value is 50 and maximum is 250." */
export const LOYVERSE_MAX_LIMIT = 250;

/**
 * What this connector actually asks for, which is the maximum.
 *
 * FEWER REQUESTS IS THE WHOLE ARGUMENT, and it is an unusual one to make. `woocommerce/client.ts`
 * deliberately caps `per_page` at 100 BELOW the platform's own maximum, because a WooCommerce order
 * carries line items, refunds and an unbounded `meta_data` bag, and a 128 MB isolate has to hold
 * the page. A Loyverse receipt is bounded and small by comparison -- and the budget it spends from
 * is shared with the merchant's own integrations, so a page taken at 50 costs the cafe five times
 * the requests for the same receipts. The scarcer resource here is requests, not memory.
 */
export const LOYVERSE_PAGE_LIMIT = LOYVERSE_MAX_LIMIT;

/** "The current limit is 300 requests per 300 sec per account." */
export const LOYVERSE_RATE_REQUESTS = 300;
export const LOYVERSE_RATE_WINDOW_MS = 300_000;

/**
 * Requests never spent by this connector, out of the 300.
 *
 * See decision 2. The limit is per ACCOUNT, so this is the merchant's headroom rather than ours:
 * a till that stops syncing because a nightly analytics pull drained the account's budget is a
 * harm this connector caused. Ten percent, held back unconditionally.
 */
export const LOYVERSE_RATE_FLOOR = 30;

/**
 * Pages one window may cost before the walk refuses.
 *
 * A CURSOR CARRIES NO TOTAL. WooCommerce's client knows how many pages a window holds, because the
 * store answers with `X-WP-TotalPages` -- so it can bisect a window that is too large. Here there
 * is no such number: a cursor says only "there is more", and a server that hands out cursors
 * forever is indistinguishable from a genuinely enormous window until something stops counting.
 * At `LOYVERSE_PAGE_LIMIT` this is 100,000 receipts in one window, which is far past any cafe and
 * still finite.
 */
export const LOYVERSE_MAX_PAGES = 400;

/**
 * The scopes this connector requires, and the complete set it will tolerate.
 *
 * Mirrors `PROVIDERS.loyverse.scopes` in @repo/oauth, where the argument for each one -- and for
 * the absence of `SHIFTS_READ`, `STORES_READ` and `OPENID` -- is written out. Duplicated here
 * rather than imported because @repo/connectors does not depend on @repo/oauth and adding that
 * edge to check one string would be the wrong trade; a test asserts the two agree.
 */
export const LOYVERSE_SCOPES: readonly string[] = ["RECEIPTS_READ", "MERCHANT_READ"];

/**
 * How this unit refuses.
 *
 * Grouped by WHEN, because that is what a caller mapping these to an owner-facing message needs:
 * the first four are knowable before a request exists and mean the connection is wrong, the next
 * three mean the walk hit a ceiling and can resume, and the last two mean the platform answered
 * with something this connector will not read.
 */
export type LoyverseClientErrorCode =
  // The credential, before any request exists.
  | "personal_access_token"
  | "write_scope_granted"
  | "missing_scope"
  | "invalid_credential"
  // The window, before any request exists.
  | "invalid_window"
  // The walk.
  | "rate_budget_exhausted"
  | "page_budget_exhausted"
  | "cursor_not_advancing"
  // What came back.
  | "unexpected_body"
  | "missing_currency";

export class LoyverseClientError extends Error {
  constructor(
    message: string,
    readonly code: LoyverseClientErrorCode,
  ) {
    super(message);
    this.name = "LoyverseClientError";
  }
}

/**
 * What the connection holds.
 *
 * THE `bearer` MEMBER EXISTS SO IT CAN BE REFUSED BY NAME. See decision 1: a credential arrives
 * from a database column as data, and a union that cannot express the refused case can only refuse
 * it at the type level -- which is not where the merchant's till is.
 */
export type LoyverseCredential =
  | {
      readonly kind: "oauth";
      readonly accessToken: string;
      /**
       * What the token endpoint actually granted, from `public.connections.granted_scopes`.
       *
       * EMPTY MEANS "NOT REPORTED", NOT "NOTHING GRANTED" -- the same reading `connect()` takes,
       * because a provider may report no scope string at all. Loyverse's documented token response
       * does include one, so an empty list here means the connection predates the field or the
       * caller did not pass it, and the scope check is skipped rather than failing every pull on a
       * connection that may be perfectly good.
       */
      readonly grantedScopes?: readonly string[];
    }
  | {
      /** A Loyverse personal access token. Accepted by the type so it can be refused by name. */
      readonly kind: "bearer";
      readonly token: string;
    };

/**
 * The read-only gate. Called at the top of every exported entry point, not once at construction.
 *
 * AT EVERY ENTRY POINT, because there is no construction step to hang it on: these are free
 * functions taking an options object, so a caller that builds its own options reaches the network
 * without passing anything that could have checked. Calling it three times costs nothing; missing
 * it once costs the guarantee.
 */
export function assertReadOnlyCredential(credential: LoyverseCredential): void {
  if (credential.kind !== "oauth") {
    throw new LoyverseClientError(
      "loyverse: this connection holds a pasted token rather than an OAuth grant. Loyverse's own " +
        'specification says a personal access token "gives unlimited access to the targeted ' +
        'account" -- which on this API includes RECEIPTS_WRITE, ITEMS_WRITE, INVENTORY_WRITE and ' +
        "CUSTOMERS_WRITE. This connector reads takings under RECEIPTS_READ and MERCHANT_READ and " +
        "refuses a credential that could do more. Reconnect through the Loyverse consent screen.",
      "personal_access_token",
    );
  }

  if (credential.accessToken.trim() === "") {
    throw new LoyverseClientError(
      "loyverse: the access token is empty. An empty bearer header 401s on the first request, " +
        "hours later, with nothing in the failure pointing at the cause.",
      "invalid_credential",
    );
  }

  const granted = credential.grantedScopes ?? [];
  // Empty means the grant was not reported. See the field note: skipping is the same reading
  // `connect()` takes, and inventing a failure here would break every connection sealed before the
  // field was recorded.
  if (granted.length === 0) return;

  // A SCOPE THIS CONNECTOR NEVER ASKS FOR. The authorisation URL is built from
  // `PROVIDERS.loyverse.scopes`, which holds two `_READ` entries and nothing else, so a write scope
  // in the granted set means the credential did not come from this product's flow. Refusing is the
  // difference between read-only that is ENFORCED and read-only that is asserted.
  const writeScopes = granted.filter((scope) => scope.toUpperCase().endsWith("_WRITE"));
  if (writeScopes.length > 0) {
    throw new LoyverseClientError(
      `loyverse: this grant carries ${writeScopes.join(", ")}, which this connector never asks ` +
        "for -- it requests RECEIPTS_READ and MERCHANT_READ and nothing else. A credential that " +
        "can change the merchant's till did not come from this product's consent screen. " +
        "Refusing rather than reading with it.",
      "write_scope_granted",
    );
  }

  // CASE-INSENSITIVE, AND THAT IS NOT LAXITY. Loyverse spells its scopes UPPERCASE in the
  // permissions table and in its token-response example. Both spellings are the platform's, and a
  // comparison that picked one would refuse a perfectly good grant over the platform's own
  // inconsistency -- at connect time, with the merchant still at the keyboard, for nothing.
  const upper = granted.map((scope) => scope.toUpperCase());
  const missing = LOYVERSE_SCOPES.filter((scope) => !upper.includes(scope.toUpperCase()));
  if (missing.length > 0) {
    throw new LoyverseClientError(
      `loyverse: the grant is missing ${missing.join(", ")}. RECEIPTS_READ is the takings and ` +
        "MERCHANT_READ is the currency they are counted in -- without it every amount would have " +
        "to be labelled with a guess. Reconnect and accept both permissions.",
      "missing_scope",
    );
  }
}

/**
 * The account's spent requests, as timestamps.
 *
 * TIMESTAMPS RATHER THAN A COUNTER, because the limit is a SLIDING window: 300 in any 300 seconds,
 * not 300 per fixed bucket. A counter with a reset time would let a run spend 300 at 00:04:59 and
 * 300 more at 00:05:01, which is 600 requests in two seconds and a 429 for the merchant.
 *
 * THREADED, NOT MODULE STATE. Two connections to two merchants must not share a counter, and a
 * counter in module scope is exactly how they would.
 */
export interface LoyverseRateBudget {
  readonly at: readonly number[];
}

export const EMPTY_RATE_BUDGET: LoyverseRateBudget = { at: [] };

/** Drop what has fallen out of the sliding window. */
function prune(budget: LoyverseRateBudget, now: Date): number[] {
  const floor = now.getTime() - LOYVERSE_RATE_WINDOW_MS;
  return budget.at.filter((stamp) => stamp > floor);
}

/**
 * Whether another request fits, leaving the merchant's floor untouched.
 *
 * The floor is a parameter so a deliberate catch-up can lower it with its eyes open, and defaults
 * to `LOYVERSE_RATE_FLOOR` so the careful behaviour is the one you get by not thinking about it.
 */
export function rateAllowsAnother(
  budget: LoyverseRateBudget,
  now: Date,
  floor: number = LOYVERSE_RATE_FLOOR,
): boolean {
  return prune(budget, now).length < LOYVERSE_RATE_REQUESTS - floor;
}

/** Record one request. Returns a NEW budget; the input is not mutated. */
export function spendRequest(budget: LoyverseRateBudget, now: Date): LoyverseRateBudget {
  return { at: [...prune(budget, now), now.getTime()] };
}

/** A span of UPDATED time. See decision 4 for why it is updated and not created. */
export interface LoyverseWindow {
  /** RFC3339 UTC. Receipts updated at or after this. */
  readonly updatedAfter: string;
  /** RFC3339 UTC, pinned to the run's start by the caller. See decision 3. */
  readonly updatedBefore: string;
}

export interface LoyverseReceiptsQuery extends LoyverseWindow {
  readonly cursor?: string;
  readonly limit?: number;
  /** Only this store's receipts. Absent means every store on the account. */
  readonly storeId?: string;
}

/**
 * The request URL.
 *
 * THE CURSOR IS SENT ALONGSIDE THE FILTERS AND NOT INSTEAD OF THEM. Loyverse documents the cursor
 * as "the cursor value returned in the previous response as a query parameter" and does not say
 * whether it carries the original filters. Sending both is correct under either reading -- the
 * filters are either redundant or load-bearing, and dropping them is only safe under one.
 *
 * `limit` IS CLAMPED RATHER THAN PASSED THROUGH. A caller asking for 1,000 would otherwise get
 * whatever the platform does with an over-maximum value, which the specification does not say.
 */
export function receiptsUrl(query: LoyverseReceiptsQuery): string {
  const params = new URLSearchParams({
    updated_at_min: query.updatedAfter,
    updated_at_max: query.updatedBefore,
    limit: String(Math.min(query.limit ?? LOYVERSE_PAGE_LIMIT, LOYVERSE_MAX_LIMIT)),
  });
  if (query.storeId !== undefined) params.set("store_id", query.storeId);
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  return `${LOYVERSE_API_BASE}${LOYVERSE_RECEIPTS_PATH}?${params.toString()}`;
}

export function merchantUrl(): string {
  return `${LOYVERSE_API_BASE}${LOYVERSE_MERCHANT_PATH}`;
}

export interface LoyverseFetchOptions extends FetchOptions {
  readonly fetchImpl: typeof fetch;
  readonly credential: LoyverseCredential;
}

/** One page, plus the budget it cost. */
export interface LoyverseReceiptsPage {
  readonly receipts: readonly unknown[];
  readonly cursor: string | null;
  /** 1-based, counted HERE. Loyverse reports no page number; a cursor has no ordinal. */
  readonly page: number;
  /** The budget AFTER this request, so a caller can carry it into the next window or run. */
  readonly budget: LoyverseRateBudget;
}

async function request(
  options: LoyverseFetchOptions,
  url: string,
  budget: LoyverseRateBudget,
): Promise<{ body: unknown; budget: LoyverseRateBudget }> {
  const now = options.now();
  if (!rateAllowsAnother(budget, now)) {
    throw new LoyverseClientError(
      `loyverse: this account's rate budget is spent -- ${LOYVERSE_RATE_REQUESTS} requests per ` +
        `${LOYVERSE_RATE_WINDOW_MS / 1000}s, with ${LOYVERSE_RATE_FLOOR} held back so the ` +
        "merchant's own integrations are not the ones that get the 429. Resume after the window " +
        "rolls; the watermark has not advanced past anything unread.",
      "rate_budget_exhausted",
    );
  }

  // SPENT BEFORE THE REQUEST, NOT AFTER IT. A request that throws still consumed the merchant's
  // budget -- Loyverse counted it -- so crediting it back on failure would let a run in an error
  // loop spend unboundedly while believing it had spent nothing.
  const spent = spendRequest(budget, now);
  const response = await fetchWithRetry(
    options.fetchImpl,
    {
      url,
      init: {
        method: "GET",
        headers: {
          // The only authorisation header Loyverse documents, and identical in shape for both
          // credential kinds -- which is precisely why decision 1's refusal cannot live here.
          Authorization: `Bearer ${(options.credential as { accessToken?: string }).accessToken}`,
          Accept: "application/json",
          // So a merchant reviewing their account's API traffic can attribute it to something,
          // rather than finding an unidentified client reading their till every night.
          "User-Agent": "marketing-data-plane/1.0 (+connector; loyverse)",
        },
      },
    },
    options,
  );

  return { body: (await response.json()) as unknown, budget: spent };
}

/** One page of receipts. Prefer `fetchReceiptsPages`, which walks the cursor. */
export async function fetchReceiptsPage(
  options: LoyverseFetchOptions,
  query: LoyverseReceiptsQuery,
  budget: LoyverseRateBudget = EMPTY_RATE_BUDGET,
  page = 1,
): Promise<LoyverseReceiptsPage> {
  assertReadOnlyCredential(options.credential);

  const { body, budget: spent } = await request(options, receiptsUrl(query), budget);
  const envelope = body as { receipts?: unknown; cursor?: unknown } | null;

  // A BODY WITH NO `receipts` ARRAY IS REFUSED, NOT READ AS ZERO RECEIPTS. WooCommerce's client can
  // treat a non-array body as an empty page, because its pagination headers are a second opinion on
  // whether that was the end. Here there is none: an empty page that is actually an error body
  // would end the walk, the window would report complete, and the watermark would advance past
  // receipts nobody read. That hole is permanent -- nothing asks for that window twice.
  if (envelope === null || !Array.isArray(envelope.receipts)) {
    throw new LoyverseClientError(
      "loyverse: /receipts returned a body with no `receipts` array. Refusing rather than reading " +
        "it as an empty page -- an empty page advances the watermark, and nothing would ever ask " +
        "for this window again.",
      "unexpected_body",
    );
  }

  // ABSENT MEANS THE LAST PAGE: "When the endpoint sends the final set of results, the response
  // body will not include a cursor field." A non-string or empty cursor is treated as absent rather
  // than refused -- ending a walk early is recoverable on the next run, where the watermark has not
  // advanced past what was not read, whereas refusing would fail a window that may be complete.
  const cursor =
    typeof envelope.cursor === "string" && envelope.cursor !== "" ? envelope.cursor : null;

  return { receipts: envelope.receipts, cursor, page, budget: spent };
}

export interface LoyverseWalkOptions {
  readonly limit?: number;
  readonly storeId?: string;
  /** Pages one window may cost. Default `LOYVERSE_MAX_PAGES`. */
  readonly maxPages?: number;
  /** Carried in so the ceiling spans windows and runs. Default `EMPTY_RATE_BUDGET`. */
  readonly budget?: LoyverseRateBudget;
}

/**
 * Walk one window's cursor to the end. THIS IS THE ONE A SCHEDULED PULL SHOULD CALL.
 *
 * A GENERATOR RATHER THAN AN ACCUMULATED ARRAY, for `fetchOrdersPages`' reason: one window may
 * legally be `LOYVERSE_MAX_PAGES` pages of `LOYVERSE_PAGE_LIMIT` receipts, and buffering that
 * would put 100,000 receipts in a 128 MB isolate to hand back one array.
 */
export async function* fetchReceiptsPages(
  options: LoyverseFetchOptions,
  window: LoyverseWindow,
  walk: LoyverseWalkOptions = {},
): AsyncGenerator<LoyverseReceiptsPage, void, undefined> {
  assertReadOnlyCredential(options.credential);
  assertWindow(window);

  const maxPages = walk.maxPages ?? LOYVERSE_MAX_PAGES;
  const seen = new Set<string>();
  let budget = walk.budget ?? EMPTY_RATE_BUDGET;
  let cursor: string | undefined;

  for (let page = 1; ; page += 1) {
    if (page > maxPages) {
      throw new LoyverseClientError(
        `loyverse: ${window.updatedAfter}..${window.updatedBefore} is over ${maxPages} pages of ` +
          `${walk.limit ?? LOYVERSE_PAGE_LIMIT}. A cursor carries no total, so this is the only ` +
          "thing that can tell an unusually large window from a server handing out cursors " +
          "forever. Narrow the window, or run a deliberate catch-up.",
        "page_budget_exhausted",
      );
    }

    const current = await fetchReceiptsPage(
      options,
      { ...window, cursor, limit: walk.limit, storeId: walk.storeId },
      budget,
      page,
    );
    budget = current.budget;
    yield current;

    if (current.cursor === null) return;

    // THE SAME CURSOR TWICE IS NOT PROGRESS. Following it would re-fetch and re-emit the identical
    // page until the page budget ran out, and every one of those pages would be normalised and
    // upserted -- so a day's takings would be counted once per lap. The upsert key collapses most
    // of it, which is exactly what makes this impossible to notice from the numbers.
    if (seen.has(current.cursor)) {
      throw new LoyverseClientError(
        `loyverse: /receipts returned the cursor ${JSON.stringify(current.cursor)} a second time ` +
          `on page ${current.page}. That is a loop, not a page. Refusing rather than re-reading ` +
          "the same receipts until the page budget runs out.",
        "cursor_not_advancing",
      );
    }
    seen.add(current.cursor);
    cursor = current.cursor;
  }
}

/**
 * The account profile. ONE REQUEST PER RUN, AND IT BUYS THE CURRENCY LABEL.
 *
 * `dimensions.currency` is required on every envelope row and A LOYVERSE RECEIPT CARRIES NO
 * CURRENCY: `total_money` is a bare number whose own description says only that "The money amount
 * format depends on country of account registration". `GET /merchant/`'s `currency.code` is the
 * single place the ISO 4217 code appears in the entire API. That is the whole reason
 * `MERCHANT_READ` is requested.
 */
export interface LoyverseMerchant {
  readonly id: string;
  readonly currency: string;
  /**
   * How many decimal places the account's currency uses.
   *
   * KEPT BECAUSE THE PLATFORM VOLUNTEERS IT AND IT IS A REAL TRAP -- `total_money`'s description
   * gives Japan as its own example of a currency with none. Nothing here rounds by it; the envelope
   * stores the number the platform sent. But a reader FORMATTING a figure needs it, and discovering
   * that later would mean another `MERCHANT_READ` call for a field already in hand.
   */
  readonly decimalPlaces: number | null;
  readonly businessName: string | null;
  readonly budget: LoyverseRateBudget;
}

export async function fetchMerchant(
  options: LoyverseFetchOptions,
  budget: LoyverseRateBudget = EMPTY_RATE_BUDGET,
): Promise<LoyverseMerchant> {
  assertReadOnlyCredential(options.credential);

  const { body, budget: spent } = await request(options, merchantUrl(), budget);
  const profile = body as {
    id?: unknown;
    business_name?: unknown;
    currency?: { code?: unknown; decimal_places?: unknown };
  } | null;

  const id = typeof profile?.id === "string" ? profile.id : null;
  if (id === null || id === "") {
    throw new LoyverseClientError(
      "loyverse: /merchant/ returned no `id`. That id is the row's `account_id` and half of the " +
        "envelope's upsert key, so there would be nothing to file these receipts under.",
      "unexpected_body",
    );
  }

  const code = typeof profile?.currency?.code === "string" ? profile.currency.code : null;
  // REFUSED RATHER THAN DEFAULTED, and this is the refusal `MERCHANT_READ` was requested for. A
  // receipt carries no currency; if the one place that reports it does not, there is no second
  // source to fall back to and a default would mislabel every amount on every row for this account.
  // `normalizeWooOrders` already refuses an order for exactly this, and a POS is not a weaker case
  // than a web shop.
  if (code === null || !/^[A-Za-z]{3}$/.test(code)) {
    throw new LoyverseClientError(
      `loyverse: /merchant/ reported the currency as ${JSON.stringify(code)}, which is not an ` +
        "ISO 4217 code. A Loyverse receipt carries no currency of its own, so there is no second " +
        "source to fall back to and a default would mislabel every amount on every row.",
      "missing_currency",
    );
  }

  const places = profile?.currency?.decimal_places;
  return {
    id,
    currency: code.toUpperCase(),
    decimalPlaces: typeof places === "number" && Number.isInteger(places) ? places : null,
    businessName: typeof profile?.business_name === "string" ? profile.business_name : null,
    budget: spent,
  };
}

/**
 * Refuse a window before it costs the merchant a request.
 *
 * The last check is the one worth having: Loyverse answers `400 INVALID_RANGE` to a range whose
 * "end time is before the start time", so an inverted window is a request spent to be told
 * something knowable for free.
 */
/**
 * THE DESIGNATOR IS REQUIRED, AND THE FIRST VERSION OF THIS ONLY LOOKED LIKE IT WAS.
 *
 * That version tested `/\d{4}-\d{2}-\d{2}T/` -- which `"2026-09-09T00:00:00"` matches -- and then
 * accepted whatever `Date.parse` made of it. `Date.parse` reads a designator-less string as LOCAL
 * time, so in Asia/Bangkok that window silently began seven hours earlier than the caller wrote,
 * while the comment above it claimed the opposite. A test written against the comment is what found
 * it. This pattern is the same one `loyverseInstantToDate` uses on receipt timestamps, for the same
 * reason and against the same platform sentence: "all dates and times in the API are in UTC".
 */
const WINDOW_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

export function assertWindow(window: LoyverseWindow): void {
  const after = Date.parse(window.updatedAfter);
  const before = Date.parse(window.updatedBefore);
  if (!Number.isFinite(after) || !WINDOW_INSTANT.test(window.updatedAfter)) {
    throw new LoyverseClientError(
      `loyverse: updatedAfter is ${JSON.stringify(window.updatedAfter)}, which is not an ` +
        'RFC3339 instant. Loyverse documents that "all dates and times in the API are in UTC" and ' +
        "its own examples end in `Z`; a value with no designator is read as local time, which " +
        "moves the window by the runtime's offset.",
      "invalid_window",
    );
  }
  if (!Number.isFinite(before) || !WINDOW_INSTANT.test(window.updatedBefore)) {
    throw new LoyverseClientError(
      `loyverse: updatedBefore is ${JSON.stringify(window.updatedBefore)}, which is not an ` +
        "RFC3339 instant.",
      "invalid_window",
    );
  }
  if (before <= after) {
    throw new LoyverseClientError(
      `loyverse: the window ${window.updatedAfter}..${window.updatedBefore} ends at or before it ` +
        "starts. Loyverse answers `400 INVALID_RANGE` to that, so the merchant's request would be " +
        "spent on a window that can contain nothing.",
      "invalid_window",
    );
  }
}
