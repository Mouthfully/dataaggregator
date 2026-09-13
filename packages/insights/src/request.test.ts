import { describe, expect, it } from "vitest";

import { INSIGHT_RESPONSE_SCHEMA, SYSTEM_PROMPT } from "./brief.ts";
import {
  type OpaqueTenantId,
  assertPrivacyFields,
  buildRequest,
  opaqueTenantId,
} from "./request.ts";

const TENANT = "a".repeat(64) as OpaqueTenantId;

function body() {
  return buildRequest({ model: "some/model", userPrompt: "figures", tenant: TENANT });
}

/* ==============================================================================================
 * THE PRIVACY FIELDS.
 *
 * THIS BLOCK IS MUTATION-PROVEN. Deleting `data_collection: "deny"` from PRIVACY_FIELDS in
 * request.ts turns the first test red; deleting `zdr: true` turns the second red; deleting the
 * whole `provider` key from the body turns both red plus the client's refusal test. Each was
 * checked by making the deletion, watching the failure, and putting it back. A privacy control
 * whose test passes either way is decoration, and the only way to know which kind you have is to
 * break it on purpose once.
 *
 * `data_collection` is the one that matters most, because IT DEFAULTS TO "allow" UPSTREAM. A
 * forgotten field does not error and does not warn -- it silently permits providers to store and
 * train on the tenant's business data.
 * ============================================================================================== */

describe("every call carries both privacy fields", () => {
  it("denies data collection", () => {
    expect(body().provider.data_collection).toBe("deny");
  });

  it("asks for zero data retention", () => {
    expect(body().provider.zdr).toBe(true);
  });

  it("carries them on a body built for any model and any prompt", () => {
    for (const model of ["a/b", "c/d:free", "openrouter/auto"]) {
      const built = buildRequest({ model, userPrompt: "", tenant: TENANT });
      expect(built.provider).toEqual({ data_collection: "deny", zdr: true });
    }
  });

  it("cannot be removed after the fact", () => {
    const built = body();
    // Frozen one level down as well: the field that defaults dangerously is not at the top level.
    expect(() => {
      (built.provider as { data_collection?: string }).data_collection = "allow";
    }).toThrow();
    expect(built.provider.data_collection).toBe("deny");
  });

  it("is re-checked by assertPrivacyFields, which is what the client calls", () => {
    expect(assertPrivacyFields(body())).toBeNull();
    expect(assertPrivacyFields({})).toBe("missing_provider");
    expect(assertPrivacyFields({ provider: null })).toBe("missing_provider");
    expect(assertPrivacyFields({ provider: { zdr: true } })).toBe("data_collection_not_deny");
    // The exact failure a forgotten field produces upstream, caught here rather than there.
    expect(assertPrivacyFields({ provider: { data_collection: "allow", zdr: true } })).toBe(
      "data_collection_not_deny",
    );
    expect(assertPrivacyFields({ provider: { data_collection: "deny" } })).toBe("zdr_not_true");
    expect(assertPrivacyFields({ provider: { data_collection: "deny", zdr: false } })).toBe(
      "zdr_not_true",
    );
  });
});

describe("the rest of what every call carries", () => {
  it("sends no plugins, explicitly rather than by omission", () => {
    // In particular no web-search plugin, which would take the tenant's own figures to a search
    // engine. An empty list puts the intent on the wire, where a diff that adds one is visible.
    expect(body().plugins).toEqual([]);
    expect("plugins" in body()).toBe(true);
  });

  it("pins temperature to zero so a brief is reproducible", () => {
    expect(body().temperature).toBe(0);
  });

  it("asks for a JSON schema rather than prose", () => {
    expect(body().response_format).toBe(INSIGHT_RESPONSE_SCHEMA);
    expect(INSIGHT_RESPONSE_SCHEMA.json_schema.schema.additionalProperties).toBe(false);
  });

  it("sends the fixed system prompt and the caller's figures, in that order", () => {
    const built = buildRequest({ model: "a/b", userPrompt: "THE FIGURES", tenant: TENANT });
    expect(built.messages).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "THE FIGURES" },
    ]);
  });
});

describe("the tenant identifier a provider could join against", () => {
  it("is the opaque id, and nothing else is accepted", () => {
    expect(body().user).toBe(TENANT);
  });

  it("refuses anything that is not opaque, even when the type is cast away", () => {
    for (const bad of [
      "Northstar Studio",
      "owner@example.com",
      "workspace-1",
      "",
      "A".repeat(64),
    ]) {
      expect(() =>
        buildRequest({ model: "a/b", userPrompt: "", tenant: bad as OpaqueTenantId }),
      ).toThrow(/opaque tenant id/);
    }
  });

  it("refuses a request with no model", () => {
    expect(() => buildRequest({ model: "  ", userPrompt: "", tenant: TENANT })).toThrow(
      /model slug/,
    );
  });
});

describe("opaqueTenantId", () => {
  it("is stable for one workspace and salt", async () => {
    const a = await opaqueTenantId("ws-1", "pepper");
    const b = await opaqueTenantId("ws-1", "pepper");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs between workspaces and between salts", async () => {
    const a = await opaqueTenantId("ws-1", "pepper");
    expect(a).not.toBe(await opaqueTenantId("ws-2", "pepper"));
    expect(a).not.toBe(await opaqueTenantId("ws-1", "other"));
  });

  it("reveals nothing about its input", async () => {
    const id = await opaqueTenantId("northstar-studio", "pepper");
    expect(id).not.toContain("northstar");
  });

  it("refuses to run without a salt, rather than hashing a bare uuid", async () => {
    // A hash of a uuid is reproducible by anyone holding the uuid, which is precisely the join
    // the `user` field exists to prevent. Refusing is the whole point of the argument existing.
    await expect(opaqueTenantId("ws-1", "")).rejects.toThrow(/salt/);
    await expect(opaqueTenantId("", "pepper")).rejects.toThrow(/workspace id/);
  });
});
