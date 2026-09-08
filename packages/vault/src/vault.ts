/**
 * The credential vault: envelope encryption for the customer's own platform grants.
 *
 * Decided in docs/marketplane/03-supabase-schema-and-rls.md (gap 3). Supabase Vault is simpler and
 * puts the key material next to the ciphertext, so one database compromise yields both. What this
 * product sells is custody of other people's platform credentials, so the database has to be worth
 * nothing on its own.
 *
 * The scheme:
 *
 *   1. A fresh 256-bit data encryption key (DEK) per connection, per rotation.
 *   2. The credential sealed under that DEK with AES-256-GCM.
 *   3. The DEK itself sealed under a key encryption key (KEK) held in Cloudflare, and only the
 *      wrapped form stored.
 *
 * Postgres never sees a plaintext credential, a plaintext DEK, or the KEK. Decryption happens in
 * the Worker, which is also the only place that needs it: the scheduler calls platform APIs,
 * Postgres never does.
 *
 * TWO PROPERTIES WORTH BEING EXPLICIT ABOUT.
 *
 * AAD BINDING. Both seals are bound to the workspace and connection they belong to, as additional
 * authenticated data. Without it, anyone who can write to the database could move a ciphertext from
 * one row to another -- a different workspace's row included -- and the Worker would decrypt it
 * happily, because the bytes are valid. The row-level security in 20260908000700_rls.sql stops a
 * tenant reaching another tenant's row; this stops a ciphertext being *relocated* into a row they
 * can reach. They are different attacks and need different answers.
 *
 * NO AMBIENT GLOBALS. `crypto` is passed in rather than read from the global scope, for the same
 * reason `siteUrl(env)` takes its environment: this package is compiled into both the Next app and
 * workerd, the two runtimes type their WebCrypto differently, and a package that reaches for a
 * global typechecks under whichever config it was written against and fails on the other.
 */

/**
 * The slice of WebCrypto this module uses, declared structurally.
 *
 * Node and workerd both provide it; their type declarations disagree, and this package must
 * typecheck under both with `types: []`. Naming exactly what is used is more honest than widening
 * the tsconfig until a global appears.
 */
export interface CryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: {
    importKey(
      format: "raw",
      keyData: ArrayBuffer | ArrayBufferView,
      algorithm: { name: string },
      extractable: boolean,
      keyUsages: readonly string[],
    ): Promise<CryptoKeyLike>;
    exportKey(format: "raw", key: CryptoKeyLike): Promise<ArrayBuffer>;
    generateKey(
      algorithm: { name: string; length: number },
      extractable: boolean,
      keyUsages: readonly string[],
    ): Promise<CryptoKeyLike>;
    encrypt(
      algorithm: { name: string; iv: ArrayBufferView; additionalData?: ArrayBufferView },
      key: CryptoKeyLike,
      data: ArrayBufferView,
    ): Promise<ArrayBuffer>;
    decrypt(
      algorithm: { name: string; iv: ArrayBufferView; additionalData?: ArrayBufferView },
      key: CryptoKeyLike,
      data: ArrayBufferView,
    ): Promise<ArrayBuffer>;
  };
}

/** Opaque handle; the shape differs between runtimes and none of it is used here. */
export type CryptoKeyLike = object;

/** AES-GCM's standard nonce length. 12 bytes, not 16: longer nonces are re-hashed and slower. */
const IV_BYTES = 12;

/** What the `connections` row holds. Exactly the columns in 20260908000500_connections.sql. */
export interface SealedCredential {
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
  /** The wrapped DEK, as `iv || ciphertext`. See wrapDek for why they travel together. */
  readonly wrappedDek: Uint8Array;
  readonly keyVersion: number;
}

/** Binds a sealed credential to the row it belongs to. Any change makes decryption fail. */
export interface CredentialScope {
  readonly workspaceId: string;
  readonly connectionId: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The domain separation string is deliberately NOT the product name.
 *
 * This value is baked into the authentication tag of every credential ever sealed. Changing it makes
 * every stored credential unopenable, so it has to outlive anything that might be renamed -- and the
 * product name is explicitly unsettled (docs/marketplane/01-brand-identity.md). A name in here would
 * be a latent data migration disguised as a string literal. `vault` is what this is, permanently.
 *
 * Purpose is included so a wrapped data key can never be presented as a credential, or the reverse,
 * even within one row.
 */
function aad(scope: CredentialScope, purpose: "credential" | "dek"): Uint8Array {
  return encoder.encode(`vault:v1:${purpose}:${scope.workspaceId}:${scope.connectionId}`);
}

async function importKek(crypto: CryptoLike, kek: Uint8Array): Promise<CryptoKeyLike> {
  if (kek.length !== 32) {
    throw new RangeError(
      `vault: the key encryption key must be 32 bytes (AES-256), received ${kek.length}`,
    );
  }
  return crypto.subtle.importKey("raw", kek, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Wrap a data key under the key encryption key.
 *
 * The nonce is prefixed to the ciphertext rather than stored separately, because the `connections`
 * table has one `wrapped_dek` column and a nonce that can be lost is a key that can be lost.
 */
async function wrapDek(
  crypto: CryptoLike,
  kekKey: CryptoKeyLike,
  dek: CryptoKeyLike,
  scope: CredentialScope,
): Promise<Uint8Array> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(scope, "dek") },
      kekKey,
      raw,
    ),
  );
  const out = new Uint8Array(iv.length + wrapped.length);
  out.set(iv, 0);
  out.set(wrapped, iv.length);
  return out;
}

async function unwrapDek(
  crypto: CryptoLike,
  kekKey: CryptoKeyLike,
  wrappedDek: Uint8Array,
  scope: CredentialScope,
): Promise<CryptoKeyLike> {
  if (wrappedDek.length <= IV_BYTES) {
    throw new RangeError("vault: wrapped data key is too short to contain a nonce");
  }
  const iv = wrappedDek.subarray(0, IV_BYTES);
  const body = wrappedDek.subarray(IV_BYTES);
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad(scope, "dek") },
    kekKey,
    body,
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

/**
 * Seal a credential for storage.
 *
 * `plaintext` is the platform grant as the customer authorised it -- an OAuth refresh token, an API
 * key, whatever the provider issued. It never leaves this process unsealed.
 */
export async function seal(
  crypto: CryptoLike,
  options: {
    plaintext: string;
    kek: Uint8Array;
    keyVersion: number;
    scope: CredentialScope;
  },
): Promise<SealedCredential> {
  const kekKey = await importKek(crypto, options.kek);
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(options.scope, "credential") },
      dek,
      encoder.encode(options.plaintext),
    ),
  );

  return {
    ciphertext,
    iv,
    wrappedDek: await wrapDek(crypto, kekKey, dek, options.scope),
    keyVersion: options.keyVersion,
  };
}

/**
 * Open a sealed credential.
 *
 * Throws if the key is wrong, if any byte has been tampered with, or if the record has been moved to
 * a different workspace or connection. AES-GCM authenticates rather than merely decrypting, so all
 * three surface as a failure rather than as plausible-looking garbage.
 */
export async function open(
  crypto: CryptoLike,
  options: {
    sealed: SealedCredential;
    kek: Uint8Array;
    scope: CredentialScope;
  },
): Promise<string> {
  const kekKey = await importKek(crypto, options.kek);
  const dek = await unwrapDek(crypto, kekKey, options.sealed.wrappedDek, options.scope);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: options.sealed.iv,
      additionalData: aad(options.scope, "credential"),
    },
    dek,
    options.sealed.ciphertext,
  );
  return decoder.decode(plaintext);
}

/**
 * Rotate the key encryption key.
 *
 * Only the wrapped data key changes: the credential ciphertext is untouched, so rotating the KEK
 * across every connection is a small write per row rather than a re-encryption of every secret.
 * That is the reason for the envelope, and the reason `key_version` is a column.
 */
export async function rewrap(
  crypto: CryptoLike,
  options: {
    sealed: SealedCredential;
    oldKek: Uint8Array;
    newKek: Uint8Array;
    newKeyVersion: number;
    scope: CredentialScope;
  },
): Promise<SealedCredential> {
  const oldKekKey = await importKek(crypto, options.oldKek);
  const newKekKey = await importKek(crypto, options.newKek);
  const dek = await unwrapDek(crypto, oldKekKey, options.sealed.wrappedDek, options.scope);

  return {
    ciphertext: options.sealed.ciphertext,
    iv: options.sealed.iv,
    wrappedDek: await wrapDek(crypto, newKekKey, dek, options.scope),
    keyVersion: options.newKeyVersion,
  };
}

/** Decode a base64 KEK, as it arrives from a Worker secret or an environment variable. */
export function kekFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (bytes.length !== 32) {
    throw new RangeError(
      `vault: the key encryption key must decode to 32 bytes (AES-256), got ${bytes.length}`,
    );
  }
  return bytes;
}
