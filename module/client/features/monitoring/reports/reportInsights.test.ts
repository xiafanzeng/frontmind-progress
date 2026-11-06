import { expect, it } from "vitest";
import type { RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { demoConfigurations, makeDemoRun } from "../../../../tests/monitoring-fixtures";
import { citationChanges, citationInventory, comparisonReason, latestComparable, matchesGap } from "./reportInsights";

const query: MonitoringQueryState = { tab: "overview", subject: "self", range: "custom", from: "2026-11-01", to: "2026-11-06", sourceScope: "all", fullscreen: false };
const base = makeDemoRun("monitor", demoConfigurations["demo-living"]!);
const run = (id: string, day: number) => ({ ...base, id, createdAt: `2026-11-0${day}T01:00:00Z`, status: "completed" as const });
const answer = (id: string): RunAttempt => ({ ...base.attempts[0]!, id, status: "completed", answer: "回答正文", citationProvenance: "explicit" });

it("selects the latest compatible earlier batch and rejects brand/version/order changes", () => {
  const first = run("first", 1), second = run("second", 2), last = run("last", 4);
  const changed = { ...run("changed", 3), config: { ...base.config, brandName: "另一品牌" } };
  expect(latestComparable([last, first, changed, second], last, query)?.id).toBe("second");
  expect(comparisonReason(second, last, query)).toBeUndefined();
  expect(comparisonReason(changed, last, query)).toContain("品牌不同");
  expect(comparisonReason({ ...second, version: last.version + 1 }, last, query)).toContain("版本");
  expect(comparisonReason(last, second, query)).toContain("早于");
  expect(comparisonReason(second, last, { ...query, subject: "competitor:品牌" })).toContain("竞品标签");
});

it("keeps failed/empty answers separate from missing labels and treats unknowns explicitly", () => {
  expect(matchesGap({ ...answer("known"), sentiment: "neutral" }, "sentiment")).toBe(false);
  expect(matchesGap({ ...answer("unknown"), sentiment: "unknown" }, "sentiment")).toBe(true);
  expect(matchesGap({ ...answer("failed"), status: "failed", answer: "" }, "sentiment")).toBe(false);
  expect(matchesGap({ ...answer("failed"), status: "failed", answer: "" }, "failed")).toBe(true);
  expect(matchesGap({ ...answer("empty"), answer: "  " }, "empty")).toBe(true);
  expect(matchesGap({ ...answer("absent"), brandMentioned: false, mentionPosition: undefined }, "rank")).toBe(false);
  expect(matchesGap({ ...answer("unranked"), brandMentioned: true, mentionPosition: undefined }, "rank")).toBe(true);
});

it("deduplicates fragments per answer and only compares complete explicit citation records", () => {
  const first = answer("first"), second = answer("second");
  const source = { ...first.sources[0]!, id: "source", url: "https://example.com/item#one", isCited: true };
  first.sources = [source, { ...source, id: "duplicate", url: "https://example.com/item#two" }];
  second.sources = [{ ...source, url: "https://example.com/next" }];
  expect(citationInventory([first]).get("https://example.com/item")?.answers).toHaveLength(1);
  const result = citationChanges([first], [second], true);
  expect(result.canCompare).toBe(true);
  expect(result.rows.find(row => row.url === "https://example.com/item")?.state).toBe("absent");
  expect(result.rows.find(row => row.url === "https://example.com/next")?.state).toBe("added");
  const partial = citationChanges([first], [{ ...second, citationProvenance: undefined }], true);
  expect(partial.canCompare).toBe(false);
  expect(partial.rows).toHaveLength(0);
  const single = citationChanges([], [second], false);
  expect(single.rows[0]?.state).toBe("observed");
  const unlinked = { ...first, sources: [{ ...source, url: "" }] };
  expect(citationChanges([unlinked], [second], true).rows.some(row => !row.url)).toBe(false);
});
