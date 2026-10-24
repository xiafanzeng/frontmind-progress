import { z } from "zod";
import { monitoringScopeSchema, monitoringAnswerDetailOutputSchema } from "@frontmind/monitoring-contracts";

export const sentimentToneSchema = z.enum(["positive", "neutral", "negative"]);
export const keywordStateSchema = z.enum(["available", "empty", "not_returned", "unavailable"]);
const page = z.number().int().min(1).max(50000).default(1);
export const overviewSentimentInputSchema = z.object({
  scope: monitoringScopeSchema,
  answerTone: z.enum(["all", "positive", "neutral", "negative", "missing"]).default("all"),
  keywordTone: z.enum(["all", "positive", "neutral", "negative"]).default("all"),
  keywordKey: z.string().max(2000).nullable().default(null),
  page,
});
const keyword = z.object({ key: z.string(), keyword: z.string(), nature: sentimentToneSchema, answerCount: z.number(), conflicted: z.boolean() });
export const overviewSentimentOutputSchema = z.object({
  targetBrand: z.string(), total: z.number(), classified: z.number(), missing: z.number(), brandMismatch: z.number(),
  counts: z.object({ positive: z.number(), neutral: z.number(), negative: z.number() }),
  keywordStates: z.object({ available: z.number(), empty: z.number(), not_returned: z.number(), unavailable: z.number() }),
  filteredAnswers: z.number(), keywords: z.array(keyword),
  rows: z.array(z.object({
    answerId: z.string(), runId: z.string(), questionId: z.string(), question: z.string(), platformName: z.string(),
    capturedAt: z.string(), revisionId: z.string(), revision: z.number().nullable(), targetBrand: z.string(),
    sentiment: sentimentToneSchema.nullable(), keywordState: keywordStateSchema,
    evaluations: z.array(z.object({ key: z.string(), keyword: z.string(), nature: sentimentToneSchema, context: z.string().nullable() })),
  })),
  page: z.number(), pageSize: z.literal(10), rowCount: z.number(), pageCount: z.number(),
  coverage: z.string(),
});
export const overviewSourcesInputSchema = z.object({
  scope: monitoringScopeSchema, domain: z.string().max(2000).nullable().default(null), domainPage: page, contentPage: page,
});
export const overviewSourcesOutputSchema = z.object({
  total: z.number(), domainCount: z.number(), contentCount: z.number(), domainPage: z.number(), contentPage: z.number(), pageSize: z.literal(10),
  domains: z.array(z.object({ domain: z.string(), count: z.number() })),
  contents: z.array(z.object({ title: z.string(), url: z.string(), domain: z.string(), count: z.number() })),
  coverage: z.string(),
});
export const overviewEvidenceInputSchema = z.object({ monitorId: z.string().uuid(), answerId: z.string().uuid(), revisionId: z.string().uuid() });
export const overviewEvidenceOutputSchema = monitoringAnswerDetailOutputSchema.extend({
  revisionId: z.string(), revision: z.number(), resultUpdatedAt: z.string(),
  targetBrand: z.string(), brandVersionId: z.string(), brandAliases: z.array(z.string()),
  provider: z.literal("moli"), rawSentiment: z.string().nullable(), keywordState: keywordStateSchema,
});
export type OverviewSentimentInput = z.infer<typeof overviewSentimentInputSchema>;
export type OverviewSentimentData = z.infer<typeof overviewSentimentOutputSchema>;
export type OverviewSourcesInput = z.infer<typeof overviewSourcesInputSchema>;
export type OverviewSourcesData = z.infer<typeof overviewSourcesOutputSchema>;
export type OverviewEvidenceInput = z.infer<typeof overviewEvidenceInputSchema>;
export type OverviewEvidenceData = z.infer<typeof overviewEvidenceOutputSchema>;
