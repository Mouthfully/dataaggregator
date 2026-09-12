import type { FetchOptions } from "@repo/extract";
import { describe, expect, it } from "vitest";
import { WooClientError, probeStore, probeUrl } from "./client.js";

const STORE = "https://shop.example.com";
const CRED = { key: "ck_a1b2c3", secret: "cs_9z8y7x" };

const RETRY: FetchOptions = {
  random: () => 0,
  now: () => new Date("2026-09-10T00:00:00.000Z"),
  sleep: async () => {},
};

function store(handler: (url: URL) => Response | Promise<Response>) {
  const calls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return handler(url);
  };
  return { calls, options: { fetchImpl, storeUrl: STORE, credential: CRED, ...RETRY } };
}

/** WordPress's error shape. The `code` field is the whole diagnosis; the text is translatable. */
function wpError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ code, message, data: { status } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function refusal(run: () => Promise<unknown>): Promise<WooClientError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof WooClientError) return error;
    throw error;
  }
  throw new Error("expected a WooClientError, got none");
}

describe("what the probe asks for", () => {
  it("asks for exactly one order", () => {
    // per_page=1 is doing two jobs: it makes the check cheap on the merchant's database, and it
    // bounds the personal data this request pulls to a single buyer rather than a hundred.
    const url = new URL(probeUrl(STORE));
    expect(url.pathname).toBe("/wp-json/wc/v3/orders");
    expect(url.searchParams.get("per_page")).toBe("1");
    expect(url.searchParams.get("status")).toBe("any");
  });

  it("keeps the secret out of the URL, as every other request does", () => {
    expect(probeUrl(STORE)).not.toContain(CRED.secret);
    expect(probeUrl(STORE)).not.toContain("consumer_secret");
  });

  it("reports how many orders the key can see, and nothing about the order it read", async () => {
    const s = store(
      () =>
        new Response(JSON.stringify([{ id: 4821, billing: { email: "somchai@example.co.th" } }]), {
          headers: {
            "content-type": "application/json",
            "x-wp-total": "4812",
            "x-wp-totalpages": "4812",
          },
        }),
    );

    const probe = await probeStore(s.options);

    expect(probe).toEqual({ storeUrl: STORE, totalOrders: 4812 });
    // Gate 13. The one order fetched carries a real buyer's name, email, phone and address; the
    // result is a count. A connect screen cannot leak what it was never handed.
    expect(JSON.stringify(probe)).not.toContain("somchai");
    expect(s.calls).toHaveLength(1);
  });
});

describe("permalinks are off, which is NOT a bad key", () => {
  it("maps rest_no_route to permalinks, not to the credential", async () => {
    // THE ONE THAT MATTERS. A merchant told their key is wrong regenerates a key that was fine,
    // pastes it, fails identically, and now believes the product is broken.
    const s = store(() => wpError("rest_no_route", "No route was found matching the URL", 404));

    const error = await refusal(() => probeStore(s.options));

    expect(error.code).toBe("permalinks_disabled");
    expect(error.code).not.toBe("invalid_credential");
    expect(error.message).toMatch(/Settings -> Permalinks/);
    expect(error.message).toMatch(/WooCommerce being deactivated/);
    // And it says so outright, because the merchant's first instinct will be the key.
    expect(error.message).toMatch(/Regenerating the API key changes nothing/);
  });

  it("costs one request, because a 404 is not worth retrying", async () => {
    const s = store(() => wpError("rest_no_route", "No route was found matching the URL", 404));

    await refusal(() => probeStore(s.options));

    expect(s.calls).toHaveLength(1);
  });
});

describe("the credential, the permission level and the user behind it", () => {
  it("reports a rejected key as invalid_credential, naming the permission level too", async () => {
    // WooCommerce returns ONE code for "consumer key is invalid" and for "this key has Write
    // permission and you asked to read". Only the human text differs, and it goes through __() --
    // a Thai-language store returns it in Thai. So both are named, and neither is guessed.
    const s = store(() =>
      wpError("woocommerce_rest_authentication_error", "Consumer key is invalid.", 401),
    );

    const error = await refusal(() => probeStore(s.options));

    expect(error.code).toBe("invalid_credential");
    expect(error.message).toMatch(/Write-only/);
    expect(error.message).toMatch(/Settings -> Advanced -> REST API/);
  });

  it("separates a key that cannot SEE orders from a key that is wrong", async () => {
    const s = store(() =>
      wpError("woocommerce_rest_cannot_view", "Sorry, you cannot list resources.", 401),
    );

    const error = await refusal(() => probeStore(s.options));

    expect(error.code).toBe("insufficient_permission");
    // Two causes, one response. The WordPress user may lack the capability, or the host may have
    // stripped the Authorization header -- `34` §1.2's case, whose query-string workaround is
    // deliberately unimplemented. Naming one would be a guess dressed as a diagnosis.
    expect(error.message).toMatch(/Administrator or Shop manager/);
    expect(error.message).toMatch(/stripping the Authorization header/);
  });

  it("validates the store URL itself, rather than taking the caller's word for it", async () => {
    // "Validates store URL" has to mean this or it means nearly nothing: a merchant pastes the
    // address bar, which is somewhere inside wp-admin, and a probe that concatenated it would 404
    // and report permalinks -- the exact wrong answer this whole mapping exists to avoid.
    const s = store(
      () =>
        new Response(JSON.stringify([{ id: 1 }]), {
          headers: { "content-type": "application/json", "x-wp-total": "1" },
        }),
    );

    const probe = await probeStore({
      ...s.options,
      storeUrl: "https://shop.example.com/wp-admin/admin.php?page=wc-settings",
    });

    expect(probe.storeUrl).toBe(STORE);
    expect(s.calls[0]?.pathname).toBe("/wp-json/wc/v3/orders");
  });

  it("refuses a plain-HTTP store at connect time, before a request exists", async () => {
    const s = store(() => new Response("[]"));

    const error = await refusal(() =>
      probeStore({ ...s.options, storeUrl: "http://shop.example.com" }),
    );

    expect(error.code).toBe("insecure_store_url");
    expect(s.calls).toHaveLength(0);
  });

  it("refuses an unencodable credential before touching the store at all", async () => {
    const s = store(() => new Response("[]"));

    const error = await refusal(() =>
      probeStore({ ...s.options, credential: { key: "ck_ครัว", secret: "cs_1" } }),
    );

    expect(error.code).toBe("invalid_credential");
    expect(s.calls).toHaveLength(0);
  });

  it("never puts the key or the secret in a message", async () => {
    // Gate 4, and an error message is the likeliest place in this file to fail it.
    const s = store(() =>
      wpError("woocommerce_rest_authentication_error", `Consumer key ${CRED.key} is invalid.`, 401),
    );

    const error = await refusal(() => probeStore(s.options));

    expect(error.message).not.toContain(CRED.key);
    expect(error.message).not.toContain(CRED.secret);
  });
});

describe("something that is not the WooCommerce REST API", () => {
  it("names the WAF, the CDN and the themed 404 when there is no WordPress error code", async () => {
    const s = store(() => new Response("<html><body>Access denied</body></html>", { status: 403 }));

    const error = await refusal(() => probeStore(s.options));

    expect(error.code).toBe("not_a_wp_rest_endpoint");
    expect(error.message).toMatch(/security plugin or WAF/);
  });

  it("refuses a 200 that is not a JSON array", async () => {
    // A caching or maintenance plugin serving a page with a 200 is indistinguishable from success
    // by status alone, and would otherwise connect a store that can never be read.
    const s = store(
      () => new Response("<!doctype html><title>Maintenance</title>", { status: 200 }),
    );

    const error = await refusal(() => probeStore(s.options));

    expect(error.code).toBe("not_a_wp_rest_endpoint");
  });
});

describe("a store that is simply not answering", () => {
  it("reports 5xx as unreachable, and says the credential was never tested", async () => {
    const s = store(() => new Response("bad gateway", { status: 502 }));

    const error = await refusal(() => probeStore(s.options));

    expect(error.code).toBe("store_unreachable");
    expect(error.message).toMatch(/credential was never tested/);
    // Retried, because a 502 is the one failure class here that retrying can fix.
    expect(s.calls).toHaveLength(3);
  });

  it("reports a network failure as unreachable rather than as a bad key", async () => {
    const s = store(() => {
      throw new TypeError("getaddrinfo ENOTFOUND shop.example.com");
    });

    const error = await refusal(() => probeStore(s.options));

    expect(error.code).toBe("store_unreachable");
    expect(error.message).toMatch(/DNS is down/);
  });

  it("reports a host-level rate limit as its own sentence", async () => {
    const s = store(() => new Response("slow down", { status: 429 }));

    const error = await refusal(() => probeStore(s.options));

    expect(error.code).toBe("store_unreachable");
    expect(error.message).toMatch(/rate-limited/);
  });
});
