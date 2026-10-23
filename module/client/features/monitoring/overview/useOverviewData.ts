import { useEffect, useState } from "react";
import { mapRunDetail } from "../../../apiMappers";
import { trpc } from "../../../trpc";
import type { MonitorRun } from "../../../domain";
import { calendarDateRangeToUtc, shiftCalendarDate } from "../queryState";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData, MonitoringAnswerListItem } from "../useMonitoringDataSource";
import { rangeBounds } from "./overviewModel";

export type OverviewTab = "metrics" | "trends" | "sentiment" | "sources" | "suggestions";
const readOptions = { staleTime: 60_000, refetchInterval: false as const, refetchOnWindowFocus: false, trpc: { abortOnUnmount: true } };
function previousYearDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year! - 1, month!, 0)).getUTCDate();
  return `${year! - 1}-${String(month).padStart(2, "0")}-${String(Math.min(day!, lastDay)).padStart(2, "0")}`;
}
function uniqueRuns(items: MonitoringAnswerListItem[]) {
  return [...new Map(items.map(item => [item.runId, item])).values()];
}

export function useOverviewData(query: MonitoringQueryState, timezone: string, catalog: MonitoringSummaryData | undefined, scopeReady: boolean, tab: OverviewTab) {
  const utils = trpc.useUtils();
  const bounds = rangeBounds(query, timezone);
  const days = Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86_400_000);
  const previousBounds = calendarDateRangeToUtc(shiftCalendarDate(query.from, -days), query.from, timezone);
  const yearFrom = previousYearDate(query.from), yearTo = previousYearDate(query.to);
  const yearWindowValid = yearFrom < yearTo && (Date.parse(yearTo) - Date.parse(yearFrom)) / 86_400_000 === days;
  const yearBounds = yearWindowValid ? calendarDateRangeToUtc(yearFrom, yearTo, timezone) : previousBounds;
  const scope = {
    monitorId: query.monitorId!, from: new Date(bounds.from), to: new Date(bounds.to),
    subject: query.subject === "self" ? { kind: "self" as const } : { kind: "competitor" as const, name: query.subject.slice(11) },
    ...(query.question ? { questionId: query.question } : {}),
    ...(query.questionCategory ? { questionCategory: query.questionCategory } : {}),
    ...(query.model ? { platformId: query.model } : {}),
  };
  const scopeKey = JSON.stringify(scope);
  const [budget, setBudget] = useState({ scopeKey, count: 3 });
  const limit = budget.scopeKey === scopeKey ? budget.count : 3;
  const ready = Boolean(query.monitorId && catalog && scopeReady);
  const compare = ready && tab === "metrics";
  const priorScope = { ...scope, from: new Date(previousBounds.from), to: new Date(previousBounds.to) };
  const yearScope = { ...scope, from: new Date(yearBounds.from), to: new Date(yearBounds.to) };
  const monitor = trpc.monitors.get.useQuery({ monitorId: query.monitorId! }, { ...readOptions, enabled: ready });
  const prior = trpc.monitoring.summary.useQuery(priorScope, { ...readOptions, enabled: compare });
  const yearPrior = trpc.monitoring.summary.useQuery(yearScope, { ...readOptions, enabled: compare && yearWindowValid });
  // The existing, date-scoped answer cursor reaches all historical runs. Unlike
  // runs.list(limit:100), it does not silently exclude older matching evidence.
  const indexOptions = { ...readOptions, getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor || undefined };
  const currentIndex = trpc.monitoring.answers.list.useInfiniteQuery({ scope, limit: 50 }, { ...indexOptions, enabled: ready });
  const priorEnabled = compare && Boolean(prior.data?.metrics.attempts);
  const yearEnabled = compare && yearWindowValid && Boolean(yearPrior.data?.metrics.attempts);
  const priorIndex = trpc.monitoring.answers.list.useInfiniteQuery({ scope: priorScope, limit: 50 }, { ...indexOptions, enabled: priorEnabled });
  const yearIndex = trpc.monitoring.answers.list.useInfiniteQuery({ scope: yearScope, limit: 50 }, { ...indexOptions, enabled: yearEnabled });
  const currentRuns = uniqueRuns(currentIndex.data?.pages.flatMap(page => page.items) || []);
  const previousRuns = priorEnabled ? uniqueRuns(priorIndex.data?.pages.flatMap(page => page.items) || []) : [];
  const yearRuns = yearEnabled ? uniqueRuns(yearIndex.data?.pages.flatMap(page => page.items) || []) : [];
  const candidates = [...new Map([...currentRuns, ...previousRuns, ...yearRuns].map(run => [run.runId, run])).values()];
  const selected = candidates.slice(0, limit);
  const indexItems = [...(currentIndex.data?.pages.flatMap(page => page.items) || []),
    ...(priorEnabled ? priorIndex.data?.pages.flatMap(page => page.items) || [] : []),
    ...(yearEnabled ? yearIndex.data?.pages.flatMap(page => page.items) || [] : [])];
  const staleCached = selected.filter(run => {
    const cached = utils.runs.get.getData({ runId: run.runId });
    return cached && indexItems.some(item => {
      if (item.runId !== run.runId) return false;
      const answer = cached.attempts.find(row => row.attempt.id === item.answerId);
      const terminal = ["completed", "failed", "cancelled"];
      // A null list result can mean incomplete summary fields. A newer full
      // snapshot must not be repeatedly fetched against an older directory.
      return !answer || (terminal.includes(item.status) && !terminal.includes(answer.attempt.status)) ||
        (item.result && (!answer.result || new Date(item.result.updatedAt).getTime() > new Date(answer.result.updatedAt).getTime()));
    });
  }).map(run => run.runId);
  const indexVersion = JSON.stringify(indexItems.map(item => [item.answerId, item.status, item.result?.updatedAt]));
  const [refreshingEvidence, setRefreshingEvidence] = useState(false);
  useEffect(() => {
    let active = true;
    if (!staleCached.length) return;
    setRefreshingEvidence(true);
    void (async () => {
      try {
        for (let i = 0; active && i < staleCached.length; i += 3) {
          await Promise.allSettled(staleCached.slice(i, i + 3).map(runId => utils.runs.get.fetch({ runId }, { staleTime: 0 })));
        }
      } finally { if (active) setRefreshingEvidence(false); }
    })();
    return () => { active = false; setRefreshingEvidence(false); };
    // React to a new directory revision, not our own cache writes/re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, indexVersion, limit]);
  // At most three uncached full runs in flight, even after switching tabs or
  // restoring a larger page budget. Cached runs remain on canonical tRPC keys.
  const pending = new Set(selected.filter(run => !utils.runs.get.getData({ runId: run.runId })).slice(0, 3).map(run => run.runId));
  const details = trpc.useQueries(api => selected.map(run => api.runs.get({ runId: run.runId }, {
    ...readOptions, staleTime: Infinity,
    enabled: ready && !staleCached.length && !refreshingEvidence && (pending.has(run.runId) || Boolean(utils.runs.get.getData({ runId: run.runId }))),
  })));
  const loaded: MonitorRun[] = details.flatMap(detail => {
    if (!detail.data) return [];
    const output = detail.data;
    const mapped = mapRunDetail(output);
    return [{ ...mapped, attempts: mapped.attempts.map((attempt, index) => {
      const raw = output.attempts[index]!.attempt;
      const question = output.configuration.questions.find(item => item.ordinal === raw.monitorQuestionOrdinal);
      const platform = output.configuration.platforms.find(item => item.ordinal === raw.monitorPlatformOrdinal);
      return { ...attempt, runId: mapped.id, questionId: question?.questionId || attempt.questionId,
        platformId: platform?.platformId, capturedAt: mapped.createdAt };
    }) }];
  });
  const currentIds = new Set(currentRuns.map(run => run.runId));
  const previousIds = new Set(previousRuns.map(run => run.runId));
  const yearIds = new Set(yearRuns.map(run => run.runId));
  const allLoaded = (ids: Set<string>) => [...ids].every(id => loaded.some(run => run.id === id));
  const currentComplete = ready && !staleCached.length && !refreshingEvidence && currentIndex.isSuccess && !currentIndex.hasNextPage && allLoaded(currentIds);
  const previousComplete = prior.isSuccess && (prior.data.metrics.attempts === 0 || priorIndex.isSuccess && !priorIndex.hasNextPage && allLoaded(previousIds));
  const yearComplete = compare && yearWindowValid && currentComplete && yearPrior.isSuccess && (yearPrior.data.metrics.attempts === 0 || yearIndex.isSuccess && !yearIndex.hasNextPage && allLoaded(yearIds));
  const citations = trpc.monitoring.analysis.useQuery({ scope, kind: "citations" }, { ...readOptions, enabled: ready && tab === "sources" });
  const sources = trpc.monitoring.analysis.useQuery({ scope, kind: "sources" }, { ...readOptions, enabled: ready && tab === "sources" });
  const indexes = [currentIndex, ...(priorEnabled ? [priorIndex] : []), ...(yearEnabled ? [yearIndex] : [])];
  const loading = !ready || refreshingEvidence || monitor.isLoading || indexes.some(index => index.isFetching) || details.some(detail => detail.isFetching);
  const loadMore = async () => {
    if (loading) return;
    if (selected.length >= candidates.length) {
      const next = indexes.find(index => index.hasNextPage);
      if (next) await next.fetchNextPage();
    }
    setBudget({ scopeKey, count: limit + 3 });
  };
  const refresh = async () => {
    await Promise.all([
      utils.monitoring.summary.invalidate(),
      monitor.refetch(),
      ...indexes.map(index => index.refetch()),
      // Refresh only three full runs at a time, preserving the same load bound.
      (async () => { for (let i = 0; i < details.length; i += 3) await Promise.all(details.slice(i, i + 3).map(detail => detail.refetch())); })(),
      ...(tab === "sources" ? [citations.refetch(), sources.refetch()] : []),
      ...(compare ? [prior.refetch(), ...(yearWindowValid ? [yearPrior.refetch()] : [])] : []),
    ]);
  };
  return {
    snapshots: loaded.filter(run => currentIds.has(run.id) || previousIds.has(run.id)),
    yearSnapshots: loaded.filter(run => yearIds.has(run.id)), yearPrior: compare ? yearPrior.data : undefined, yearComplete,
    competitors: monitor.data?.version.competitors || [], prior: compare ? prior.data : undefined,
    citations: citations.data?.kind === "citations" ? citations.data : undefined,
    sources: sources.data?.kind === "sources" ? sources.data : undefined,
    complete: currentComplete && (!compare || previousComplete), currentComplete,
    loading, refresh,
    error: (!refreshingEvidence && staleCached.length ? "部分回答版本已更新，完整证据尚未同步，请刷新重试" : undefined) || monitor.error?.message || indexes.find(index => index.error)?.error?.message || details.find(detail => detail.error)?.error?.message ||
      (compare ? prior.error?.message || yearPrior.error?.message : undefined) || (tab === "sources" ? citations.error?.message || sources.error?.message : undefined),
    canLoadMore: selected.length < candidates.length || indexes.some(index => index.hasNextPage), loadMore,
    listLimited: indexes.some(index => index.hasNextPage),
  };
}
export type OverviewData = ReturnType<typeof useOverviewData>;
