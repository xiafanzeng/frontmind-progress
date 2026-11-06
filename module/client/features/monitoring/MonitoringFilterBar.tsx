import MonitoringSelect from "../../components/MonitoringSelect";
import MonitoringDatePicker from "../../components/MonitoringDatePicker";
import { shiftCalendarDate } from "./queryState";
import type { MonitorRun, ProjectSummary } from "../../domain";
import type { MonitoringSummaryData } from "./useMonitoringDataSource";
import {
  attemptModelKey,
  attemptModelLabel,
  clientTypeLabel,
  type DateRange,
  type MonitoringSubject,
} from "./types";

type MonitoringFilterBarProps = {
  project: ProjectSummary;
  run?: MonitorRun;
  summary?: MonitoringSummaryData;
  question?: string;
  hideQuestion?: boolean;
  hideSubject?: boolean;
  model?: string;
  range: DateRange;
  from: string;
  to: string;
  subject: MonitoringSubject;
  onQuestionChange: (value?: string) => void;
  onModelChange: (value?: string) => void;
  onRangeChange: (value: DateRange) => void;
  onDateWindowChange: (from: string, to: string) => void;
  onSubjectChange: (value: MonitoringSubject) => void;
};

export default function MonitoringFilterBar({
  project,
  run,
  summary,
  question,
  hideQuestion = false,
  hideSubject = false,
  model,
  range,
  from,
  to,
  subject,
  onQuestionChange,
  onModelChange,
  onRangeChange,
  onDateWindowChange,
  onSubjectChange,
}: MonitoringFilterBarProps) {
  const questions = summary
    ? summary.filters.questions.map((item) => [item.id, item.label] as const)
    : Array.from(
        new Map(
          run?.attempts.map((attempt) => [
            attempt.questionId,
            attempt.question,
          ]) || [],
        ),
      );
  const models = summary
    ? summary.filters.platforms.map((item) => ({
        key: item.id,
        label: `${item.displayName}（${clientTypeLabel(item.clientType)}）`,
      }))
    : Array.from(
        new Map(
          run?.attempts.map((attempt) => [attemptModelKey(attempt), attempt]) ||
            [],
        ),
      ).map(([key, attempt]) => ({ key, label: attemptModelLabel(attempt) }));
  const subjects = summary
    ? summary.filters.subjects.map((item) => ({
        value:
          item.kind === "self"
            ? ("self" as const)
            : (`competitor:${item.name}` as const),
        label: `${item.kind === "self" ? "本品" : "竞品"} · ${item.label.replace(/^(本品|竞品)\s*[·：:]\s*/u, "")}`,
      }))
    : [
        {
          value: "self" as const,
          label: `本品 · ${run?.config.brandName || "监控品牌待读取"}`,
        },
        ...(run?.config.competitors || []).map((competitor) => ({
          value: `competitor:${competitor.name}` as const,
          label: `竞品 · ${competitor.name}`,
        })),
      ];

  return (
    <section className="fm-filter-bar" aria-label="监控数据筛选">
      {!hideSubject && <label>
        <span>品牌主体</span>
        <select
          aria-label="品牌主体"
          value={subject}
          onChange={(event) =>
            onSubjectChange(event.target.value as MonitoringSubject)
          }
        >
          {subjects.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>}
      {!hideQuestion && (
        <label>
          <span>问题</span>
          <select
            aria-label="按问题筛选回答"
            value={question || ""}
            disabled={!questions.length}
            onChange={(event) =>
              onQuestionChange(event.target.value || undefined)
            }
          >
            <option value="">全部问题</option>
            {questions.map(([questionId, questionLabel]) => (
              <option key={questionId} value={questionId}>
                {questionLabel}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="fm-model-filter" role="group" aria-label="模型筛选">
        <span>模型</span>
        <MonitoringSelect label="按模型筛选回答" value={model || ""} onChange={value => onModelChange(value || undefined)}
          options={[{ value: "", label: "全部模型" }, ...(model && !models.some(item => item.key === model) ? [{ value: model, label: "所选模型（当前无记录）" }] : []), ...models.map(item => ({ value: item.key, label: item.label }))]} />
      </div>
      <div className="fm-date-filter" role="group" aria-label="日期筛选">
        <span>日期</span>
        <MonitoringDatePicker from={from} to={shiftCalendarDate(to, -1)} range={range} timezone={project.timezone}
          onApply={(nextFrom, nextTo, nextRange) => {
            if (nextRange === "custom") onDateWindowChange(nextFrom, shiftCalendarDate(nextTo, 1));
            else onRangeChange(nextRange);
          }} />
      </div>
    </section>
  );
}
