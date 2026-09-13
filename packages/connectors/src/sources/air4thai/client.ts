/**
 * Air4Thai -> transport.
 *
 * THE SOURCE. Air4Thai is the Thai Pollution Control Department's public air quality service. It
 * publishes hourly readings from roughly 174 fixed monitoring stations across Thailand over an
 * UNAUTHENTICATED GET that returns every station in one JSON document.
 *
 * ============================================================================================
 * THIS CONNECTOR HOLDS NO CREDENTIAL, AND THAT IS THE WHOLE REASON IT LOOKS DIFFERENT.
 * ============================================================================================
 *
 * Compare `Ga4ClientOptions`, which carries `accessToken`, or `WooCredential`, which carries a key
 * and a secret. `Air4ThaiClientOptions` carries neither, and no field of it is secret. There is
 * nothing to seal, nothing to refresh, nothing to revoke and nothing to go stale at 3am.
 *
 * The consequences reach further than one missing field:
 *
 *   NO `connections` ROW. `public.connections` requires `credential_ciphertext`, `credential_iv`
 *   and `wrapped_dek` NOT NULL. Filing a row of placeholder bytes would put a fiction in the one
 *   table whose entire purpose is custody of real secrets.
 *
 *   NO ENTRY IN `PROVIDER_LANES`, and NO NEW MEMBER OF `app.credential_lane`. A lane answers "how
 *   did this credential get here"; there is no credential. A `none` lane would make
 *   `isSelfIssued()` -- which is `lane !== "oauth"` -- answer TRUE to "did the customer mint this
 *   itself", and `connectionHealth` would then report "Connected. This key does not expire" about
 *   something that does not exist. `scripts/check-providers.mjs` passes in both directions because
 *   nothing was added to either side; `supabase/tests/14_ambient.sql` asserts both absences so
 *   this paragraph cannot quietly stop being true.
 *
 *   NO PER-TENANT ATTRIBUTION. The rows land in `public.ambient_readings`, which is shared and
 *   carries no `workspace_id`. What a workspace owns is its SUBSCRIPTION. See the header of
 *   `supabase/migrations/20260912000900_ambient_readings.sql`.
 *
 * ============================================================================================
 * THE BASE URL AND THE RESPONSE SHAPE ARE UNVERIFIED AGAINST THE LIVE SERVICE.
 * ============================================================================================
 *
 * Stated at the top rather than buried in the fixtures, because everything below depends on it.
 * The endpoint was NOT reachable from the environment this was written in: `air4thai.pcd.go.th`
 * and `air4thai.com` both resolved and both returned `503 upstream connect error ... remote
 * connection failure` from the egress gateway, for every path tried, over both http and https.
 *
 * So the URL and every field name here come from the DOCUMENTED shape -- the service's published
 * endpoint and the field names its long-standing third-party consumers read -- and not from a
 * response anyone observed. Specification section 13.3 rule 6 wants recorded fixtures with PII
 * scrubbed; these are not that, exactly as `ga4/fixtures.ts` says of its own.
 *
 * WHAT THAT MEANS IN PRACTICE: the normaliser encodes what the API is believed to return. A
 * recorded response encodes what it does return. Every assumption is marked `ASSUMPTION:` at the
 * point it is relied on, in this file, in `normalize.ts` and in `fixtures.ts`. Before this
 * connector is scheduled against the live service, fetch one response, save it as a fixture, and
 * re-run `contract.test.ts`. If it disagrees, the fixture is right and this code is wrong.
 *
 * ============================================================================================
 * WHAT THIS CLIENT DELIBERATELY DOES NOT HAVE.
 * ============================================================================================
 *
 *   NO PAGING. The endpoint returns every station in one document -- there is no cursor, no
 *   offset, no `rowCount`, and therefore no page walker and no `backfill.ts`. That absence is a
 *   fact about the service, not an omission: `check-capabilities.mjs` treats `backfill.ts` as
 *   optional precisely so a connector is not forced to assert a roadmap. A backfill here would be
 *   a different endpoint (the history service), which is a separate unit of work.
 *
 *   NO QUOTA ACCOUNTING. GA4 meters complexity tokens and Google Ads meters operations against a
 *   ceiling shared across every tenant, which is why those clients budget. This is one
 *   unauthenticated GET against a government service with no published quota; inventing a budget
 *   would produce a number that looks measured and is not (the same trap `parseMetaThrottle`
 *   documents). What it has instead is politeness: the data changes hourly, so pulling it more
 *   often than hourly spends someone else's bandwidth for nothing.
 */

import { type FetchOptions, fetchWithRetry } from "@repo/extract";
import type { Air4ThaiResponse } from "./normalize.ts";

/**
 * `GET {base}/getNewAQI_JSON.php`.
 *
 * ASSUMPTION: the host, the path and the https scheme. Overridable so tests never resolve a real
 * host, which is also the only way this module is testable at all given the service was
 * unreachable.
 */
export const AIR4THAI_API_BASE = "https://air4thai.pcd.go.th/services";

export const AIR4THAI_STATIONS_PATH = "/getNewAQI_JSON.php";

/**
 * The floor a healthy response must clear.
 *
 * ASSUMPTION: the network is documented as roughly 174 stations. The check is not `=== 174` --
 * stations are commissioned and decommissioned and a connector that breaks when Thailand opens one
 * is worse than useless. What it refuses is the degenerate case: a 200 carrying `{"stations": []}`,
 * which is an outage wearing the costume of clean air everywhere in the country. Silence and zero
 * are different readings and only one of them should reach a customer.
 */
export const AIR4THAI_MIN_STATIONS = 1;

export type Air4ThaiClientErrorCode = "unparseable_body" | "not_an_object" | "no_stations";

export class Air4ThaiClientError extends Error {
  constructor(
    message: string,
    readonly code: Air4ThaiClientErrorCode,
  ) {
    super(message);
    this.name = "Air4ThaiClientError";
  }
}

/**
 * Everything this client needs, and it is deliberately three fields with no secret among them.
 *
 * A reviewer looking for the credential should find this comment instead of adding one.
 */
export interface Air4ThaiClientOptions {
  readonly fetchImpl: typeof fetch;
  readonly baseUrl?: string;
  readonly retry: FetchOptions;
}

export interface Air4ThaiSnapshot {
  readonly response: Air4ThaiResponse;
  /** How many stations the document carried, so a caller can log a shrinking network. */
  readonly stations: number;
}

export function stationsUrl(baseUrl: string = AIR4THAI_API_BASE): string {
  return `${baseUrl}${AIR4THAI_STATIONS_PATH}`;
}

/**
 * The whole network, in one request.
 *
 * NO `authorization` HEADER IS SENT, and `client.test.ts` asserts that rather than trusting it.
 * The point is not that it would be rejected -- it would probably be ignored -- but that a header
 * added here later, by someone pattern-matching on the other five connectors, is how a credential
 * this product does not need starts being collected. An empty init is the statement.
 */
export async function fetchStations(options: Air4ThaiClientOptions): Promise<Air4ThaiSnapshot> {
  const url = stationsUrl(options.baseUrl);

  const response = await fetchWithRetry(
    options.fetchImpl,
    { url, init: { method: "GET", headers: { accept: "application/json" } } },
    options.retry,
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Air4ThaiClientError(
      `air4thai: ${url} returned a body that is not JSON: ${(cause as Error).message}`,
      "unparseable_body",
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Air4ThaiClientError(
      `air4thai: ${url} returned ${Array.isArray(body) ? "an array" : typeof body}, not an object`,
      "not_an_object",
    );
  }

  const stations = (body as Air4ThaiResponse).stations;

  // AN EMPTY NETWORK IS AN OUTAGE, NOT A READING. Refused here rather than normalised into zero
  // rows, because zero rows is indistinguishable downstream from "we have not pulled yet" and both
  // are indistinguishable from "the air is fine". The product's entire pitch is that a number
  // going missing is louder than a number being wrong.
  if (!Array.isArray(stations) || stations.length < AIR4THAI_MIN_STATIONS) {
    throw new Air4ThaiClientError(
      `air4thai: ${url} returned ${Array.isArray(stations) ? stations.length : "no"} stations. ` +
        "An empty network is an outage presenting as clean air across Thailand; refusing rather " +
        "than emitting zero rows, which nothing downstream can tell apart from not having pulled.",
      "no_stations",
    );
  }

  return { response: body as Air4ThaiResponse, stations: stations.length };
}
