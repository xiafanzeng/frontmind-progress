import { z } from "zod";
import { monitoringSummaryOutputSchema, monitoringAnswersListOutputSchema, monitoringAnswerDetailOutputSchema } from "@frontmind/monitoring-contracts";

export const answerBrandContextSchema = z.object({
  targetBrand: z.string().nullable(),
  currentBrand: z.string(),
  matchesCurrent: z.boolean(),
});
export const brandScopedSummaryOutputSchema = monitoringSummaryOutputSchema.extend({
  brandScope: z.object({
    targetBrand: z.string(), eligibleAnswers: z.number().int().nonnegative(), excludedAnswers: z.number().int().nonnegative(),
  }),
});
const answerItem = monitoringAnswersListOutputSchema.shape.items.element;
export const brandScopedAnswersListOutputSchema = monitoringAnswersListOutputSchema.extend({
  items: z.array(answerItem.extend({
    brandContext: answerBrandContextSchema,
    result: answerItem.shape.result.unwrap().extend({ mentioned: z.boolean().nullable() }).nullable(),
  })),
});
// A single historical answer retains its original result and explicitly identifies
// the historical target. Aggregate endpoints instead exclude mismatched brands.
export const brandScopedAnswerDetailOutputSchema = monitoringAnswerDetailOutputSchema.extend({
  brandContext: answerBrandContextSchema,
});
