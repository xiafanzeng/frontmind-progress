import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "wouter";
import { progressRunRoute } from "../reportNavigation";
import type { MonitorRun, ProjectSummary, RunAttempt } from "../../../domain";
import { mapRunDetail } from "../../../apiMappers";
import { trpc } from "../../../trpc";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import MonitoringScopeFilters from "../MonitoringScopeFilters";
import { MonitoringMarkdown } from "../MonitoringMarkdown";
import { rangeBounds } from "../overview/overviewModel";
import { categoryMainScore, percent, questionMainScore, reportAttempts, reportCategories, reportChange, reportComparable, reportObservations, reportObservationMetrics, validAnswers, type ReportObservationMetric } from "./reportModel";
import ReportObservations from "./ReportObservations";
import "./progress-report.css";
import { comparisonReason, latestComparable, matchesGap, type GapKind } from "./reportInsights";
import ReportSources from "./ReportSources";
import ReportAnswerEvidence from "./ReportAnswerEvidence";
import OverviewPagination from "../overview/OverviewPagination";
import "../overview/overview.css";

type Page = "overview" | "questions" | "single" | "assets" | "scoring";
type Props = {
  project: ProjectSummary; query: MonitoringQueryState; catalog?: MonitoringSummaryData;
  questions: Array<{ id: string; label: string; category?: string | null }>;
  runs: MonitorRun[]; serverData: boolean;
  onChange: (patch: Partial<MonitoringQueryState>) => void;
  renderRun: (runId?: string) => ReactNode;
};
type Data = { runs: MonitorRun[]; loading: boolean; error?: string; limited: boolean; more: boolean; loadMore: () => void; refreshing: boolean; refresh: () => Promise<void> };

function LiveReport(props: Props) {
  const [limit, setLimit] = useState(10);
  const bounds = rangeBounds(props.query, props.project.timezone);
  const list = trpc.runs.list.useQuery({ monitorId: props.query.monitorId || "00000000-0000-0000-0000-000000000000", limit: 100 }, {
    enabled: Boolean(props.query.monitorId && props.catalog), staleTime: 15_000, refetchInterval: false, refetchOnWindowFocus: false,
  });
  const candidates = [...(list.data || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).filter(item => {
    const time = new Date(item.createdAt).getTime();
    return item.monitorId === props.query.monitorId && time >= bounds.from && time < bounds.to;
  });
  // Keep the explicitly linked run in the first read batch even with many runs.
  const linked = candidates.find(item => item.id === props.query.runId);
  const selected = linked ? [linked, ...candidates.filter(item => item.id !== linked.id)].slice(0, limit) : candidates.slice(0, limit);
  const pinned = trpc.runs.get.useQuery({ runId: props.query.runId || "00000000-0000-0000-0000-000000000000" }, {
    enabled: Boolean(props.query.runId) && !selected.some(item => item.id === props.query.runId),
    staleTime: 15_000, refetchInterval: false, refetchOnWindowFocus: false,
  });
  const details = trpc.useQueries(api => selected.map(item => api.runs.get({ runId: item.id }, {
    staleTime: 15_000, refetchInterval: false, refetchOnWindowFocus: false,
  })));
  const needsPinned = Boolean(props.query.runId) && !selected.some(item => item.id === props.query.runId);
  const runs = [...details, ...(needsPinned ? [pinned] : [])].flatMap(detail => {
    if (!detail.data) return [];
    const output = detail.data;
    if (output.run.monitorId !== props.query.monitorId) return [];
    const run = mapRunDetail(output);
    return [{ ...run, attempts: run.attempts.map((attempt, index) => {
      const raw = output.attempts[index]!.attempt;
      return { ...attempt, runId: run.id,
        questionId: output.configuration.questions.find(item => item.ordinal === raw.monitorQuestionOrdinal)?.questionId || attempt.questionId,
        platformId: output.configuration.platforms.find(item => item.ordinal === raw.monitorPlatformOrdinal)?.platformId,
      };
    }) }];
  });
  return <ReportContent {...props} data={{ runs,
    loading: Boolean(props.query.monitorId) && (list.isPending || details.some(item => item.isPending) || (needsPinned && pinned.isPending)),
    error: list.error?.message || details.find(item => item.error)?.error?.message || (needsPinned ? pinned.error?.message || (pinned.data && pinned.data.run.monitorId !== props.query.monitorId ? "链接中的运行不属于当前监控任务。" : undefined) : undefined),
    limited: Boolean(list.data?.length === 100 && new Date(list.data.at(-1)!.createdAt).getTime() >= bounds.from),
    more: selected.length < candidates.length, loadMore: () => setLimit(value => Math.min(100, value + 10)),
    refreshing: list.isFetching || details.some(item => item.isFetching) || (needsPinned && pinned.isFetching),
    refresh: async () => { await Promise.all([list.refetch(), ...details.map(item => item.refetch()), ...(needsPinned ? [pinned.refetch()] : [])]); },
  }} />;
}

function ObservationTrend({ points, label }: { points: Array<{ id: string; label: string; value?: number }>; label: string }) {
  if (!points.some(item => item.value !== undefined)) return <p className="fm-pr-empty">当前指标暂无有效值。</p>;
  const x = (index: number) => 45 + index * 530 / Math.max(1, points.length - 1);
  const y = (value: number) => 145 - value * 1.15;
  return <div className="fm-pr-chart"><svg viewBox="0 0 620 180" role="img" aria-label={`${label}，缺测或不可比处断开`}><title>{label}；同期变化不代表因果效果</title>
    {[0, 50, 100].map(value => <g key={value}><line x1="40" x2="590" y1={y(value)} y2={y(value)} /><text x="0" y={y(value) + 4}>{value}%</text></g>)}
    {points.map((item, index) => <g key={item.id}>{item.value !== undefined && <>
      {index > 0 && points[index - 1]!.value !== undefined && <line className="fm-pr-plot" x1={x(index - 1)} y1={y(points[index - 1]!.value!)} x2={x(index)} y2={y(item.value)} />}
      <circle cx={x(index)} cy={y(item.value)} r="4" /><text textAnchor="middle" x={x(index)} y={y(item.value) - 10}>{percent(item.value)}</text>
    </>}<text textAnchor="middle" x={x(index)} y="170">{item.label}</text></g>)}
  </svg></div>;
}

function AnswerCard({ attempt, label, onEvidence }: { attempt?: RunAttempt; label: string; onEvidence?: () => void }) {
  return <article className="fm-pr-card"><h3>{label}</h3>{attempt ? <>
    <p>{attempt.platformName} · 第 {attempt.repetition} 次 · {attempt.id}</p>
    <div className="fm-pr-answer"><MonitoringMarkdown attempt={attempt} markdown={attempt.answer || "尚无回答正文"} /></div>
    <p className="fm-pr-note">独立采集的回答样例，仅用于解释差异；不构成天然配对，不代表整体评分。</p>
    {onEvidence && <button type="button" onClick={onEvidence}>查看该回答依据 →</button>}
  </> : <p className="fm-pr-empty">当前范围尚无有效回答样例。</p>}</article>;
}

function ReportContent({ project, query, catalog, questions, onChange, renderRun, serverData, data }: Props & { data: Data }) {
  const [page, setPage] = useState<Page>(() => typeof window !== "undefined" && window.location.hash === "#question-optimization" ? "single" : "overview");
  const [questionId, setQuestionId] = useState(query.question || "");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState(query.runId || "");
  const [answerId, setAnswerId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("optimizationAnswer") || "");
  const [assetsAll, setAssetsAll] = useState(false);
  const [gap, setGap] = useState<GapKind | undefined>();
  const [gapScope, setGapScope] = useState(false);
  const [evidenceSide, setEvidenceSide] = useState<"before" | "after">("after");
  const [evidencePage, setEvidencePage] = useState(1);
  const initialAnswer = useRef(answerId);
  const [sort, setSort] = useState("default");
  const [status, setStatus] = useState("all");
  const [metric, setMetric] = useState<ReportObservationMetric>("mentionRate");
  const [drilldown, setDrilldown] = useState<Pick<MonitoringQueryState, "questionCategory" | "question"> | null>(null);
  const returnOverview = () => { if (drilldown) onChange(drilldown); setDrilldown(null); setGap(undefined); setGapScope(false); setAnswerId(""); setPage("overview"); };
  const anchor = useRef<HTMLElement>(null);
  const runs = [...data.runs].filter(item => item.monitorId === query.monitorId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const after = runs.find(item => item.id === afterId) || [...runs].reverse().find(item => item.status === "completed") || runs.at(-1);
  const before = beforeId === "none" ? undefined : runs.find(item => item.id === beforeId) || latestComparable(runs, after, query);
  const reason = comparisonReason(before, after, query);
  const noSnapshot = !after && Boolean(data.loading || data.error);
  // Historical questions stay visible even if the current configuration retired them.
  const questionCatalog = [...new Map([...questions, ...runs.flatMap(run => run.attempts.map(item => ({ id: item.questionId, label: item.question, category: item.questionCategory }))), ...(after?.attempts || []).map(item => ({ id: item.questionId, label: item.question, category: item.questionCategory }))].map(item => [item.id, item])).values()];
  const scopeQuestions = questionCatalog.filter(item => (!query.questionCategory || item.category === query.questionCategory) && (!query.question || item.id === query.question));
  const question = scopeQuestions.find(item => item.id === questionId) || scopeQuestions[0];
  const category = reportCategories.find(item => item.key === question?.category);
  const comparable = !data.loading && !data.error && !reason;
  const complete = !data.loading && !data.error && !data.more && !data.limited;
  const date = (run: MonitorRun) => new Intl.DateTimeFormat("zh-CN", { timeZone: project.timezone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(run.createdAt));
  const currentAttempts = reportAttempts(after, query, question?.id);
  const priorAttempts = reportAttempts(before, query, question?.id);
  const answers = validAnswers(currentAttempts);
  const priorAnswers = validAnswers(priorAttempts);
  const evidenceRun = evidenceSide === "before" ? before : after;
  const evidenceAttempts = reportAttempts(evidenceRun, query, gapScope ? undefined : question?.id).filter(attempt => !gap || matchesGap(attempt, gap));
  const actualEvidencePage = Math.min(evidencePage, Math.max(1, Math.ceil(evidenceAttempts.length / 10)));
  const shownEvidence = evidenceAttempts.slice((actualEvidencePage - 1) * 10, actualEvidencePage * 10);
  const selectedAnswer = page === "scoring" ? evidenceAttempts.find(item => item.id === answerId) || shownEvidence[0] : answers.find(item => item.id === answerId) || answers[0];
  const linkedRun = runs.find(run => run.attempts.some(item => item.id === answerId));
  const rows = scopeQuestions.map(item => {
    const prior = questionMainScore(before, query, item), current = questionMainScore(after, query, item);
    const delta = comparable && prior !== undefined && current !== undefined ? Number((current - prior).toFixed(1)) : undefined;
    return { ...item, prior, current, delta, state: delta === undefined ? "pending" : delta < 0 ? "down" : delta > 0 ? "up" : "flat" };
  });
  const visibleRows = rows.filter(item => status === "all" || item.state === status).sort((a, b) =>
    sort === "samples" ? validAnswers(reportAttempts(after, query, b.id)).length - validAnswers(reportAttempts(after, query, a.id)).length :
    sort === "decline" ? a.delta === undefined ? b.delta === undefined ? 0 : 1 : b.delta === undefined ? -1 : a.delta - b.delta : 0);
  const declining = rows.filter(item => item.state === "down");
  const timeline = runs.filter(run => after && (!before || Date.parse(run.createdAt) >= Date.parse(before.createdAt)) && Date.parse(run.createdAt) <= Date.parse(after.createdAt));
  const trendValue = (run: MonitorRun, value: number | undefined) => complete && query.subject === "self" && run.status === "completed" &&
    (run.id === after?.id || reportComparable(run, after, query)) ? value : undefined;
  const self = query.subject === "self";
  useEffect(() => { if (query.question) setQuestionId(query.question); }, [query.question]);
  useEffect(() => { if (query.runId) setAfterId(query.runId); }, [query.runId]);
  useEffect(() => {
    if (!initialAnswer.current) return;
    const run = runs.find(item => item.attempts.some(attempt => attempt.id === initialAnswer.current));
    const linked = run?.attempts.find(item => item.id === initialAnswer.current);
    if (run && linked) { initialAnswer.current = ""; setQuestionId(linked.questionId); setAfterId(run.id); }
  }, [data.runs]);
  useEffect(() => {
    if (page === "single" && typeof window !== "undefined" && window.location.hash === "#question-optimization") anchor.current?.focus({ preventScroll: true });
  }, [page]);
  const openQuestion = (id: string) => { setQuestionId(id); setAnswerId(""); setGap(undefined); setGapScope(false); setPage("single"); };
  const title = page === "overview" ? "优化进度报告" : page === "questions" ? "问题列表" : page === "assets" ? "引用资料" : page === "scoring" ? "评分依据与复核" : "单题优化报告";
  const openGap = (kind: GapKind) => { setGap(kind); setGapScope(page === "overview"); setEvidenceSide("after"); setEvidencePage(1); setAnswerId(""); setPage("scoring"); };
  const openEvidence = (attempt: RunAttempt, side: "before" | "after") => { setGap(undefined); setGapScope(false); setEvidenceSide(side); setAnswerId(attempt.id); setQuestionId(attempt.questionId); const pool = reportAttempts(side === "before" ? before : after, query, attempt.questionId); setEvidencePage(Math.floor(Math.max(0,pool.findIndex(item => item.id === attempt.id)) / 10) + 1); setPage("scoring"); };
  return <section ref={anchor} id="question-optimization" tabIndex={-1} className="fm-progress-report" aria-label="优化进度报告">
    <header className="fm-pr-header"><div><h2>{title}</h2>{!["overview", "questions"].includes(page) && <p>{gapScope ? "当前范围的数据完整性" : page === "assets" && assetsAll ? "当前筛选范围的引用资料" : question?.label || "请先选择监控问题"}</p>}</div></header>
    <MonitoringScopeFilters project={project} query={query} run={after} summary={catalog} questions={questionCatalog} onChange={onChange} />
    <nav className="fm-pr-tabs" aria-label="进度报告视图">{(["overview", "questions"].includes(page) ? [["overview", "效果总览"], ["questions", "问题列表"]] : [["questions", "← 问题列表"], ["single", "单题报告"], ["assets", "引用资料"], ["scoring", "评分依据"]]).map(([id, label]) => <button type="button" key={id} aria-current={page === id ? "page" : undefined} onClick={() => { setGap(undefined); setGapScope(false); setAnswerId(""); if (id === "overview") setDrilldown(null); if (id === "assets" && page !== "assets") setAssetsAll(false); setPage(id as Page); }}>{label}</button>)}</nav>
    {(page !== "overview" || query.questionCategory) && <div className="fm-pr-return">
      {page !== "overview" && <button type="button" onClick={returnOverview}>← 返回效果总览</button>}
      {query.questionCategory && <button type="button" onClick={() => { onChange({ questionCategory: undefined, question: undefined }); setDrilldown(null); }}>清除分类筛选</button>}
    </div>}
    <div className="fm-pr-compare"><button type="button" disabled={data.refreshing} onClick={() => void data.refresh()}>{data.refreshing ? "正在刷新…" : "刷新数据"}</button><span>对比批次（已读取范围）</span><label>起点<select value={beforeId || "auto"} onChange={event => { setBeforeId(event.target.value === "auto" ? "" : event.target.value); setAnswerId(""); }}><option value="auto">最近可比批次</option><option value="none">不比较，仅看本次</option>{runs.map(run => <option key={run.id} value={run.id}>{date(run)} · V{run.version} · {run.id.slice(0, 8)}</option>)}</select></label><span>→</span><label>本次<select value={after?.id || ""} onChange={event => { setAfterId(event.target.value); setBeforeId(""); setAnswerId(""); }}>{!runs.length && <option value="">暂无评估</option>}{runs.map(run => <option key={run.id} value={run.id}>{date(run)} · V{run.version} · {run.id.slice(0, 8)}</option>)}</select></label></div>
    <p className="fm-pr-note" role="status">{data.loading ? "正在读取运行快照…" : `已读取 ${runs.length} 个运行批次`} · {scopeQuestions.length} 题 · {complete ? "范围已完整读取" : "范围尚未完整"}{data.more && <button type="button" disabled={data.loading} onClick={data.loadMore}>继续加载批次</button>}</p>
    {data.error && <p className="fm-pr-warning" role="alert">读取失败：{data.error}。未读取数据不视为零。</p>}
    {data.limited && <p className="fm-pr-warning">当前最多可读取最近100批，请缩小日期范围后比较。</p>}
    {answerId && !linkedRun && !data.loading && <p className="fm-pr-warning">定位链接的回答尚未在当前已读取批次中找到，请继续加载或调整日期范围；当前显示的是手动选择的结果。</p>}
    {query.subject !== "self" && <p className="fm-pr-warning">本报告评分以监控主品牌为对象。当前选中了竞品，下面仅保留原始证据，不输出竞品评分或改善结论。</p>}
    <p className="fm-pr-notice">{comparable ? "所选批次的采集配置一致，可对比已有回答指标；变化不代表内容更新的因果效果。" : data.loading ? "正在读取，暂不输出变化。" : beforeId === "none" ? "仅查看本次结果，不计算批次变化。" : reason || "读取存在错误，暂不输出变化。"}</p>
    {after && <>
      {(Date.parse(after.createdAt) < rangeBounds(query, project.timezone).from || Date.parse(after.createdAt) >= rangeBounds(query, project.timezone).to) && <p className="fm-pr-note">当前定位的运行在日期范围外，已单独保留。其他批次仍按日期筛选。</p>}
      {renderRun(after.id)}
    </>}
    {noSnapshot && <p className="fm-pr-empty">{data.loading ? "正在读取真实运行快照…" : "读取失败，请刷新重试。"}</p>}
    {!noSnapshot && page === "overview" && <>
      <div className="fm-pr-grid">{reportCategories.map(item => {
        const items = scopeQuestions.filter(question => question.category === item.key);
        const count = items.filter(question => validAnswers(reportAttempts(after, query, question.id)).length > 0).length;
        const prior = categoryMainScore(before, query, items), current = categoryMainScore(after, query, items);
        const scored = rows.filter(row => row.category === item.key);
        return <article className="fm-pr-card fm-pr-category" key={item.key} style={{ "--report-accent": "var(--fm-brand, #3d1560)" } as CSSProperties}>
          <header><span className="fm-pr-badge">{item.label}</span><h3>{item.metric}</h3><small>本类 {items.length} 题 · 等权平均</small></header><p>{item.rule}</p>
          <strong className="fm-pr-value">{!items.length ? "暂无本类问题" : count < items.length ? "数据未齐" : before ? `${percent(prior)} → ${percent(current)}` : percent(current)}</strong>
          <p>{reportChange(prior, current, comparable)}</p>
          {item.key === "industry" ? <ObservationTrend label="行业排名 · Top3 推荐率" points={timeline.map(run => ({ id: run.id, label: date(run), value: trendValue(run, categoryMainScore(run, query, items)) }))} /> :
            <p className="fm-pr-note">{item.key === "competitor_comparison" ? "缺少单题指定对手和有据优势核验，排名不能代替本指标。" : item.key === "reputation" ? "缺少逐条关键断言核验，正向情感不能代替本指标。" : "缺少必要条件与事实约束核验，品牌提及不能代替本指标。"}</p>}
          <p className="fm-pr-note">有效回答覆盖 {count}/{items.length} 题；范围未加载完时不绘制完整趋势。</p>
          <footer><span>{scored.filter(row => row.state === "up").length} 题提升 / {scored.filter(row => row.state === "down").length} 题下降 / {scored.filter(row => row.state === "pending").length} 题待评估或不可比</span><button type="button" onClick={() => { setDrilldown({ questionCategory: query.questionCategory, question: query.question }); onChange({ questionCategory: item.key, question: undefined }); setStatus("all"); setPage("questions"); }}>查看本类问题 →</button></footer>
        </article>;
      })}</div>
      <ReportObservations before={reportAttempts(before, query)} after={reportAttempts(after, query)} comparable={comparable} enabled={self} onGap={openGap} />
      <div className="fm-pr-grid">
        <article className="fm-pr-card"><p>引用资料</p><h3>查看回答引用的内容</h3><p>按当前筛选查看明确引用的资料、出现变化及关联回答。</p><button type="button" onClick={() => { setAssetsAll(true); setPage("assets"); }}>查看引用资料 →</button></article>
        <article className="fm-pr-card"><p>需要关注</p><h3>{comparable ? `${declining.length} 道行业排名题下降` : "等待可比批次"}</h3><p>{comparable ? "仅统计两个批次均能计算 Top3 推荐率的题目；其他题目保留待评估。" : "当前批次不可比，暂不判断下降问题。"}</p><button type="button" onClick={() => { setStatus(declining.length ? "down" : "pending"); setSort("decline"); setPage("questions"); }}>查看问题 →</button></article>
      </div>
    </>}
    {!noSnapshot && page === "questions" && <section className="fm-pr-card">
      <header className="fm-pr-header"><h3>本范围 {scopeQuestions.length} 道问题</h3><div className="fm-pr-compare">
        <label>状态<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部状态</option><option value="down">下降</option><option value="up">提升</option><option value="flat">持平</option><option value="pending">待评估 / 不可比</option></select></label>
        <label>排序<select value={sort} onChange={event => setSort(event.target.value)}><option value="default">配置顺序</option><option value="decline">下降优先</option><option value="samples">有效回答数优先</option></select></label>
      </div></header>
      <div className="fm-pr-table"><table><thead><tr><th>问题 / 主指标</th><th>起点评估</th><th>本次评估</th><th>变化</th><th>样本量（前 → 后）</th><th>操作</th></tr></thead><tbody>{visibleRows.map(item => <tr key={item.id}>
        <th scope="row">{item.label}<small>{reportCategories.find(category => category.key === item.category)?.metric || "未分类"}</small></th>
        <td>{percent(item.prior)}</td><td>{percent(item.current)}</td><td>{reportChange(item.prior, item.current, comparable)}</td>
        <td>{validAnswers(reportAttempts(before, query, item.id)).length} → {validAnswers(reportAttempts(after, query, item.id)).length} 条</td><td><button type="button" onClick={() => openQuestion(item.id)}>查看报告 →</button></td>
      </tr>)}</tbody></table>{!visibleRows.length && <p className="fm-pr-empty">当前筛选没有问题，请调整分类、状态或日期范围。</p>}</div>
    </section>}
    {!noSnapshot && !["overview", "questions"].includes(page) && <>{!(page === "assets" && assetsAll) && <label className="fm-pr-question-picker">切换问题<select value={question?.id || ""} onChange={event => { setQuestionId(event.target.value); setGap(undefined); setGapScope(false); setEvidencePage(1); setAnswerId(""); }}>{scopeQuestions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      {!question && !(page === "assets" && assetsAll) ? <p className="fm-pr-empty">当前范围没有可查看的问题。</p> : <>
      {page === "single" && question && <>
        <div className="fm-pr-grid"><article className="fm-pr-card"><span>{category?.metric || "单题主指标"}</span><strong className="fm-pr-value">{before ? `${percent(questionMainScore(before, query, question))} → ` : ""}{percent(questionMainScore(after, query, question))}</strong><p>{reportChange(questionMainScore(before, query, question), questionMainScore(after, query, question), comparable)}；有效回答 {priorAnswers.length} → {answers.length} 条。</p></article><article className="fm-pr-card"><h3>本题引用资料</h3><p>查看明确引用的内容及对应回答。</p><button type="button" onClick={() => { setAssetsAll(false); setPage("assets"); }}>查看引用资料 →</button></article></div>
        <ReportObservations before={priorAttempts} after={currentAttempts} comparable={comparable} enabled={self} onGap={openGap} />
        <section className="fm-pr-card"><h3>回答效果与本题更新</h3>
          <label className="fm-pr-compare">观察指标<select value={metric} onChange={event => setMetric(event.target.value as ReportObservationMetric)}>{reportObservationMetrics.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <ObservationTrend label={reportObservationMetrics.find(item => item.key === metric)!.label} points={timeline.map(run => ({ id: run.id, label: date(run), value: trendValue(run, reportObservations(reportAttempts(run, query, question?.id))[metric]) }))} />
          <p className="fm-pr-notice">各点来自真实运行批次；尚无本题内容更新记录，不推断已经优化或更新导致改善。</p>
        </section>
        <h3>回答样例对照 <small>独立提问，仅用于解释差异</small></h3><div className="fm-pr-grid"><AnswerCard label="起点回答样例" attempt={priorAnswers[0]} /><AnswerCard label="本次回答样例" attempt={selectedAnswer} onEvidence={selectedAnswer ? () => openEvidence(selectedAnswer, "after") : undefined} /></div>
      </>}
      {page === "assets" && <ReportSources key={`${before?.id}:${after?.id}:${assetsAll ? "all" : question?.id}:${query.question || ""}:${query.questionCategory || ""}`} before={reportAttempts(before, query, assetsAll ? undefined : question?.id)} after={reportAttempts(after, query, assetsAll ? undefined : question?.id)} comparable={comparable} onEvidence={openEvidence} />}

      {page === "scoring" && question && <>
        {!gapScope && <><p className="fm-pr-notice">{category?.metric || "本题主指标"}：{percent(questionMainScore(after, query, question))}。{category?.key === "industry" ? "按有效回答的品牌提及与正整数排名计算；提及但排名缺失时保持待评估。" : "该主指标所需的逐项核验依据尚未提供，现有提及、排名和情感仅作辅助观察。"}</p>
        <ReportObservations before={priorAttempts} after={currentAttempts} comparable={comparable} enabled={self} onGap={openGap} /></>}
        {gap && <p className="fm-pr-note">当前只显示对应缺口的记录。<button type="button" onClick={() => { setGap(undefined); setAnswerId(""); setEvidencePage(1); }}>显示全部回答</button></p>}
        <div className="fm-pr-evidence-layout"><aside className="fm-pr-card"><h3>{evidenceSide === "before" ? "起点" : "本次"}回答 · {evidenceAttempts.length} 条</h3>{shownEvidence.map(item => <button type="button" key={item.id} aria-pressed={selectedAnswer?.id === item.id} onClick={() => setAnswerId(item.id)}>{item.platformName} · 第 {item.repetition} 次<small>{item.question} · {item.status === "completed" ? "已完成" : "尚无有效结果"}</small></button>)}<div className="fm-overview-workspace"><OverviewPagination label="报告回答分页" page={actualEvidencePage} total={evidenceAttempts.length} onChange={value => { setEvidencePage(value); setAnswerId(""); }} /></div></aside>{selectedAnswer && query.monitorId ? <ReportAnswerEvidence key={`${selectedAnswer.id}:${query.subject}`} attempt={selectedAnswer} monitorId={query.monitorId} subject={query.subject} brand={evidenceRun?.config.brandName || ""} serverData={serverData} /> : <p className="fm-pr-empty">当前条件没有回答记录。</p>}</div>

      </>}
      </>}
    </>}
    <p className="fm-pr-notice">四类主指标不合成总分。Top3 推荐率及回答观察来自所选批次的有效回答；其余主指标缺少核验依据时保持待评估。</p>

  </section>;
}

export default function ProgressReportWorkspace(props: Props) {
  const [path] = useLocation();
  const linkedRun = progressRunRoute(path);
  const effectiveProps = { ...props, query: { ...props.query, runId: linkedRun?.runId || props.query.runId } };
  const key = `${props.query.monitorId}:${props.query.from}:${props.query.to}:${props.query.model || ""}:${props.query.subject}`;
  return props.serverData ? <LiveReport key={key} {...effectiveProps} /> : <ReportContent key={key} {...effectiveProps} data={{ runs: props.runs, loading: false, limited: false, more: false, loadMore: () => undefined, refreshing: false, refresh: async () => undefined }} />;
}
