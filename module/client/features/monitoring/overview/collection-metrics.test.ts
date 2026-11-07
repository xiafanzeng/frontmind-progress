import { expect, it } from "vitest";
import type { MonitorRun } from "../../../domain";
import { demoConfigurations, makeDemoRun } from "../../../../tests/monitoring-fixtures";
import { calculateEvidenceMetrics } from "../selectors";
import { periodMetrics } from "./overviewModel";
import type { MonitoringQueryState } from "../types";

const query: MonitoringQueryState = { tab: "overview", subject: "self", range: "custom", from: "2026-11-01", to: "2026-11-07", sourceScope: "all", fullscreen: false };
function run(id: string, mentions: boolean[]): MonitorRun {
  const base = makeDemoRun("monitor", demoConfigurations["demo-living"]!);
  return { ...base, id, status: "completed", config: { ...base.config, brandName: "品牌" },
    attempts: mentions.map((mentioned, index) => ({ ...base.attempts[0]!, id: `${id}-${index}`, runId: id,
      status: "completed", answer: "有效回答", brandMentioned: mentioned, mentionPosition: mentioned ? 2 : undefined })) };
}
it("uses equal collection weights for cards but keeps answer weights for trends", () => {
  const runs = [run("one", [true, false, false]), run("two", [false])];
  expect(periodMetrics(runs, query, [], "品牌")).toMatchObject({ mentionRate: 50, top3Rate: 50, triggeredRuns: 2, mentionedRuns: 1, top3Runs: 1 });
  expect(calculateEvidenceMetrics(runs.flatMap(item => item.attempts))).toMatchObject({ mentionRate: 25, top3Rate: 25 });
});
it("ignores unfinished and historical other-brand runs in collection rates", () => {
  const historical = run("old", [true]); historical.config.brandName = "旧品牌";
  const unfinished = run("pending", [true]); unfinished.status = "running";
  expect(periodMetrics([historical, unfinished], query, [], "品牌")).toMatchObject({ triggeredRuns: 0, mentionRate: undefined, top3Rate: undefined });
  expect(periodMetrics([run("one", [true])], { ...query, model: "unselected-model" }, [], "品牌").triggeredRuns).toBe(0);
});
