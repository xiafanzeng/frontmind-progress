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
import CompactAnswerInsights from "../CompactAnswerInsights";
import { safeExternalUrl } from "../selectors";
import { rangeBounds } from "../overview/overviewModel";
import { categoryMainScore, percent, questionMainScore, reportAttempts, reportCategories, reportChange, reportComparable, reportObservations, reportObservationMetrics, top3Observation, validAnswers, type ReportObservationMetric } from "./reportModel";
import ReportObservations from "./ReportObservations";
import "./progress-report.css";
import ReportExampleWorkspace from "./ReportExampleWorkspace";

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
    enabled: Boolean(props.query.monitorId && props.catalog), staleTime: 15_000, refetchInterval: 15_000,
  });
  const candidates = (list.data || []).filter(item => {
    const time = new Date(item.createdAt).getTime();
    return item.monitorId === props.query.monitorId && time >= bounds.from && time < bounds.to;
  });
  // Keep the explicitly linked run in the first read batch even with many runs.
  const linked = candidates.find(item => item.id === props.query.runId);
  const selected = linked ? [linked, ...candidates.filter(item => item.id !== linked.id)].slice(0, limit) : candidates.slice(0, limit);
  const pinned = trpc.runs.get.useQuery({ runId: props.query.runId || "00000000-0000-0000-0000-000000000000" }, {
    enabled: Boolean(props.query.runId) && !selected.some(item => item.id === props.query.runId),
    staleTime: 15_000, refetchInterval: 30_000, refetchIntervalInBackground: false,
  });
  const details = trpc.useQueries(api => selected.map(item => api.runs.get({ runId: item.id }, {
    staleTime: 15_000, refetchInterval: 30_000, refetchIntervalInBackground: false,
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
  if (points.filter(item => item.value !== undefined).length < 2) return <p className="fm-pr-empty">可比有效运行不足两次，暂不绘制趋势。</p>;
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

function ReportContent({ project, query, catalog, questions, onChange, renderRun, data }: Props & { data: Data }) {
  const [page, setPage] = useState<Page>(() => typeof window !== "undefined" && window.location.hash === "#question-optimization" ? "single" : "overview");
  const [questionId, setQuestionId] = useState(query.question || "");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState(query.runId || "");
  const [answerId, setAnswerId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("optimizationAnswer") || "");
  const [showRules, setShowRules] = useState(false);
  const [sort, setSort] = useState("default");
  const [status, setStatus] = useState("all");
  const [metric, setMetric] = useState<ReportObservationMetric>("mentionRate");
  const [drilldown, setDrilldown] = useState<Pick<MonitoringQueryState, "questionCategory" | "question"> | null>(null);
  const returnOverview = () => { if (drilldown) onChange(drilldown); setDrilldown(null); setPage("overview"); };
  const anchor = useRef<HTMLElement>(null);
  const runs = [...data.runs].filter(item => item.monitorId === query.monitorId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const before = runs.find(item => item.id === beforeId) || runs[0];
  const after = runs.find(item => item.id === afterId) || runs.at(-1);
  // Historical questions stay visible even if the current configuration retired them.
  const questionCatalog = [...new Map([...questions, ...runs.flatMap(run => run.attempts.map(item => ({ id: item.questionId, label: item.question, category: item.questionCategory }))), ...(after?.attempts || []).map(item => ({ id: item.questionId, label: item.question, category: item.questionCategory }))].map(item => [item.id, item])).values()];
  const scopeQuestions = questionCatalog.filter(item => (!query.questionCategory || item.category === query.questionCategory) && (!query.question || item.id === query.question));
  const question = scopeQuestions.find(item => item.id === questionId) || scopeQuestions[0];
  const category = reportCategories.find(item => item.key === question?.category);
  const comparable = query.subject === "self" && !data.error && reportComparable(before, after, query);
  const complete = !data.loading && !data.error && !data.more && !data.limited;
  const date = (run: MonitorRun) => new Intl.DateTimeFormat("zh-CN", { timeZone: project.timezone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(run.createdAt));
  const currentAttempts = reportAttempts(after, query, question?.id);
  const priorAttempts = reportAttempts(before, query, question?.id);
  const answers = validAnswers(currentAttempts);
  const priorAnswers = validAnswers(priorAttempts);
  const selectedAnswer = answers.find(item => item.id === answerId) || answers[0];
  const linkedRun = runs.find(run => run.attempts.some(item => item.id === answerId));
  const failed = currentAttempts.filter(item => ["failed", "error"].includes(item.status)).length;
  const rows = scopeQuestions.map(item => {
    const prior = questionMainScore(before, query, item), current = questionMainScore(after, query, item);
    const delta = comparable && prior !== undefined && current !== undefined ? Number((current - prior).toFixed(1)) : undefined;
    return { ...item, prior, current, delta, state: delta === undefined ? "pending" : delta < 0 ? "down" : delta > 0 ? "up" : "flat" };
  });
  const visibleRows = rows.filter(item => status === "all" || item.state === status).sort((a, b) =>
    sort === "samples" ? validAnswers(reportAttempts(after, query, b.id)).length - validAnswers(reportAttempts(after, query, a.id)).length :
    sort === "decline" ? a.delta === undefined ? b.delta === undefined ? 0 : 1 : b.delta === undefined ? -1 : a.delta - b.delta : 0);
  const declining = rows.filter(item => item.state === "down");
  const timeline = runs.filter(run => before && after && Date.parse(run.createdAt) >= Date.parse(before.createdAt) && Date.parse(run.createdAt) <= Date.parse(after.createdAt));
  const trendValue = (run: MonitorRun, value: number | undefined) => complete && query.subject === "self" && run.status === "completed" &&
    (run.id === before?.id || reportComparable(before, run, query)) ? value : undefined;
  const self = query.subject === "self";
  useEffect(() => { if (query.question) setQuestionId(query.question); }, [query.question]);
  useEffect(() => { if (query.runId) setAfterId(query.runId); }, [query.runId]);
  useEffect(() => {
    if (!linkedRun) return;
    const linked = linkedRun.attempts.find(item => item.id === answerId);
    if (linked) { setQuestionId(linked.questionId); setAfterId(linkedRun.id); }
  }, [linkedRun?.id, answerId]);
  useEffect(() => {
    if (page === "single" && typeof window !== "undefined" && window.location.hash === "#question-optimization") anchor.current?.focus({ preventScroll: true });
  }, [page]);
  const openQuestion = (id: string) => { setQuestionId(id); setAnswerId(""); setPage("single"); };
  const title = page === "overview" ? "优化进度报告" : page === "questions" ? "问题列表" : page === "assets" ? "内容准备与发布记录" : page === "scoring" ? "评分依据与复核" : "单题优化报告";
  const evidence = new Map<string, { title: string; url?: string; answers: Set<string>; published?: string | null }>();
  for (const attempt of answers) for (const source of attempt.sources.filter(item => item.isCited && attempt.citationProvenance === "explicit")) {
    const key = source.url || source.id;
    const entry = evidence.get(key) || { title: source.title, url: safeExternalUrl(source.url), answers: new Set<string>(), published: source.publishedAt };
    entry.answers.add(attempt.id); evidence.set(key, entry);
  }
  return <section ref={anchor} id="question-optimization" tabIndex={-1} className="fm-progress-report" aria-label="优化进度报告">
    <header className="fm-pr-header"><div><h2>{title}</h2><p>{["overview", "questions"].includes(page) ? "先看四类效果，再定位需要处理的问题。" : question?.label || "请先选择监控问题"}</p></div><button type="button" aria-expanded={showRules} onClick={() => setShowRules(!showRules)}>查看评分口径 {showRules ? "↑" : "↗"}</button></header>
    {showRules && <section className="fm-pr-card" aria-label="评分口径"><h3>四类分别计算，不合成总分</h3>{reportCategories.map(item => <p key={item.key}><strong>{item.label} · {item.metric}：</strong>{item.rule}。</p>)}<p>行业排名按本次显示题集逐题计算 Top3 推荐率，再等权平均；已提及但排名缺失时显示“待评估”，不补零。其余三类缺少专门评分依据时保持待评估。问题、模型或规则变更时不可直接比较；引用不等于事实正确，同期变化不代表更新造成的因果效果。</p></section>}
    <nav className="fm-pr-tabs" aria-label="进度报告视图">{(["overview", "questions"].includes(page) ? [["overview", "效果总览"], ["questions", "问题列表"]] : [["questions", "← 问题列表"], ["single", "单题报告"], ["assets", "内容准备"], ["scoring", "评分依据"]]).map(([id, label]) => <button type="button" key={id} aria-current={page === id ? "page" : undefined} onClick={() => id === "overview" ? returnOverview() : setPage(id as Page)}>{label}</button>)}</nav>
    {(page !== "overview" || query.questionCategory) && <div className="fm-pr-return">
      {page !== "overview" && <button type="button" onClick={returnOverview}>← 返回效果总览</button>}
      {query.questionCategory && <button type="button" onClick={() => { onChange({ questionCategory: undefined, question: undefined }); setDrilldown(null); }}>清除分类筛选</button>}
    </div>}
    <MonitoringScopeFilters project={project} query={query} run={after} summary={catalog} questions={questionCatalog} onChange={onChange} />
    <div className="fm-pr-compare"><button type="button" disabled={data.refreshing} onClick={() => void data.refresh()}>{data.refreshing ? "正在刷新…" : "刷新数据"}</button><span>对比批次（已读取范围）</span><label>起点<select value={before?.id || ""} onChange={event => setBeforeId(event.target.value)}>{!runs.length && <option value="">暂无评估</option>}{runs.map(run => <option key={run.id} value={run.id}>{date(run)} · V{run.version} · {run.id.slice(0, 8)}</option>)}</select></label><span>→</span><label>本次<select value={after?.id || ""} onChange={event => { setAfterId(event.target.value); setAnswerId(""); }}>{!runs.length && <option value="">暂无评估</option>}{runs.map(run => <option key={run.id} value={run.id}>{date(run)} · V{run.version} · {run.id.slice(0, 8)}</option>)}</select></label></div>
    <p className="fm-pr-note">批次品牌：起点 {before?.config.brandName || "—"} → 本次 {after?.config.brandName || "—"}。指标使用各自历史快照；品牌或采集配置不同不输出升降结论。</p>
    <p className="fm-pr-note" role="status">{data.loading ? "正在读取运行快照…" : `已读取 ${runs.length} 个运行批次`} · {scopeQuestions.length} 题 · {complete ? "范围已完整读取" : "范围尚未完整"}{data.more && <button type="button" disabled={data.loading} onClick={data.loadMore}>继续加载批次</button>}</p>
    {data.error && <p className="fm-pr-warning" role="alert">读取失败：{data.error}。未读取数据不视为零。</p>}
    {data.limited && <p className="fm-pr-warning">当前最多可读取最近100批，请缩小日期范围后比较。</p>}
    {answerId && !linkedRun && !data.loading && <p className="fm-pr-warning">定位链接的回答尚未在当前已读取批次中找到，请继续加载或调整日期范围；当前显示的是手动选择的结果。</p>}
    {query.subject !== "self" && <p className="fm-pr-warning">本报告评分以监控主品牌为对象。当前选中了竞品，下面仅保留原始证据，不输出竞品评分或改善结论。</p>}
    <p className="fm-pr-notice">{comparable ? "所选批次的采集配置一致，可对比已有回答指标；变化不代表内容更新的因果效果。" : "不可直接比较：请选择两个已完成且问题、模型与采集配置一致的不同批次。"}</p>
    {after && <>
      {(Date.parse(after.createdAt) < rangeBounds(query, project.timezone).from || Date.parse(after.createdAt) >= rangeBounds(query, project.timezone).to) && <p className="fm-pr-note">当前定位的运行在日期范围外，已单独保留。其他批次仍按日期筛选。</p>}
      {renderRun(after.id)}
    </>}
    {page === "overview" && <>
      <div className="fm-pr-grid">{reportCategories.map(item => {
        const items = scopeQuestions.filter(question => question.category === item.key);
        const count = items.filter(question => validAnswers(reportAttempts(after, query, question.id)).length > 0).length;
        const prior = categoryMainScore(before, query, items), current = categoryMainScore(after, query, items);
        const scored = rows.filter(row => row.category === item.key);
        return <article className="fm-pr-card fm-pr-category" key={item.key} style={{ "--report-accent": item.color } as CSSProperties}>
          <header><span className="fm-pr-badge">{item.label}</span><h3>{item.metric}</h3><small>本类 {items.length} 题 · 等权平均</small></header><p>{item.rule}</p>
          <strong className="fm-pr-value">{count < items.length ? "数据未齐" : `${percent(prior)} → ${percent(current)}`}</strong>
          <p>{reportChange(prior, current, comparable)}</p>
          {item.key === "industry" ? <ObservationTrend label="行业排名 · Top3 推荐率" points={timeline.map(run => ({ id: run.id, label: date(run), value: trendValue(run, categoryMainScore(run, query, items)) }))} /> :
            <p className="fm-pr-note">{item.key === "competitor_comparison" ? "缺少单题指定对手和有据优势核验，排名不能代替本指标。" : item.key === "reputation" ? "缺少逐条关键断言核验，正向情感不能代替本指标。" : "缺少必要条件与事实约束核验，品牌提及不能代替本指标。"}</p>}
          <p className="fm-pr-note">有效回答覆盖 {count}/{items.length} 题；范围未加载完时不绘制完整趋势。</p>
          <footer><span>{scored.filter(row => row.state === "up").length} 题提升 / {scored.filter(row => row.state === "down").length} 题下降 / {scored.filter(row => row.state === "pending").length} 题待评估或不可比</span><button type="button" onClick={() => { setDrilldown({ questionCategory: query.questionCategory, question: query.question }); onChange({ questionCategory: item.key, question: undefined }); setStatus("all"); setPage("questions"); }}>查看本类问题 →</button></footer>
        </article>;
      })}</div>
      <ReportObservations before={reportAttempts(before, query)} after={reportAttempts(after, query)} comparable={comparable} enabled={self} />
      <div className="fm-pr-grid fm-pr-three">
        <article className="fm-pr-card"><p>内容准备</p><h3>必要信息就绪度待核验</h3><p>缺少必要信息清单及核验记录，不以引用数或草稿代替完成项。</p><button type="button" onClick={() => setPage("assets")}>查看已有资料 →</button></article>
        <article className="fm-pr-card"><p>目标内容引用率</p><h3>待登记目标链接</h3><p>已有明确引用可追溯；未登记目标集合，不能计算目标内容引用率。</p><button type="button" onClick={() => setPage("assets")}>查看引用资料 →</button></article>
        <article className="fm-pr-card"><p>需要关注</p><h3>{comparable ? `${declining.length} 道行业排名题下降` : "等待可比批次"}</h3><p>{comparable ? "仅统计两个批次均能计算 Top3 推荐率的题目；其他题目保留待评估。" : "当前批次不可比，暂不判断下降问题。"}</p><button type="button" onClick={() => { setStatus(declining.length ? "down" : "pending"); setSort("decline"); setPage("questions"); }}>查看问题 →</button></article>
      </div>
    </>}
    {page === "questions" && <section className="fm-pr-card">
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
    {!["overview", "questions"].includes(page) && <><label className="fm-pr-question-picker">切换问题<select value={question?.id || ""} onChange={event => { setQuestionId(event.target.value); setAnswerId(""); }}>{scopeQuestions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {!question ? <p className="fm-pr-empty">当前范围没有可查看的问题。</p> : <>
      {page === "single" && <>
        <div className="fm-pr-grid fm-pr-three"><article className="fm-pr-card"><span>{category?.metric || "单题主指标"}</span><strong className="fm-pr-value">{percent(questionMainScore(before, query, question))} → {percent(questionMainScore(after, query, question))}</strong><p>{reportChange(questionMainScore(before, query, question), questionMainScore(after, query, question), comparable)}；有效回答 {priorAnswers.length} → {answers.length} 条。</p></article><article className="fm-pr-card"><span>必要信息就绪度</span><strong className="fm-pr-value">待核验</strong><button type="button" onClick={() => setPage("assets")}>查看内容准备 →</button></article><article className="fm-pr-card"><span>目标内容引用率</span><strong className="fm-pr-value">待登记</strong><p>需登记目标链接并核对引用记录完整性。</p></article></div>
        <ReportObservations before={priorAttempts} after={currentAttempts} comparable={comparable} enabled={self} />
        <section className="fm-pr-card"><h3>回答效果与本题更新</h3>
          <label className="fm-pr-compare">观察指标<select value={metric} onChange={event => setMetric(event.target.value as ReportObservationMetric)}>{reportObservationMetrics.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <ObservationTrend label={reportObservationMetrics.find(item => item.key === metric)!.label} points={timeline.map(run => ({ id: run.id, label: date(run), value: trendValue(run, reportObservations(reportAttempts(run, query, question.id))[metric]) }))} />
          <p className="fm-pr-notice">各点来自真实运行批次；尚无本题内容更新记录，不推断已经优化或更新导致改善。</p>
        </section>
        <h3>回答样例对照 <small>独立提问，仅用于解释差异</small></h3><div className="fm-pr-grid"><AnswerCard label="起点回答样例" attempt={priorAnswers[0]} /><AnswerCard label="本次回答样例" attempt={selectedAnswer} onEvidence={() => setPage("scoring")} /></div>
      </>}
      {page === "assets" && <>
        <section className="fm-pr-card"><h3>必要信息就绪度：待核验</h3><p>必要信息就绪度＝已满足项数 ÷ 必要项数。当前未提供本题固定清单与历史核验快照，不能以引用数、发布次数或草稿代替完成项。</p><div className="fm-pr-table"><table><thead><tr><th>必要信息</th><th>满足标准</th><th>规定渠道</th><th>依据 / 内容版本</th><th>准备状态</th></tr></thead><tbody><tr><td colSpan={5}>尚无本题必要信息清单与核验依据。</td></tr></tbody></table></div></section>
        <section className="fm-pr-card"><h3>渠道建设情况</h3><div className="fm-pr-grid fm-pr-three">{["官方内容", "媒体与专业内容", "社区与问答内容"].map(label => <div key={label}><h4>{label}</h4><p>待核验 · 独立展示，不加权合成总分</p></div>)}</div></section>
        <section className="fm-pr-card"><h3>本题观察到的引用资料</h3><p>下列为回答返回的明确引用，尚未登记为目标内容，也不表示已经核验或由本方发布。</p><div className="fm-pr-table"><table><thead><tr><th>资料</th><th>来源返回的发布时间</th><th>引用回答数（去重）</th><th>入口</th></tr></thead><tbody>{[...evidence].map(([key, item]) => <tr key={key}><th>{item.title}</th><td>{item.published || "未提供"}</td><td>{item.answers.size}/{answers.length}</td><td>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">查看原资料 ↗</a> : "无可用链接"}</td></tr>)}</tbody></table>{!evidence.size && <p className="fm-pr-empty">尚无可展示的明确引用资料。</p>}</div><p className="fm-pr-note">引用记录完整性：{answers.length && answers.every(item => item.citationProvenance === "explicit") ? "本次有效回答均带明确引用记录" : "尚未确认，缺失记录不能按未引用计算"}。多篇资料的引用次数不可直接相加为回答引用率。</p></section>
      </>}
      {page === "scoring" && <>
        <p className="fm-pr-notice">{category?.metric || "本题主指标"}：{percent(questionMainScore(after, query, question))}。{category?.key === "industry" ? "按有效回答的品牌提及与正整数排名计算；提及但排名缺失时保持待评估。" : "该主指标所需的逐项核验依据尚未提供，现有提及、排名和情感仅作辅助观察。"}</p>
        <ReportObservations before={priorAttempts} after={currentAttempts} comparable={comparable} enabled={self} />
        <div className="fm-pr-evidence-layout"><aside className="fm-pr-card"><h3>本次回答 · {answers.length} 条</h3><p className="fm-pr-note">计划 {currentAttempts.length} 条 · 有效 {answers.length} 条 · 采集失败 {failed} 条 · 其余 {currentAttempts.length - answers.length - failed} 条未计入有效回答</p>{answers.map(item => <button type="button" key={item.id} aria-pressed={selectedAnswer?.id === item.id} onClick={() => setAnswerId(item.id)}>{item.platformName} · 第 {item.repetition} 次<small>{self && category?.key === "industry" ? { pass: "已进入前三", fail: "未进入前三", pending: "排名待确认" }[top3Observation(item)] : "评分待核验"} · {item.id}</small></button>)}{!answers.length && <p>当前范围暂无有效回答。</p>}</aside><section className="fm-pr-card">{selectedAnswer ? <><h3>{selectedAnswer.platformName} · 第 {selectedAnswer.repetition} 次</h3><div className="fm-pr-answer"><MonitoringMarkdown attempt={selectedAnswer} markdown={selectedAnswer.answer || "暂无正文"} /></div><CompactAnswerInsights attempt={selectedAnswer} /><h3>逐项检查与参考资料</h3>{self && category?.key === "industry" && <p>供应商返回：品牌提及{selectedAnswer.brandMentioned === undefined ? "待确认" : selectedAnswer.brandMentioned ? "是" : "否"}，排名 {selectedAnswer.mentionPosition ?? "未返回"}；Top3 判定：{{ pass: "已进入前三", fail: "未进入前三", pending: "待确认" }[top3Observation(selectedAnswer)]}。回答版本 {selectedAnswer.revision ?? "未返回"}。</p>}<p>尚无事实约束判定及适用资料版本。不能据现有引用自动判为事实正确。</p><p>人工复核：未提供记录。复核需保留原判断、修订依据、理由、人员与时间，再更新相关统计。</p></> : <p className="fm-pr-empty">选择有有效回答的运行批次后查看。</p>}</section></div>
      </>}
      </>}
    </>}
    <p className="fm-pr-notice">四类主指标不合成总分。Top3 推荐率及回答观察来自所选批次的有效回答；其余主指标、必要信息就绪度和目标内容引用率缺少依据时保持待评估。</p>

  </section>;
}

export default function ProgressReportWorkspace(props: Props) {
  const [path] = useLocation();
  const linkedRun = progressRunRoute(path);
  const effectiveProps = { ...props, query: { ...props.query, runId: linkedRun?.runId || props.query.runId } };
  const [exampleOpen, setExampleOpen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => { setExampleOpen(false); }, [path, props.query.monitorId, props.query.runId]);
  useEffect(() => { frame.current?.closest<HTMLElement>(".fm-monitor-detail")?.scrollTo({ top: 0 }); }, [exampleOpen]);
  return <div ref={frame}>
    {exampleOpen && <ReportExampleWorkspace onExit={() => setExampleOpen(false)} />}
    <div hidden={exampleOpen} style={exampleOpen ? { display: "none" } : undefined}>
      <div className="fm-report-mode-entry"><button type="button" className="fm-secondary-button" onClick={() => setExampleOpen(true)}>查看示例报告</button><span>当前报告来自所选项目的监控记录；示例单独展示。</span></div>
      {props.serverData ? <LiveReport key={props.query.monitorId} {...effectiveProps} /> : <ReportContent key={props.query.monitorId} {...effectiveProps} data={{ runs: props.runs, loading: false, limited: false, more: false, loadMore: () => undefined, refreshing: false, refresh: async () => undefined }} />}
    </div>
  </div>;
}
