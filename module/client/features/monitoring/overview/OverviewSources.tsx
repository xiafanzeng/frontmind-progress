import type { CSSProperties } from "react";
import type { RunAttempt } from "../../../domain";
import { aggregateSources, safeExternalUrl, visibleSourcesForAttempt } from "../selectors";
import type { MonitoringAnalysisData } from "../useMonitoringDataSource";

const publicationLabels = { last_7_days: "近 7 天", last_30_days: "8–30 天", last_90_days: "31–90 天", older: "90 天以前", unknown: "发布时间未知" };
const colors = ["#7950d5", "#b79ce9", "#4e9bc5", "#91bdb0", "#d4d8e0"];

function Distribution({ title, rows, note }: { title: string; rows: Array<{ label: string; count: number }>; note: string }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let angle = 0;
  const segments = rows.map((row, index) => {
    const from = angle;
    angle += total ? row.count / total * 360 : 0;
    return `${colors[index % colors.length]} ${from}deg ${angle}deg`;
  });
  return <section className="fm-ov-card"><h3>{title}</h3><p className="fm-ov-note">{note}</p><div className="fm-ov-distribution">
    <div className="fm-ov-donut" role="img" aria-label={`${title}：${total} 次来源记录，明细见右侧`} style={{ "--ov-ring": total ? `conic-gradient(${segments.join(",")})` : "#e9e7ef" } as CSSProperties}><div><strong>{total}</strong><small>来源记录</small></div></div>
    <ul>{rows.map((row, index) => <li key={row.label}><i style={{ background: colors[index % colors.length] }} /><span>{row.label}</span><strong>{row.count}</strong><small>{total ? (row.count / total * 100).toFixed(1) : "0.0"}%</small></li>)}</ul>
  </div></section>;
}

export default function OverviewSources({ attempts, citations, sources, to, canReport, onReport }: {
  attempts: RunAttempt[]; citations?: Extract<MonitoringAnalysisData, { kind: "citations" }>;
  sources?: Extract<MonitoringAnalysisData, { kind: "sources" }>;
  to: string; canReport: boolean; onReport: () => void;
}) {
  const local = aggregateSources(attempts, "cited");
  const ranking = (citations?.contents || local).slice().sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  const total = citations ? citations.total : local.reduce((sum, source) => sum + source.count, 0);
  const all = attempts.flatMap((attempt) => visibleSourcesForAttempt(attempt, "all"));
  const localTimes = Object.keys(publicationLabels).map((key) => ({ bucket: key as keyof typeof publicationLabels, discoveredCount: 0 }));
  for (const source of all) {
    const time = source.publishedAt ? Date.parse(source.publishedAt) : NaN;
    const age = (Date.parse(to) - time) / 86_400_000;
    const key = !Number.isFinite(age) || age < 0 ? "unknown" : age <= 7 ? "last_7_days" : age <= 30 ? "last_30_days" : age <= 90 ? "last_90_days" : "older";
    localTimes.find((item) => item.bucket === key)!.discoveredCount += 1;
  }
  const times = sources?.publicationTimeBuckets || localTimes;
  const sourceTotal = sources ? sources.total : all.length;
  return <section className="fm-ov-section" aria-labelledby="overview-source-title">
    <header className="fm-ov-heading"><div><h2 id="overview-source-title">信源分析</h2><p className="fm-ov-note">排行统计明确文内引用；分布统计全部来源记录。</p></div><button type="button" className="fm-primary-button" disabled={!canReport} onClick={onReport}>生成报告</button></header>
    <section className="fm-ov-card"><h3>信源排行</h3>{ranking.length ? <div className="fm-table-scroll"><table className="fm-data-table fm-ov-source-ranking"><caption>{total} 次文内引用 · 按次数降序{citations && ranking.reduce((sum, item) => sum + item.count, 0) < total ? " · 仅展示前 100 项，占比以全部引用为分母" : ""}</caption><thead><tr><th>序号</th><th>信源名称</th><th>引用次数</th><th>占比</th></tr></thead><tbody>{ranking.map((item, index) => {
      const url = safeExternalUrl(item.url);
      const ratio = total ? item.count / total * 100 : 0;
      return <tr key={`${item.url}:${index}`}><td>{index + 1}</td><td>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{item.title || item.domain}</a> : item.title || item.domain}</td><td><strong>{item.count}</strong></td><td><div className="fm-ov-share"><progress value={ratio} max={100} aria-label={`${item.title}引用占比`} /><span>{ratio.toFixed(1)}%</span></div></td></tr>;
    })}</tbody></table></div> : <div className="fm-empty"><strong>当前筛选暂无明确文内引用</strong><span>未明确引用的答案参考不计入排行。</span></div>}</section>
    <div className="fm-ov-two-columns"><Distribution title="信源类型分布" rows={[{ label: "类型待核实", count: sourceTotal }]} note="当前接口未提供信源业务类型，保留待核实分类；不根据域名猜测类型。" /><Distribution title="信源发布时间分布" rows={times.map((item) => ({ label: publicationLabels[item.bucket], count: item.discoveredCount }))} note="使用明确返回的发布日期，沿用时窗结束日期的统计口径；日期缺失单列。" /></div>
  </section>;
}
