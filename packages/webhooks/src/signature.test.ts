import { describe, expect, it } from "vitest";
import {
  SIGNATURE_TOLERANCE_SECONDS,
  deriveSecret,
  signPayload,
  verifySignature,
} from "./signature.js";

const KEY = "service-key-for-tests-only";
const ENDPOINT = "9f1c2d3e-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-08T12:00:00Z");
const BODY = '{"type":"restated","id":"e1"}';

describe("deriving an endpoint's secret", () => {
  it("is deterministic, or nothing a receiver stored would keep verifying", async () => {
    expect(await deriveSecret(KEY, ENDPOINT, 1)).toBe(await deriveSecret(KEY, ENDPOINT, 1));
  });

  it("differs per endpoint, so one customer's secret does not verify another's delivery", async () => {
    const other = "9f1c2d3e-0000-4000-8000-000000000002";
    expect(await deriveSecret(KEY, ENDPOINT, 1)).not.toBe(await deriveSecret(KEY, other, 1));
  });

  it("differs per version, which is what makes a version bump a rotation", async () => {
    expect(await deriveSecret(KEY, ENDPOINT, 1)).not.toBe(await deriveSecret(KEY, ENDPOINT, 2));
  });

  it("refuses an empty service key rather than signing with nothing", async () => {
    await expect(deriveSecret("", ENDPOINT, 1)).rejects.toThrow(/empty service key/);
  });

  it("refuses a version that is not a positive integer", async () => {
    await expect(deriveSecret(KEY, ENDPOINT, 0)).rejects.toThrow(/positive integer/);
    await expect(deriveSecret(KEY, ENDPOINT, 1.5)).rejects.toThrow(/positive integer/);
  });
});

describe("signing and verifying a delivery", () => {
  it("round-trips", async () => {
    const secret = await deriveSecret(KEY, ENDPOINT, 1);
    const header = await signPayload({ secret, body: BODY, timestamp: NOW });
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(await verifySignature({ secret, body: BODY, header, now: NOW })).toBe(true);
  });

  it("rejects a tampered body, which is the whole point", async () => {
    const secret = await deriveSecret(KEY, ENDPOINT, 1);
    const header = await signPayload({ secret, body: BODY, timestamp: NOW });
    const tampered = BODY.replace("restated", "deleted");
    expect(await verifySignature({ secret, body: tampered, header, now: NOW })).toBe(false);
  });

  it("rejects a signature made with the previous secret after a rotation", async () => {
    const old = await deriveSecret(KEY, ENDPOINT, 1);
    const header = await signPayload({ secret: old, body: BODY, timestamp: NOW });
    const rotated = await deriveSecret(KEY, ENDPOINT, 2);
    expect(await verifySignature({ secret: rotated, body: BODY, header, now: NOW })).toBe(false);
  });

  it("rejects a replay outside the tolerance window", async () => {
    // Signing the body alone would produce a token valid forever. The timestamp is inside the
    // signature so a captured delivery stops verifying, and this is the assertion that says so.
    const secret = await deriveSecret(KEY, ENDPOINT, 1);
    const header = await signPayload({ secret, body: BODY, timestamp: NOW });
    const later = new Date(NOW.getTime() + (SIGNATURE_TOLERANCE_SECONDS + 1) * 1000);
    expect(await verifySignature({ secret, body: BODY, header, now: later })).toBe(false);
  });

  it("rejects a timestamp from the future by the same margin", async () => {
    const secret = await deriveSecret(KEY, ENDPOINT, 1);
    const ahead = new Date(NOW.getTime() + (SIGNATURE_TOLERANCE_SECONDS + 1) * 1000);
    const header = await signPayload({ secret, body: BODY, timestamp: ahead });
    expect(await verifySignature({ secret, body: BODY, header, now: NOW })).toBe(false);
  });

  it("accepts a delivery at the edge of the window", async () => {
    const secret = await deriveSecret(KEY, ENDPOINT, 1);
    const header = await signPayload({ secret, body: BODY, timestamp: NOW });
    const edge = new Date(NOW.getTime() + SIGNATURE_TOLERANCE_SECONDS * 1000);
    expect(await verifySignature({ secret, body: BODY, header, now: edge })).toBe(true);
  });

  it("rejects a header that is missing a part, rather than reading around it", async () => {
    const secret = await deriveSecret(KEY, ENDPOINT, 1);
    const header = await signPayload({ secret, body: BODY, timestamp: NOW });
    const [t, v1] = header.split(",");
    expect(await verifySignature({ secret, body: BODY, header: t as string, now: NOW })).toBe(
      false,
    );
    expect(await verifySignature({ secret, body: BODY, header: v1 as string, now: NOW })).toBe(
      false,
    );
    expect(await verifySignature({ secret, body: BODY, header: "", now: NOW })).toBe(false);
    expect(await verifySignature({ secret, body: BODY, header: "t=abc,v1=zz", now: NOW })).toBe(
      false,
    );
  });
});
