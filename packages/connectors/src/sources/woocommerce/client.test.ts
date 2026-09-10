import { describe, expect, it } from "vitest";
import {
  WOO_MAX_PER_PAGE,
  WooClientError,
  basicAuthHeader,
  normaliseStoreUrl,
  ordersUrl,
  readPagination,
} from "./client.js";

const CRED = { key: "ck_a1b2c3", secret: "cs_9z8y7x" };
const QUERY = {
  modifiedAfter: "2026-09-09T00:00:00.000Z",
  modifiedBefore: "2026-09-10T00:00:00.000Z",
};

describe("decision 1: https or nothing", () => {
  it("refuses a plain-HTTP store, and says why rather than just refusing", () => {
    // Over HTTP the API requires OAuth 1.0a signing. The message has to carry that, or the merchant
    // reads "https required" as pedantry and goes looking for a setting to turn it off.
    try {
      normaliseStoreUrl("http://shop.example.com");
      throw new Error("should have refused");
    } catch (error) {
      expect((error as WooClientError).code).toBe("insecure_store_url");
      expect((error as Error).message).toMatch(/OAuth 1\.0a/);
    }
  });

  it("refuses something that is not a URL at all", () => {
    expect(() => normaliseStoreUrl("shop.example.com")).toThrow(/is not a URL/);
  });

  it("reduces a pasted admin URL to its origin", () => {
    // A merchant copies the address bar, which is usually somewhere inside wp-admin. Concatenating
    // that into the API path 404s with a message about a route rather than about the URL.
    expect(normaliseStoreUrl("https://shop.example.com/wp-admin/admin.php?page=wc-settings")).toBe(
      "https://shop.example.com",
    );
    expect(normaliseStoreUrl("  https://shop.example.com/  ")).toBe("https://shop.example.com");
  });
});

describe("decision 2: the window is UTC, not the merchant's timezone", () => {
  it("sends dates_are_gmt=true on every request", () => {
    // It DEFAULTS TO FALSE. Without it a Thai store's boundary moves by seven hours and the pull
    // silently covers a different day than it reports.
    const url = new URL(ordersUrl("https://shop.example.com", QUERY));
    expect(url.searchParams.get("dates_are_gmt")).toBe("true");
  });

  it("strips the RFC3339 designator, because WooCommerce wants a bare timestamp", () => {
    const url = new URL(ordersUrl("https://shop.example.com", QUERY));
    expect(url.searchParams.get("modified_after")).toBe("2026-09-09T00:00:00");
    expect(url.searchParams.get("modified_after")).not.toMatch(/Z$/);
  });
});

describe("decision 3: the upper bound is pinned", () => {
  it("always sends modified_before, never leaving the window open", () => {
    // WordPress paginates with OFFSET. A row modified DURING the pull shifts between pages, and one
    // that shifts backwards past the cursor is never returned at all -- which presents as "some
    // orders are just missing sometimes".
    const url = new URL(ordersUrl("https://shop.example.com", QUERY));
    expect(url.searchParams.get("modified_before")).toBe("2026-09-10T00:00:00");
  });
});

describe("decision 4: filter on modified, not created", () => {
  it("uses modified_after and never `after`", () => {
    // `after` filters on CREATED date and would never return a refund of last month's order.
    const url = new URL(ordersUrl("https://shop.example.com", QUERY));
    expect(url.searchParams.get("modified_after")).toBeTruthy();
    expect(url.searchParams.get("after")).toBeNull();
    expect(url.searchParams.get("before")).toBeNull();
  });

  it("sorts by modified ascending, for a stable page order", () => {
    const url = new URL(ordersUrl("https://shop.example.com", QUERY));
    expect(url.searchParams.get("orderby")).toBe("modified");
    expect(url.searchParams.get("order")).toBe("asc");
  });

  it("asks for every status, because a cancelled order is a restatement", () => {
    const url = new URL(ordersUrl("https://shop.example.com", QUERY));
    expect(url.searchParams.get("status")).toBe("any");
  });
});

describe("decision 5: per_page caps at 100", () => {
  it("clamps a larger request rather than sending it", () => {
    // WooCommerce does not error on per_page=500; it silently returns 100. Sending it would make
    // the caller believe it had asked for something it did not get.
    const url = new URL(ordersUrl("https://shop.example.com", { ...QUERY, perPage: 500 }));
    expect(url.searchParams.get("per_page")).toBe(String(WOO_MAX_PER_PAGE));
  });

  it("reads the page count from the header, not from a short page", () => {
    const headers = new Headers({ "x-wp-totalpages": "7", "x-wp-total": "612" });
    expect(readPagination(headers, 1)).toEqual({ page: 1, totalPages: 7, totalOrders: 612 });
  });

  it("treats a missing header as one page, not as zero", () => {
    // A proxy that strips the header must not make a store with orders look empty. Reading it once
    // is recoverable; skipping it silently is not.
    expect(readPagination(new Headers(), 1).totalPages).toBe(1);
  });
});

describe("authentication", () => {
  it("builds a Basic header from the key and secret", () => {
    const header = basicAuthHeader(CRED);
    expect(header).toMatch(/^Basic /);
    expect(atob(header.slice("Basic ".length))).toBe("ck_a1b2c3:cs_9z8y7x");
  });

  it("keeps the secret out of the URL entirely", () => {
    // WooCommerce documents a query-string fallback for hosts that strip the Authorization header.
    // It is not the default here and must never become it by accident: a secret in a URL is a
    // secret in the merchant's access log, and in every proxy log between us and them.
    const url = ordersUrl("https://shop.example.com", QUERY);
    expect(url).not.toContain(CRED.secret);
    expect(url).not.toContain("consumer_secret");
  });

  it("refuses a non-ASCII credential rather than letting btoa throw at request time", () => {
    // btoa is Latin-1 only. A character outside it THROWS when the request is built, which surfaces
    // on a scheduled pull as a network-shaped failure rather than as a bad credential the merchant
    // can actually fix. "ครัว" is Thai, i.e. exactly what a Thai merchant might
    // paste by accident from the wrong field.
    expect(() => basicAuthHeader({ key: "ck_ครัว", secret: "cs_1" })).toThrow(WooClientError);
  });

  it("refuses a control byte, which would smuggle a newline into a header", () => {
    // Header injection: a bare CR or LF in a credential is how a second header gets appended. btoa
    // would encode it happily -- it is Latin-1 -- so this refusal is not the same as the one above.
    expect(() => basicAuthHeader({ key: "ck_1", secret: "cs_\r\nX-Evil: 1" })).toThrow(
      /printable ASCII/,
    );
  });
});
