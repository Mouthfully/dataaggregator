/**
 * THE LOOP, ONCE: rows in, a verified brief or a refusal out.
 *
 * Five steps, and four of them can refuse. That is the design rather than a shortcoming -- there is
 * no step here that repairs, defaults or retries its way past a problem, so every way this can go
 * wrong has to come back as an answer a caller can act on.
 *
 *   figures   the arithmetic. Refuses on no rows, mixed currencies, an impossible period, or
 *             nothing readable to say anything about.
 *   brief     the prompt. Deterministic; cannot refuse.
 *   request   the body. Throws on a model slug or a tenant id that must not be sent.
 *   client    the call. Typed refusals, one retry, never on a 4xx.
 *   verify    the gate. Refuses the whole insight over one number it cannot trace.
 *
 * IT GENERATES ONCE. There is no loop that regenerates after a refusal, and that is the most
 * important line in this file: a retry after a fabrication is a loop selecting for outputs that
 * slip past the gate rather than for outputs that are true. A refused brief is a brief nobody
 * sends and an operator is told about.
 *
 * WHAT COMES BACK CARRIES ITS PROVENANCE. The figure set is returned alongside the text, so the
 * numbers a customer reads are rendered from the arithmetic rather than re-read out of the model's
 * sentences, and so a dispute six months later can be settled against the same set.
 */

import { renderUserPrompt } from "./brief.ts";
import type { ModelInsight } from "./brief.ts";
import { type ClientOptions, InsightClientError, postInsight } from "./client.ts";
import type { InsightClientErrorCode } from "./client.ts";
import {
  type FigureInput,
  type FigureRefusalCode,
  type FigureSet,
  buildFigureSet,
} from "./figures.ts";
import { type OpaqueTenantId, buildRequest } from "./request.ts";
import { type RefusalCode, verifyInsight } from "./verify.ts";

export interface GenerateInput extends FigureInput {
  readonly model: string;
  readonly tenant: OpaqueTenantId;
  readonly client: ClientOptions;
}

/** Which model and which provider actually answered, kept so a brief can be attributed later. */
export interface InsightProvenance {
  readonly requestedModel: string;
  readonly servedByModel: string | null;
  readonly servedByProvider: string | null;
  readonly generationId: string | null;
}

export type GenerateResult =
  | {
      readonly ok: true;
      readonly insight: ModelInsight;
      readonly set: FigureSet;
      readonly provenance: InsightProvenance;
    }
  | {
      readonly ok: false;
      readonly stage: "figures";
      readonly code: FigureRefusalCode;
      readonly detail: string;
    }
  | {
      readonly ok: false;
      readonly stage: "client";
      readonly code: InsightClientErrorCode;
      readonly detail: string;
    }
  | {
      readonly ok: false;
      readonly stage: "verify";
      readonly code: RefusalCode;
      readonly detail: string;
      readonly offending?: string;
    };

export async function generateInsight(input: GenerateInput): Promise<GenerateResult> {
  const figures = buildFigureSet(input);
  if (!figures.ok) {
    return { ok: false, stage: "figures", code: figures.code, detail: figures.detail };
  }

  const body = buildRequest({
    model: input.model,
    userPrompt: renderUserPrompt(figures.set),
    tenant: input.tenant,
  });

  let completion: Awaited<ReturnType<typeof postInsight>>;
  try {
    completion = await postInsight(body, input.client);
  } catch (error) {
    if (error instanceof InsightClientError) {
      return { ok: false, stage: "client", code: error.code, detail: error.message };
    }
    throw error;
  }

  const verdict = verifyInsight(completion.content, figures.set);
  if (!verdict.ok) {
    return {
      ok: false,
      stage: "verify",
      code: verdict.code,
      detail: verdict.detail,
      ...(verdict.offending === undefined ? {} : { offending: verdict.offending }),
    };
  }

  return {
    ok: true,
    insight: verdict.insight,
    set: figures.set,
    provenance: {
      requestedModel: input.model,
      servedByModel: completion.servedByModel,
      servedByProvider: completion.servedByProvider,
      generationId: completion.generationId,
    },
  };
}
