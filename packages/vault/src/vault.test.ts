import { describe, expect, it } from "vitest";
import { type CryptoLike, kekFromBase64, open, rewrap, seal } from "./vault.js";

const subject = globalThis.crypto as unknown as CryptoLike;

const KEK_A = new Uint8Array(32).fill(7);
const KEK_B = new Uint8Array(32).fill(9);

const SCOPE = {
  workspaceId: "c0000000-0000-0000-0000-000000000001",
  connectionId: "e0000000-0000-0000-0000-000000000001",
};

const TOKEN = "ya29.a0AfB_refresh-token-the-customer-authorised";

async function sealed(scope = SCOPE, kek = KEK_A) {
  return seal(subject, { plaintext: TOKEN, kek, keyVersion: 1, scope });
}

describe("sealing and opening", () => {
  it("round-trips a credential", async () => {
    expect(await open(subject, { sealed: await sealed(), kek: KEK_A, scope: SCOPE })).toBe(TOKEN);
  });

  it("stores nothing that resembles the plaintext", async () => {
    const record = await sealed();
    const asText = new TextDecoder().decode(record.ciphertext);
    expect(asText).not.toContain("ya29");
    expect(asText).not.toContain("refresh-token");
  });

  it("uses a fresh data key and nonce every time", async () => {
    // Reusing a nonce under the same key breaks AES-GCM outright, so this is not a style point.
    const [a, b] = [await sealed(), await sealed()];
    expect(Buffer.from(a.iv)).not.toEqual(Buffer.from(b.iv));
    expect(Buffer.from(a.wrappedDek)).not.toEqual(Buffer.from(b.wrappedDek));
    expect(Buffer.from(a.ciphertext)).not.toEqual(Buffer.from(b.ciphertext));
  });

  it("refuses a key encryption key that is not AES-256", async () => {
    await expect(
      seal(subject, { plaintext: TOKEN, kek: new Uint8Array(16), keyVersion: 1, scope: SCOPE }),
    ).rejects.toThrow(/32 bytes/);
  });
});

describe("what a database compromise is worth", () => {
  // The whole point of holding the key encryption key in Cloudflare: the rows are not enough.

  it("cannot be opened with the wrong key encryption key", async () => {
    await expect(
      open(subject, { sealed: await sealed(), kek: KEK_B, scope: SCOPE }),
    ).rejects.toThrow();
  });

  it("detects a tampered ciphertext rather than returning garbage", async () => {
    const record = await sealed();
    const tampered = new Uint8Array(record.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    await expect(
      open(subject, { sealed: { ...record, ciphertext: tampered }, kek: KEK_A, scope: SCOPE }),
    ).rejects.toThrow();
  });

  it("detects a tampered nonce", async () => {
    const record = await sealed();
    const tampered = new Uint8Array(record.iv);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    await expect(
      open(subject, { sealed: { ...record, iv: tampered }, kek: KEK_A, scope: SCOPE }),
    ).rejects.toThrow();
  });

  it("detects a tampered wrapped data key", async () => {
    const record = await sealed();
    const tampered = new Uint8Array(record.wrappedDek);
    const last = tampered.length - 1;
    tampered[last] = (tampered[last] ?? 0) ^ 0xff;
    await expect(
      open(subject, { sealed: { ...record, wrappedDek: tampered }, kek: KEK_A, scope: SCOPE }),
    ).rejects.toThrow();
  });
});

describe("relocation: the attack row-level security does not cover", () => {
  // RLS stops a tenant READING another tenant's row. It does not stop a ciphertext being MOVED
  // into a row they can already read. Different attack, different answer: the AAD binding.

  it("refuses a credential moved to another workspace", async () => {
    const record = await sealed();
    await expect(
      open(subject, {
        sealed: record,
        kek: KEK_A,
        scope: { ...SCOPE, workspaceId: "c0000000-0000-0000-0000-000000000002" },
      }),
    ).rejects.toThrow();
  });

  it("refuses a credential moved to another connection in the same workspace", async () => {
    const record = await sealed();
    await expect(
      open(subject, {
        sealed: record,
        kek: KEK_A,
        scope: { ...SCOPE, connectionId: "e0000000-0000-0000-0000-000000000009" },
      }),
    ).rejects.toThrow();
  });

  it("refuses a wrapped data key presented as a credential", async () => {
    // The two seals carry different purposes in their AAD, so even within one row the parts are
    // not interchangeable.
    const record = await sealed();
    await expect(
      open(subject, {
        sealed: {
          ...record,
          ciphertext: record.wrappedDek.subarray(12),
          iv: record.wrappedDek.subarray(0, 12),
        },
        kek: KEK_A,
        scope: SCOPE,
      }),
    ).rejects.toThrow();
  });
});

describe("key rotation", () => {
  it("re-wraps without touching the credential ciphertext", async () => {
    // This is the reason for the envelope: rotating the key encryption key across every connection
    // is a small write per row, not a re-encryption of every secret.
    const record = await sealed();
    const rotated = await rewrap(subject, {
      sealed: record,
      oldKek: KEK_A,
      newKek: KEK_B,
      newKeyVersion: 2,
      scope: SCOPE,
    });

    expect(Buffer.from(rotated.ciphertext)).toEqual(Buffer.from(record.ciphertext));
    expect(Buffer.from(rotated.iv)).toEqual(Buffer.from(record.iv));
    expect(Buffer.from(rotated.wrappedDek)).not.toEqual(Buffer.from(record.wrappedDek));
    expect(rotated.keyVersion).toBe(2);
  });

  it("opens under the new key after rotation", async () => {
    const rotated = await rewrap(subject, {
      sealed: await sealed(),
      oldKek: KEK_A,
      newKek: KEK_B,
      newKeyVersion: 2,
      scope: SCOPE,
    });
    expect(await open(subject, { sealed: rotated, kek: KEK_B, scope: SCOPE })).toBe(TOKEN);
  });

  it("stops opening under the retired key", async () => {
    const rotated = await rewrap(subject, {
      sealed: await sealed(),
      oldKek: KEK_A,
      newKek: KEK_B,
      newKeyVersion: 2,
      scope: SCOPE,
    });
    await expect(open(subject, { sealed: rotated, kek: KEK_A, scope: SCOPE })).rejects.toThrow();
  });

  it("refuses to rotate with the wrong current key", async () => {
    await expect(
      rewrap(subject, {
        sealed: await sealed(),
        oldKek: KEK_B,
        newKek: KEK_A,
        newKeyVersion: 2,
        scope: SCOPE,
      }),
    ).rejects.toThrow();
  });
});

describe("kekFromBase64", () => {
  it("decodes a 32-byte key", () => {
    expect(kekFromBase64(Buffer.from(KEK_A).toString("base64"))).toEqual(KEK_A);
  });

  it("refuses anything that is not 32 bytes, rather than padding or truncating", () => {
    expect(() => kekFromBase64(Buffer.from(new Uint8Array(16)).toString("base64"))).toThrow(
      /32 bytes/,
    );
  });
});
