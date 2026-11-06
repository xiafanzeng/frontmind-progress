import MonitoringSelect from "../../components/MonitoringSelect";
import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { KEYWORD_CATEGORY_OPTIONS } from "@frontmind/module-ui/keyword-categories";
import ModelBrandIcon from "../../components/ModelBrandIcon";
import { attemptStatusLabel, formatDateTime, runStatusLabel, type MonitorRun, type ProjectSummary, type RunAttempt } from "../../domain";
import AnswerWorkspace from "./AnswerWorkspace";
import MonitoringScopeFilters from "./MonitoringScopeFilters";
import { filterRunsByRange, projectAttemptsForRunSubject } from "./selectors";
import { attemptModelKey, clientTypeLabel, type MonitoringQueryState } from "./types";
import { previewQuestionDetailData, useQuestionDetailData, type QuestionDetailData } from "./useQuestionDetailData";
import "./question-detail.css";

type Props = {
  query: MonitoringQueryState;
  project: ProjectSummary;
  runs: MonitorRun[];
  serverData: boolean;
  navigation: ReactNode;
  header?: ReactNode;
  onChange: (patch: Partial<MonitoringQueryState>, mode?: "push" | "replace") => void;
};

const clearAnswer = { answerQuestion: undefined, answerId: undefined, fullscreen: false };
const categoryLabel = (category?: string | null) => KEYWORD_CATEGORY_OPTIONS.find((item) => item.key === category)?.label.replace(/词$/, "问题") || "未分类";
const mentionLabel = (attempt?: RunAttempt) => attempt?.brandMentioned === true ? "已提及品牌" : attempt?.brandMentioned === false ? "未提及品牌" : "提及待判定";
const sentimentLabel = (attempt?: RunAttempt) => ({ positive: "正面", neutral: "中性", negative: "负面", unknown: "标签缺失" }[attempt?.sentiment || "unknown"]);

export default function QuestionDetailWorkspace(props: Props) {
  return props.serverData ? <LiveQuestionDetail {...props} /> : <QuestionDetail {...props} data={previewQuestionDetailData(props.runs, props.query, props.project.timezone)} />;
}

function LiveQuestionDetail(props: Props) {
  const data = useQuestionDetailData(props.query, props.project.timezone);
  return <QuestionDetail {...props} data={data} />;
}

function QuestionDetail({ query, project, onChange, navigation, header, data }: Props & { data: QuestionDetailData }) {
  const run = data.run;
  const linked = data.linkedAnswer;
  const subject = query.subject.startsWith("competitor:")
    ? { name: query.subject.slice("competitor:".length), aliases: [] }
    : "self" as const;
  const attempts = run ? projectAttemptsForRunSubject(run.attempts, subject, run.config.competitors) : [];
  const incomingRunPending = Boolean(linked?.runId && linked.runId !== run?.id);

  // A link from a source, sentiment insight or report may point beyond the
  // history list. Preserve its identity until the matching snapshot arrives.
  useEffect(() => {
    if (!linked || !query.answerId || linked.id !== query.answerId) return;
    const patch: Partial<MonitoringQueryState> = {};
    if (linked.runId && linked.runId !== query.runId) patch.runId = linked.runId;
    if (linked.questionId !== query.answerQuestion) patch.answerQuestion = linked.questionId;
    if (query.question && linked.questionId !== query.question) patch.question = linked.questionId;
    if (query.questionCategory && linked.questionCategory !== query.questionCategory) patch.questionCategory = linked.questionCategory || undefined;
    if (query.model && attemptModelKey(linked) !== query.model) patch.model = attemptModelKey(linked);
    if (Object.keys(patch).length) onChange(patch, "replace");
  }, [linked?.id, linked?.runId, query.runId, query.answerId, query.answerQuestion, query.question, query.questionCategory, query.model, onChange]);

  // A question missing from an old run must show an empty state, never another question.
  const questions = data.questions.filter(question => query.question && question.id === query.question);
  const question = questions.find((item) => item.id === query.answerQuestion) || questions[0];
  const questionAttempts = attempts.filter((attempt) => attempt.questionId === question?.id && (!query.model || attemptModelKey(attempt) === query.model));
  const requested = questionAttempts.find((attempt) => attempt.id === query.answerId);
  const selected = requested || (query.answerId ? undefined : questionAttempts.find((attempt) => attempt.status === "completed" && attempt.answer?.trim()) || questionAttempts[0]);
  const selectedModel = selected ? attemptModelKey(selected) : query.model || run?.config.platforms[0]?.platformId;
  const modelAttempts = questionAttempts.filter((attempt) => attemptModelKey(attempt) === selectedModel).sort((a, b) => a.repetition - b.repetition);
  const selectedAnswer = selected && linked?.id === selected.id ? { ...selected, ...linked, capturedAt: selected.capturedAt || linked.capturedAt } : selected;
  const ready = !data.loading && !data.error && !incomingRunPending;

  useEffect(() => {
    if (!ready || !run || query.answerId) return;
    const patch = {
      runId: run.id,
      answerQuestion: question?.id,
      answerId: selected?.id,
    };
    if (patch.runId !== query.runId || patch.answerQuestion !== query.answerQuestion || patch.answerId !== query.answerId) onChange(patch, "replace");
  }, [ready, run?.id, question?.id, selected?.id, query.runId, query.answerQuestion, query.answerId, onChange]);

  const rangedRuns = filterRunsByRange(data.runs, query.range, query.from, query.to, project.timezone);
  const pinnedRun = run && !rangedRuns.some((item) => item.id === run.id) ? run : undefined;
  const availableRuns = pinnedRun ? [pinnedRun, ...rangedRuns] : rangedRuns;
  const selectAnswer = (attempt: RunAttempt) => onChange({ runId: run?.id, answerQuestion: attempt.questionId, answerId: attempt.id });
  const changeFilter = (patch: Partial<MonitoringQueryState>) => {
    onChange({ ...clearAnswer, ...patch });
  };
  const answerControls = (
      <div className="fm-qa-repetitions">
        <div role="group" aria-label="切换回答次数"><span>回答次数</span>
          <button type="button" aria-label="上一次回答" disabled={!selected || !modelAttempts.some(item => item.repetition < selected.repetition)} onClick={() => {
            const previous = modelAttempts.filter(item => item.repetition < (selected?.repetition ?? 0)).sort((a, b) => b.repetition - a.repetition)[0];
            if (previous) selectAnswer(previous);
          }}><ChevronLeft size={16} /></button>
          <span aria-live="polite">{selected?.repetition ?? "—"} / {run?.config.repetitions || 0}</span>
          <button type="button" aria-label="下一次回答" disabled={!selected || !modelAttempts.some(item => item.repetition > selected.repetition)} onClick={() => {
            const next = modelAttempts.filter(item => item.repetition > (selected?.repetition ?? 0)).sort((a, b) => a.repetition - b.repetition)[0];
            if (next) selectAnswer(next);
          }}><ChevronRight size={16} /></button>
        </div>
        {selected && <small><span className={`fm-attempt-state ${selected.status}`}>{attemptStatusLabel(selected.status)}</span> {formatDateTime(selected.capturedAt)}</small>}
      </div>
  );
  const selectionHeader = (
    <div className="fm-qa-selection">
      <div className="fm-qa-inline-history">
        <strong title={question?.label || selectedAnswer?.question}>{question?.label || selectedAnswer?.question || "监控问题"}</strong>
        <div className="fm-history-picker"><History size={14} /><span>运行记录</span><MonitoringSelect label="选择运行记录" value={run?.id || ""} onChange={value => changeFilter({ runId: value })}
          options={availableRuns.map(item => ({ value: item.id, label: `${formatDateTime(item.createdAt)} · ${item.trigger === "manual" ? "手动" : "自动"} · ${runStatusLabel(item.status)}` }))} /></div>
      </div>
      {pinnedRun && <p className="fm-qa-notice">正在查看日期范围外的历史记录。</p>}
      {data.historyLimited && <p className="fm-qa-notice">显示最近 100 次运行。</p>}
      <div className="fm-qa-question-heading">
        {selectedAnswer && <p><span className="fm-meta-pill">{categoryLabel(question?.category)}</span><span className="fm-meta-pill">{mentionLabel(selectedAnswer)}</span><span className="fm-meta-pill">{sentimentLabel(selectedAnswer)}</span><span>品牌排名 {selectedAnswer.mentionPosition ? `第 ${selectedAnswer.mentionPosition} 位` : "—"}</span></p>}
      </div>
      <div className="fm-qa-models" role="group" aria-label="切换回答模型">
        {(run?.config.platforms || []).filter((platform) => !query.model || platform.platformId === query.model).map((platform) => {
          const siblings = questionAttempts.filter((attempt) => attemptModelKey(attempt) === platform.platformId);
          return <button type="button" key={platform.platformId} aria-pressed={selectedModel === platform.platformId} disabled={!siblings.length} onClick={() => {
            const next = siblings.find((attempt) => attempt.repetition === selected?.repetition) || siblings[0];
            if (next) selectAnswer(next);
          }}><ModelBrandIcon code={platform.providerCode} name={platform.displayName} />{platform.displayName}<small>{clientTypeLabel(platform.clientType)}</small>{platform.mode === "reasoning_search" && <small>深度思考</small>}</button>;
        })}
      </div>
    </div>
  );

  return <section className="fm-question-detail" id="monitor-answers" aria-labelledby="monitor-tab-answers">
    <div className="fm-question-topbar">{header}<MonitoringScopeFilters project={project} query={query} run={run} questions={data.questions} onChange={changeFilter} navigation={navigation} /></div>
    {data.error && <div className="fm-data-notice" role="alert">问题明细读取失败：{data.error}<button type="button" className="fm-secondary-button" onClick={data.retry}>重新读取</button></div>}
    {(data.loading || incomingRunPending) && <p className="fm-qa-notice" role="status">正在读取所选运行与回答…</p>}
    {ready && run && <div className="fm-qa-content">
      <div className="fm-qa-answer">
        {selectedAnswer ? <AnswerWorkspace attempts={modelAttempts} selected={selectedAnswer} fullscreen={query.fullscreen} onSelect={selectAnswer} onFullscreenChange={(fullscreen) => onChange({ fullscreen })} sourceScope={query.sourceScope} onSourceScopeChange={(sourceScope) => onChange({ sourceScope })} scopeKey={`${run.id}:${question?.id}:${selectedModel}:${query.subject}`} showSentiment detailLayout selectionHeader={selectionHeader} answerControls={answerControls} totalAnswers={modelAttempts.filter((attempt) => attempt.status === "completed" && attempt.answer?.trim()).length} /> : <div className="fm-qa-empty-answer">{selectionHeader}<p>{query.answerId ? "指定回答不在本次运行中，或已无法读取。" : question ? "该问题在所选模型下尚无回答记录。" : "当前问题在这次运行中没有记录，请选择其他运行。"}</p>{query.answerId && <button type="button" className="fm-secondary-button" onClick={() => onChange({ answerId: undefined, fullscreen: false })}>查看当前问题的可用回答</button>}</div>}
      </div>
    </div>}
    {ready && !run && <div className="fm-qa-empty-answer"><p>该日期范围内没有回答记录，请调整日期。</p></div>}
  </section>;
}
