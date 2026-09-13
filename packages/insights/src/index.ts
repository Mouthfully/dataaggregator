// Internal imports carry the REAL `.ts` extension, not `.js`. `moduleResolution: "bundler"`
// accepts both and a `.js` specifier fails only `next build`, which is the last step before
// deploy -- so the extension that is true is the one used. Same note as @repo/brand.
export {
  ACTION_KINDS,
  BUSINESS_TYPES,
  TAKINGS_METRICS,
  allowedNumbers,
  buildFigureSet,
  canonicalNumber,
  estimateFloor,
  leadingMetrics,
  readMetric,
  type ActionKind,
  type BusinessType,
  type Estimate,
  type Figure,
  type FigureInput,
  type FigureKind,
  type FigureRefusalCode,
  type FigureSet,
  type FigureSetResult,
  type InsightRow,
  type Period,
  type RankedAction,
  type Reading,
} from "./figures.ts";
export {
  INSIGHT_RESPONSE_SCHEMA,
  SUMMARY_LINES,
  SYSTEM_PROMPT,
  renderUserPrompt,
  textOf,
  type ModelInsight,
} from "./brief.ts";
export {
  OPENROUTER_COMPLETIONS_URL,
  PRIVACY_FIELDS,
  assertPrivacyFields,
  buildRequest,
  opaqueTenantId,
  type OpaqueTenantId,
  type OpenRouterBody,
  type PrivacyProblem,
  type RequestInput,
} from "./request.ts";
export {
  DEFAULT_TIMEOUT_MS,
  InsightClientError,
  postInsight,
  type ClientOptions,
  type InsightClientErrorCode,
  type InsightCompletion,
} from "./client.ts";
export {
  SPELLED_QUANTITIES,
  numericTokens,
  verifyInsight,
  type RefusalCode,
  type Verdict,
} from "./verify.ts";
export {
  generateInsight,
  type GenerateInput,
  type GenerateResult,
  type InsightProvenance,
} from "./generate.ts";
