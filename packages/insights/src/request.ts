/**
 * THE ONLY PLACE AN OPENROUTER BODY IS CONSTRUCTED.
 *
 * Two privacy fields ride on every call, and the reason they are enforced in code rather than
 * written in a runbook is that ONE OF THEM DEFAULTS THE WRONG WAY UPSTREAM:
 *
 *   data_collection  DEFAULTS TO "allow". A forgotten field does not fail, does not warn, and does
 *                    not look different in any log -- it silently permits providers that store and
 *                    train on the tenant's business data. Safe behaviour here is opt-in, which
 *                    means a convention is not enough: the only thing that makes it true on every
 *                    call is that there is no code path that builds a body without it.
 *   zdr              zero data retention. Asked for on the same object, for the same reason.
 *
 * SO THE BUILDER IS THE ONLY DOOR, AND THE CLIENT CHECKS THE DOOR WAS USED. `buildRequest` always
 * sets both fields and there is no parameter that can unset them; the returned object is frozen so
 * a caller cannot reach in afterwards; and `assertPrivacyFields` runs again inside `client.ts`
 * against whatever body it was handed. A hand-rolled body therefore fails at the fetch rather than
 * reaching a provider. Two checks for one property is not belt and braces here -- the first is a
 * type-level guarantee that can be defeated by a cast, and the second cannot.
 *
 * WHAT THE PRIVACY FIELDS DO NOT BUY, and why the site must not say otherwise. OpenRouter states
 * that its provider-policy data "is not a definitive source of third party data policies, but
 * represents our best knowledge", and `data_collection: "deny"` alone still permits 30-55 day
 * retention at some providers. So what is enforceable is what is enforced here, and the copy says
 * that and not "your data is never used to train AI".
 *
 * THE TENANT IDENTIFIER IS OPAQUE BY TYPE. `user` is what a provider can join against, so it may
 * never be a workspace name, a customer email, a domain or anything else with meaning outside this
 * system. `OpaqueTenantId` is a branded type produced by exactly one function, so passing a
 * workspace name does not typecheck; and because a cast defeats that, the format is re-checked at
 * runtime as well.
 *
 * NO PLUGINS, AND IN PARTICULAR NO WEB SEARCH. A web-search plugin would take fragments of the
 * tenant's own figures to a search engine. The field is not merely omitted -- an explicitly empty
 * list is sent, so the intent is on the wire and a diff that adds one is visible.
 *
 * TEMPERATURE 0 AND A RESPONSE SCHEMA, so the same figures produce the same brief and an answer
 * from six months ago can be reproduced when somebody disputes it.
 */

import { INSIGHT_RESPONSE_SCHEMA, SYSTEM_PROMPT } from "./brief.ts";

export const OPENROUTER_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

declare const opaqueTenantIdBrand: unique symbol;

/** A tenant identifier a provider cannot join against. Produced by `opaqueTenantId` and nowhere else. */
export type OpaqueTenantId = string & { readonly [opaqueTenantIdBrand]: "opaque-tenant-id" };

/** The shape the brand is checked against at runtime, because a cast can produce the type. */
const OPAQUE_RE = /^[0-9a-f]{64}$/;

/**
 * An opaque, stable identifier for one tenant.
 *
 * SHA-256 over a salt and the workspace id. The salt is REQUIRED and has no default: without one
 * this is a hash of a uuid, which anyone holding the uuid can reproduce and use to confirm that a
 * particular workspace made a particular call. That is exactly the join the `user` field exists to
 * prevent, so a missing salt refuses rather than falling back.
 *
 * The workspace id rather than anything the customer chose: an id is already meaningless outside
 * this system, so hashing it costs nothing, while hashing a name would leave a value that a
 * dictionary attack recovers.
 */
export async function opaqueTenantId(workspaceId: string, salt: string): Promise<OpaqueTenantId> {
  if (workspaceId.trim() === "") {
    throw new Error("insights: a tenant identifier needs a workspace id, not an empty string");
  }
  if (salt.trim() === "") {
    throw new Error(
      "insights: an opaque tenant id needs a salt. Without one the value is a hash of a uuid, " +
        "which anyone holding the uuid can reproduce -- the join this field exists to prevent.",
    );
  }
  const bytes = new TextEncoder().encode(`${salt}:${workspaceId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex as OpaqueTenantId;
}

/** The privacy object, verbatim, in one place. Both fields, always. */
export const PRIVACY_FIELDS = {
  data_collection: "deny",
  zdr: true,
} as const;

export interface OpenRouterMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface OpenRouterBody {
  readonly model: string;
  readonly messages: readonly OpenRouterMessage[];
  readonly provider: {
    readonly data_collection: "deny";
    readonly zdr: true;
  };
  readonly user: string;
  readonly temperature: 0;
  readonly response_format: typeof INSIGHT_RESPONSE_SCHEMA;
  /** Explicitly empty. See the module note on why this is sent rather than omitted. */
  readonly plugins: readonly never[];
}

export interface RequestInput {
  /** An OpenRouter model slug. Which model actually served the call is read off the response. */
  readonly model: string;
  /** The rendered figure set, from `brief.ts`. */
  readonly userPrompt: string;
  readonly tenant: OpaqueTenantId;
}

/**
 * Build the request body.
 *
 * There is no options object, no spread of caller-supplied fields and no merge. Every one of those
 * is a way for a forgotten or overridden key to reach the wire, and the whole point of routing
 * every call through here is that there is nothing to forget.
 */
export function buildRequest(input: RequestInput): OpenRouterBody {
  if (input.model.trim() === "") {
    throw new Error("insights: a request needs a model slug");
  }
  if (!OPAQUE_RE.test(input.tenant)) {
    throw new Error(
      "insights: the user field must be an opaque tenant id from opaqueTenantId(). A workspace " +
        "name, an email or a raw id is something a provider can join against.",
    );
  }

  const body: OpenRouterBody = {
    model: input.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: input.userPrompt },
    ],
    provider: PRIVACY_FIELDS,
    user: input.tenant,
    temperature: 0,
    response_format: INSIGHT_RESPONSE_SCHEMA,
    plugins: [],
  };

  // Frozen so a caller cannot delete `provider` after the fact. Shallow freeze is not enough: the
  // field that defaults dangerously lives one level down.
  Object.freeze(body.provider);
  Object.freeze(body.messages);
  return Object.freeze(body);
}

export type PrivacyProblem = "missing_provider" | "data_collection_not_deny" | "zdr_not_true";

/**
 * Re-check the privacy fields on whatever is about to be sent.
 *
 * Called by `client.ts` on every request, against the body it was actually handed rather than the
 * one it hoped for. `buildRequest` guarantees the fields for anything that came through it; this
 * is what guarantees them for anything that did not.
 */
export function assertPrivacyFields(body: unknown): PrivacyProblem | null {
  if (typeof body !== "object" || body === null) return "missing_provider";
  const provider = (body as { provider?: unknown }).provider;
  if (typeof provider !== "object" || provider === null) return "missing_provider";
  const record = provider as Record<string, unknown>;
  if (record.data_collection !== "deny") return "data_collection_not_deny";
  if (record.zdr !== true) return "zdr_not_true";
  return null;
}
