import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, BarChart3, Clock3, Info, RefreshCw, Search, Target, TrendingUp, Trophy } from "lucide-react";
import { runStatusLabel, type MonitorRun, type ProjectSummary, type RunAttempt } from "../../../domain";
import ModelBrandIcon from "../../../components/ModelBrandIcon";
import MonitoringFilterBar from "../MonitoringFilterBar";
import { MonitoringMarkdown } from "../MonitoringMarkdown";
import { monitoringDateWindow } from "../queryState";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import { rangeBounds } from "../overview/overviewModel";
import { latestComparable } from "./reportInsights";
import { reportAttempts, validAnswers } from "./reportModel";
import ReportAnswerEvidence from "./ReportAnswerEvidence";
import ReportSources from "./ReportSources";
import { measureQuestion, measurementChange, measurementText, questionComparisonReason, questionReportMetrics, questionReportPhases, reportPlatformKey, reportPlatformLabel, type QuestionReportMetric, type ReportMeasurement } from "./questionReportModel";

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

function MetricCard({ side, measurement, metric, run, date }: {
  side: Side; measurement: ReportMeasurement; metric: QuestionReportMetric; run?: MonitorRun; date: (run?: MonitorRun) => string;
}) {
  return <article className={`fm-qpr-score is-${side}`}>
    <header><strong>{side === "before" ? "优化前基准" : "优化后复测"}</strong><span>{date(run)}</span></header>
    <strong className="fm-qpr-value">{measurementText(measurement.value, metric)}</strong>
    <p>{measurement.basis}</p>
    {measurement.value !== undefined && metric !== "averagePosition" && <div className="fm-qpr-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, measurement.value))}%` }} /></div>}
    <small>{measurement.coverage}</small>
    {measurement.missing && <p className="fm-pr-note">{measurement.missing}</p>}
    {run && <small>监控品牌：{run.config.brandName || "未返回"} · {runStatusLabel(run.status)}</small>}
  </article>;
}

function AnswerSample({ side, attempts, selectedId, onSelect, onEvidence, run, date }: {
  side: Side; attempts: RunAttempt[]; selectedId?: string; onSelect: (id: string) => void;
  onEvidence: (attempt: RunAttempt, side: Side) => void; run?: MonitorRun; date: (run?: MonitorRun) => string;
}) {
  const answer = attempts.find(item => item.id === selectedId) || attempts[0];
  return <article className={`fm-qpr-answer-card is-${side}`}>
    <header><div><small>{side === "before" ? "优化前" : "优化后"}</small><h4>{side === "before" ? "优化前回答" : "优化后回答"}</h4></div>{answer && <button type="button" onClick={() => onEvidence(answer, side)}>查看完整证据</button>}</header>
    {answer ? <>
      <div className="fm-qpr-answer-model"><ModelBrandIcon code={answer.platformCode} name={answer.platformName} /><div><b>{reportPlatformLabel(answer)}</b><small>{date(run)}</small></div></div>
      <label className="fm-qpr-repetition">回答记录<select aria-label={`${side === "before" ? "优化前" : "优化后"}回答记录`} value={answer.id} onChange={event => onSelect(event.target.value)}>{attempts.map(item => <option key={item.id} value={item.id}>第 {item.repetition} 次 · {item.id.slice(0, 8)}</option>)}</select></label>
      <p className="fm-qpr-snapshot-question">采集问题：{answer.question}</p>
      <div className="fm-pr-answer"><MonitoringMarkdown attempt={answer} markdown={answer.answer || "尚无回答正文"} /></div>
      <div className="fm-qpr-answer-tags"><span>主品牌提及：{answer.brandMentioned === undefined ? "未判定" : answer.brandMentioned ? "是" : "否"}</span><span>主品牌排名：{answer.mentionPosition ?? "未知"}</span><span>主品牌情感：{({ positive: "正面", neutral: "中性", negative: "负面", unknown: "未判定" } as const)[answer.sentiment || "unknown"]}</span></div>
      <small className="fm-qpr-answer-id">回答 ID：{answer.id} · 版本 {answer.revision ?? "未知"}</small>
    </> : <p className="fm-pr-empty">该批次、问题与平台下暂无有效回答。</p>}
  </article>;
}

export default function QuestionProgressReport({ project, query, catalog, questions, onChange, renderRun, serverData, data }: QuestionProgressReportProps & { data: QuestionReportData }) {
  const [search, setSearch] = useState("");
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
  const questionId = query.reportQuestionId || query.question || after?.attempts[0]?.questionId || questionCatalog[0]?.id;
  const question = questionCatalog.find(item => item.id === questionId);
  const scopeQuery = { ...query, question: questionId, questionCategory: undefined };
  const before = query.reportBeforeId === "none" ? undefined : query.reportBeforeId ? runs.find(run => run.id === query.reportBeforeId) : latestComparable(runs, after, scopeQuery);
  const priorAttempts = questionId ? reportAttempts(before, scopeQuery, questionId) : [];
  const currentAttempts = questionId ? reportAttempts(after, scopeQuery, questionId) : [];
  const self = query.subject === "self";
  const beforeMetric = measureQuestion(priorAttempts, metric, self);
  const afterMetric = measureQuestion(currentAttempts, metric, self);
  const reason = data.loading ? "正在读取所选运行快照，暂不输出变化。" : data.error || refreshError ? "数据读取存在错误，暂不输出变化。" : questionComparisonReason(before, after, scopeQuery, questionId);
  const change = measurementChange(beforeMetric, afterMetric, metric, reason);
  const comparable = !reason;
  const date = (run?: MonitorRun) => run ? new Intl.DateTimeFormat("zh-CN", { timeZone: project.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(run.createdAt)) : "尚未选择批次";
  const sampleAttempts = phase === "before" ? priorAttempts : phase === "after" ? currentAttempts : [...priorAttempts, ...currentAttempts];
  const platformOptions = [...new Map(sampleAttempts.map(attempt => [reportPlatformKey(attempt), reportPlatformLabel(attempt)])).entries()];
  const selectedPlatform = platformOptions.some(([key]) => key === platform) ? platform : platformOptions[0]?.[0];
  const priorSamples = validAnswers(priorAttempts).filter(attempt => reportPlatformKey(attempt) === selectedPlatform);
  const currentSamples = validAnswers(currentAttempts).filter(attempt => reportPlatformKey(attempt) === selectedPlatform);
  const evidenceAttempt = evidence ? (evidence.side === "before" ? priorAttempts : currentAttempts).find(attempt => attempt.id === evidence.id) : undefined;
  const evidenceRun = evidence?.side === "before" ? before : after;
  const currentRun = phase === "before" ? before : after;
  const displayedSides: Side[] = phase === "compare" ? ["before", "after"] : [phase];
  const matchingQuestions = questionCatalog.filter(item => item.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const changeReport = (patch: Partial<MonitoringQueryState>) => onChange({ reportMonitorId: query.monitorId, questionCategory: undefined, ...patch });
  const changeScope = (patch: Partial<MonitoringQueryState>) => changeReport({ answerId: undefined, answerQuestion: undefined, fullscreen: false, ...patch });
  const changeDates = (patch: Partial<MonitoringQueryState>) => changeScope({ runId: undefined, reportBeforeId: undefined, reportAfterId: undefined, ...patch });
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

  return <section id="question-optimization" ref={root} tabIndex={-1} className="fm-progress-report fm-question-progress-report" aria-label="问题进度报告">
    <header className="fm-pr-header"><div><h2>问题进度报告</h2><p className="fm-pr-note">选择具体问题和评估指标，查看优化前、优化后与前后对比。</p></div><button type="button" disabled={data.refreshing} onClick={() => { setRefreshError(""); void data.refresh().catch(() => setRefreshError("刷新失败，请重试。")); }}><RefreshCw size={15} aria-hidden="true" /> {data.refreshing ? "正在刷新…" : "刷新数据"}</button></header>
    <nav className="fm-qpr-phases" aria-label="报告阶段">{questionReportPhases.map(item => { const Icon = phaseIcons[item.key]; return <button type="button" key={item.key} aria-pressed={phase === item.key} onClick={() => changeReport({ reportPhase: item.key })}><span className="fm-qpr-phase-icon"><Icon size={21} aria-hidden="true" /></span><span><b>{item.label}</b><small>{item.description}</small></span></button>; })}</nav>
    <div className="fm-qpr-scope"><MonitoringFilterBar project={project} run={after || before} summary={catalog} hideQuestion question={questionId} model={query.model} range={query.range} from={query.from} to={query.to} subject={query.subject}
      onQuestionChange={reportQuestionId => changeScope({ question: undefined, reportQuestionId })} onModelChange={model => changeScope({ model })} onSubjectChange={subject => changeScope({ subject })}
      onRangeChange={range => changeDates(range === "custom" ? { range } : { range, ...monitoringDateWindow(range, project.timezone) })}
      onDateWindowChange={(from, to) => { if (from && to && from < to) changeDates({ range: "custom", from, to }); }} />
      <div className="fm-qpr-batches"><label>优化前批次<select aria-label="优化前批次" value={query.reportBeforeId || "auto"} onChange={event => changeReport({ reportBeforeId: event.target.value === "auto" ? undefined : event.target.value })}><option value="auto">最近可比批次{before && !query.reportBeforeId ? ` · ${date(before)}` : ""}</option><option value="none">暂不选择</option>{query.reportBeforeId && query.reportBeforeId !== "none" && !runs.some(run => run.id === query.reportBeforeId) && <option value={query.reportBeforeId}>所选批次尚未读取</option>}{runs.map(run => <option key={run.id} value={run.id}>{date(run)} · V{run.version} · {runStatusLabel(run.status)}</option>)}</select></label><ArrowLeftRight size={16} aria-hidden="true" /><label>优化后批次<select aria-label="优化后批次" value={after?.id || requestedAfter || ""} onChange={event => changeReport({ reportAfterId: event.target.value })}>{!after && <option value={requestedAfter || ""}>{requestedAfter ? "所选批次尚未读取" : "暂无运行批次"}</option>}{runs.map(run => <option key={run.id} value={run.id}>{date(run)} · V{run.version} · {runStatusLabel(run.status)}</option>)}</select></label></div>
      <p className="fm-pr-note" role="status">{data.loading ? "正在读取运行快照…" : `已读取 ${runs.length} 个批次`} · 日期用于查找批次 · 时区 {project.timezone}{data.more && <button type="button" disabled={data.loading} onClick={data.loadMore}>继续加载批次</button>}</p>
      {data.limited && <p className="fm-pr-warning">批次列表仅返回最近 100 批。范围可能不完整；不会把未读取历史当作没有数据。</p>}
      {(data.error || refreshError) && <p className="fm-pr-warning" role="alert">读取失败：{data.error || refreshError}。已缓存结果仅供查看，暂不输出变化。</p>}
      {pinnedOutside.length > 0 && <p className="fm-pr-note">所选批次中有 {new Set(pinnedOutside.map(run => run.id)).size} 个在日期范围外，已按明确选择保留。</p>}
      {deepLink.current && !data.loading && <p className="fm-pr-warning">链接中的回答尚未在已读取批次中找到，请继续加载；当前报告显示所选问题。</p>}
    </div>
    {!query.monitorId ? <p className="fm-pr-empty">请先从监控任务列表选择一个任务。</p> : <div className="fm-qpr-layout">
      <aside className="fm-qpr-picker"><h3>选择报告内容</h3><p>先选指标，再选一个具体问题</p><h4>评估指标 · 4 项</h4><div className="fm-qpr-metrics">{questionReportMetrics.map(item => { const Icon = metricIcons[item.key]; return <button type="button" key={item.key} aria-pressed={metric === item.key} onClick={() => changeReport({ reportMetric: item.key })}><Icon size={17} aria-hidden="true" /><b>{item.label}</b><small>{item.caption}</small></button>; })}</div>
        <h4>监控问题 <small>{questionCatalog.length} 个</small></h4><label className="fm-qpr-search"><Search size={14} aria-hidden="true" /><input aria-label="搜索具体问题" placeholder="搜索问题关键词" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="fm-qpr-question-list">{matchingQuestions.map((item, index) => <button key={item.id} type="button" aria-pressed={questionId === item.id} onClick={() => changeScope({ question: undefined, reportQuestionId: item.id })}><span>{String(index + 1).padStart(2, "0")}</span>{item.label}</button>)}{!matchingQuestions.length && <p className="fm-pr-empty">{data.loading ? "正在读取问题…" : "没有匹配的问题"}</p>}</div>
        <small className="fm-qpr-picker-note">按真实问题选择，不需要问题分组。历史问题保留采集时的内容。</small>
      </aside>
      <article className={`fm-qpr-paper is-${phase}`} aria-label={`${definition.label}报告`}>
        <header className="fm-qpr-hero"><span>{questionReportPhases.find(item => item.key === phase)!.label}</span><h3>{question?.label || (questionId ? "所选问题尚未读取" : "请先选择具体问题")}</h3><p>当前指标：{definition.label}</p></header>
        <div className="fm-qpr-ribbon"><div><small>监控品牌快照</small><b>{currentRun?.config.brandName || "待读取"}</b></div><div><small>平台采集条件</small><b>{platformOptions.length} 组</b></div><div><small>有效回答</small><b>{phase === "compare" ? `前 ${beforeMetric.effective} / 后 ${afterMetric.effective}` : `${phase === "before" ? beforeMetric.effective : afterMetric.effective} 条`}</b></div></div>
        <div className="fm-qpr-body">
          {!serverData && <p className="fm-pr-warning">当前为独立预览数据。真实环境使用已有运行记录，不以预览回答替代业务结果。</p>}
          {!self && <p className="fm-pr-warning">当前选中了竞品，指标暂不计算。<button type="button" onClick={() => changeScope({ subject: "self" })}>切换本品</button> · 原始回答与竞品证据仍可查看。</p>}
          <p className="fm-qpr-observation-note">“优化前 / 后”表示所选基准与复测批次。此处未确认内容更新已执行，不将同期变化解释为因果效果。</p>
          {!question && <p className="fm-pr-empty">{data.loading ? "正在读取问题与运行快照…" : questionId ? "当前已读取范围没有这个问题，请继续加载或重新选择。" : "暂无问题，请先在问题监控中配置并采集。"}</p>}
          <section className="fm-qpr-section"><header><span>01</span><div><h3>{definition.title}</h3><p>{definition.rule}</p></div></header>
            <div className={`fm-qpr-scores ${phase === "compare" ? "" : "is-single"}`}>{displayedSides.map(side => <MetricCard key={side} side={side} measurement={side === "before" ? beforeMetric : afterMetric} metric={metric} run={side === "before" ? before : after} date={date} />)}</div>
            {phase === "compare" && <div className="fm-qpr-change"><strong>{change.title}</strong><span>{change.description}</span></div>}
            <div className="fm-qpr-explanation"><Info size={16} aria-hidden="true" /><p><b>如何理解：</b>{definition.interpretation}</p></div>
          </section>
          <section className="fm-qpr-section"><header><span>02</span><div><h3>不同平台的表现</h3><p>同一具体问题，按平台、设备、思考模式与区域分别计算。</p></div></header>
            <div className="fm-pr-table fm-qpr-table"><table><thead><tr><th>平台 / 采集条件</th>{displayedSides.map(side => <th key={side}>{side === "before" ? "优化前" : "优化后"}</th>)}{phase === "compare" && <th>变化</th>}</tr></thead><tbody>{platformOptions.map(([key, label]) => {
              const prior = measureQuestion(priorAttempts.filter(attempt => reportPlatformKey(attempt) === key), metric, self);
              const current = measureQuestion(currentAttempts.filter(attempt => reportPlatformKey(attempt) === key), metric, self);
              return <tr key={key}><th scope="row">{label}</th>{displayedSides.map(side => { const item = side === "before" ? prior : current; return <td key={side}><b>{measurementText(item.value, metric)}</b><small>{item.basis}</small><small>{item.coverage}</small>{item.missing && <small>{item.missing}</small>}</td>; })}{phase === "compare" && <td>{measurementChange(prior, current, metric, reason).title}</td>}</tr>;
            })}</tbody></table>{!platformOptions.length && <p className="fm-pr-empty">所选问题与批次暂无平台采集记录。</p>}</div>
          </section>
          <section className="fm-qpr-section"><header><span>03</span><div><h3>{phase === "compare" ? "优化前后回答对照" : "本期回答证据"}</h3><p>查看真实采集正文；两期独立提问，记录不天然配对。</p></div><label className="fm-qpr-platform"><span>平台</span><select aria-label="回答对照平台" value={selectedPlatform || ""} disabled={!platformOptions.length} onChange={event => { setPlatform(event.target.value); setBeforeAnswer(""); setAfterAnswer(""); setEvidence(undefined); }}>{!platformOptions.length && <option value="">暂无平台</option>}{platformOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></header>
            <div className={`fm-qpr-answers ${phase === "compare" ? "" : "is-single"}`}>{displayedSides.map(side => <AnswerSample key={side} side={side} attempts={side === "before" ? priorSamples : currentSamples} selectedId={side === "before" ? beforeAnswer : afterAnswer} onSelect={side === "before" ? setBeforeAnswer : setAfterAnswer} onEvidence={openEvidence} run={side === "before" ? before : after} date={date} />)}</div>
            {evidenceAttempt && query.monitorId && <section ref={evidenceRef} tabIndex={-1} className="fm-qpr-evidence"><header><b>{evidence?.side === "before" ? "优化前" : "优化后"}完整证据</b><button type="button" onClick={() => setEvidence(undefined)}>收起</button></header><ReportAnswerEvidence key={`${evidenceAttempt.id}:${query.subject}`} attempt={evidenceAttempt} monitorId={query.monitorId} subject={query.subject} brand={evidenceRun?.config.brandName || ""} serverData={serverData} /></section>}
          </section>
          <section className="fm-qpr-section"><header><span>04</span><div><h3>统计与数据说明</h3><p>保留样本覆盖与缺失信息，结论可回溯到回答。</p></div></header><div className="fm-qpr-explanation"><div><p><b>有效回答：</b>完成且有非空正文；失败、处理中或空正文不计入。{phase !== "after" && `优化前 ${beforeMetric.effective}/${beforeMetric.attempts} 条。`}{phase !== "before" && `优化后 ${afterMetric.effective}/${afterMetric.attempts} 条。`}</p><p><b>比较条件：</b>{reason || "所选问题、模型及采集配置一致，两个批次已完成。"}</p><p><b>样本解释：</b>小样本波动和标签覆盖变化都可能影响结果。四项指标独立观察，不合成总分。</p></div></div>
            <details className="fm-qpr-details"><summary>查看引用资料与关联回答</summary><ReportSources key={`${before?.id}:${after?.id}:${questionId}:${query.model}:${phase}`} before={phase === "compare" ? priorAttempts : []} after={phase === "before" ? priorAttempts : currentAttempts} comparable={phase === "compare" && comparable} onEvidence={(attempt, side) => openEvidence(attempt, phase === "before" ? "before" : side)} /></details>
          </section>
        </div>
      </article>
    </div>}
    {currentRun && <details className="fm-qpr-details fm-qpr-run-details"><summary>{phase === "before" ? "优化前" : "优化后"}运行详情与配置 · {date(currentRun)} · {runStatusLabel(currentRun.status)}</summary>{renderRun(currentRun.id)}</details>}
  </section>;
}
