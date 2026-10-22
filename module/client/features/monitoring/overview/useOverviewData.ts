import { useState } from "react";
import { mapRunDetail } from "../../../apiMappers";
import { trpc } from "../../../trpc";
import type { MonitorRun } from "../../../domain";
import { calendarDateRangeToUtc, shiftCalendarDate } from "../queryState";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import { rangeBounds } from "./overviewModel";

export function useOverviewData(query: MonitoringQueryState, timezone: string, catalog: MonitoringSummaryData | undefined, scopeReady: boolean) {
  const [limit, setLimit] = useState(10);
  const bounds = rangeBounds(query, timezone);
  const days = Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86_400_000);
  const previousBounds = calendarDateRangeToUtc(shiftCalendarDate(query.from, -days), query.from, timezone);
  const scope = {
    monitorId: query.monitorId!, from: new Date(bounds.from), to: new Date(bounds.to),
    subject: query.subject === "self" ? { kind: "self" as const } : { kind: "competitor" as const, name: query.subject.slice(11) },
    ...(query.question ? { questionId: query.question } : {}),
    ...(query.questionCategory ? { questionCategory: query.questionCategory } : {}),
    ...(query.model ? { platformId: query.model } : {}),
  };
  // The existing scoped summary resolves retired/category-filtered questions
  // before any additional reads. Do not race it with an unresolved UUID.
  const ready = Boolean(query.monitorId && catalog && scopeReady);
  const monitor = trpc.monitors.get.useQuery({ monitorId: query.monitorId! }, { enabled: ready, staleTime: 30_000 });
  const runs = trpc.runs.list.useQuery({ monitorId: query.monitorId!, limit: 100 }, { enabled: ready, staleTime: 15_000, refetchInterval: 15_000 });
  const readOptions = { enabled: ready, staleTime: 30_000, refetchInterval: 15_000, refetchIntervalInBackground: false };
  const prior = trpc.monitoring.summary.useQuery({ ...scope, from: new Date(previousBounds.from), to: new Date(previousBounds.to) }, readOptions);
  const citations = trpc.monitoring.analysis.useQuery({ scope, kind: "citations" }, readOptions);
  const sources = trpc.monitoring.analysis.useQuery({ scope, kind: "sources" }, readOptions);
  const candidates = (runs.data || []).filter((run) => {
    const time = new Date(run.createdAt).getTime();
    return run.monitorId === query.monitorId && time >= Date.parse(previousBounds.from) && time < bounds.to;
  });
  const currentCandidates = candidates.filter((run) => new Date(run.createdAt).getTime() >= bounds.from);
  const previousCandidates = candidates.filter((run) => new Date(run.createdAt).getTime() < bounds.from);
  // Load a bounded set of real snapshots, with an explicit continuation. The
  // headline metrics always use the full server summary, never this subset.
  const selected = [...currentCandidates.slice(0, limit), ...previousCandidates.slice(0, limit)];
  // Keep canonical tRPC query keys so the existing refresh/invalidation flow
  // also refreshes the overview evidence; no second result cache is introduced.
  const details = trpc.useQueries((api) => selected.map((run) => api.runs.get({ runId: run.id }, {
    staleTime: 15_000,
    refetchIntervalInBackground: false,
    refetchInterval: ["completed", "partial_completed", "failed", "cancelled"].includes(run.status) ? 60_000 : 15_000,
  })));
  const snapshots: MonitorRun[] = details.flatMap((detail) => {
    if (!detail.data) return [];
    const output = detail.data;
    const mapped = mapRunDetail(output);
    return [{ ...mapped, attempts: mapped.attempts.map((attempt, index) => {
      const raw = output.attempts[index]!.attempt;
      const question = output.configuration.questions.find((item) => item.ordinal === raw.monitorQuestionOrdinal);
      const platform = output.configuration.platforms.find((item) => item.ordinal === raw.monitorPlatformOrdinal);
      return { ...attempt, runId: mapped.id, questionId: question?.questionId || attempt.questionId,
        platformId: platform?.platformId, capturedAt: mapped.createdAt };
    }) }];
  });
  const listCoversWindow = Boolean(runs.data && (runs.data.length < 100 ||
    new Date(runs.data.at(-1)!.createdAt).getTime() < Date.parse(previousBounds.from)));
  const complete = ready && runs.isSuccess && monitor.isSuccess && listCoversWindow && selected.length === candidates.length && details.every((detail) => detail.isSuccess);
  return {
    snapshots,
    competitors: monitor.data?.version.competitors || [],
    prior: prior.data,
    citations: citations.data?.kind === "citations" ? citations.data : undefined,
    sources: sources.data?.kind === "sources" ? sources.data : undefined,
    complete,
    loading: !ready || runs.isPending || monitor.isPending || details.some((detail) => detail.isPending),
    error: runs.error?.message || monitor.error?.message || prior.error?.message || citations.error?.message || sources.error?.message || details.find((detail) => detail.error)?.error?.message,
    canLoadMore: selected.length < candidates.length,
    loadMore: () => setLimit((value) => Math.min(100, value + 10)),
    listLimited: Boolean(runs.data && !listCoversWindow),
  };
}

export type OverviewData = ReturnType<typeof useOverviewData>;
