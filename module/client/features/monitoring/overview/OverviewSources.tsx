import { useState, type CSSProperties } from "react";
import type { RunAttempt } from "../../../domain";
import { aggregateSources, safeExternalUrl, visibleSourcesForAttempt } from "../selectors";
import type { MonitoringAnalysisData } from "../useMonitoringDataSource";

const publicationLabels = { last_7_days: "近 7 天", last_30_days: "8–30 天", last_90_days: "31–90 天", older: "90 天以前", unknown: "发布时间未知" };
const colors = ["#7950d5", "#b79ce9", "#4e9bc5", "#91bdb0", "#d4d8e0"];

// Match the read repository's content aggregation (fragment identifiers do not
// identify a different source). Keep this client-side; do not import server code.
function contentUrl(value: string) {
  try { const url = new URL(value); url.hash = ""; return url.toString(); }
  catch { return value.trim(); }
}

function Distribution({ title, rows, note, pending = false }: { title: string; rows: Array<{ label: string; count: number; unknown?: boolean }>; note: string; pending?: boolean }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const color = (row: typeof rows[number], index: number) => pending || row.unknown ? "#a3aab6" : colors[index % colors.length];
  let angle = 0;
  const segments = rows.map((row, index) => {
    const from = angle;
    angle += total ? row.count / total * 360 : 0;
    return `${color(row, index)} ${from}deg ${angle}deg`;
  });
  return <section className="fm-ov-card"><h3>{title}</h3><p className="fm-ov-note">{note}</p><div className="fm-ov-distribution">
    <div className={`fm-ov-donut${pending ? " pending" : ""}`} role="img" aria-label={`${title}：${pending ? "类型待核实，" : ""}${total} 次来源记录，明细见列表`} style={{ "--ov-ring": total ? `conic-gradient(${segments.join(",")})` : "#e9e7ef" } as CSSProperties}><div><strong>{pending ? "类型待核实" : total}</strong><small>{pending ? `${total} 条记录` : "来源记录"}</small></div></div>
    <ul>{rows.map((row, index) => <li key={row.label}><i style={{ background: color(row, index) }} /><span>{row.label}</span><strong>{row.count}</strong><small>{total ? (row.count / total * 100).toFixed(1) : "0.0"}%</small></li>)}</ul>
  </div></section>;
}

export default function OverviewSources({ attempts, citations, sources, to, canReport, onReport, onAnswer }: {
  attempts: RunAttempt[]; citations?: Extract<MonitoringAnalysisData, { kind: "citations" }>;
  sources?: Extract<MonitoringAnalysisData, { kind: "sources" }>;
  to: string; canReport: boolean; onReport: () => void; onAnswer: (attempt: RunAttempt) => void;
}) {
  const [view, setView] = useState("ranking");
  const [domain, setDomain] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const local = aggregateSources(attempts, "cited");
  const ranking = (citations?.contents || local).slice().sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  const total = citations ? citations.total : local.reduce((sum, source) => sum + source.count, 0);
  const localDomains = new Map<string, number>();
  local.forEach(item => localDomains.set(item.domain, (localDomains.get(item.domain) || 0) + item.count));
  const domains = (citations?.items || [...localDomains].map(([domain, count]) => ({ domain, count }))).slice().sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
  const filtered = ranking.filter(item => domain === null || item.domain === domain);
  const selected = filtered.find(item => item.url === selectedUrl);
  const related = selected?.url ? attempts.filter(attempt => attempt.status === "completed" && Boolean(attempt.answer?.trim()) && visibleSourcesForAttempt(attempt, "cited").some(source => source.url && contentUrl(source.url) === contentUrl(selected.url!))) : [];
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
    <header className="fm-ov-heading fm-ov-source-heading"><div><h2 id="overview-source-title">信源分析</h2><p className="fm-ov-note">从引用域名追溯到内容，再查看关联回答。</p></div><div className="fm-ov-view-switch" role="group" aria-label="切换信源排行或信源分布">{[{ id: "ranking", label: "信源排行" }, { id: "distribution", label: "信源分布" }].map(item => <button type="button" key={item.id} className={view === item.id ? "active" : ""} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}</div></header>
    <div className="fm-ov-heading"><span>{total} 次明确引用 · {sourceTotal} 条来源记录{view === "distribution" ? " · 类型与发布时间" : ""}</span><button type="button" className="fm-text-button" disabled={!canReport} onClick={onReport}>下载监控报告 →</button></div>
    {view === "ranking" ? <section className="fm-ov-card">{ranking.length ? <div className="fm-ov-source-grid"><aside className="fm-ov-domain-list" aria-label="按引用域名筛选"><h3>引用域名</h3>{domains.reduce((sum, item) => sum + item.count, 0) < total && <p className="fm-ov-note">仅展示接口返回的前 100 个域名</p>}<button type="button" aria-pressed={domain === null} onClick={() => { setDomain(null); setSelectedUrl(null); }}><span>全部信源</span><strong>{total}</strong></button>{domains.map(item => <button type="button" key={item.domain} aria-pressed={domain === item.domain} onClick={() => { setDomain(item.domain); setSelectedUrl(null); }}><span>{item.domain || "域名未知"}</span><strong>{item.count}</strong><progress value={item.count} max={total || 1} aria-label={`${item.domain}占全部引用的比例`} /></button>)}</aside><div className="fm-ov-source-content"><h3>{domain || "全部信源"} · 引用内容</h3><div className="fm-table-scroll"><table className="fm-data-table fm-ov-source-ranking"><caption>占比始终以全部 {total} 次引用为分母{citations && ranking.reduce((sum, item) => sum + item.count, 0) < total ? " · 仅展示接口已返回的前 100 项内容" : ""}</caption><thead><tr><th>序号</th><th>内容 / 信源</th><th>引用次数</th><th>占比</th></tr></thead><tbody>{filtered.map((item, index) => {
      const url = safeExternalUrl(item.url);
      const ratio = total ? item.count / total * 100 : 0;
      return <tr key={`${item.url}:${index}`} className={Boolean(selected && item.url && selected.url === item.url) ? "selected" : ""}><td>{index + 1}</td><td><button type="button" className="fm-ov-source-title" aria-pressed={Boolean(selected && item.url && selected.url === item.url)} disabled={!item.url} onClick={() => setSelectedUrl(item.url || null)}>{item.title || item.domain}</button><small>{item.domain} {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`打开来源：${item.title || item.domain}`}>打开来源 ↗</a>}</small></td><td><strong>{item.count}</strong></td><td><div className="fm-ov-share"><progress value={ratio} max={100} aria-label={`${item.title}引用占比`} /><span>{ratio.toFixed(1)}%</span></div></td></tr>;
    })}</tbody></table></div>{!filtered.length && <p className="fm-ov-note">该域名的内容未包含在本次接口返回的排行中。</p>}{selected ? <section className="fm-ov-source-related"><h4>已读取的关联回答 · {related.length} 条</h4><p className="fm-ov-note">{selected.title} · 仅列已读取快照，回答数与引用次数口径不同。</p>{related.length ? related.map(attempt => <button type="button" className="fm-ov-related-answer" key={attempt.id} onClick={() => onAnswer(attempt)}><strong>{attempt.question}</strong><span>{attempt.platformName} · {attempt.runId?.slice(0, 8)} · 查看回答 →</span></button>) : <p className="fm-ov-note">已读取快照中暂无该 URL 的明确引用，继续加载批次后可补全。</p>}</section> : <p className="fm-ov-note">选择一条内容，查看其关联回答。</p>}</div></div> : <div className="fm-empty"><strong>当前筛选暂无明确文内引用</strong><span>未明确引用的答案参考不计入排行。</span></div>}</section> :
    <div className="fm-ov-two-columns"><Distribution title="信源类型分布" pending rows={[{ label: "类型待核实", count: sourceTotal }]} note="尚无业务类型数据，不根据域名推断。" /><Distribution title="信源发布时间分布" rows={times.map((item) => ({ label: publicationLabels[item.bucket], count: item.discoveredCount, unknown: item.bucket === "unknown" }))} note="按全部来源记录的已返回发布日期统计，日期缺失单列。" /></div>}
  </section>;
}


