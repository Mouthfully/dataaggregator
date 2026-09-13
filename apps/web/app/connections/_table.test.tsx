import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CONNECTIONS } from "../_content";
import type { ConnectionListRow } from "./_connections";
import { ALL_PROVIDERS, TYPED_PROVIDERS } from "./_providers";
import { ConnectionTable } from "./_table";

/**
 * The list, read the way a customer reads it: rendered to markup, then asserted on as text.
 *
 * The rows are fabricated here, which is the only place in this repository a row may be invented.
 * Two of them are built to be the ones a table gets wrong -- a connection nothing has ever read,
 * and a connection with no time zone, which the ingest path refuses outright.
 */

const base: ConnectionListRow = {
  id: "c-1",
  provider: "woocommerce",
  credential_lane: "key_secret",
  external_account_id: "https://shop.example.com",
  display_name: null,
  status: "active",
  timezone: "Asia/Bangkok",
  last_backfill_at: "2026-09-12T04:00:00+00:00",
  created_at: "2026-09-01T00:00:00+00:00",
};

function render(rows: readonly ConnectionListRow[]): string {
  return renderToStaticMarkup(<ConnectionTable rows={rows} />);
}

describe("the connections list", () => {
  it("says the source, the account, the lane, the status and when it was last read", () => {
    const markup = render([base]);
    expect(markup).toContain(CONNECTIONS.providerNames.woocommerce);
    expect(markup).toContain("https://shop.example.com");
    expect(markup).toContain(CONNECTIONS.laneNames.key_secret);
    expect(markup).toContain(CONNECTIONS.statusNames.active);
    expect(markup).toContain("2026-09-12T04:00:00+00:00");
  });

  /**
   * A CONNECTION NOTHING HAS EVER READ SAYS SO. An empty cell reads as a rendering fault, and the
   * difference between "never" and "we could not render it" is the difference between a customer
   * who checks their key and a customer who waits.
   */
  it("says never rather than leaving the cell blank", () => {
    expect(render([{ ...base, last_backfill_at: null }])).toContain(CONNECTIONS.never);
  });

  it("marks a connection that has no time zone, and explains once why that matters", () => {
    const markup = render([{ ...base, timezone: null }]);
    expect(markup).toContain(CONNECTIONS.timezoneMissing);
    expect(markup).toContain(CONNECTIONS.timezoneNote);
  });

  it("leaves the note off when every connection has one", () => {
    expect(render([base])).not.toContain(CONNECTIONS.timezoneNote);
  });

  /**
   * A STATUS OR A PROVIDER THIS BUILD DOES NOT KNOW RENDERS AS ITSELF. Both columns are Postgres
   * enums that this app cannot import the TypeScript twin of, so a member added to either must show
   * up as the stored value rather than as an empty cell or the wrong word.
   */
  it("prints an unknown enum member verbatim", () => {
    const markup = render([{ ...base, provider: "shopify", status: "paused" }]);
    expect(markup).toContain("shopify");
    expect(markup).toContain("paused");
  });

  it("prefers a display name where the row has one, and still shows the account", () => {
    const markup = render([{ ...base, display_name: "Main store" }]);
    expect(markup).toContain("Main store");
    expect(markup).toContain("https://shop.example.com");
  });
});

describe("every source the screen can show has words for it", () => {
  it("names each provider", () => {
    for (const id of ALL_PROVIDERS) {
      expect(CONNECTIONS.providerNames[id], id).toBeTypeOf("string");
    }
  });

  /**
   * A SOURCE ADDED TO THE TYPED LIST WITHOUT COPY WOULD RENDER A FORM WITH BLANK LABELS -- a field
   * asking for a secret with no word saying which secret. It fails here instead.
   */
  it("labels each field of each typed source, for the lane it actually uses", () => {
    const fields = CONNECTIONS.fields as Record<string, Record<string, string | undefined>>;
    for (const { id, lane } of TYPED_PROVIDERS) {
      const copy = fields[id];
      expect(copy, id).toBeDefined();
      expect(copy?.accountLabel, id).toBeTypeOf("string");
      expect(copy?.credentialHint, id).toBeTypeOf("string");
      if (lane === "key_secret") {
        expect(copy?.keyLabel, id).toBeTypeOf("string");
        expect(copy?.secretLabel, id).toBeTypeOf("string");
      } else {
        expect(copy?.tokenLabel, id).toBeTypeOf("string");
      }
    }
  });
});
