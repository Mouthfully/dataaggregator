import { ExtractError, type FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import {
  AIR4THAI_API_BASE,
  AIR4THAI_STATIONS_PATH,
  Air4ThaiClientError,
  type Air4ThaiClientOptions,
  fetchStations,
  stationsUrl,
} from "./client.ts";
import { ONE_STATION, TWO_STATIONS } from "./fixtures.ts";

/** No real waiting, no real randomness, no real host. */
const RETRY: FetchOptions = {
  maxAttempts: 2,
  random: () => 0.5,
  now: () => new Date("2026-09-12T07:12:00Z"),
  sleep: async () => undefined,
};

const BASE = "https://air4thai.test/services";

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/**
 * Records what was asked and replays a queue. Throws when the queue runs out rather than
 * replaying, for the reason ga4/client.test.ts gives: a client that requests more than it should
 * must fail fast rather than hang CI.
 */
function recorder(responses: Array<{ status?: number; body: unknown; text?: string }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const next = responses[calls.length];
    if (next === undefined) {
      throw new Error(
        `the client made request ${calls.length + 1} with only ${responses.length} queued. This ` +
          "endpoint returns the whole network in one document; there is nothing to page.",
      );
    }
    calls.push({ url: String(url), init });
    return new Response(next.text ?? JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function client(fetchImpl: typeof fetch): Air4ThaiClientOptions {
  return { fetchImpl, baseUrl: BASE, retry: RETRY };
}

describe("the URL", () => {
  it("is the documented endpoint by default", () => {
    expect(stationsUrl()).toBe(`${AIR4THAI_API_BASE}${AIR4THAI_STATIONS_PATH}`);
    expect(stationsUrl()).toBe("https://air4thai.pcd.go.th/services/getNewAQI_JSON.php");
  });

  it("is overridable, which is the only reason this module is testable at all", () => {
    // The live service was unreachable from the environment this was written in -- see the header
    // of client.ts. Without an injectable base there would be no evidence of anything here.
    expect(stationsUrl(BASE)).toBe(`${BASE}/getNewAQI_JSON.php`);
  });
});

describe("fetching the network", () => {
  it("asks once and returns every station", async () => {
    const { calls, fetchImpl } = recorder([{ body: TWO_STATIONS }]);
    const snapshot = await fetchStations(client(fetchImpl));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/getNewAQI_JSON.php`);
    expect(snapshot.stations).toBe(2);
    expect(snapshot.response.stations?.[0]?.stationID).toBe("03t");
  });

  it("SENDS NO CREDENTIAL OF ANY KIND", async () => {
    // THE POINT OF THIS TEST is not that a credential would be rejected -- it would probably be
    // ignored. It is that somebody extending this file by pattern-matching on the other five
    // connectors, all of which carry a token, would start collecting a secret this product has no
    // need for and no lane to store. The assertion is the guard rail.
    const { calls, fetchImpl } = recorder([{ body: ONE_STATION }]);
    await fetchStations(client(fetchImpl));

    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-api-key")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(calls[0]?.url).not.toMatch(/[?&](key|token|api_key|apikey)=/i);
  });

  it("uses GET, because nothing here is a submission", async () => {
    const { calls, fetchImpl } = recorder([{ body: ONE_STATION }]);
    await fetchStations(client(fetchImpl));
    expect(calls[0]?.init?.method).toBe("GET");
  });

  it("does not page, because the endpoint has no cursor", async () => {
    // One queued response and a recorder that throws on a second request. A page walker added
    // later fails here rather than silently double-counting a station.
    const { fetchImpl } = recorder([{ body: TWO_STATIONS }]);
    await expect(fetchStations(client(fetchImpl))).resolves.toBeTruthy();
  });
});

describe("the refusals", () => {
  it("refuses a body that is not JSON", async () => {
    const { fetchImpl } = recorder([{ body: null, text: "<html>maintenance</html>" }]);
    await expect(fetchStations(client(fetchImpl))).rejects.toThrow(Air4ThaiClientError);
  });

  it("refuses a JSON body that is not an object", async () => {
    const { fetchImpl } = recorder([{ body: [1, 2, 3] }]);
    await expect(fetchStations(client(fetchImpl))).rejects.toThrow(/not an object/);
  });

  it("refuses an empty network rather than reporting clean air across Thailand", async () => {
    // A 200 carrying zero stations is an outage. Normalised, it is zero rows -- which nothing
    // downstream can tell apart from "we have not pulled yet", or from "the air is fine".
    const { fetchImpl } = recorder([{ body: { stations: [] } }]);
    await expect(fetchStations(client(fetchImpl))).rejects.toThrow(/empty network is an outage/);

    try {
      const again = recorder([{ body: { stations: [] } }]);
      await fetchStations(client(again.fetchImpl));
    } catch (error) {
      expect((error as Air4ThaiClientError).code).toBe("no_stations");
    }
  });

  it("refuses a body with no stations key at all", async () => {
    const { fetchImpl } = recorder([{ body: { error: "down for maintenance" } }]);
    await expect(fetchStations(client(fetchImpl))).rejects.toThrow(/stations/);
  });

  it("lets a transport failure through as an ExtractError rather than swallowing it", async () => {
    // 404 is a client failure: `fetchWithRetry` classifies it non-retryable and throws. If this
    // connector caught it and returned an empty snapshot, a moved endpoint would present as a
    // country with no air quality data and no error anywhere.
    const { fetchImpl } = recorder([{ status: 404, body: { error: "gone" } }]);
    await expect(fetchStations(client(fetchImpl))).rejects.toThrow(ExtractError);
  });

  it("retries a 5xx and succeeds on the second attempt", async () => {
    const { calls, fetchImpl } = recorder([
      { status: 503, body: { error: "upstream" } },
      { body: ONE_STATION },
    ]);
    const snapshot = await fetchStations(client(fetchImpl));
    expect(calls).toHaveLength(2);
    expect(snapshot.stations).toBe(1);
  });
});
