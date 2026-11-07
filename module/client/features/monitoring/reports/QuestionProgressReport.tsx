import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, BarChart3, Clock3, RefreshCw, Target, TrendingUp, Trophy } from "lucide-react";
import { type MonitorRun, type ProjectSummary, type RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import { rangeBounds } from "../overview/overviewModel";
import { questionCategoryLabel } from "../ProjectQuestionSidebar";
import { reportAttempts, validAnswers } from "./reportModel";
import ReportAnswerEvidence from "./ReportAnswerEvidence";
import ReportAnswerSample from "./ReportAnswerSample";
import ReportConfiguration from "./ReportConfiguration";
import ReportKnowledge from "./ReportKnowledge";
import ReportMetricDetail from "./ReportMetricDetail";
import ReportTrend from "./ReportTrend";
import { compactMeasurement } from "./reportPresentation";
import { questionRankComparisons, measureQuestion, measurementChange, measurementText, questionComparisonReason, questionReportMetrics, questionReportPhases, reportPlatformKey, reportPlatformLabel } from "./questionReportModel";

export type QuestionProgressReportProps = {
  project: ProjectSummary;
  query: MonitoringQueryState;
  catalog?: MonitoringSummaryData;
  questions: Array<{ id: string; label: string; category?: string | null }>;
  runs: MonitorRun[];
  serverData: boolean;
  onChange: (patch: Partial<MonitoringQueryState>) => void;
  renderRun: (runId?: string) => ReactNode;
};
export type QuestionReportData = {
  runs: MonitorRun[]; loading: boolean; error?: string; limited: boolean; more: boolean;
  loadMore: () => void; refreshing: boolean; refresh: () => Promise<void>;
};

type Side = "before" | "after";
const metricIcons = { mentionRate: Target, top3Rate: Trophy, averagePosition: BarChart3, positiveRate: TrendingUp };
const phaseIcons = { before: Clock3, compare: ArrowLeftRight, after: BarChart3 };

export default function QuestionProgressReport({ project, query, catalog, questions, onChange, serverData, data }: QuestionProgressReportProps & { data: QuestionReportData }) {
  const [highlight, setHighlight] = useState(true);
  const [platform, setPlatform] = useState("");
  const [beforeAnswer, setBeforeAnswer] = useState("");
  const [afterAnswer, setAfterAnswer] = useState("");
  const [evidence, setEvidence] = useState<{ id: string; side: Side }>();
  const [refreshError, setRefreshError] = useState("");
  const root = useRef<HTMLElement>(null);
  const evidenceRef = useRef<HTMLElement>(null);
  const deepLink = useRef(typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("optimizationAnswer") || "");
  const linkedSelection = useRef<{ id: string; questionId: string; runId: string; platform: string } | undefined>(undefined);
  const metric = query.reportMetric || "mentionRate";
  const phase = query.reportPhase || "compare";
  const definition = questionReportMetrics.find(item => item.key === metric)!;
  const runs = [...data.runs].filter(run => run.monitorId === query.monitorId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const requestedAfter = query.reportAfterId || query.runId;
  const after = requestedAfter ? runs.find(run => run.id === requestedAfter) : [...runs].reverse().find(run => run.status === "completed") || runs.at(-1);
  const questionCatalog = [...new Map([
    ...questions,
    ...runs.flatMap(run => run.attempts.map(attempt => ({ id: attempt.questionId, label: attempt.question, category: attempt.questionCategory }))),
    ...(after?.attempts || []).map(attempt => ({ id: attempt.questionId, label: attempt.question, category: attempt.questionCategory })),
  ].map(question => [question.id, question])).values()];
  // A requested question missing from loaded history must not silently become another question.
  const questionId = query.question || query.reportQuestionId || after?.attempts[0]?.questionId || questionCatalog[0]?.id;
  const question = questionCatalog.find(item => item.id === questionId);
  const scopeQuery = { ...query, question: questionId, questionCategory: undefined };
  const before = query.reportBeforeId === "none" ? undefined : query.reportBeforeId ? runs.find(run => run.id === query.reportBeforeId) : [...runs].reverse().find(run => !questionComparisonReason(run, after, scopeQuery, questionId));
  const priorAttempts = questionId ? reportAttempts(before, scopeQuery, questionId) : [];
  const currentAttempts = questionId ? reportAttempts(after, scopeQuery, questionId) : [];
  const self = query.subject === "self";
  const beforeMetric = measureQuestion(priorAttempts, metric, self);
  const afterMetric = measureQuestion(currentAttempts, metric, self);
  const reason = data.loading ? "正在读取所选运行快照，暂不输出变化。" : data.error || refreshError ? "数据读取存在错误，暂不输出变化。" : questionComparisonReason(before, after, scopeQuery, questionId);
  const rankRows = metric === "averagePosition" ? questionRankComparisons(phase === "after" ? [] : priorAttempts, phase === "before" ? [] : currentAttempts) : [];
  const change = metric === "averagePosition" && rankRows.length === 1
    ? measurementChange(rankRows[0]!.before, rankRows[0]!.after, metric, reason || rankRows[0]!.reason)
    : metric === "averagePosition" && !reason && rankRows.length > 1
      ? { title: "逐条排名对照", description: "按相同采集条件和回答序号查看下方排名变化。" }
      : measurementChange(beforeMetric, afterMetric, metric, reason);
  const date = (run?: MonitorRun) => run ? new Intl.DateTimeFormat("zh-CN", { timeZone: project.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(run.createdAt)) : "尚未选择批次";
  const sampleAttempts = phase === "before" ? priorAttempts : phase === "after" ? currentAttempts : [...priorAttempts, ...currentAttempts];
  const platformOptions = [...new Map(sampleAttempts.map(attempt => [reportPlatformKey(attempt), reportPlatformLabel(attempt)])).entries()];
  const selectedPlatform = platformOptions.some(([key]) => key === platform) ? platform : platformOptions[0]?.[0];
  const priorSamples = validAnswers(priorAttempts).filter(attempt => reportPlatformKey(attempt) === selectedPlatform);
  const currentSamples = validAnswers(currentAttempts).filter(attempt => reportPlatformKey(attempt) === selectedPlatform);
  const selectedBefore = priorSamples.find(item => item.id === beforeAnswer) || priorSamples[0];
  const selectedAfter = currentSamples.find(item => item.id === afterAnswer) || currentSamples[0];
  const evidenceAttempt = evidence ? (evidence.side === "before" ? priorAttempts : currentAttempts).find(attempt => attempt.id === evidence.id) : undefined;
  const evidenceRun = evidence?.side === "before" ? before : after;
  const displayedSides: Side[] = phase === "compare" ? ["before", "after"] : [phase];
  const changeReport = (patch: Partial<MonitoringQueryState>) => onChange({ reportMonitorId: query.monitorId, questionCategory: undefined, ...patch });
  const changeScope = (patch: Partial<MonitoringQueryState>) => changeReport({ answerId: undefined, answerQuestion: undefined, fullscreen: false, ...patch });
  const openEvidence = (attempt: RunAttempt, side: Side) => setEvidence({ id: attempt.id, side });
  const bounds = rangeBounds(query, project.timezone);
  const pinnedOutside = [before, after].filter((run): run is MonitorRun => Boolean(run)).filter(run => Date.parse(run.createdAt) < bounds.from || Date.parse(run.createdAt) >= bounds.to);

  useEffect(() => { if (query.questionCategory) onChange({ questionCategory: undefined }); }, [query.questionCategory, onChange]);
  useEffect(() => {
    const linked = linkedSelection.current;
    const matched = linked && linked.questionId === questionId && linked.runId === after?.id ? linked : undefined;
    setPlatform(matched?.platform || ""); setBeforeAnswer(""); setAfterAnswer(matched?.id || ""); setEvidence(undefined);
  }, [questionId, before?.id, after?.id, query.model, query.subject, phase]);
  useEffect(() => {
    const target = deepLink.current;
    if (!target) return;
    const run = runs.find(item => item.attempts.some(attempt => attempt.id === target));
    const attempt = run?.attempts.find(item => item.id === target);
    if (!run || !attempt) return;
    deepLink.current = "";
    linkedSelection.current = { id: attempt.id, questionId: attempt.questionId, runId: run.id, platform: reportPlatformKey(attempt) };
    setPlatform(reportPlatformKey(attempt)); setAfterAnswer(attempt.id);
    onChange({ question: undefined, reportQuestionId: attempt.questionId, questionCategory: undefined, reportMonitorId: query.monitorId, reportAfterId: run.id, reportPhase: "after" });
  }, [data.runs, onChange, query.monitorId]);
  useEffect(() => { if (evidenceAttempt) evidenceRef.current?.focus({ preventScroll: false }); }, [evidenceAttempt?.id, evidence?.side]);
  useEffect(() => { if (typeof window !== "undefined" && window.location.hash === "#question-optimization") root.current?.focus({ preventScroll: true }); }, []);

  const trendUnavailable = data.loading ? "正在读取运行快照…" : data.error || refreshError ? "读取存在错误，暂不绘制趋势。" : undefined;

  return <section id="question-optimization" ref={root} tabIndex={-1} className="fm-progress-report fm-question-progress-report" aria-label="问题进度报告">
    <header className="fm-pr-header fm-qpr-report-header">
      <div className="fm-qpr-report-title">
        <h2>{question?.label || (query.monitorId ? questionId ? "所选问题尚未读取" : "请先选择具体问题" : "问题进度报告")}</h2>
        {query.monitorId && <div className="fm-qpr-report-meta"><span>{questionCategoryLabel(question?.category ?? questions.find(item => item.id === questionId)?.category)}</span><span>{phase === "compare" ? `有效回答：前 ${beforeMetric.effective} / 后 ${afterMetric.effective}` : `有效回答 ${(phase === "before" ? beforeMetric : afterMetric).effective} 条`}</span></div>}
      </div>
      <button type="button" disabled={data.refreshing} onClick={() => { setRefreshError(""); void data.refresh().catch(() => setRefreshError("刷新失败，请重试。")); }}><RefreshCw size={15} aria-hidden="true" /> {data.refreshing ? "正在刷新…" : "刷新数据"}</button></header>
    <ReportConfiguration project={project} query={query} catalog={catalog} runs={runs} before={before} after={after} date={date} onChange={changeScope} />
    <div className="fm-qpr-load-state"><p role="status">{data.loading ? "正在读取运行快照…" : `已读取 ${runs.length} 个批次`} · 时区 {project.timezone}{data.more && <button type="button" disabled={data.loading} onClick={data.loadMore}>继续加载批次</button>}</p>
      {data.limited && <p className="fm-pr-warning">批次列表仅返回最近 100 批，所选范围可能不完整。</p>}
      {(data.error || refreshError) && <p className="fm-pr-warning" role="alert">读取失败：{data.error || refreshError}。已缓存结果仅供查看，暂不输出变化。</p>}
      {pinnedOutside.length > 0 && <p>所选批次中有 {new Set(pinnedOutside.map(run => run.id)).size} 个在日期范围外，已按明确选择保留。</p>}
      {deepLink.current && !data.loading && <p className="fm-pr-warning">链接中的回答尚未在已读取批次中找到，请继续加载；当前报告显示所选问题。</p>}
    </div>
    <nav className="fm-qpr-phases" aria-label="报告阶段">{questionReportPhases.map(item => { const Icon = phaseIcons[item.key]; return <button type="button" key={item.key} aria-pressed={phase === item.key} onClick={() => changeReport({ reportPhase: item.key })}><span className="fm-qpr-phase-icon"><Icon size={20} aria-hidden="true" /></span><span><b>{item.label}</b><small>{item.description}</small></span></button>; })}</nav>
    {!query.monitorId ? <p className="fm-pr-empty">请先从左侧选择具体问题。</p> : <>
      {!self && <p className="fm-pr-warning">当前指标以主品牌为对象。<button type="button" onClick={() => changeScope({ subject: "self" })}>切换本品</button></p>}
      {!question && <p className="fm-pr-empty">{data.loading ? "正在读取问题与运行快照…" : questionId ? "当前已读取范围没有这个问题，请继续加载或重新选择。" : "暂无问题，请先在问题监控中配置并采集。"}</p>}
      <nav className="fm-qpr-metric-cards" aria-label="评估指标">{questionReportMetrics.map(item => {
        const Icon = metricIcons[item.key];
        const prior = measureQuestion(priorAttempts, item.key, self), current = measureQuestion(currentAttempts, item.key, self);
        const observed = phase === "before" ? prior : current;
        const slots = item.key === "averagePosition" ? questionRankComparisons(priorAttempts, currentAttempts) : [];
        const cardChange = item.key === "averagePosition" && slots.length === 1
          ? measurementChange(slots[0]!.before, slots[0]!.after, item.key, reason || slots[0]!.reason).title
          : item.key === "averagePosition" && !reason && slots.length > 1 ? "逐条排名对照" : measurementChange(prior, current, item.key, reason).title;
        return <button type="button" key={item.key} className={`fm-qpr-metric-card is-${item.key}`} aria-pressed={metric === item.key} onClick={() => changeReport({ reportMetric: item.key })}>
          <span className="fm-qpr-card-label"><Icon size={17} aria-hidden="true" />{item.label}</span>
          {phase === "compare" ? <><span className="fm-qpr-card-pair"><span>{compactMeasurement(prior, item.key)}</span><span aria-hidden="true">→</span><b>{compactMeasurement(current, item.key)}</b></span><span className="fm-qpr-card-change">{cardChange}</span><small>有效回答：前 {prior.effective} / 后 {current.effective}</small></> : <><strong className="fm-qpr-card-value">{compactMeasurement(observed, item.key)}</strong><small>{observed.coverage}</small></>}
        </button>;
      })}</nav>
      {phase === "compare" ? <>
        <section className="fm-qpr-panel"><header className="fm-qpr-section-heading"><div><h3>{definition.title}</h3><p>{definition.rule}</p></div></header>
          <div className="fm-qpr-period-values">{displayedSides.map(side => { const measured = side === "before" ? beforeMetric : afterMetric; return <div key={side} className={`is-${side}`}><small>{side === "before" ? "优化前基准" : "优化后复测"}</small><strong>{compactMeasurement(measured, metric)}</strong><p>{measured.basis}</p><small>{measured.coverage}</small>{measured.missing && <small>{measured.missing}</small>}</div>; })}</div>
          <div className="fm-qpr-change"><b>{change.title}</b><span>{change.description}</span></div>
        </section>
        <ReportTrend key={`${questionId}:${metric}:${query.model || ""}`} runs={runs} query={scopeQuery} questionId={questionId} metric={metric} before={before} after={after} timezone={project.timezone} date={date} unavailable={trendUnavailable} />
      </> : <ReportMetricDetail attempts={phase === "before" ? priorAttempts : currentAttempts} metric={metric} enabled={self} period={phase === "before" ? "优化前" : "优化后"} />}
      <section className="fm-qpr-panel"><header className="fm-qpr-section-heading"><div><h3>不同平台的表现</h3></div></header>
        <div className="fm-pr-table fm-qpr-table"><table><thead><tr><th>平台 / 采集条件</th>{displayedSides.map(side => <th key={side}>{side === "before" ? "优化前" : "优化后"}</th>)}{phase === "compare" && <th>变化</th>}</tr></thead><tbody>{metric === "averagePosition" ? rankRows.map(row => <tr key={row.key}><th scope="row">{row.label}</th>{displayedSides.map(side => <td key={side}><b>{measurementText(row[side].value, metric)}</b>{row[side].missing && <small>{row[side].missing}</small>}</td>)}{phase === "compare" && <td>{measurementChange(row.before, row.after, metric, reason || row.reason).title}</td>}</tr>) : platformOptions.map(([key, label]) => {
          const prior = measureQuestion(priorAttempts.filter(attempt => reportPlatformKey(attempt) === key), metric, self);
          const current = measureQuestion(currentAttempts.filter(attempt => reportPlatformKey(attempt) === key), metric, self);
          return <tr key={key}><th scope="row">{label}</th>{displayedSides.map(side => { const item = side === "before" ? prior : current; return <td key={side}><b>{measurementText(item.value, metric)}</b><small>{item.basis}</small><small>{item.coverage}</small>{item.missing && <small>{item.missing}</small>}</td>; })}{phase === "compare" && <td>{measurementChange(prior, current, metric, reason).title}</td>}</tr>;
        })}</tbody></table>{!platformOptions.length && <p className="fm-pr-empty">所选问题与批次暂无平台采集记录。</p>}</div>
      </section>
      <section className="fm-qpr-panel"><header className="fm-qpr-section-heading"><h3>{phase === "compare" ? "优化前后回答对照" : phase === "before" ? "基准回答" : "复测回答"}</h3><div className="fm-qpr-answer-controls">
        <label className="fm-qpr-highlight-toggle"><input type="checkbox" checked={highlight} onChange={event => setHighlight(event.target.checked)} />关键词高亮</label>
        <label className="fm-qpr-platform">平台<select aria-label="回答对照平台" value={selectedPlatform || ""} disabled={!platformOptions.length} onChange={event => { setPlatform(event.target.value); setBeforeAnswer(""); setAfterAnswer(""); setEvidence(undefined); }}>{!platformOptions.length && <option value="">暂无平台</option>}{platformOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div></header>
        <div className={`fm-qpr-answers ${phase === "compare" ? "" : "is-single"}`}>{displayedSides.map(side => <ReportAnswerSample key={side} side={side} attempts={side === "before" ? priorSamples : currentSamples} selectedId={side === "before" ? beforeAnswer : afterAnswer} onSelect={id => { if (side === "before") setBeforeAnswer(id); else setAfterAnswer(id); setEvidence(undefined); }} onEvidence={openEvidence} run={side === "before" ? before : after} date={date} highlight={highlight} />)}</div>
        {evidenceAttempt && query.monitorId && <section ref={evidenceRef} tabIndex={-1} className="fm-qpr-evidence"><header><b>{evidence?.side === "before" ? "优化前" : "优化后"}完整证据</b><button type="button" onClick={() => setEvidence(undefined)}>收起</button></header><ReportAnswerEvidence key={`${evidenceAttempt.id}:${query.subject}`} attempt={evidenceAttempt} monitorId={query.monitorId} subject={query.subject} brand={evidenceRun?.config.brandName || ""} serverData={serverData} /></section>}
      </section>
      <ReportKnowledge phase={phase} before={selectedBefore} after={selectedAfter} beforeRun={before} afterRun={after} reason={reason} change={change} onEvidence={openEvidence} />
    </>}
  </section>;
}
