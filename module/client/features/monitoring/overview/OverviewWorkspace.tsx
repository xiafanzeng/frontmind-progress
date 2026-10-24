import { BarChart3, Lightbulb, Medal, RadioTower, Target } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { MonitorRun, MonitorSummary, ProjectSummary, RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import OverviewTrend from "./OverviewTrend";
import OverviewSentiment from "./OverviewSentiment";
import OverviewSentimentLive from "./OverviewSentimentLive";
import OverviewSources from "./OverviewSources";
import OverviewSuggestions from "./OverviewSuggestions";
import { useOverviewData, type OverviewData, type OverviewTab } from "./useOverviewData";
import { buildSuggestions, comparablePeriods, metricText, periodMetrics, rangeBounds, scopedAttempts, summaryMetrics, type OverviewMetric } from "./overviewModel";
import "./overview.css";

const tabs = [
  { id: "metrics", label: "指标看板" }, { id: "trends", label: "趋势分析" },
  { id: "sentiment", label: "情感分析" }, { id: "sources", label: "信源分析" },
  { id: "suggestions", label: "AI 优化建议" },
] as const;
type Props = {
  project: ProjectSummary; monitor: MonitorSummary; query: MonitoringQueryState;
  summary?: MonitoringSummaryData; catalog?: MonitoringSummaryData; runs: MonitorRun[];
  serverData: boolean; onChange: (patch: Partial<MonitoringQueryState>) => void;
  onConfigure: () => void; onReport: () => void;
};

function OverviewContent({ project, monitor, query, summary, serverData, onChange, onConfigure, onReport, data, tab, setTab }: Props & { data: OverviewData; tab: OverviewTab; setTab: (tab: OverviewTab) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    scrollRef.current?.closest<HTMLElement>(".fm-monitor-detail")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [tab, monitor.id]);
  const bounds = rangeBounds(query, project.timezone);
  const current = data.snapshots.filter((run) => Date.parse(run.createdAt) >= bounds.from && Date.parse(run.createdAt) < bounds.to);
  const previous = data.snapshots.filter((run) => Date.parse(run.createdAt) < bounds.from);
  const attempts = current.flatMap((run) => scopedAttempts(run, query));
  const suggestions = buildSuggestions(query.subject === "self" ? attempts : []);
  const evidenceCount = new Set(suggestions.flatMap((item) => item.evidence.map((attempt) => attempt.id))).size;
  const questionCount = new Set(suggestions.flatMap((item) => item.evidence.map((attempt) => attempt.questionId || attempt.question))).size;
  const metrics = summary ? summaryMetrics(summary) : serverData ? undefined : periodMetrics(current, query, data.competitors);
  const prior = data.prior ? summaryMetrics(data.prior) : serverData ? undefined : periodMetrics(previous, query, data.competitors);
  const yearPrior = data.yearPrior ? summaryMetrics(data.yearPrior) : undefined;
  const comparable = data.complete && !data.error && comparablePeriods(current, previous, query);
  const yearComparable = data.yearComplete && !data.error && comparablePeriods(current, data.yearSnapshots, query);
  const scopeKey = [monitor.id, query.question, query.questionCategory, query.model, query.subject, query.from, query.to].join(":");
  const draftNamespace = `frontmind-overview-v1:${project.id}:${monitor.id}`;
  const openAnswer = (attempt: RunAttempt) => onChange({ tab: "answers", runId: attempt.runId, answerQuestion: attempt.questionId, answerId: attempt.id, fullscreen: false });
  const change = (key: OverviewMetric, label: "环比" | "同比", baseline: typeof prior, canCompare: boolean) => {
    const now = metrics?.[key], before = baseline?.[key];
    if (!canCompare || !metrics?.effective || !baseline?.effective || typeof now !== "number" || typeof before !== "number" || !Number.isFinite(now) || !Number.isFinite(before)) return null;
    if (key === "mentionRate" || key === "top3Rate") return `${label} ${now - before >= 0 ? "+" : ""}${(now - before).toFixed(1)} 个百分点`;
    if (key === "averagePosition") return `${label} ${now - before >= 0 ? "+" : ""}${(now - before).toFixed(1)} 位（越低越好）`;
    return before ? `${label} ${now - before >= 0 ? "+" : ""}${((now - before) / before * 100).toFixed(1)}%` : null;
  };
  const cards = [
    { key: "effective" as const, label: "累计有效回答", icon: <RadioTower size={18} />, hint: "所选日期范围内全部有效回答" },
    { key: "mentionRate" as const, label: "品牌提及率", icon: <Target size={18} />, hint: "提及回答 / 有效回答" },
    { key: "averagePosition" as const, label: "平均排名", icon: <BarChart3 size={18} />, hint: "仅统计有效且提及的已知排名" },
    { key: "top3Rate" as const, label: "Top3 推荐率", icon: <Medal size={18} />, hint: "前三提及回答 / 有效回答" },
  ];
  return <div ref={scrollRef} className="fm-overview-workspace fm-ov-content" tabIndex={0} aria-label="概览分析内容">
    <nav className="fm-ov-nav fm-segmented" role="tablist" aria-label="概览分析子模块">{tabs.map((item, index) => <button type="button" role="tab" id={`overview-tab-${item.id}`} key={item.id} aria-selected={tab === item.id} aria-controls={`overview-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} onKeyDown={(event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
      if (next === undefined) return;
      event.preventDefault(); setTab(tabs[next]!.id);
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus({ preventScroll: true });
    }}>{item.id === "suggestions" && <Lightbulb size={16} />}{item.label}{item.id === "suggestions" && suggestions.some((suggestion) => suggestion.evidence.length > 0) && <span className="fm-ov-nav-count" title="有真实回答证据的核查方向">{suggestions.filter((suggestion) => suggestion.evidence.length > 0).length}</span>}</button>)}</nav>
    {data.error && <p className="fm-ov-notice pending" role="alert">部分监控数据读取失败：{data.error}。未读取的数据不视为零，请稍后刷新。</p>}
    <div className="fm-ov-coverage"><span role="status">{data.loading ? "正在读取监控数据…" : `已读取当前周期 ${current.length} 个批次`}</span>{data.canLoadMore && <button type="button" className="fm-text-button" disabled={data.loading} onClick={() => void data.loadMore()}>继续读取历史证据</button>}<button type="button" className="fm-text-button" disabled={data.loading} onClick={() => void data.refresh()}>刷新数据</button><details><summary>查看数据范围与口径</summary><p>指标卡使用当前筛选的完整汇总；情感分布和词云使用同一范围的服务端回答，信源排行独立分页。趋势和建议依据已读取的批次。每次扩展最多 3 个完整批次，使用现有游标读取历史，不受最近 100 批限制。{data.complete ? "当前所需周期的目录与证据已读取完整。" : "分析证据尚未完整，比较仅在样本齐全且可比时显示。"}{data.listLimited && "历史目录尚有下一页，可继续读取；未读部分不视为无数据。"}</p></details></div>
    <div role="tabpanel" id={`overview-panel-${tab}`} aria-labelledby={`overview-tab-${tab}`} tabIndex={0}>
      {tab === "metrics" && <section className="fm-ov-section" aria-labelledby="overview-metric-title"><header className="fm-ov-heading"><h2 id="overview-metric-title">指标看板</h2><span>{query.from} 至 {query.to}（不含结束日）</span></header>
        <div className="fm-ov-metrics">{cards.map((card) => {
          const periodChange = change(card.key, "环比", prior, comparable);
          const yearChange = change(card.key, "同比", yearPrior, yearComparable);
          return <article key={card.key} className={`fm-ov-card metric-${card.key}`}><span className="fm-ov-metric-label">{card.icon}{card.label}</span><strong className="fm-ov-metric-value">{metricText(card.key, metrics?.[card.key])}</strong><small>{card.hint}</small>{summary && card.key === "effective" && <small>{summary.metrics.answers} 条有效 / {summary.metrics.attempts} 次采集</small>}{summary && card.key === "mentionRate" && <small>{summary.metrics.mentionedAnswers} 条提及 / {summary.metrics.answers} 条有效</small>}{periodChange && <small>{periodChange}</small>}{yearChange && <small>{yearChange}</small>}</article>;
        })}</div>
        <article className="fm-ov-highlight"><div className="fm-ov-highlight-main"><header><Lightbulb size={20} /><h3>AI 建议重点</h3><span className="fm-ov-tag">待核查</span></header><h4>{evidenceCount ? "从回答证据出发，确认下一步优化方向" : "等待可核查证据"}</h4><p>{evidenceCount ? "优先核对资料与实际回答是否一致，再准备知识库、FAQ 或公开信源的行动草稿。" : "当前证据不足，先核对采集结果与关联资料。"}</p><button type="button" onClick={() => setTab("suggestions")}>查看建议与依据 <span aria-hidden="true">→</span></button></div><aside className="fm-ov-highlight-aside"><span>已读取的核查线索</span><div><strong>{evidenceCount}</strong> 条回答证据</div><div><strong>{questionCount}</strong> 个关联问题</div><small>证据数量不等于已确认问题数量</small></aside></article>
        <div className="fm-ov-two-columns"><section className="fm-ov-card"><h3>监控范围与采集质量</h3><dl className="fm-ov-quality"><div><dt>有效回答</dt><dd>{metrics?.effective ?? "—"}</dd></div><div><dt>采集次数</dt><dd>{summary?.metrics.attempts ?? "—"}</dd></div><div><dt>已读取批次</dt><dd>{current.length}</dd></div></dl><p className="fm-ov-note">有效回答排除失败或空回答。具体判定可进入原回答核查。</p></section><section className="fm-ov-card"><h3>从指标进入分析</h3><div className="fm-ov-analysis-links">{tabs.filter(item => ["trends", "sentiment", "sources"].includes(item.id)).map(item => <button type="button" key={item.id} onClick={() => setTab(item.id)}><span>{item.label}</span><span aria-hidden="true">→</span></button>)}</div></section></div>
        <section className="fm-ov-card"><header className="fm-ov-heading"><h3>从竞品进入分析</h3><span>沿用监控配置</span></header>{data.competitors.length ? <div className="fm-ov-competitors">{data.competitors.map((competitor) => <button type="button" key={competitor.name} className="fm-secondary-button" onClick={() => { onChange({ subject: `competitor:${competitor.name}` }); setTab("trends"); }}>{competitor.name} <span>查看趋势 →</span></button>)}</div> : <p className="fm-ov-note">当前监控尚未配置竞品。<button type="button" className="fm-text-button" onClick={onConfigure}>编辑监控配置</button></p>}</section>
      </section>}
      {tab === "trends" && <OverviewTrend key={scopeKey} runs={current} query={query} competitors={data.competitors} loading={data.loading} complete={data.complete} onConfigure={onConfigure} />}
      {tab === "sentiment" && (serverData ? data.scope ? <OverviewSentimentLive key={scopeKey} scope={data.scope} draftNamespace={draftNamespace} onAnswer={openAnswer} /> : <p role="status">等待当前筛选范围…</p> : <OverviewSentiment key={scopeKey} draftNamespace={draftNamespace} attempts={attempts} summary={summary} self={query.subject === "self"} onAnswer={openAnswer} />)}
      {tab === "sources" && (serverData && (!data.scope || !data.sources) ? <p role="status">{data.error ? "信源数据读取失败，请稍后刷新。" : "正在读取当前筛选的信源分布…"}</p> : <OverviewSources key={scopeKey} scope={data.scope} attempts={attempts} sources={data.sources} to={query.to} canReport={serverData && Boolean(summary?.metrics.answers)} onReport={onReport} onAnswer={openAnswer} />)}
      {tab === "suggestions" && <>{query.subject !== "self" && <p className="fm-ov-notice pending">竞品的资料缺口与情感证据未单独提供。以下保留核查入口，切回当前品牌可查看关联证据。</p>}<OverviewSuggestions key={scopeKey} draftNamespace={draftNamespace} suggestions={suggestions} monitorId={monitor.id} query={query} onAnswer={openAnswer} /></>}
    </div>
  </div>;
}

function LiveOverview(props: Props & { tab: OverviewTab; setTab: (tab: OverviewTab) => void }) {
  const data = useOverviewData(props.query, props.project.timezone, props.catalog, Boolean(props.summary), props.tab);
  return <OverviewContent {...props} data={data} />;
}

export default function OverviewWorkspace(props: Props) {
  const [tab, setTab] = useState<OverviewTab>("metrics");
  if (props.serverData) return <LiveOverview {...props} tab={tab} setTab={setTab} />;
  const data: OverviewData = { snapshots: props.runs, competitors: props.runs[0]?.config.competitors || [], prior: undefined,
    yearSnapshots: [], yearPrior: undefined, yearComplete: false,
    scope: undefined, sources: undefined, complete: true, currentComplete: true, loading: false, error: undefined,
    canLoadMore: false, loadMore: async () => undefined, refresh: async () => undefined, listLimited: false };
  return <OverviewContent {...props} data={data} tab={tab} setTab={setTab} />;
}


