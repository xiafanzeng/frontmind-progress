import type { ReactNode } from "react";
import type { MonitorRun, ProjectSummary } from "../../domain";
import MonitoringFilterBar from "./MonitoringFilterBar";
import { monitoringDateWindow } from "./queryState";
import type { MonitoringQueryState } from "./types";
import type { MonitoringSummaryData } from "./useMonitoringDataSource";

type Props = {
  navigation?: ReactNode;
  questionsCategoryScoped?: boolean;
  project: ProjectSummary;
  query: MonitoringQueryState;
  run?: MonitorRun;
  summary?: MonitoringSummaryData;
  questions: Array<{ id: string; label: string; category?: string | null }>;
  onChange: (patch: Partial<MonitoringQueryState>) => void;
};

/** Shared scope for overview and question detail; the answer selection stays local. */
export default function MonitoringScopeFilters({ project, query, run, summary, onChange, navigation }: Props) {
  const changeFilter = (patch: Partial<MonitoringQueryState>) => onChange({ answerQuestion: undefined, answerId: undefined, fullscreen: false, ...patch });
  const changeDates = (patch: Partial<MonitoringQueryState>) => changeFilter({ runId: undefined, ...patch });
  // Only the overview/detail view tabs opt in; report filters keep their existing layout.
  return <div className={`fm-qa-sticky-scope${navigation ? " fm-monitor-scope" : ""}`}><div className="fm-qa-scope">
    <div className="fm-qa-filters">
      <MonitoringFilterBar project={project} run={run} summary={summary} hideQuestion hideSubject question={query.question} model={query.model} range={query.range} from={query.from} to={query.to} subject={query.subject}
        onQuestionChange={(value) => changeFilter({ question: value })}
        onModelChange={(model) => changeFilter({ model })}
        onSubjectChange={(subject) => changeFilter({ subject })}
        onRangeChange={(range) => changeDates(range === "custom" ? { range } : { range, ...monitoringDateWindow(range, project.timezone) })}
        onDateWindowChange={(from, to) => { if (from && to && from < to) changeDates({ range: "custom", from, to }); }} />
      <button type="button" className="fm-text-button fm-question-reset" onClick={() => changeDates({ model: undefined, subject: "self", range: "7d", ...monitoringDateWindow("7d", project.timezone) })}>重置</button>

    </div>
  </div>{navigation}</div>;
}
