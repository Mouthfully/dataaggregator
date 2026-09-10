/**
 * WooCommerce REST client.
 *
 * The `client` half of the connector unit (specification 13.3). It builds requests and reads
 * pagination; it does not normalise, and it does not read the body — `fetchWithRetry` returns the
 * `Response` so an extractor can stream it to R2 rather than materialise rows in a 128 MB isolate.
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
 */

import { type FetchOptions, fetchWithRetry } from "@repo/extract";

/** WordPress core's cap on a collection request. Not WooCommerce's, and not overridable. */
export const WOO_MAX_PER_PAGE = 100;

export const WOO_API_PATH = "/wp-json/wc/v3";

export type WooClientErrorCode = "insecure_store_url" | "invalid_store_url" | "invalid_credential";

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

export interface WooOrdersQuery {
  /** RFC3339 UTC. The watermark: only orders modified at or after this. */
  readonly modifiedAfter: string;
  /** RFC3339 UTC, pinned to the run's start. See decision 3. */
  readonly modifiedBefore: string;
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
