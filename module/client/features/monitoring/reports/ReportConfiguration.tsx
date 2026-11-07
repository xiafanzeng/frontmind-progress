import type { MonitorRun, ProjectSummary } from "../../../domain";
import { runStatusLabel } from "../../../domain";
import MonitoringSelect from "../../../components/MonitoringSelect";
import MonitoringFilterBar from "../MonitoringFilterBar";
import { monitoringDateWindow } from "../queryState";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";

/** Report scope is edited in place; each selection immediately updates the report. */
export default function ReportConfiguration({ project, query, catalog, runs, before, after, date, onChange }: {
  project: ProjectSummary; query: MonitoringQueryState; catalog?: MonitoringSummaryData; runs: MonitorRun[];
  before?: MonitorRun; after?: MonitorRun; date: (run?: MonitorRun) => string;
  onChange: (patch: Partial<MonitoringQueryState>) => void;
}) {
  const updateDates = (patch: Partial<MonitoringQueryState>) => onChange({ runId: undefined, reportBeforeId: undefined, reportAfterId: undefined, ...patch });
  const beforeId = query.reportBeforeId || "auto";
  const afterId = query.reportAfterId || query.runId || "auto";
  const batches = [...runs].reverse().map(run => ({ value: run.id, label: `${date(run)} · V${run.version} · ${runStatusLabel(run.status)}` }));
  return <section className="fm-qpr-scope fm-qpr-inline-filters" aria-label="报告筛选">
    <MonitoringFilterBar project={project} run={after || before} summary={catalog} hideQuestion hideSubject model={query.model} range={query.range} from={query.from} to={query.to} subject="self"
      onQuestionChange={() => undefined} onSubjectChange={() => undefined} onModelChange={model => onChange({ model })}
      onRangeChange={range => updateDates(range === "custom" ? { range } : { range, ...monitoringDateWindow(range, project.timezone) })}
      onDateWindowChange={(from, to) => updateDates({ range: "custom", from, to })} />
    <div className="fm-qpr-batch-filter" role="group" aria-label="优化前日期">
      <span>优化前</span><MonitoringSelect label="优化前批次" value={beforeId} onChange={value => onChange({ reportBeforeId: value === "auto" ? undefined : value })} options={[
        { value: "auto", label: before && beforeId === "auto" ? `最近可比批次 · ${date(before)}` : "最近可比批次" }, { value: "none", label: "暂不选择" },
        ...(beforeId !== "auto" && beforeId !== "none" && !runs.some(run => run.id === beforeId) ? [{ value: beforeId, label: "所选批次尚未读取" }] : []), ...batches,
      ]} />
    </div>
    <div className="fm-qpr-batch-filter" role="group" aria-label="优化后日期">
      <span>优化后</span><MonitoringSelect label="优化后批次" value={afterId} onChange={value => onChange({ reportAfterId: value === "auto" ? undefined : value, runId: undefined })} options={[
        { value: "auto", label: after && afterId === "auto" ? `最近完成批次 · ${date(after)}` : "最近完成批次" },
        ...(afterId !== "auto" && !runs.some(run => run.id === afterId) ? [{ value: afterId, label: "所选批次尚未读取" }] : []), ...batches,
      ]} />
    </div>
  </section>;
}
