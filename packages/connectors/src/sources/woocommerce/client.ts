/**
 * WooCommerce REST client.
 *
 * The `client` half of the connector unit (specification 13.3). It builds requests and reads
 * pagination; it does not normalise.
 *
 * IT BUFFERS ONE PAGE, AND THAT IS REQUIRED RATHER THAN CONVENIENT. The usual rule here is that an
 * extractor streams a response to R2 without materialising it, because a Worker isolate has 128 MB
 * -- `fetchWithRetry` deliberately returns the `Response` unread so a caller can. **WooCommerce may
 * not take that path at all.** Its redaction policy is `redact` (see `25-payload-redaction.md`), and
 * `putPayload` REFUSES a non-`verbatim` source outright: a streamed payload is never parsed, so it
 * can never be redacted, so streaming it would archive buyer name, email, phone and address
 * verbatim. `putBufferedPayload` is the only path open to this source.
 *
 * Which makes `per_page` load-bearing twice over. Decision 5 below caps it at 100 because WooCommerce
 * silently clamps there anyway -- but the same cap is what bounds the buffer. One page is at most a
 * hundred orders, and a hundred orders is a size an isolate can hold and a redactor can walk. A
 * caller that wanted an unbounded page would be asking for a payload it is not allowed to store.
 *
 * FIVE DECISIONS, each of which is a silent wrong answer if taken the other way.
 *
 * 1. HTTPS OR NOTHING. Over plain HTTP the WooCommerce API requires OAuth 1.0a one-legged signing —
 *    `oauth_signature`, `oauth_nonce`, an HMAC over a constructed base string. That is a second
 *    authentication scheme to implement, test and maintain so that a merchant can send its own
 *    orders over the wire in clear. The store URL is refused at construction instead.
 *
 * 2. `dates_are_gmt=true` ON EVERY REQUEST. It defaults to FALSE, and when false WooCommerce
 *    interprets the window boundary in the MERCHANT'S WordPress timezone. For a Thai store that is
 *    UTC+7, so a nightly job asking for "since 00:00" silently asks for a different seven hours than
 *    it thinks. It is a query parameter rather than a flag on this client because forgetting it
 *    produces plausible data rather than an error.
 *
 * 3. `modified_before` IS PINNED TO THE RUN'S START, not left open. WordPress paginates with
 *    OFFSET, so a row modified DURING the pull shifts position between page 1 and page 5 — and a
 *    row that shifts backwards past the cursor is never returned at all. Pinning the upper bound
 *    makes the result set immutable for the duration of the run. This is the bug that would present
 *    as "some orders are just missing sometimes".
 *
 * 4. THE FILTER IS `modified_after`, NOT `after`. `after` filters on CREATED date and would never
 *    return a refund of last month's order. `wc_create_refund` bumps the parent order's
 *    `date_modified` unconditionally — verified in WooCommerce core — which is what makes an
 *    incremental pull catch restatements at all. The two parameters are joined with AND by
 *    WooCommerce, so "created after X OR modified after X" is not expressible in one request; the
 *    modified window is the one that subsumes the other.
 *
 * 5. `per_page` CAPS AT 100. Not documented on the orders page; it is WordPress core's collection
 *    parameter (`'maximum' => 100`) and WooCommerce does not override it. Asking for more does not
 *    error — it silently returns 100, which is exactly how a `limit + 1` next-page probe stops
 *    working. Pagination reads `X-WP-TotalPages` instead of inferring from a short page.
 *
 * THREE MORE, added with the read path. `34-woocommerce-client.md` §4 named these as gaps; each is
 * a loop, a load decision or a sentence a merchant reads at 09:00 instead of a log line at 03:00.
 *
 * 6. THE PAGE LOOP IS BOUNDED BY A NUMBER READ ONCE, AND REFUSED IF IT IS ABSURD. `X-WP-TotalPages`
 *    comes from the merchant's server, so a loop that re-reads it every page is a loop that server
 *    can extend forever — a caching plugin that recomputes the count, or a plugin that ignores
 *    `modified_before`, is enough. `fetchOrdersPages` reads the count from page 1, refuses outright
 *    above `WOO_MAX_PAGES_PER_WINDOW`, and never looks at a later page's headers again. The loop is
 *    therefore bounded by construction rather than by the server's good behaviour.
 *
 * 7. A WINDOW THAT IS TOO BIG IS SPLIT, NOT PAGED DEEPER, AND THE FLOOR IS ONE SECOND. WordPress
 *    pages with OFFSET against the MERCHANT'S OWN MySQL: page 20 makes their database sort 1,900
 *    rows to hand back 100, while their shop serves customers. Splitting the date range costs us an
 *    extra request and costs them nothing. `modified_after`/`modified_before` are second-granular
 *    (the designator-less format carries no milliseconds), so bisection terminates at a one-second
 *    window — and a one-second window that is STILL too large is real, because a bulk edit or a
 *    migration stamps thousands of orders with the same `date_modified`. That case gets a raised
 *    cap rather than a refusal: refusing would stall the connector on that second forever.
 *
 * 8. THE PROBE ANSWERS IN SENTENCES, NOT IN STATUS CODES, AND `rest_no_route` IS THE ONE THAT
 *    MATTERS. It means the REST route does not exist, which is what Plain permalinks does — it is
 *    NOT a bad credential. Telling a merchant their key is wrong sends them to regenerate a key
 *    that was fine, and they arrive back with the same failure and less trust. One
 *    `GET /orders?per_page=1` at connect time separates permalinks, credential, permission level,
 *    WordPress-user capability and "that URL is not a WooCommerce store" while a human is looking.
 */

import { ExtractError, type FetchOptions, fetchWithRetry } from "@repo/extract";

/** WordPress core's cap on a collection request. Not WooCommerce's, and not overridable. */
export const WOO_MAX_PER_PAGE = 100;

export const WOO_API_PATH = "/wp-json/wc/v3";

/**
 * Pages one window may cost before it is split instead.
 *
 * DERIVED, not picked. At `per_page=100` this is 2,000 orders, and it is two numbers at once:
 *
 *   * THE MERCHANT'S SIDE. WordPress pages with `OFFSET`. Page 20 is `LIMIT 100 OFFSET 1900`, so
 *     their MySQL sorts 2,000 rows to return 100 — a 20x amplification, on a `wp_posts` /
 *     `wp_postmeta` join, on the same database serving their storefront. At page 50 it is 49x. 20x
 *     is where this draws the line; it is a judgement, not a measurement, and `34` §5 already
 *     records that deep-page performance is reasoned about rather than measured.
 *   * OUR SIDE. 2,000 orders is far above the launch-target merchant — `32` §3 puts a café at ~50
 *     changed orders a night and a busy online seller at ~500 — so the common path never splits at
 *     all and the cost model of `34` §2 is unchanged for every store it described.
 */
export const WOO_MAX_PAGES_PER_WINDOW = 20;

/**
 * Pages a ONE-SECOND window may cost. The floor case, where there is nothing left to split.
 *
 * A merchant who bulk-edits, re-imports or migrates stamps thousands of orders with the same
 * `date_modified`. That window cannot be narrowed — WooCommerce's date filters are second-granular
 * — so the choice is a deep read or no read ever. A deep read wins, once, with a cap that is still
 * a cap: 200 pages is 20,000 orders. Above that the refusal names the cause, because at that point
 * the right answer is a deliberate catch-up run and not a nightly job.
 */
export const WOO_FLOOR_MAX_PAGES = 200;

/**
 * Sub-windows one bisecting read may visit.
 *
 * Halving terminates because the span shrinks; it does not follow that it terminates CHEAPLY. If
 * splitting never reduces the reported count — a plugin that ignores the date filter, a cached
 * `X-WP-Total` — the tree expands exponentially and each node is a request against the merchant's
 * store. 64 windows bounds the whole read at 64 + 64x`WOO_FLOOR_MAX_PAGES` requests in the worst
 * case, and 64 leaves x 2,000 orders is 128,000 orders in one window: past that the store needs a
 * different ingestion strategy, not a longer loop.
 */
export const WOO_MAX_WINDOWS = 64;

/**
 * Every distinguishable way this client refuses, and each one is a different sentence to a merchant.
 *
 * Grouped by where they arise: the URL and the credential (connect), the window (a scheduled read),
 * and the probe (connect again, with the store answering). The union is deliberately flat and
 * deliberately long — a caller that maps these to UI copy needs the distinctions, and collapsing
 * two causes into one code is how a merchant gets sent to fix the wrong thing.
 */
export type WooClientErrorCode =
  // The store URL, before any request exists.
  | "insecure_store_url"
  | "invalid_store_url"
  | "invalid_credential"
  // The window, while paging.
  | "invalid_window"
  | "window_too_large"
  | "window_budget_exhausted"
  | "incomplete_window"
  | "pagination_headers_missing"
  // The probe, reading what the store actually answered.
  | "permalinks_disabled"
  | "insufficient_permission"
  | "not_a_wp_rest_endpoint"
  | "store_unreachable";

export class WooClientError extends Error {
  constructor(
    message: string,
    readonly code: WooClientErrorCode,
  ) {
    super(message);
    this.name = "WooClientError";
  }
}

export interface WooCredential {
  readonly key: string;
  readonly secret: string;
}

/**
 * Normalise a merchant-pasted store URL, or refuse it.
 *
 * Refusing here rather than at request time is the point: a merchant who pastes `http://` or a URL
 * with a path gets told at connect time, while they are looking at the screen, rather than at 03:00
 * the following morning in a log nobody reads.
 */
export function normaliseStoreUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new WooClientError(
      `woocommerce: ${JSON.stringify(input)} is not a URL. Paste the store's address, e.g. ` +
        "https://shop.example.com",
      "invalid_store_url",
    );
  }

  if (url.protocol !== "https:") {
    throw new WooClientError(
      `woocommerce: ${url.protocol}// is refused. Over plain HTTP the WooCommerce API requires ` +
        "OAuth 1.0a request signing, which this connector deliberately does not implement — the " +
        "store's own orders would travel in clear either way. Use https.",
      "insecure_store_url",
    );
  }

  // Origin only. A pasted `/wp-admin` or a trailing slash would otherwise be concatenated into the
  // API path and 404 with a message about a route rather than about the URL.
  return url.origin;
}

/**
 * The Authorization header for a consumer key and secret.
 *
 * `btoa` is Latin-1 only. WooCommerce keys are ASCII (`ck_`/`cs_` followed by hex), so this is safe
 * — but it is asserted rather than assumed, because a non-ASCII byte makes `btoa` THROW at request
 * time, which would surface as a network error on a scheduled pull instead of as a bad credential.
 */
export function basicAuthHeader(credential: WooCredential): string {
  const pair = `${credential.key}:${credential.secret}`;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to reject control bytes.
  if (/[^\x20-\x7E]/.test(pair)) {
    throw new WooClientError(
      "woocommerce: the key or secret contains a character outside printable ASCII. WooCommerce " +
        "issues ASCII credentials, so this is a paste error rather than a key this connector " +
        "cannot encode.",
      "invalid_credential",
    );
  }
  return `Basic ${btoa(pair)}`;
}

/**
 * A window of MODIFIED time, which is the unit both the walker and the bisector work in.
 *
 * Not a date and not a day. `32` §2 established that no WooCommerce window ever closes, so a pull
 * is bounded by two instants rather than by a calendar day, and the bisector below needs to halve
 * it down to seconds.
 */
export interface WooWindow {
  /** RFC3339 UTC. The watermark: only orders modified at or after this. */
  readonly modifiedAfter: string;
  /** RFC3339 UTC, pinned to the run's start. See decision 3. */
  readonly modifiedBefore: string;
}

export interface WooOrdersQuery extends WooWindow {
  readonly page?: number;
  readonly perPage?: number;
}

/**
 * The URL for one page of orders.
 *
 * WooCommerce wants `YYYY-MM-DDTHH:MM:SS` without a designator and interprets it as UTC when
 * `dates_are_gmt=true`, so the trailing `Z` is stripped from the RFC3339 input rather than passed
 * through — the same designator-less convention the normaliser has to undo on the way back.
 */
export function ordersUrl(storeUrl: string, query: WooOrdersQuery): string {
  const perPage = Math.min(query.perPage ?? WOO_MAX_PER_PAGE, WOO_MAX_PER_PAGE);
  const params = new URLSearchParams({
    modified_after: stripDesignator(query.modifiedAfter),
    modified_before: stripDesignator(query.modifiedBefore),
    // Decision 2. Without this the window is in the merchant's WordPress timezone.
    dates_are_gmt: "true",
    // A stable sort. Under OFFSET pagination an unstable one drops rows between pages.
    orderby: "modified",
    order: "asc",
    // Every status, including refunded and cancelled: a cancelled order is a restatement of a sale
    // that was counted, not a row to hide.
    status: "any",
    per_page: String(perPage),
    page: String(query.page ?? 1),
    // Two decimal places. WooCommerce's default rounds money for display.
    dp: "2",
  });
  return `${storeUrl}${WOO_API_PATH}/orders?${params.toString()}`;
}

function stripDesignator(rfc3339: string): string {
  return rfc3339.replace(/(?:\.\d+)?Z$/, "").replace(/(?:\.\d+)?[+-]\d{2}:\d{2}$/, "");
}

export interface WooPage {
  readonly orders: readonly unknown[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalOrders: number;
}

/**
 * Read WooCommerce's pagination headers.
 *
 * `X-WP-TotalPages` is authoritative and a short page is NOT a reliable end-of-results signal — see
 * decision 5. A missing header is treated as a single page rather than as zero: a store with one
 * order and a proxy that strips the header should still be read once, not skipped silently.
 */
export function readPagination(headers: Headers, page: number): Omit<WooPage, "orders"> {
  const totalPages = Number(headers.get("x-wp-totalpages"));
  const totalOrders = Number(headers.get("x-wp-total"));
  return {
    page,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
    totalOrders: Number.isFinite(totalOrders) && totalOrders >= 0 ? totalOrders : 0,
  };
}

export interface WooFetchOptions extends FetchOptions {
  readonly fetchImpl: typeof fetch;
  readonly storeUrl: string;
  readonly credential: WooCredential;
}

/** Fetch one page. Returns the parsed page; the caller decides whether to ask for the next. */
export async function fetchOrdersPage(
  options: WooFetchOptions,
  query: WooOrdersQuery,
): Promise<WooPage> {
  const response = await fetchWithRetry(
    options.fetchImpl,
    {
      url: ordersUrl(options.storeUrl, query),
      init: {
        method: "GET",
        headers: {
          Authorization: basicAuthHeader(options.credential),
          Accept: "application/json",
          // So a merchant's host admin can attribute the traffic to something, rather than seeing
          // an unidentified client hitting their store nightly.
          "User-Agent": "marketing-data-plane/1.0 (+connector; woocommerce)",
        },
      },
    },
    options,
  );

  const body = (await response.json()) as unknown;
  const orders = Array.isArray(body) ? body : [];
  return { orders, ...readPagination(response.headers, query.page ?? 1) };
}

/** One page, with the window it came from. The bisector yields pages from several windows. */
export interface WooWindowPage extends WooPage {
  readonly window: WooWindow;
}

export interface WooSplit {
  readonly window: WooWindow;
  readonly left: WooWindow;
  readonly right: WooWindow;
  /** The refusal that caused the split, verbatim — it already names the page and order counts. */
  readonly reason: string;
}

/** Policy knobs. Every default is a named constant above with its derivation attached. */
export interface WooWalkOptions {
  readonly perPage?: number;
  /** Pages one window may cost before it is split. Default `WOO_MAX_PAGES_PER_WINDOW`. */
  readonly maxPages?: number;
  /** Pages a one-second window may cost. Default `WOO_FLOOR_MAX_PAGES`. */
  readonly floorMaxPages?: number;
  /** Sub-windows one bisecting read may visit. Default `WOO_MAX_WINDOWS`. */
  readonly maxWindows?: number;
  /** Called before each split, so a caller can meter how hard a store is to read. */
  readonly onSplit?: (split: WooSplit) => void;
}

/** The dedupe key. Non-numeric ids are left to the normaliser, which refuses them outright. */
function orderId(order: unknown): number | null {
  const id = (order as { id?: unknown } | null)?.id;
  return typeof id === "number" ? id : null;
}

/**
 * Every page of ONE window, as an async generator.
 *
 * A GENERATOR RATHER THAN AN ARRAY, for the reason the module note gives: `putBufferedPayload`
 * holds one page, and one page is at most 100 orders. Accumulating a window into one array would
 * reintroduce exactly the unbounded buffer the `per_page` cap exists to prevent.
 *
 * THE LOOP IS BOUNDED BY A NUMBER READ ONCE (decision 6). `totalPages` is taken from page 1 and
 * never re-read, because it is a header the merchant's server controls; a server that recomputes it
 * upward on every request is a server that can page this loop forever. Above `maxPages` it refuses
 * without walking at all, which is the signal `fetchOrdersWindow` bisects on — and which costs the
 * merchant exactly one request to discover.
 *
 * IT ALSO REFUSES A WINDOW IT CANNOT PROVE IT READ WHOLE, and that is the half worth arguing with.
 * Decision 3 pinned `modified_before` so the result set cannot grow under an OFFSET walk, which
 * closes the insert race. Two races survive it:
 *
 *   * TIES. `orderby=modified` is not unique — a bulk status change stamps dozens of orders with
 *     the same second, and MySQL's tie-break under `LIMIT/OFFSET` is undefined. The same order can
 *     land on page 2 and page 3, which means another one landed on neither.
 *   * DELETION. An order trashed mid-run shifts every later row one place toward page 1, and the
 *     row that crosses a page boundary backwards is never returned.
 *
 * So ids are deduped across the window (a duplicate order is a double-counted sale, and nothing
 * downstream of here can see that it was the same page twice), and the unique count is checked
 * against the store's own `X-WP-Total`. A short count means a row was skipped, and a row skipped is
 * revenue quietly too low — the failure this product sells against. It throws rather than reporting
 * it, and that is the recoverable direction: the run fails, the watermark does not advance, and the
 * next run reads the same window again and succeeds. The alternative, a silently short window, is
 * permanent.
 */
export async function* fetchOrdersPages(
  options: WooFetchOptions,
  window: WooWindow,
  walk: WooWalkOptions = {},
): AsyncGenerator<WooWindowPage, void, undefined> {
  const perPage = Math.min(walk.perPage ?? WOO_MAX_PER_PAGE, WOO_MAX_PER_PAGE);
  const maxPages = walk.maxPages ?? WOO_MAX_PAGES_PER_WINDOW;

  const first = await fetchOrdersPage(options, { ...window, page: 1, perPage });

  if (first.totalPages > maxPages) {
    throw new WooClientError(
      `woocommerce: ${window.modifiedAfter}..${window.modifiedBefore} is ${first.totalPages} ` +
        `pages of ${perPage} (${first.totalOrders} orders), over the ${maxPages}-page limit. ` +
        "WordPress pages with OFFSET against the store's own MySQL, so reading deeper costs the " +
        "merchant rather than us. Narrow the window — fetchOrdersWindow does it by bisection.",
      "window_too_large",
    );
  }

  // A FULL PAGE WITH NO PAGINATION HEADERS IS NOT A COMPLETE WINDOW, IT IS AN UNKNOWN ONE.
  // `readPagination` reports a missing header as one page, deliberately, so that a proxy stripping
  // it cannot make a store with orders look empty (decision 5). The inverse mistake is this one: a
  // page that came back FULL is exactly the shape that has more behind it, and calling that window
  // done would under-report every night without ever erroring. A SHORT page is accepted, because
  // with `per_page` clamped to 100 a short page really is the last one.
  if (first.totalPages === 1 && first.totalOrders === 0 && first.orders.length === perPage) {
    throw new WooClientError(
      `woocommerce: ${window.modifiedAfter}..${window.modifiedBefore} returned a full page of ` +
        `${perPage} orders with no X-WP-Total or X-WP-TotalPages header, so there is no way to ` +
        "tell whether more remain. Something between us and the store is stripping response " +
        "headers — usually a proxy, a CDN or a security plugin. Refusing rather than reporting " +
        "one page as the whole window.",
      "pagination_headers_missing",
    );
  }

  const seen = new Set<number>();
  let unique = 0;

  for (let page = 1; page <= first.totalPages; page += 1) {
    const current =
      page === 1 ? first : await fetchOrdersPage(options, { ...window, page, perPage });

    // A server that runs out of rows before its own header said it would. Stopping here saves the
    // merchant the remaining requests; the count check below decides whether it was a real end.
    if (current.orders.length === 0) break;

    const fresh = current.orders;
    unique += fresh.length;

    // `totalPages` and `totalOrders` are page 1's, not this page's. Reporting the header this page
    // happened to carry would hand the caller the very number the loop refuses to trust.
    yield {
      window,
      orders: fresh,
      page,
      totalPages: first.totalPages,
      totalOrders: first.totalOrders,
    };
  }

  // Only checkable when the store said how many there were. With the headers stripped the loop read
  // one short page and stopped, which the refusal above already bounded to the safe case.
  if (first.totalOrders > 0 && unique !== first.totalOrders) {
    throw new WooClientError(
      `woocommerce: ${window.modifiedAfter}..${window.modifiedBefore} reported ` +
        `${first.totalOrders} orders and yielded ${unique} distinct ones. Under OFFSET paging that ` +
        "means a row moved while we read — a tie on date_modified that MySQL broke differently " +
        "between pages, or an order deleted mid-run. Refusing rather than returning a window that " +
        "is quietly short; the watermark does not advance and the next run reads it again.",
      "incomplete_window",
    );
  }
}

/**
 * The instant a window boundary actually means, in whole UTC seconds.
 *
 * Truncating to a second is not a loss: `ordersUrl` strips the fractional part before the request
 * is sent, because WooCommerce's designator-less format carries no milliseconds. So this is the
 * boundary the store will apply, and halving in these units is halving in the only units the filter
 * can express — which is also why the recursion has a floor at all.
 */
function windowSecond(rfc3339: string, field: string): number {
  const ms = Date.parse(rfc3339);
  if (!Number.isFinite(ms)) {
    throw new WooClientError(
      `woocommerce: ${field} is ${JSON.stringify(rfc3339)}, which is not an RFC3339 instant. ` +
        "Refusing rather than sending a window the store will interpret as something else.",
      "invalid_window",
    );
  }
  return Math.floor(ms / 1000);
}

/** Whole seconds back to the RFC3339 the query builder expects. UTC by construction. */
function windowStamp(second: number): string {
  return new Date(second * 1000).toISOString();
}

/**
 * Every page of a window, splitting the window when it is too big to read in one pass.
 *
 * THIS IS THE ONE A SCHEDULED PULL SHOULD CALL. `fetchOrdersPages` refuses an oversized window;
 * this one does something about it.
 *
 * THE TRIGGER IS PAGE COUNT, FROM PAGE 1'S OWN HEADERS, AND THE ALTERNATIVES ARE WORSE. Latency
 * cannot be the trigger: it is only known AFTER the merchant's database has already done the work,
 * it conflates their network with their MySQL, and a first page that came back fast says nothing
 * about page 30 — OFFSET degrades with depth, so the measurement that would decide is the one it is
 * too late to take. A totalPages threshold is known from the request we were going to make anyway,
 * costs the merchant nothing extra, and is the same number the depth problem is expressed in.
 *
 * TWO BOUNDS, BECAUSE ONE IS NOT ENOUGH. The span halves each time and integers cannot halve
 * forever, so the DEPTH terminates at a one-second window; that alone still permits an exponential
 * tree when splitting fails to reduce the count, so the number of windows visited is also budgeted
 * (`WOO_MAX_WINDOWS`). Worst case is therefore bounded arithmetic rather than trust.
 *
 * THE HALVES DO NOT OVERLAP BY ONE SECOND, deliberately. WooCommerce's `modified_after` and
 * `modified_before` bounds are inclusive, and whether they are is not something this connector has
 * verified against a live store (`34` §5). Splitting at `[after, mid]` and `[mid + 1s, before]`
 * makes the partition exact whichever way that turns out: no order can satisfy both halves, and no
 * second falls between them. Splitting at `mid` on both sides would duplicate an order for exactly
 * as long as nobody noticed.
 */
export async function* fetchOrdersWindow(
  options: WooFetchOptions,
  window: WooWindow,
  walk: WooWalkOptions = {},
): AsyncGenerator<WooWindowPage, void, undefined> {
  yield* bisect(options, window, walk, { remaining: walk.maxWindows ?? WOO_MAX_WINDOWS });
}

async function* bisect(
  options: WooFetchOptions,
  window: WooWindow,
  walk: WooWalkOptions,
  budget: { remaining: number },
): AsyncGenerator<WooWindowPage, void, undefined> {
  if (budget.remaining <= 0) {
    throw new WooClientError(
      `woocommerce: gave up after ${walk.maxWindows ?? WOO_MAX_WINDOWS} sub-windows without the ` +
        `window ${window.modifiedAfter}..${window.modifiedBefore} becoming readable. Halving is ` +
        "not reducing the store's reported order count, which means the date filter is not being " +
        "applied — a caching layer in front of the REST API, or a plugin overriding the query. " +
        "This store needs a deliberate catch-up run, not a longer loop.",
      "window_budget_exhausted",
    );
  }
  budget.remaining -= 1;

  const after = windowSecond(window.modifiedAfter, "modifiedAfter");
  const before = windowSecond(window.modifiedBefore, "modifiedBefore");
  // THE TERMINATION CONDITION, and the whole reason the recursion is safe. `before - after` is a
  // non-negative integer that strictly decreases with every split, so it reaches zero. At zero the
  // window is one second, WooCommerce cannot express anything narrower, and splitting it would hand
  // both children the same filter and the same answer forever.
  const divisible = before > after;

  let reason = "";
  try {
    yield* fetchOrdersPages(options, window, {
      ...walk,
      // The floor case buys its depth explicitly. See WOO_FLOOR_MAX_PAGES: a bulk edit or a
      // migration really does stamp thousands of orders with one `date_modified`, and refusing it
      // would mean that second is never readable by any run, ever.
      maxPages: divisible
        ? (walk.maxPages ?? WOO_MAX_PAGES_PER_WINDOW)
        : (walk.floorMaxPages ?? WOO_FLOOR_MAX_PAGES),
    });
    return;
  } catch (error) {
    // ONLY "too large" is recoverable by splitting, and only while there is something to split.
    // `incomplete_window` is raised AFTER pages have been yielded and means the store moved under
    // us; re-reading halves of it would yield those pages a second time. A one-second window that
    // is still too large has already had its cap raised above, so this rethrow carries the message
    // that names the cause rather than a generic one.
    if (!(error instanceof WooClientError) || error.code !== "window_too_large") throw error;
    if (!divisible) {
      // Re-worded rather than re-thrown, because the message it arrived with ends "narrow the
      // window" and this is the one window nobody can narrow. Telling a merchant to do the
      // impossible is the same failure as telling them to regenerate a working key.
      throw new WooClientError(
        `${error.message} And this window is a single second — WooCommerce's date filters have no ` +
          "finer granularity — so it cannot be narrowed further. Thousands of orders sharing one " +
          "date_modified is a bulk edit, a re-import or a migration; that needs a deliberate " +
          "catch-up run with a raised page limit, not a nightly job.",
        "window_too_large",
      );
    }
    reason = error.message;
  }

  const mid = after + Math.floor((before - after) / 2);
  const left: WooWindow = { modifiedAfter: window.modifiedAfter, modifiedBefore: windowStamp(mid) };
  const right: WooWindow = {
    modifiedAfter: windowStamp(mid + 1),
    modifiedBefore: window.modifiedBefore,
  };

  walk.onSplit?.({ window, left, right, reason });

  yield* bisect(options, left, walk, budget);
  yield* bisect(options, right, walk, budget);
}

/** What a successful probe tells the connect surface. Deliberately not the order it read. */
export interface WooProbe {
  /** The normalised origin every later request will use. */
  readonly storeUrl: string;
  /** `X-WP-Total` for an unfiltered read: how many orders this key can actually see. */
  readonly totalOrders: number;
}

/** `GET /orders?per_page=1`. The smallest request that exercises every link in the chain. */
export function probeUrl(storeUrl: string): string {
  // Two parameters and no more. Every parameter is another thing a plugin can reject, and this
  // request exists to distinguish failures rather than to collect data. `status=any` so a store
  // whose only orders are refunded or cancelled still proves readable.
  return `${storeUrl}${WOO_API_PATH}/orders?per_page=1&status=any`;
}

/**
 * One request that validates store URL, credential, key permission level, WordPress-user capability
 * and pretty-permalinks — at connect time, while a human is looking at the screen.
 *
 * THE POINT IS THE MAPPING, NOT THE REQUEST. Every failure below is a different thing for the
 * merchant to go and do, and the two that are commonly confused are the expensive ones:
 *
 *   * `rest_no_route` IS NOT A BAD CREDENTIAL. It is WordPress saying the route does not exist,
 *     which is what Plain permalinks produces — `/wp-json/` has no rewrite rule to match. A
 *     merchant told their key is wrong regenerates a key that was fine, pastes it, fails
 *     identically, and now believes the integration is broken. WooCommerce being deactivated gives
 *     the same answer, and the message says so: both are fixed in WP admin, neither by a new key.
 *   * `woocommerce_rest_cannot_view` HAS TWO CAUSES THAT ONE RESPONSE CANNOT SEPARATE. Either the
 *     WordPress user the key belongs to lacks the capability to list orders (a Subscriber or
 *     Customer account rather than an Administrator or Shop manager), or the host stripped the
 *     `Authorization` header and WooCommerce saw no key at all — the header-stripping case `34`
 *     §1.2 records, whose query-string workaround is deliberately unimplemented because it puts the
 *     secret in the merchant's access log. The message names both, because naming one would be a
 *     guess dressed as a diagnosis.
 *
 * AND ONE DISTINCTION DELIBERATELY NOT DRAWN. WooCommerce returns the same `woocommerce_rest_
 * authentication_error` for "consumer key is invalid" and for "this key has Write permission and
 * you asked to read"; only the human-readable `message` differs, and that message is passed through
 * `__()`. A Thai-language store returns it in Thai. Matching on it would work in the office and
 * fail at the customer, so both are reported as `invalid_credential` with a message naming both —
 * they are fixed on the same screen anyway.
 *
 * IT COSTS ONE REQUEST, and that is a property of `classify` rather than a promise made here: every
 * failure this probe exists to distinguish is a 4xx, which is non-retryable, so `fetchWithRetry`
 * stops on the first attempt. Only a 5xx or a 429 spends the retry budget, which is the one case
 * where a human is right to wait.
 *
 * IT NEVER RETURNS THE ORDER IT READ. `per_page=1` fetches one real order, carrying a real buyer's
 * name, email, phone and address. It is read to confirm the response is a JSON array and then
 * dropped: the result is the store's order COUNT and nothing else, so no personal data reaches a
 * connect screen, a log line or an error message. `per_page=1` is also what keeps that exposure to
 * one order rather than a hundred.
 */
export async function probeStore(options: WooFetchOptions): Promise<WooProbe> {
  // Throws `invalid_credential` before any request exists if the paste is unencodable. A connect
  // screen should say "that key has a stray character in it" without touching the merchant's store.
  const authorization = basicAuthHeader(options.credential);

  // `fetchWithRetry` throws on a non-ok status and hands back only the status: the BODY, which is
  // where `rest_no_route` lives, is gone. Rather than re-implementing backoff — and losing the
  // stop-on-non-retryable behaviour that keeps this to one request — the response is intercepted on
  // its way past. `clone()` because the original must reach `fetchWithRetry` unread.
  let failureBody: { code?: unknown; message?: unknown } | null = null;
  const capturing: typeof fetch = async (input, init) => {
    const response = await options.fetchImpl(input, init);
    if (!response.ok) {
      failureBody = (await response
        .clone()
        .json()
        .catch(() => null)) as { code?: unknown; message?: unknown } | null;
    }
    return response;
  };

  let response: Response;
  try {
    response = await fetchWithRetry(
      capturing,
      {
        url: probeUrl(options.storeUrl),
        init: {
          method: "GET",
          headers: {
            Authorization: authorization,
            Accept: "application/json",
            "User-Agent": "marketing-data-plane/1.0 (+connector; woocommerce)",
          },
        },
      },
      options,
    );
  } catch (error) {
    throw probeFailure(error, failureBody, options.storeUrl);
  }

  const body = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(body)) {
    throw new WooClientError(
      `woocommerce: ${options.storeUrl} answered the orders endpoint with 200 and something that ` +
        "is not a JSON array. WooCommerce always answers a collection with an array, so whatever " +
        "replied is not it — usually a caching or maintenance plugin serving a page, or a URL " +
        "that is a proxy in front of the real store.",
      "not_a_wp_rest_endpoint",
    );
  }

  // Headers only. The one order in `body` is not read, not returned and not logged.
  return {
    storeUrl: options.storeUrl,
    totalOrders: readPagination(response.headers, 1).totalOrders,
  };
}

/**
 * Turn a failed probe into the sentence a merchant can act on.
 *
 * The WordPress `code` field is the signal, not the HTTP status: a 401 is three different problems
 * and a 404 is two. Statuses are only consulted where there is no code to read, which is itself
 * diagnostic — WooCommerce always answers with JSON, so a response without a code came from
 * something in front of it.
 *
 * NO MESSAGE HERE EVER INTERPOLATES THE CREDENTIAL, including the key. `34` §3 gate 4 is the gate
 * this file could most easily fail, and an error message is the likeliest place to fail it.
 */
function probeFailure(
  error: unknown,
  body: { code?: unknown; message?: unknown } | null,
  storeUrl: string,
): WooClientError {
  const code = typeof body?.code === "string" ? body.code : null;
  const status = error instanceof ExtractError ? error.status : null;

  if (code === "rest_no_route") {
    return new WooClientError(
      `woocommerce: ${storeUrl} answered with rest_no_route, which means the REST route does not ` +
        "exist — NOT that the key is wrong. Two things produce it: permalinks set to Plain, so " +
        "/wp-json/ has no rewrite rule (fix: WP admin -> Settings -> Permalinks -> choose " +
        "anything but Plain -> Save), or WooCommerce being deactivated. Regenerating the API key " +
        "changes nothing here.",
      "permalinks_disabled",
    );
  }

  if (code === "woocommerce_rest_authentication_error") {
    return new WooClientError(
      `woocommerce: ${storeUrl} rejected the consumer key. Either the key or secret does not ` +
        "match, or the key exists with Write-only permission and this connector reads. Both are " +
        "the same screen: WooCommerce -> Settings -> Advanced -> REST API -> the key's " +
        "Permissions must be Read or Read/Write. (WooCommerce returns one error code for both and " +
        "translates the text, so this connector will not guess which.)",
      "invalid_credential",
    );
  }

  if (typeof code === "string" && code.startsWith("woocommerce_rest_cannot_")) {
    return new WooClientError(
      `woocommerce: ${storeUrl} accepted the request and refused to list orders. Either the ` +
        "WordPress user the key belongs to cannot see orders — the key must belong to an " +
        "Administrator or Shop manager, not a Customer or Subscriber — or the store's host is " +
        "stripping the Authorization header, in which case WooCommerce never saw a key at all. " +
        "One response cannot tell those apart; check the key's user first, then ask the host.",
      "insufficient_permission",
    );
  }

  if (error instanceof ExtractError && (error.kind === "network" || (status ?? 0) >= 500)) {
    return new WooClientError(
      `woocommerce: could not reach ${storeUrl}${status === null ? "" : ` (HTTP ${status})`} in ` +
        `${error.attempts} attempt(s). The store, its host or its DNS is down, or it is in ` +
        "maintenance mode. The credential was never tested, so nothing about it is implied.",
      "store_unreachable",
    );
  }

  if (status === 429) {
    return new WooClientError(
      `woocommerce: ${storeUrl} rate-limited the connect check. That is the store's host or a ` +
        "security plugin rather than WooCommerce, which publishes no rate limit. Wait a minute " +
        "and try again; if it persists the host is throttling the REST API.",
      "store_unreachable",
    );
  }

  // No WordPress error code at all. Whatever answered is not the WooCommerce REST API: a WAF or
  // security plugin (403 with an HTML page), a parked domain, a CDN error page, or WordPress's own
  // themed 404 — which is what a Plain-permalink store returns on hosts where /wp-json/ is not
  // routed at all. Permalinks are named here for that reason, not as a guess.
  return new WooClientError(
    `woocommerce: ${storeUrl} answered the orders endpoint with ` +
      `${status === null ? "no HTTP status" : `HTTP ${status}`} and no WordPress error code. ` +
      "WooCommerce always answers with JSON, so something in front of it replied: a security " +
      "plugin or WAF, a CDN error page, or a themed 404 from a store whose permalinks are set to " +
      "Plain. Check the address is the store's own home URL, then its security plugin.",
    "not_a_wp_rest_endpoint",
  );
}
