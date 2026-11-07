import { expect, it } from "vitest";
import { demoConfigurations, makeDemoRun } from "../../../../tests/monitoring-fixtures";
import type { MonitorRun, RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { measureQuestion, measurementChange, questionComparisonReason, questionRankComparisons } from "./questionReportModel";

const sample = makeDemoRun("monitor", demoConfigurations["demo-living"]!);
const answer = (position: number | undefined, repetition = 1): RunAttempt => ({ ...sample.attempts[0]!,
  id: `answer-${repetition}`, repetition, status: "completed", answer: "有效回答", brandMentioned: true, mentionPosition: position });

it("keeps individual ranks instead of averaging and does not fill missing ranks", () => {
  const result = measureQuestion([answer(1), answer(5, 2), answer(undefined, 3)], "averagePosition");
  expect(result.value).toBeUndefined();
  expect(result.ranks?.map(row => row.value)).toEqual([1, 5, undefined]);
  expect(measureQuestion([answer(undefined)], "averagePosition").value).toBeUndefined();
});

it("compares the same collection slot and leaves unpaired repetitions missing", () => {
  const rows = questionRankComparisons([answer(5), answer(2, 2)], [answer(1)]);
  expect(measurementChange(rows[0]!.before, rows[0]!.after, "averagePosition").title).toBe("改善 4 位");
  expect(measurementChange(rows[1]!.before, rows[1]!.after, "averagePosition").title).toBe("待评估");
  expect(questionRankComparisons([answer(1), answer(2)], [answer(1)])[0]!.reason).toBeTruthy();
});

it("does not align different collection modes", () => {
  const prior = { ...answer(5), mode: "search" as const };
  const next = { ...answer(1), mode: "reasoning_search" as const };
  const rows = questionRankComparisons([prior], [next]);
  expect(rows).toHaveLength(2);
  expect(rows.every(row => row.before.value === undefined || row.after.value === undefined)).toBe(true);
});

it("allows selected completed versions of the same brand while rejecting cross-brand comparisons", () => {
  const before: MonitorRun = { ...sample, id: "before", status: "completed", version: 1, createdAt: "2026-09-01T00:00:00Z", attempts: [answer(5)] };
  const after: MonitorRun = { ...before, id: "after", version: 2, createdAt: "2026-09-02T00:00:00Z", attempts: [answer(1)] };
  const query: MonitoringQueryState = { tab: "overview", subject: "self", range: "custom", from: "2026-09-01", to: "2026-09-03", sourceScope: "all", fullscreen: false };
  expect(questionComparisonReason(before, after, query, answer(1).questionId)).toBeUndefined();
  expect(questionComparisonReason(before, { ...after, config: { ...after.config, brandName: "另一品牌" } }, query, answer(1).questionId)).toBeTruthy();
});
