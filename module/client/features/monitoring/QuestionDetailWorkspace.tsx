import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, History, Search, ScanLine } from "lucide-react";
import { KEYWORD_CATEGORY_OPTIONS } from "@frontmind/module-ui/keyword-categories";
import ModelBrandIcon from "../../components/ModelBrandIcon";
import { attemptStatusLabel, formatDateTime, runStatusLabel, type MonitorRun, type ProjectSummary, type RunAttempt } from "../../domain";
import AnswerWorkspace from "./AnswerWorkspace";
import MonitoringScopeFilters from "./MonitoringScopeFilters";
import { shiftCalendarDate } from "./queryState";
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
  onChange: (patch: Partial<MonitoringQueryState>, mode?: "push" | "replace") => void;
};

type MentionFilter = "all" | "mentioned" | "unmentioned";
const clearAnswer = { answerQuestion: undefined, answerId: undefined, fullscreen: false };
const categoryLabel = (category?: string | null) => KEYWORD_CATEGORY_OPTIONS.find((item) => item.key === category)?.label.replace(/词$/, "问题") || "未分类";
const mentionLabel = (attempt?: RunAttempt) => attempt?.brandMentioned === true ? "已提及品牌" : attempt?.brandMentioned === false ? "未提及品牌" : "提及待判定";
const sentimentLabel = (attempt?: RunAttempt) => ({ positive: "正面", neutral: "中性", negative: "负面", unknown: "未判定" }[attempt?.sentiment || "unknown"]);

export default function QuestionDetailWorkspace(props: Props) {
  return props.serverData ? <LiveQuestionDetail {...props} /> : <QuestionDetail {...props} data={previewQuestionDetailData(props.runs, props.query, props.project.timezone)} />;
}

function LiveQuestionDetail(props: Props) {
  const data = useQuestionDetailData(props.query, props.project.timezone);
  return <QuestionDetail {...props} data={data} />;
}

function QuestionDetail({ query, project, onChange, navigation, data }: Props & { data: QuestionDetailData }) {
  const [search, setSearch] = useState("");
  const [mention, setMention] = useState<MentionFilter>("all");
  const runListRef = useRef<HTMLDivElement>(null);
  const questionListRef = useRef<HTMLDivElement>(null);
  const [runScroll, setRunScroll] = useState({ left: false, right: false });
  const [snapshotOpen, setSnapshotOpen] = useState(false);
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

  useEffect(() => {
    setSearch("");
    setMention("all");
    setSnapshotOpen(false);
  }, [query.monitorId, run?.id, query.questionCategory, query.question, query.model]);

  useEffect(() => {
    if (data.loading || data.error || incomingRunPending || !run || query.answerId) return;
    const patch: Partial<MonitoringQueryState> = {};
    if (query.question && !data.questions.some((item) => item.id === query.question)) patch.question = undefined;
    if (query.model && !run.config.platforms.some((item) => item.platformId === query.model)) patch.model = undefined;
    if (Object.keys(patch).length) onChange({ ...clearAnswer, ...patch }, "replace");
  }, [data.loading, data.error, incomingRunPending, run?.id, query.answerId, query.question, query.model, onChange]);

  const scopedQuestions = data.questions.filter((question) =>
    (!query.questionCategory || question.category === query.questionCategory) &&
    (!query.question || question.id === query.question),
  );
  const questions = scopedQuestions.filter((question) => {
    if (search && !question.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false;
    const rows = attempts.filter((attempt) => attempt.questionId === question.id && (!query.model || attemptModelKey(attempt) === query.model) && attempt.status === "completed" && Boolean(attempt.answer?.trim()));
    const mentioned = rows.some((attempt) => attempt.brandMentioned === true);
    // Missing or unfinished answers are not evidence of 'not mentioned'.
    const unmentioned = rows.length > 0 && rows.every((attempt) => attempt.brandMentioned === false);
    return mention === "all" || (mention === "mentioned" ? mentioned : unmentioned);
  });
  useEffect(() => {
    if (linked?.id === query.answerId && linked && !questions.some((item) => item.id === linked.questionId)) {
      setSearch("");
      setMention("all");
    }
  }, [linked?.id, linked?.questionId, query.answerId, questions.map((item) => item.id).join(",")]);
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

  const selectedQuestionIndex = questions.findIndex((item) => item.id === question?.id);
  useEffect(() => {
    const list = questionListRef.current;
    const selectedButton = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !selectedButton) return;
    const top = selectedButton.offsetTop;
    if (top < list.scrollTop || top + selectedButton.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top, behavior: "smooth" });
    }
  }, [question?.id]);
  const rangedRuns = filterRunsByRange(data.runs, query.range, query.from, query.to, project.timezone);
  const pinnedRun = run && !rangedRuns.some((item) => item.id === run.id) ? run : undefined;
  const availableRuns = pinnedRun ? [pinnedRun, ...rangedRuns] : rangedRuns;
  useEffect(() => {
    const list = runListRef.current;
    if (!list) return;
    const updateScroll = () => setRunScroll({ left: list.scrollLeft > 1, right: list.scrollLeft + list.clientWidth < list.scrollWidth - 1 });
    // Trackpads retain native horizontal scrolling; a vertical wheel over this
    // rail moves it horizontally until the edge, then lets the page scroll.
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1);
      if ((delta > 0 && list.scrollLeft + list.clientWidth < list.scrollWidth - 1) || (delta < 0 && list.scrollLeft > 0)) {
        event.preventDefault();
        list.scrollLeft += delta;
      }
    };
    const resize = new ResizeObserver(updateScroll);
    resize.observe(list);
    list.addEventListener("scroll", updateScroll);
    list.addEventListener("wheel", wheel, { passive: false });
    updateScroll();
    return () => { resize.disconnect(); list.removeEventListener("scroll", updateScroll); list.removeEventListener("wheel", wheel); };
  }, [availableRuns.map(item => item.id).join(",")]);
  useEffect(() => {
    const list = runListRef.current;
    const card = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !card) return;
    const left = card.offsetLeft;
    if (left < list.scrollLeft || left + card.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollTo({ left, behavior: "smooth" });
  }, [run?.id, availableRuns.length]);

  const selectAnswer = (attempt: RunAttempt) => onChange({ runId: run?.id, answerQuestion: attempt.questionId, answerId: attempt.id });
  const changeFilter = (patch: Partial<MonitoringQueryState>) => {
    setSearch(""); setMention("all");
    onChange({ ...clearAnswer, ...patch });
  };
  const selectionHeader = (
    <div className="fm-qa-selection">
      <div className="fm-qa-question-heading">
        <div><span>当前批次 · {formatDateTime(run?.createdAt)}</span><span>问题 {selectedQuestionIndex + 1} / {questions.length}</span></div>
        <h3>{question?.label || "请选择监控问题"}</h3>
        {selectedAnswer && <p><span className="fm-meta-pill">{categoryLabel(question?.category)}</span><span className="fm-meta-pill">{mentionLabel(selectedAnswer)}</span>{query.subject === "self" && <span className="fm-meta-pill">{sentimentLabel(selectedAnswer)}</span>}<span>品牌排名 {selectedAnswer.mentionPosition ? `第 ${selectedAnswer.mentionPosition} 位` : "—"}</span></p>}
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
      <div className="fm-qa-repetitions">
        <div role="group" aria-label="切换回答次数"><span>回答次数</span>{Array.from({ length: run?.config.repetitions || 0 }, (_, index) => {
          const repetition = index + 1;
          const attempt = modelAttempts.find((item) => item.repetition === repetition);
          return <button type="button" key={repetition} aria-pressed={selected?.repetition === repetition} disabled={!attempt} title={attempt ? attemptStatusLabel(attempt.status) : "该次回答尚未生成"} onClick={() => attempt && selectAnswer(attempt)}>第 {repetition} 次</button>;
        })}</div>
        {selected && <small><span className={`fm-attempt-state ${selected.status}`}>{attemptStatusLabel(selected.status)}</span> {formatDateTime(selected.capturedAt)} · 回答 ID：{selected.id}</small>}
      </div>
    </div>
  );

  return <section className="fm-question-detail" id="monitor-answers" aria-labelledby="monitor-tab-answers">
    <MonitoringScopeFilters project={project} query={query} run={run} questions={data.questions} onChange={changeFilter} navigation={navigation} />
    <section className="fm-qa-runs" aria-label="运行记录">
      <header><div><History size={16} /><strong>运行记录</strong><span>选择批次查看对应回答</span></div><button type="button" className="fm-text-button" disabled={!run || !ready} aria-expanded={snapshotOpen} onClick={() => setSnapshotOpen(!snapshotOpen)}><ScanLine size={14} />{snapshotOpen ? "收起配置快照" : "查看配置快照"}</button></header>
      <div className="fm-qa-run-strip"><button type="button" className="fm-icon-button" aria-label="向左滚动运行记录" disabled={!runScroll.left} onClick={() => runListRef.current?.scrollBy({ left: -360, behavior: "smooth" })}><ChevronLeft size={16} /></button><div className="fm-qa-run-list" ref={runListRef} tabIndex={0} aria-label="横向滚动运行记录">{availableRuns.map((item) => <button type="button" key={item.id} className="fm-qa-run" aria-pressed={run?.id === item.id} onClick={() => changeFilter({ runId: item.id })}><span><strong>{formatDateTime(item.createdAt)}</strong><span className={`fm-run-status ${item.status}`}>{runStatusLabel(item.status)}</span></span><small>{item.metrics.completed} / {item.metrics.expected} 已完成 · {item.trigger === "manual" ? "手动执行" : item.trigger === "catch_up" ? "补充执行" : "定时执行"}{run?.id === item.id ? " · 当前选中" : ""}</small></button>)}</div><button type="button" className="fm-icon-button" aria-label="向右滚动运行记录" disabled={!runScroll.right} onClick={() => runListRef.current?.scrollBy({ left: 360, behavior: "smooth" })}><ChevronRight size={16} /></button></div>
      {!data.loading && !availableRuns.length && <p className="fm-qa-notice">当前日期范围内没有运行记录，请调整日期范围。</p>}
      {pinnedRun && <p className="fm-qa-notice">已定位到指定历史运行；该记录位于当前日期范围或最近运行列表之外。</p>}
      {data.historyLimited && <p className="fm-qa-notice">运行列表展示最近 100 次记录；更早的记录可通过已有运行或回答链接定位。</p>}
      {snapshotOpen && run && <div className="fm-qa-snapshot"><h4>本次运行的配置快照 · V{run.version}</h4><p>{run.config.brandAliases[0] || run.config.brandName} · {data.questions.length} 个问题 · {run.config.platforms.length} 个模型 · 每模型 {run.config.repetitions} 次 · {run.config.regionLabel}</p><ol>{data.questions.map((item) => <li key={item.id}>{item.label} <small>{categoryLabel(item.category)}</small></li>)}</ol><ul>{run.config.platforms.map((item) => <li key={item.platformId}>{item.displayName} · {clientTypeLabel(item.clientType)} · {item.mode === "reasoning_search" ? "深度思考" : "联网搜索"} · 截图：{item.screenshotPolicy === 2 ? "全部回答" : item.screenshotPolicy === 1 ? "提及时" : "不采集"}</li>)}</ul></div>}
    </section>
    {data.error && <div className="fm-data-notice" role="alert">问题明细读取失败：{data.error}<button type="button" className="fm-secondary-button" onClick={data.retry}>重新读取</button></div>}
    {(data.loading || incomingRunPending) && <p className="fm-qa-notice" role="status">正在读取所选运行与回答…</p>}
    {ready && run && <div className="fm-qa-content">
      <aside className="fm-qa-question-list" aria-label="监控问题选择">
        <header><strong>监控问题</strong><small>{questions.length} 个</small></header>
        <label className="fm-qa-search"><Search size={14} /><input type="search" aria-label="搜索问题关键词" placeholder="搜索问题关键词" value={search} onChange={(event) => { setSearch(event.target.value); onChange(clearAnswer); }} /></label>
        <div className="fm-qa-mention-tabs" role="group" aria-label="按品牌提及筛选问题">{(["all", "mentioned", "unmentioned"] as const).map((value, index) => <button type="button" key={value} aria-pressed={mention === value} onClick={() => { setMention(value); onChange(clearAnswer); }}>{["全部", "已提及", "未提及"][index]}</button>)}</div>
        <div className="fm-qa-question-items" ref={questionListRef} tabIndex={0} aria-label="滚动监控问题">{questions.map((item, index) => {
          const rows = attempts.filter((attempt) => attempt.questionId === item.id && (!query.model || attemptModelKey(attempt) === query.model));
          const valid = rows.filter((attempt) => attempt.status === "completed" && attempt.answer?.trim());
          const mentioned = valid.some((attempt) => attempt.brandMentioned === true);
          const unmentioned = valid.length > 0 && valid.every((attempt) => attempt.brandMentioned === false);
          return <button type="button" className="fm-qa-question" key={item.id} aria-pressed={question?.id === item.id} onClick={() => onChange({ answerQuestion: item.id, answerId: undefined, fullscreen: false })}><span>{String(index + 1).padStart(2, "0")}</span><span><strong>{item.label}</strong><small>{categoryLabel(item.category)} · {new Set(valid.map(attemptModelKey)).size} / {query.model ? 1 : run.config.platforms.length} 模型</small><em>{mentioned ? "已提及" : unmentioned ? "未提及" : "待判定"}</em></span></button>;
        })}</div>
        {!questions.length && <p className="fm-qa-notice">没有符合条件的问题。</p>}
        <footer><small>共 {questions.length} 个问题</small><small>滚动查看更多</small></footer>
      </aside>
      <div className="fm-qa-answer">
        {selectedAnswer ? <AnswerWorkspace attempts={modelAttempts} selected={selectedAnswer} fullscreen={query.fullscreen} onSelect={selectAnswer} onFullscreenChange={(fullscreen) => onChange({ fullscreen })} sourceScope={query.sourceScope} onSourceScopeChange={(sourceScope) => onChange({ sourceScope })} scopeKey={`${run.id}:${question?.id}:${selectedModel}:${query.subject}`} showSentiment={query.subject === "self"} detailLayout selectionHeader={selectionHeader} totalAnswers={modelAttempts.filter((attempt) => attempt.status === "completed" && attempt.answer?.trim()).length} /> : <div className="fm-qa-empty-answer">{selectionHeader}<p>{query.answerId ? "指定回答不在本次运行中，或已无法读取。" : question ? "该问题在所选模型下尚无回答记录。" : "请调整筛选条件后选择问题。"}</p>{query.answerId && <button type="button" className="fm-secondary-button" onClick={() => onChange({ answerId: undefined, fullscreen: false })}>查看当前问题的可用回答</button>}</div>}
      </div>
    </div>}
    <p className="fm-qa-footnote">{query.from} 至 {shiftCalendarDate(query.to, -1)} · 问题、模型与回答次数取自选中运行的配置快照。</p>
  </section>;
}
