import { BarChart3, Lightbulb, Medal, RadioTower, Target } from "lucide-react";
import { useState } from "react";
import type { MonitorRun, MonitorSummary, ProjectSummary, RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import OverviewTrend from "./OverviewTrend";
import OverviewSentiment from "./OverviewSentiment";
import OverviewSources from "./OverviewSources";
import OverviewSuggestions from "./OverviewSuggestions";
import { useOverviewData, type OverviewData } from "./useOverviewData";
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

function OverviewContent({ project, monitor, query, summary, serverData, onChange, onConfigure, onReport, data }: Props & { data: OverviewData }) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("metrics");
  const bounds = rangeBounds(query, project.timezone);
  const current = data.snapshots.filter((run) => Date.parse(run.createdAt) >= bounds.from && Date.parse(run.createdAt) < bounds.to);
  const previous = data.snapshots.filter((run) => Date.parse(run.createdAt) < bounds.from);
  const attempts = current.flatMap((run) => scopedAttempts(run, query));
  const suggestions = buildSuggestions(query.subject === "self" ? attempts : []);
  const evidenceCount = new Set(suggestions.flatMap((item) => item.evidence.map((attempt) => attempt.id))).size;
  const metrics = summary ? summaryMetrics(summary) : serverData ? undefined : periodMetrics(current, query, data.competitors);
  const prior = data.prior ? summaryMetrics(data.prior) : periodMetrics(previous, query, data.competitors);
  const comparable = data.complete && !data.error && comparablePeriods(current, previous, query);
  const scopeKey = [monitor.id, query.question, query.questionCategory, query.model, query.subject, query.from, query.to].join(":");
  const openAnswer = (attempt: RunAttempt) => onChange({ tab: "answers", runId: attempt.runId, answerQuestion: attempt.questionId, answerId: attempt.id, fullscreen: false });
  const change = (key: OverviewMetric) => {
    const now = metrics?.[key], before = prior[key];
    if (!comparable || now === undefined || before === undefined) return "环比 —（样本或可比条件待确认）";
    if (key === "mentionRate" || key === "top3Rate") return `环比 ${now - before >= 0 ? "+" : ""}${(now - before).toFixed(1)} 个百分点`;
    if (key === "averagePosition") return `环比 ${now - before >= 0 ? "+" : ""}${(now - before).toFixed(1)} 位（越低越好）`;
    return before ? `环比 ${now - before >= 0 ? "+" : ""}${((now - before) / before * 100).toFixed(1)}%` : "环比 —（上一周期无基数）";
  };
  const cards = [
    { key: "effective" as const, label: "累计有效回答", icon: <RadioTower size={18} />, hint: "所选日期范围内全部有效回答" },
    { key: "mentionRate" as const, label: "品牌提及率", icon: <Target size={18} />, hint: "提及回答 / 有效回答" },
    { key: "averagePosition" as const, label: "平均排名", icon: <BarChart3 size={18} />, hint: "仅统计有效且提及的已知排名" },
    { key: "top3Rate" as const, label: "Top3 推荐率", icon: <Medal size={18} />, hint: "前三提及回答 / 有效回答" },
  ];
  return <div className="fm-overview-workspace">
    <nav className="fm-ov-nav fm-segmented" role="tablist" aria-label="概览分析子模块">{tabs.map((item, index) => <button type="button" role="tab" id={`overview-tab-${item.id}`} key={item.id} aria-selected={tab === item.id} aria-controls={`overview-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} onKeyDown={(event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
      if (next === undefined) return;
      event.preventDefault(); setTab(tabs[next]!.id);
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
    }}>{item.label}</button>)}</nav>
    {data.error && <p className="fm-ov-notice pending" role="alert">部分监控数据读取失败：{data.error}。未读取的数据不视为零，请稍后刷新。</p>}
    <div className="fm-ov-coverage" aria-live="polite"><span>{data.loading ? "正在读取真实运行证据…" : `已读取当前周期 ${current.length} 个批次${data.complete ? " · 对比窗口完整" : " · 分析证据尚未完整"}`}。指标卡使用完整筛选汇总，词云与建议证据使用已读取样本。</span>{data.canLoadMore && <button type="button" className="fm-text-button" disabled={data.loading} onClick={data.loadMore}>继续加载批次</button>}{data.listLimited && <span>当前接口最多返回最近 100 批；请缩小日期范围，环比暂不作结论。</span>}</div>
    <div role="tabpanel" id={`overview-panel-${tab}`} aria-labelledby={`overview-tab-${tab}`} tabIndex={0}>
      {tab === "metrics" && <section className="fm-ov-section" aria-labelledby="overview-metric-title"><header className="fm-ov-heading"><h2 id="overview-metric-title">指标看板</h2><span>{query.from} 至 {query.to}（不含结束日）</span></header>
        <div className="fm-ov-metrics">{cards.map((card) => <article key={card.key} className="fm-ov-card"><span className="fm-ov-metric-label">{card.icon}{card.label}</span><strong className="fm-ov-metric-value">{metricText(card.key, metrics?.[card.key])}</strong><small>{card.hint}</small><small>{change(card.key)}</small><small>同比 —（去年同期样本及可比性待确认）</small></article>)}</div>
        <article className="fm-ov-highlight"><div><Lightbulb size={24} /><h3>AI 建议重点</h3></div><h4>{evidenceCount ? `${evidenceCount} 条回答建议优先核查资料与表达` : "等待可核查证据，暂不指定优化原因"}</h4><p>{evidenceCount ? "从知识库补充、咨询 FAQ 完善、公开信源核验三个方向查看依据，再决定下一步行动。" : "当前没有足够证据支持确定结论，可先核对采集结果与关联资料。"}</p><p>关联问题：{[...new Set(suggestions.flatMap((item) => item.evidence.map((attempt) => attempt.question)))].slice(0, 2).join("；") || "待采集"}</p><footer><span>证据 {evidenceCount} 条 · 待处理</span><button type="button" onClick={() => setTab("suggestions")}>查看建议</button></footer></article>
        <section className="fm-ov-card"><header className="fm-ov-heading"><h3>从竞品进入分析</h3><span>沿用监控配置</span></header>{data.competitors.length ? <div className="fm-ov-competitors">{data.competitors.map((competitor) => <button type="button" key={competitor.name} className="fm-secondary-button" onClick={() => { onChange({ subject: `competitor:${competitor.name}` }); setTab("trends"); }}>{competitor.name} <span>查看趋势 →</span></button>)}</div> : <p className="fm-ov-note">当前监控尚未配置竞品。<button type="button" className="fm-text-button" onClick={onConfigure}>编辑监控配置</button></p>}</section>
      </section>}
      {tab === "trends" && <OverviewTrend runs={current} query={query} competitors={data.competitors} loading={data.loading} complete={data.complete} onConfigure={onConfigure} />}
      {tab === "sentiment" && (serverData && !summary ? <p role="status">等待当前筛选的情感汇总，暂不以局部回答代替完整分布。</p> : <OverviewSentiment key={scopeKey} attempts={attempts} summary={summary} self={query.subject === "self"} onAnswer={openAnswer} />)}
      {tab === "sources" && (serverData && (!data.citations || !data.sources) ? <p role="status">{data.error ? "信源数据读取失败，请稍后刷新。" : "正在读取当前筛选的完整信源排行与分布…"}</p> : <OverviewSources attempts={attempts} citations={data.citations} sources={data.sources} to={query.to} canReport={serverData && Boolean(summary?.metrics.answers)} onReport={onReport} />)}
      {tab === "suggestions" && <>{query.subject !== "self" && <p className="fm-ov-notice pending">竞品的资料缺口与情感证据未单独提供。以下保留核查入口，切回当前品牌可查看关联证据。</p>}<OverviewSuggestions key={scopeKey} suggestions={suggestions} monitorId={monitor.id} query={query} onAnswer={openAnswer} /></>}
    </div>
  </div>;
}

function LiveOverview(props: Props) {
  const data = useOverviewData(props.query, props.project.timezone, props.catalog, Boolean(props.summary));
  return <OverviewContent {...props} data={data} />;
}

export default function OverviewWorkspace(props: Props) {
  if (props.serverData) return <LiveOverview {...props} />;
  const data: OverviewData = { snapshots: props.runs, competitors: props.runs[0]?.config.competitors || [], prior: undefined,
    citations: undefined, sources: undefined, complete: true, loading: false, error: undefined,
    canLoadMore: false, loadMore: () => undefined, listLimited: false };
  return <OverviewContent {...props} data={data} />;
}
