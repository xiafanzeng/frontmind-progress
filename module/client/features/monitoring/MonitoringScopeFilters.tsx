import type { ReactNode } from "react";
import { KEYWORD_CATEGORY_OPTIONS } from "@frontmind/module-ui/keyword-categories";
import type { MonitorRun, ProjectSummary } from "../../domain";
import MonitoringFilterBar from "./MonitoringFilterBar";
import { monitoringDateWindow, shiftCalendarDate } from "./queryState";
import type { MonitoringQueryState } from "./types";
import type { MonitoringSummaryData } from "./useMonitoringDataSource";

type Props = {
  navigation?: ReactNode;
  navigationFirst?: boolean;
  project: ProjectSummary;
  query: MonitoringQueryState;
  run?: MonitorRun;
  summary?: MonitoringSummaryData;
  questions: Array<{ id: string; label: string; category?: string | null }>;
  onChange: (patch: Partial<MonitoringQueryState>) => void;
};

/** Shared scope for overview and question detail; the answer selection stays local. */
export default function MonitoringScopeFilters({ project, query, run, summary, questions, onChange, navigation, navigationFirst = false }: Props) {
  const changeFilter = (patch: Partial<MonitoringQueryState>) => onChange({ answerQuestion: undefined, answerId: undefined, fullscreen: false, ...patch });
  const changeDates = (patch: Partial<MonitoringQueryState>) => changeFilter({ runId: undefined, ...patch });
  const categoryLabel = (key: string) => KEYWORD_CATEGORY_OPTIONS.find(item => item.key === key)?.label.replace(/词$/, "问题");
  return <div className={`fm-qa-sticky-scope${navigationFirst ? " fm-overview-scope" : ""}`}>{navigationFirst && navigation}<div className="fm-qa-scope">
    <div className="fm-qa-filters">
      <MonitoringFilterBar project={project} run={run} summary={summary} hideQuestion question={query.question} model={query.model} range={query.range} from={query.from} to={query.to} subject={query.subject}
        onQuestionChange={(value) => changeFilter({ question: value })}
        onModelChange={(model) => changeFilter({ model })}
        onSubjectChange={(subject) => changeFilter({ subject })}
        onRangeChange={(range) => changeDates(range === "custom" ? { range } : { range, ...monitoringDateWindow(range, project.timezone) })}
        onDateWindowChange={(from, to) => { if (from && to && from < to) changeDates({ range: "custom", from, to }); }} />
      <div className="fm-qa-question-filters">
        <label><span>问题分类</span><select aria-label="问题分类" value={query.questionCategory || ""} onChange={(event) => changeFilter({ questionCategory: KEYWORD_CATEGORY_OPTIONS.find((item) => item.key === event.target.value)?.key, question: undefined })}><option value="">全部分类</option>{KEYWORD_CATEGORY_OPTIONS.map((item) => <option key={item.key} value={item.key}>{categoryLabel(item.key)}</option>)}</select></label>
        <label><span>监控问题</span><select aria-label="按问题筛选回答" value={query.question || ""} onChange={(event) => changeFilter({ question: event.target.value || undefined })}><option value="">全部问题（{questions.filter((item) => !query.questionCategory || item.category === query.questionCategory).length}）</option>{questions.filter((item) => !query.questionCategory || item.category === query.questionCategory).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <button type="button" className="fm-text-button" onClick={() => changeDates({ question: undefined, questionCategory: undefined, model: undefined, subject: "self", range: "7d", ...monitoringDateWindow("7d", project.timezone) })}>重置</button>
      </div>
    </div>
    <p className="fm-qa-scope-hint">筛选同时作用于概览、问题明细与引用信源 · {query.from} — {shiftCalendarDate(query.to, -1)}</p>
  </div>{!navigationFirst && navigation}</div>;
}
