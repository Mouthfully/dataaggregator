/**
 * WHAT MAY BE WRITTEN INTO A PAYLOAD ARCHIVE, AND WHAT MAY NOT.
 *
 * Kickoff non-negotiable: "Contact data, if it ever appears, is hashed at the edge and never stored
 * raw." Specification section 3.2 and platform-terms gate 13 say the same thing about persistence,
 * logs, error messages and LLM prompts.
 *
 * Until now that rule cost nothing, because every source in the dictionary returns AGGREGATE data:
 * a Google Ads row is a campaign and a number, a GA4 row is a property and a number. Decision
 * 11A.14 changed that. The launch connector set is WooCommerce, Shopify and a payment gateway, and
 * those return ORDERS -- buyer name, email, phone, shipping address, and on a charge, cardholder
 * details. `17-payload-store.md` stores platform responses verbatim in R2. Verbatim is now a leak.
 *
 * THE CONSTRAINT THAT SHAPES EVERYTHING HERE:
 *
 *   YOU CANNOT REDACT A STREAM YOU NEVER PARSE.
 *
 * The streaming path exists so the isolate never holds the payload -- that is the whole point of
 * `putPayload`, and of `fetchWithRetry` refusing to read a body. Redaction requires holding the
 * payload and parsing it. The two cannot both be true, so a source whose response can carry contact
 * data CANNOT USE THE STREAMING PATH AT ALL. It buffers, under the existing cap, or it does not
 * store a payload. That is enforced in `payloads.ts`, not documented and hoped for.
 *
 * TWO DECISIONS, both of which could reasonably have gone the other way.
 *
 * 1. AN ALLOW-LIST, NOT A DENY-LIST. A deny-list has to predict what a platform calls a phone
 *    number -- WooCommerce says `billing.phone`, Shopify says `customer.phone` AND
 *    `shipping_address.phone`, Stripe says `billing_details.phone` -- and the first field a
 *    platform adds ships unredacted. An allow-list fails the other way: an unrecognised field is
 *    dropped, so a platform's new field goes MISSING rather than LEAKING. A missing field is a bug
 *    report; a leaked one is a notification to a regulator.
 *
 * 2. THE ARCHIVE DROPS, IT DOES NOT HASH. The kickoff says "hashed at the edge", and that is about
 *    the WRITE path -- the offline-conversion upload of section 3.2, deferred by 11.4 -- where the
 *    platform dictates an unsalted SHA-256 of a normalised value so its own hashing matches ours.
 *    Storing that same hash in a payload archive would build a database of pseudonyms with no
 *    consumer, and a pseudonym is still personal data under PDPA and GDPR: an unsalted SHA-256 of
 *    an email address is reversible by anyone holding a list of email addresses. So identifiers are
 *    REMOVED here. Where a person-level join is needed later -- 11A.5's matched class -- the
 *    identifier is hashed on the ROW path when that path is designed, not preserved in the archive
 *    as a side effect of having once been fetched.
 *
 * WHAT THIS DOES NOT DO, AND IT IS THE SHARPEST LIMIT HERE. It removes FIELDS by key name. It does
 * not inspect VALUES. A source whose personal data sits inside a value under a legitimately kept
 * key is not protected by anything in this file -- Search Console's `keys` array is exactly that
 * shape, free text a person typed, under a key no keep-list could drop without losing the row. That
 * source relies on Google's own anonymity threshold upstream, which is a dependency on someone
 * else's behaviour rather than a property of ours, and it is declared verbatim with that reason
 * written down. A value-level rule is a different piece of work and is not pretended at here.
 *
 * WHAT IS RECORDED, AND WHY IT IS ONLY A COUNT. A redacted object carries the policy name, its
 * version and the NUMBER of keys removed, in R2 custom metadata, so the archive says "something was
 * removed here" rather than being quietly thinner than the platform's response. It does NOT record
 * which keys: a JSON object may be KEYED by an email address, and a list of removed key names would
 * reintroduce exactly what the removal was for.
 */

import { SOURCES, type Source } from "@repo/contract";

/** Bump when a policy's meaning changes, so stored metadata says which rules produced an object. */
export const REDACTION_POLICY_VERSION = 1;

/**
 * A guard against a pathological payload, not against an attacker. Recursion this deep is a
 * malformed or hostile response, and a stack overflow inside a Workflow step reports nothing.
 */
export const MAX_REDACTION_DEPTH = 64;

export type Disposition = "verbatim" | "redact";

export interface RedactionPolicy {
  readonly disposition: Disposition;
  /**
   * For `redact`: the ONLY keys that survive, at any depth. Everything else is removed.
   *
   * Applied by key NAME rather than by path, deliberately. A path list looks more precise and is
   * less safe: `line_items[].meta_data` and `shipping_lines[].meta_data` are the same hazard, and a
   * path list is one platform change away from covering one and not the other.
   */
  readonly keep?: ReadonlySet<string>;
  /** Why this source is verbatim, or what its allow-list is for. Read by a human, not by code. */
  readonly reason: string;
}

/**
 * THE TABLE, AND ITS DEFAULT.
 *
 * Every source in the dictionary is declared. A source that is NOT declared cannot store a payload
 * at all -- `policyFor` throws rather than guessing -- which is what makes this fail closed. The
 * next connector's author has to make a decision here before their payloads go anywhere, and that
 * is the point of the whole module.
 */
export const REDACTION_POLICIES: Readonly<Record<Source, RedactionPolicy>> = {
  google_ads: { disposition: "verbatim", reason: "aggregate campaign reporting; no contact data" },
  meta_ads: { disposition: "verbatim", reason: "aggregate insights; no contact data" },
  ga4: { disposition: "verbatim", reason: "aggregate property reporting; no contact data" },
  search_console: {
    disposition: "verbatim",
    // The one verbatim row with free text a person typed. Google applies its own anonymity
    // threshold and withholds low-volume queries for exactly this reason, so the filtering happens
    // upstream -- which is a dependency on Google's behaviour, not a property of ours. Re-check it
    // if that threshold ever changes.
    reason: "aggregate query reporting; queries are anonymity-thresholded by Google upstream",
  },
  impact: { disposition: "verbatim", reason: "aggregate affiliate reporting" },
  awin: { disposition: "verbatim", reason: "aggregate affiliate reporting" },
  cj: { disposition: "verbatim", reason: "aggregate affiliate reporting" },
  partnerstack: { disposition: "verbatim", reason: "aggregate affiliate reporting" },
  dataforseo_serp: { disposition: "verbatim", reason: "bought public data under a company key" },
  ai_answers: { disposition: "verbatim", reason: "bought public data under a company key" },

  // THE FIRST `redact` SOURCE. Every entry above is `verbatim` because its response is aggregate
  // reporting; a WooCommerce order is a record of one named person buying something, and 11A.12
  // settled that `raw` cannot be stored as returned for any commerce source.
  //
  // WHAT IS DROPPED BY NOT BEING NAMED, which is the whole allow-list argument working: `billing`
  // and `shipping` (each one key, carrying name, company, street, city, postcode, country, email
  // and phone), `customer_note`, `customer_ip_address`, `customer_user_agent`, `customer_id` and
  // `meta_data`.
  //
  // `customer_id` IS DROPPED DELIBERATELY, and it is the one a reviewer will query. It is only a
  // WordPress user id -- but the header above is explicit that a pseudonym is still personal data,
  // and an archive of order-to-customer-id mappings is a re-identification table with no consumer.
  // 11A.5's matched class hashes on the ROW path when that path is designed; it does not inherit an
  // identifier from an archive that once happened to fetch it.
  //
  // `meta_data` IS THE SHARPEST CALL HERE. It is an unbounded bag of arbitrary {key, value} pairs
  // that ANY WordPress plugin may write to, and the payment fee we want -- `_stripe_fee`,
  // `_wcpay_transaction_fee` -- lives in it. Keeping it would mean naming `key` and `value`, which
  // at every depth admits EVERY plugin's meta, including whatever a shipping or CRM plugin decided
  // to stash there. That is a leak with an unknowable shape, which is exactly what an allow-list
  // exists to refuse. So the bag is dropped whole, and the normaliser reads the named fee keys it
  // understands out of the LIVE response before the archive ever sees it. The fee reaches the row
  // as a typed metric; the bag does not reach the archive at all.
  //
  // `reason` on a refund is free text a human typed -- "customer said it arrived broken" -- and is
  // dropped for the same reason `customer_note` is. The refund's `id` and `total` are what the
  // number needs.
  //
  // AND THE LIMIT, restated because this is the first policy where it bites: this removes KEYS, not
  // VALUES. `line_items[].name` is a product name and is kept, because without it the archive
  // cannot say what was sold -- and a merchant who names a product after its buyer has put personal
  // data somewhere no keep-list can reach. The header says a value-level rule is different work.
  woocommerce: {
    disposition: "redact",
    keep: new Set([
      // Identity of the order itself.
      "id",
      "parent_id",
      "number",
      "status",
      "currency",
      "prices_include_tax",
      "created_via",
      "version",
      // The clocks. Only the _gmt variants: WooCommerce returns both, the non-GMT pair is in the
      // merchant's WordPress timezone, and keeping both invites a reader to use the wrong one.
      "date_created_gmt",
      "date_modified_gmt",
      "date_paid_gmt",
      "date_completed_gmt",
      // The money, at order and at line level. `total` is kept once and survives at every depth,
      // which is what makes refunds[].total and line_items[].total come through.
      "total",
      "total_tax",
      "subtotal",
      "subtotal_tax",
      "shipping_total",
      "shipping_tax",
      "discount_total",
      "discount_tax",
      "amount",
      "price",
      "quantity",
      // The line collections. Naming the collection is not enough -- the keys INSIDE each element
      // must be named too, or the array survives as the right number of empty objects.
      "line_items",
      "refunds",
      "fee_lines",
      "tax_lines",
      "shipping_lines",
      "coupon_lines",
      "taxes",
      // Line-level detail. `name` is a product, fee or method label; `code` is a coupon code.
      "name",
      "sku",
      "product_id",
      "variation_id",
      "tax_class",
      "tax_status",
      "rate_id",
      "rate_code",
      "rate_percent",
      "label",
      "compound",
      "method_id",
      "method_title",
      "code",
      "discount",
      // How it was paid. Kept because it is the only way to tell an owner WHICH gateway is opaque
      // about its fee, which is a thing the product has to be able to say out loud.
      "payment_method",
      "payment_method_title",
      "transaction_id",
    ]),
    reason:
      "an order is a record of one named person buying something: billing and shipping carry name, " +
      "address, email and phone, customer_note and the refund reason are free text, and meta_data is " +
      "an unbounded bag any plugin may write to. Ids, money, quantities, dates and product labels " +
      "survive; identity does not.",
  },
  stripe: {
    disposition: "redact",
    keep: new Set([
      "object",
      "data",
      "has_more",
      "url",
      "id",
      "amount",
      "available_on",
      "created",
      "currency",
      "exchange_rate",
      "fee",
      "fee_details",
      "net",
      "reporting_category",
      "source",
      "status",
      "type",
      "application",
    ]),
    reason:
      "Balance Transactions are financial records, but Stripe may expand `source` into a charge " +
      "that carries billing name, email, phone, address and metadata. The allow-list keeps only " +
      "settlement arithmetic, clocks, classifications and object ids; descriptions and customer " +
      "details are dropped.",
  },
};

export class PayloadPolicyError extends Error {
  constructor(
    message: string,
    readonly source: string,
  ) {
    super(message);
    this.name = "PayloadPolicyError";
  }
}

export class PayloadNotRedactableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadNotRedactableError";
  }
}

/** A table of policies. `REDACTION_POLICIES` is the one production uses. */
export type PolicyTable = Readonly<Record<string, RedactionPolicy>>;

/**
 * The declared policy for a source, or a refusal. Never a default.
 *
 * WHY THE TABLE IS A PARAMETER, since a security control with a seam in it deserves an argument
 * rather than a shrug. No source in the dictionary needs redaction yet -- the commerce sources that
 * do are not in `SOURCES` until their connectors ship -- so without this seam the redaction path
 * could not be exercised at all until the first one arrives, and redaction that has never run is
 * not a control. The seam is narrow and visible: production passes nothing, the default is the
 * table above, and any call site supplying its own is a one-word grep. Shipping untested redaction
 * to avoid a testable parameter would be the worse trade.
 */
export function policyFor(
  source: string,
  policies: PolicyTable = REDACTION_POLICIES,
): RedactionPolicy {
  const policy = (policies as Record<string, RedactionPolicy | undefined>)[source];
  if (policy === undefined) {
    throw new PayloadPolicyError(
      `payloads: no redaction policy declared for source "${source}". Declare one in ` +
        "packages/payloads/src/redaction.ts before storing its payloads. A source whose responses " +
        'can carry contact data needs `disposition: "redact"` and a keep-list; one whose ' +
        'responses are aggregate needs `disposition: "verbatim"` and a reason saying so.',
      source,
    );
  }
  if (policy.disposition === "redact" && policy.keep === undefined) {
    throw new PayloadPolicyError(
      `payloads: the policy for "${source}" redacts but declares no keep-list, which would remove ` +
        "every field. That is a policy bug, not a strict setting.",
      source,
    );
  }
  return policy;
}

export interface RedactionResult {
  readonly value: unknown;
  /** How many keys were removed. Counts, never names -- see the header. */
  readonly removed: number;
}

/**
 * Drop every key not on the allow-list, at every depth.
 *
 * Arrays are traversed rather than filtered: an array has no keys of its own, so its elements are
 * redacted individually and the array's length is preserved. A row count that changed under
 * redaction would make the archive disagree with the metrics computed from it.
 */
export function redactValue(value: unknown, keep: ReadonlySet<string>, depth = 0): RedactionResult {
  if (depth > MAX_REDACTION_DEPTH) {
    throw new PayloadNotRedactableError(
      `payloads: payload nests deeper than ${MAX_REDACTION_DEPTH} levels; refusing to redact it ` +
        "rather than risking a stack overflow inside a Workflow step",
    );
  }

  if (Array.isArray(value)) {
    let removed = 0;
    const out = value.map((item) => {
      const result = redactValue(item, keep, depth + 1);
      removed += result.removed;
      return result.value;
    });
    return { value: out, removed };
  }

  // EVERY object is filtered, with no exemption by prototype. An earlier version returned
  // null-prototype and exotic objects untouched on the grounds that only a plain object has keys
  // worth reasoning about; that is a bypass, not a nicety -- `Object.create(null)` with a `phone`
  // on it would have sailed through. `JSON.parse` produces only plain objects and arrays anyway, so
  // the exemption bought nothing and could only ever have cost.
  if (value === null || typeof value !== "object") {
    return { value, removed: 0 };
  }

  let removed = 0;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!keep.has(key)) {
      removed += 1;
      continue;
    }
    const result = redactValue(item, keep, depth + 1);
    removed += result.removed;
    out[key] = result.value;
  }
  return { value: out, removed };
}

/**
 * Redact a JSON payload held as bytes, and return the bytes to store.
 *
 * Parsing is the point of failure that matters: a body that is not JSON cannot be redacted, and
 * storing it unexamined is the thing this module exists to prevent. So it throws.
 */
export function redactJsonBytes(
  bytes: Uint8Array,
  policy: RedactionPolicy,
): { bytes: Uint8Array; removed: number } {
  if (policy.keep === undefined) {
    throw new PayloadNotRedactableError("payloads: redaction requires a keep-list");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new PayloadNotRedactableError(
      "payloads: this source's payloads must be redacted, and the body is not JSON, so it cannot " +
        `be: ${error instanceof Error ? error.message : String(error)}. Storing it unexamined is ` +
        "the leak this policy exists to prevent.",
    );
  }
  const { value, removed } = redactValue(parsed, policy.keep);
  return { bytes: new TextEncoder().encode(JSON.stringify(value)), removed };
}

/** Every declared source, for a test that asserts the table covers the dictionary. */
export const DECLARED_SOURCES: readonly Source[] = SOURCES;
