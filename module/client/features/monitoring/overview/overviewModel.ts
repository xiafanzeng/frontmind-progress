import type { CompetitorInput, MonitorRun, RunAttempt } from "../../../domain";
import { calculateEvidenceMetrics, projectAttemptsForRunSubject } from "../selectors";
import { calendarDateRangeToUtc, monitoringQueryString } from "../queryState";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import { projectWorkspaceUrl } from "../../../host-runtime";

export type OverviewMetric = "mentionRate" | "top3Rate" | "averagePosition" | "effective";
export const overviewMetrics: Array<{ key: OverviewMetric; label: string }> = [
  { key: "mentionRate", label: "提及率" },
  { key: "top3Rate", label: "Top3 推荐率" },
  { key: "averagePosition", label: "平均排名" },
  { key: "effective", label: "有效回答数" },
];

export function metricText(key: OverviewMetric, value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  return key === "effective" ? String(value) : key === "averagePosition" ? value.toFixed(1) : `${value.toFixed(1)}%`;
}

export function summaryMetrics(summary: MonitoringSummaryData) {
  return {
    effective: summary.metrics.answers,
    mentionRate: summary.metrics.mentionRate === null ? undefined : summary.metrics.mentionRate * 100,
    top3Rate: summary.metrics.top3Rate === null ? undefined : summary.metrics.top3Rate * 100,
    averagePosition: summary.metrics.averagePosition ?? undefined,
  };
}

export function scopedAttempts(run: MonitorRun, query: MonitoringQueryState) {
  return run.attempts.filter((attempt) =>
    (!query.question || attempt.questionId === query.question) &&
    (!query.questionCategory || attempt.questionCategory === query.questionCategory) &&
    (!query.model || attempt.platformId === query.model || `${attempt.platformCode}:${attempt.clientType}` === query.model),
  );
}

export function subjectAttempts(run: MonitorRun, query: MonitoringQueryState, competitors: CompetitorInput[]) {
  const name = query.subject.startsWith("competitor:") ? query.subject.slice(11) : undefined;
  const competitor = name ? competitors.find((item) => item.name === name) : undefined;
  // Never silently project a missing competitor back to the main brand.
  if (name && !competitor) return [];
  return projectAttemptsForRunSubject(scopedAttempts(run, query), competitor || "self", run.config.competitors);
}

export function rangeBounds(query: MonitoringQueryState, timezone: string) {
  const bounds = calendarDateRangeToUtc(query.from, query.to, timezone);
  return { from: Date.parse(bounds.from), to: Date.parse(bounds.to) };
}

export function effectiveAttempts(attempts: RunAttempt[]) {
  return attempts.filter((attempt) => attempt.status === "completed" && Boolean(attempt.answer?.trim()));
}

export function runSignature(run: MonitorRun, query: MonitoringQueryState) {
  // Includes planned sample counts, rather than only successful answers. A
  // failed collection must not accidentally look like a changed configuration.
  const cells = new Map<string, number>();
  for (const attempt of scopedAttempts(run, query)) {
    const cell = JSON.stringify([attempt.questionId, attempt.question, attempt.questionCategory,
      attempt.platformId, attempt.platformCode, attempt.clientType, attempt.mode, attempt.regionCode]);
    cells.set(cell, (cells.get(cell) || 0) + 1);
  }
  return JSON.stringify({
    brand: run.config.brandName,
    aliases: [...run.config.brandAliases].sort(),
    competitors: run.config.competitors.map((item) => [item.name, [...item.aliases].sort()]).sort(),
    cells: [...cells].sort(([a], [b]) => a.localeCompare(b)),
    repetitions: run.config.repetitions,
    region: run.config.regionLabel,
  });
}

export function comparablePeriods(current: MonitorRun[], previous: MonitorRun[], query: MonitoringQueryState) {
  if (!current.length || current.length !== previous.length) return false;
  if ([...current, ...previous].some((run) => run.status !== "completed")) return false;
  const signatures = [...current, ...previous].map((run) => runSignature(run, query));
  return new Set(signatures).size === 1;
}

export function periodMetrics(runs: MonitorRun[], query: MonitoringQueryState, competitors: CompetitorInput[]) {
  // Aggregate answer facts once: never average daily or per-run percentages.
  return calculateEvidenceMetrics(runs.flatMap((run) => subjectAttempts(run, query, competitors)));
}

export type Suggestion = {
  id: "knowledge" | "faq" | "sources";
  title: string;
  priority: "P0" | "P1" | "P2";
  action: string;
  destination: string;
  metric: string;
  check: string;
  evidence: RunAttempt[];
};

export function buildSuggestions(attempts: RunAttempt[]): Suggestion[] {
  const effective = effectiveAttempts(attempts);
  return [
    { id: "knowledge", title: "知识库补充", priority: "P1",
      action: "核查未提及品牌的回答与现有资料，确认是否需要补充知识条目。",
      destination: "知识库 → 内容制作 / 官网发布（集成待确认）", metric: "品牌提及率",
      check: "有效回答是否提及当前品牌主体", evidence: effective.filter((item) => item.brandMentioned === false) },
    { id: "faq", title: "咨询 FAQ 完善", priority: "P1",
      action: "复核负面回答的原句与咨询材料，确认后再完善 FAQ 表达。",
      destination: "知识库 / 内容制作（集成待确认）", metric: "负面回答占比、未判定占比",
      check: "供应商返回的回答情感及原句语境", evidence: effective.filter((item) => item.sentiment === "negative") },
    { id: "sources", title: "公开信源核验", priority: "P2",
      action: "核查回答的公开依据与引用来源，尚不能确认时补充资料。",
      destination: "品牌资料 / 官网发布（集成待确认）", metric: "可核验引用覆盖、Top3 推荐率",
      check: "供应商是否明确返回可核验的文内引用",
      evidence: effective.filter((item) => item.citationProvenance !== "explicit" || !item.sources.some((source) => source.isCited)) },
  ];
}

export function optimizationReportHref(monitorId: string, attempt: RunAttempt, query: MonitoringQueryState) {
  if (!attempt.runId) return undefined;
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  for (const [key, value] of new URLSearchParams(monitoringQueryString(query))) params.set(key, value);
  // Preserve the actual analysis window so an older linked run is not replaced
  // by the workspace's default seven-day fallback during asynchronous hydration.
  params.set("monitor", monitorId);
  params.set("run", attempt.runId);
  params.set("optimizationAnswer", attempt.id);
  params.set("view", "reports");
  params.set("tab", "overview");
  params.delete("fullscreen");
  params.delete("answer");
  params.delete("answerQuestion");
  return projectWorkspaceUrl(`/monitoring-system/${encodeURIComponent(monitorId)}/runs/${encodeURIComponent(attempt.runId)}?${params}#question-optimization`);
}

export function downloadHandoff(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
