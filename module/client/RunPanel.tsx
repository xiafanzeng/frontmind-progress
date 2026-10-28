import { trpc } from "./trpc";
import { mapRunDetail } from "./apiMappers";
import { shouldPollRun } from "./runtimeState";
import { ProgressExecutionActivity } from "./host-runtime";
import { formatDateTime, runStatusLabel } from "./domain";

/** The new report owns analysis; retain only the original execution activity. */
export function MonitoringRunPanel({ runId, monitorId }: { runId: string; monitorId?: string }) {
  const query = trpc.runs.get.useQuery({ runId }, {
    refetchInterval: state => state.state.data && shouldPollRun(state.state.data.run.status) ? 5000 : false,
    refetchIntervalInBackground: false,
  });
  if (query.isLoading) return <p role="status">正在读取运行过程…</p>;
  if (query.error) return <p role="alert">{query.error.message}<button type="button" onClick={() => void query.refetch()}>重新读取</button></p>;
  if (!query.data || (monitorId && query.data.run.monitorId !== monitorId)) return <p role="alert">该运行不属于当前监控任务，请重新选择。</p>;
  const run = mapRunDetail(query.data);
  return <section className="fm-pr-execution" aria-label="运行过程">
    <header><div><h3>运行过程</h3><p>{run.monitorName} · {formatDateTime(run.createdAt)} · {runStatusLabel(run.status)}</p></div><small>运行 {run.id}</small></header>
    <ProgressExecutionActivity run={run} />
  </section>;
}
