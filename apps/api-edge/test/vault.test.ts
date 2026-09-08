import { describe, expect, it } from "vitest";
import { type CryptoLike, open, seal } from "@repo/vault";

// The vault package has its own suite, which runs under Node. This one runs the same code under
// REAL WORKERD, because that is where it actually executes: the scheduler opens credentials to call
// platform APIs, and Node's WebCrypto and workerd's are different implementations. A crypto module
// that passes only on the runtime it was developed against is not verified.
describe("the credential vault under workerd", () => {
  const subtle = crypto as unknown as CryptoLike;
  const kek = new Uint8Array(32).fill(7);
  const scope = {
    workspaceId: "c0000000-0000-0000-0000-000000000001",
    connectionId: "e0000000-0000-0000-0000-000000000001",
  };
  const token = "ya29.a0AfB_refresh-token-the-customer-authorised";

  it("round-trips a credential in the runtime that will actually open it", async () => {
    const sealed = await seal(subtle, { plaintext: token, kek, keyVersion: 1, scope });
    expect(await open(subtle, { sealed, kek, scope })).toBe(token);
  });

  it("still refuses a credential relocated to another workspace", async () => {
    const sealed = await seal(subtle, { plaintext: token, kek, keyVersion: 1, scope });
    await expect(
      open(subtle, {
        sealed,
        kek,
        scope: { ...scope, workspaceId: "c0000000-0000-0000-0000-000000000002" },
      }),
    ).rejects.toThrow();
  });
});
