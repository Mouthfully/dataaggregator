import { RESTATEMENT_CLOCKS, envelopeRowSchema, upsertKey } from "@repo/contract";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LEVEL,
  AD_LEVEL,
  ADSET_LEVEL,
  DAILY_CAMPAIGN,
  DELIVERY_ONLY,
  FIXTURE_ACCOUNT,
  MIXED_ACTION_TYPES,
  SPARSE_WINDOWS,
  VALUE_ONLY,
} from "./fixtures.ts";
import {
  type MetaActionWindow,
  type MetaInsightsRow,
  type MetaLevel,
  normalizeMetaInsights,
} from "./normalize.ts";

const TIMEZONE = "Asia/Bangkok";
const FETCHED_AT = "2026-09-08T02:00:00Z";
const FIRST_SEEN_AT = "2026-08-14T06:00:00Z";

const SIX: readonly MetaActionWindow[] = [
  "1d_click",
  "7d_click",
  "28d_click",
  "1d_view",
  "7d_view",
  "28d_view",
];

function normalize(
  rows: readonly MetaInsightsRow[],
  level: MetaLevel = "campaign",
  fetchedAt: string = FETCHED_AT,
  firstSeenAt: string = FIRST_SEEN_AT,
) {
  return normalizeMetaInsights({
    rows,
    level,
    adAccountId: FIXTURE_ACCOUNT,
    timezone: TIMEZONE,
    attributionWindows: SIX,
    fetchedAt,
    firstSeenAt,
  });
}

describe("the contract: every row must satisfy the envelope", () => {
  // Section 13.3's pre-merge requirement. Not "looks about right" -- parsed by the real schema.

  const cases: Array<[string, ReturnType<typeof normalize>]> = [
    ["campaign", normalize(DAILY_CAMPAIGN)],
    ["account", normalize(ACCOUNT_LEVEL, "account")],
    ["adset", normalize(ADSET_LEVEL, "adset")],
    ["ad", normalize(AD_LEVEL, "ad")],
    ["delivery only", normalize(DELIVERY_ONLY)],
    ["sparse windows", normalize(SPARSE_WINDOWS)],
    ["value only", normalize(VALUE_ONLY)],
    ["mixed actions", normalize(MIXED_ACTION_TYPES)],
  ];

  it.each(cases)("emits rows the envelope schema accepts: %s", (_name, rows) => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const result = envelopeRowSchema.safeParse(row);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it("produces the upsert key section 7 specifies", () => {
    const rows = normalize(DAILY_CAMPAIGN);
    const attributed = rows.find((row) => row.dimensions.attribution_window === "7d_click");
    expect(upsertKey(attributed as never)).toBe(
      "meta_ads act_000000000000001 000000000000000101 2026-08-14 7d_click",
    );
    const delivery = rows.find((row) => row.dimensions.attribution_window === null);
    expect(upsertKey(delivery as never)).toBe(
      "meta_ads act_000000000000001 000000000000000101 2026-08-14 none",
    );
  });

  it("gives every row of one insights row a distinct upsert key", () => {
    // `envelope_rows_pkey` is `(workspace, source, account_id, entity_id, date,
    // attribution_window)` with NULLS NOT DISTINCT. Two rows sharing a key do not error -- the
    // second UPDATES the first, so five of the seven windows would silently vanish on write and
    // the survivor would be whichever the batch happened to end on.
    const keys = normalize(DAILY_CAMPAIGN).map((row) => upsertKey(row as never));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(7);
  });

  it("refuses an unlabelled conversion count, as section 2 requires", () => {
    // The guarantee the whole source is built around, asserted against the real schema rather than
    // assumed: take a row that carries conversions and remove its window.
    const attributed = normalize(DAILY_CAMPAIGN).find(
      (row) => row.dimensions.attribution_window === "7d_click",
    );
    const unlabelled = {
      ...(attributed as never as Record<string, unknown>),
      dimensions: { ...attributed?.dimensions, attribution_window: null },
    };
    const result = envelopeRowSchema.safeParse(unlabelled);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("unlabelled conversion count");
  });

  it("accepts the delivery row with no window, because none applies to it", () => {
    // The other half of the same rule: spend is not an attributed figure and is deliberately absent
    // from COMMERCE_METRICS, so a campaign row carrying it needs no window.
    const delivery = normalize(DAILY_CAMPAIGN).find(
      (row) => row.dimensions.attribution_window === null,
    );
    expect(envelopeRowSchema.safeParse(delivery).success).toBe(true);
    expect(delivery?.entity.type).toBe("campaign");
  });
});

describe("the 28-day clock", () => {
  it("uses the window the contract encodes rather than one of its own", () => {
    expect(RESTATEMENT_CLOCKS.meta_ads.windowDays).toBe(28);
    expect(RESTATEMENT_CLOCKS.meta_ads.perAccount).toBe(false);
  });

  it("anchors restates_until on first sight, not on the fetch", () => {
    // The specification's own formula is fetched_at + 28d, which slides forward on every nightly
    // re-pull so no row ever becomes final. @repo/contract anchors on first_seen_at instead; this
    // asserts the connector uses that and does not compute its own.
    const [row] = normalize(DAILY_CAMPAIGN);
    expect(row?.first_seen_at).toBe(FIRST_SEEN_AT);
    expect(row?.restates_until).toBe("2026-09-11T06:00:00.000Z");

    // Same day, first seen five weeks later: the clock starts when the row does.
    const late = normalize(
      DAILY_CAMPAIGN,
      "campaign",
      "2026-09-20T02:00:00Z",
      "2026-09-20T02:00:00Z",
    );
    expect(late[0]?.restates_until).toBe("2026-10-18T02:00:00.000Z");
  });

  it("derives is_provisional from the window rather than asserting it", () => {
    // Both pulls share a restates_until, because first_seen_at is immutable. Only the fetch time
    // differs, and that alone decides whether the row may still change. A hard-coded `true` would
    // pass the schema and lie to the customer for the rest of the row's life.
    const open = normalize(DAILY_CAMPAIGN, "campaign", "2026-09-08T02:00:00Z");
    expect(open[0]?.is_provisional).toBe(true);

    const closed = normalize(DAILY_CAMPAIGN, "campaign", "2026-10-01T02:00:00Z");
    expect(closed[0]?.restates_until).toBe("2026-09-11T06:00:00.000Z");
    expect(closed[0]?.is_provisional).toBe(false);
  });

  it("applies the same clock to every window of one day", () => {
    // A 1d_click row and a 28d_click row describe the same day and close together. If they did
    // not, one window of a day would go final while another stayed open, and a consumer comparing
    // them would see a difference that is an artefact of our arithmetic rather than of Meta's.
    const rows = normalize(DAILY_CAMPAIGN);
    expect(new Set(rows.map((row) => row.restates_until)).size).toBe(1);
    expect(new Set(rows.map((row) => row.is_provisional)).size).toBe(1);
  });
});
