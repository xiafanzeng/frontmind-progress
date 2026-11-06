import { useState } from "react";
import { useLocation } from "wouter";
import { progressRunRoute } from "../reportNavigation";
import { mapRunDetail } from "../../../apiMappers";
import { trpc } from "../../../trpc";
import { isMonitoringUuid } from "../../../identifiers";
import { rangeBounds } from "../overview/overviewModel";
import QuestionProgressReport, { type QuestionProgressReportProps } from "./QuestionProgressReport";
import "./progress-report.css";
import "./question-progress-report.css";
import "../overview/overview.css";

type Props = QuestionProgressReportProps;

function LiveReport(props: Props) {
  const [limit, setLimit] = useState(10);
  const bounds = rangeBounds(props.query, props.project.timezone);
  const enabled = isMonitoringUuid(props.query.monitorId);
  const list = trpc.runs.list.useQuery({ monitorId: props.query.monitorId || "00000000-0000-0000-0000-000000000000", limit: 100 }, {
    enabled, staleTime: 15_000, refetchInterval: false, refetchOnWindowFocus: false,
  });
  const candidates = [...(list.data || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).filter(item => {
    const time = new Date(item.createdAt).getTime();
    return item.monitorId === props.query.monitorId && time >= bounds.from && time < bounds.to;
  });
  // Pinned before/after snapshots may be outside the selected discovery window.
  // Fetch them explicitly and check ownership; never silently replace a missing selection.
  const pinnedIds = [...new Set([
    props.query.reportAfterId || props.query.runId,
    props.query.reportBeforeId,
  ].filter((id): id is string => Boolean(id && isMonitoringUuid(id))))];
  const selectedIds = enabled ? [...new Set([...pinnedIds, ...candidates.slice(0, limit).map(item => item.id)])] : [];
  const details = trpc.useQueries(api => selectedIds.map(runId => api.runs.get({ runId }, {
    staleTime: 15_000, refetchInterval: false, refetchOnWindowFocus: false,
  })));
  const invalidOwner = details.some(detail => detail.data && detail.data.run.monitorId !== props.query.monitorId);
  const runs = details.flatMap(detail => {
    if (!detail.data || detail.data.run.monitorId !== props.query.monitorId) return [];
    const output = detail.data;
    const run = mapRunDetail(output);
    const attemptsById = new Map(output.attempts.map(item => [item.attempt.id, item.attempt]));
    return [{ ...run, attempts: run.attempts.map(attempt => {
      const raw = attemptsById.get(attempt.id);
      return { ...attempt, runId: run.id,
        questionId: output.configuration.questions.find(item => item.ordinal === raw?.monitorQuestionOrdinal)?.questionId || attempt.questionId,
        platformId: output.configuration.platforms.find(item => item.ordinal === raw?.monitorPlatformOrdinal)?.platformId,
      };
    }) }];
  });
  return <QuestionProgressReport {...props} data={{ runs,
    loading: enabled && (list.isPending || details.some(item => item.isPending)),
    error: list.error?.message || details.find(item => item.error)?.error?.message || (invalidOwner ? "所选运行不属于当前监控任务，请重新选择批次。" : undefined),
    limited: Boolean(list.data?.length === 100),
    more: candidates.length > limit, loadMore: () => setLimit(value => Math.min(100, value + 10)),
    refreshing: list.isFetching || details.some(item => item.isFetching),
    refresh: async () => { await Promise.all([list.refetch(), ...details.map(item => item.refetch())]); },
  }} />;
}

export default function ProgressReportWorkspace(props: Props) {
  const [path] = useLocation();
  const linkedRun = progressRunRoute(path);
  const effectiveProps = { ...props, query: { ...props.query,
    runId: linkedRun && linkedRun.monitorId === props.query.monitorId ? linkedRun.runId : props.query.runId,
  } };
  const key = `${props.project.id}:${props.query.monitorId}:${props.query.from}:${props.query.to}`;
  return props.serverData ? <LiveReport key={key} {...effectiveProps} /> : <QuestionProgressReport key={key} {...effectiveProps} data={{
    runs: props.runs, loading: false, limited: false, more: false,
    loadMore: () => undefined, refreshing: false, refresh: async () => undefined,
  }} />;
}
