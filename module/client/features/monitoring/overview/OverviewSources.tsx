import { useRef, useState, type CSSProperties } from "react";
import type { MonitoringScope } from "@frontmind/monitoring-contracts";
import { trpc } from "../../../trpc";
import OverviewPagination from "./OverviewPagination";
import type { RunAttempt } from "../../../domain";
import { safeExternalUrl, visibleSourcesForAttempt } from "../selectors";
import type { MonitoringAnalysisData } from "../useMonitoringDataSource";

import { citationPage } from "../../../../shared/overviewAnalysis";
import { sourceCategoryLabels, type SourceCategory } from "../../../../shared/sourceClassification";

// SVG assets load through URL references (the module tsconfig has no "*.svg"
// module declarations; this matches the existing ModelBrandIcon pattern).
const logoUrl = (path: string) => new URL(path, import.meta.url).href;

// Match host boundaries, never a title or a substring of an unrelated domain.
const siteLogos = [
  { hosts: ["douyin.com", "iesdouyin.com", "tiktok.com"], src: logoUrl("../../../assets/model-logos/tiktok.svg") },
  { hosts: ["xiaohongshu.com", "xhslink.com"], src: logoUrl("../../../assets/model-logos/xiaohongshu.svg") },
  { hosts: ["weibo.com", "weibo.cn"], src: logoUrl("../../../assets/model-logos/sinaweibo.svg") },
  { hosts: ["baidu.com"], src: logoUrl("../../../assets/model-logos/baidu-color.svg") },
  { hosts: ["google.com", "google.com.hk"], src: logoUrl("../../../assets/model-logos/google-color.svg") },
  { hosts: ["bing.com"], src: logoUrl("../../../assets/model-logos/bing-color.svg") },
  { hosts: ["zhihu.com"], src: logoUrl("../../../assets/source-logos/zhihu.svg") },
  { hosts: ["mp.weixin.qq.com", "weixin.qq.com", "wechat.com"], src: logoUrl("../../../assets/source-logos/wechat.svg") },
  { hosts: ["bilibili.com", "b23.tv"], src: logoUrl("../../../assets/source-logos/bilibili.svg") },
  { hosts: ["taobao.com"], src: logoUrl("../../../assets/source-logos/taobao.svg") },
];

function SourceCategoryBadge({ category }: { category: SourceCategory }) {
  return <span className={`fm-ov-source-category category-${category}`}>{sourceCategoryLabels[category]}</span>;
}

function SourceIdentity({ domain, siteName, category }: { domain: string; siteName?: string | null; category?: SourceCategory }) {
  const host = domain.trim().toLowerCase().replace(/\.$/, "");
  const label = siteName?.trim() || domain || "域名未知";
  const logo = siteLogos.find(item => item.hosts.some(root => host === root || host.endsWith(`.${root}`)))?.src;
  return <span className="fm-ov-source-identity" title={siteName && siteName !== domain ? `${siteName} · ${domain}` : label}>
    <span className="fm-ov-site-monogram" aria-hidden="true">{logo ? <img src={logo} alt="" /> : Array.from(siteName?.trim() || domain.replace(/^www\./i, ""))[0]?.toUpperCase() || "?"}</span>
    <span className="fm-ov-site-label"><b>{label}</b>{category ? <SourceCategoryBadge category={category} /> : siteName && siteName !== domain && <span>{domain}</span>}</span>
  </span>;
}

const publicationLabels = { last_7_days: "近 7 天", last_30_days: "8–30 天", last_90_days: "31–90 天", older: "90 天以前", unknown: "发布时间未知" };
const colors = ["#6e4293", "#a78abe", "#587a92", "#739c90", "#b78a48", "#a3aab6"];

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

export default function OverviewSources({ attempts, citations, sources, to, refreshing, onRefresh, onAnswer, scope, brandNames = [] }: {
  brandNames?: string[]; scope?: MonitoringScope; attempts: RunAttempt[]; citations?: Extract<MonitoringAnalysisData, { kind: "citations" }>;
  sources?: Extract<MonitoringAnalysisData, { kind: "sources" }>;
  to: string; refreshing: boolean; onRefresh: () => Promise<void>; onAnswer: (attempt: RunAttempt) => void;
}) {
  const rankingRef = useRef<HTMLElement>(null);
  const [loadingHeight, setLoadingHeight] = useState(360);
  const rememberHeight = () => { if (rankingRef.current) setLoadingHeight(rankingRef.current.getBoundingClientRect().height); };
  const [view, setView] = useState("ranking");
  const [domain, setDomain] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [domainPage, setDomainPage] = useState(1);
  const [contentPage, setContentPage] = useState(1);
  const live = trpc.monitoring.overview.sources.useQuery({ scope: scope!, domain, domainPage, contentPage }, {
    enabled: Boolean(scope), staleTime: 60_000, refetchOnWindowFocus: false, retry: false, trpc: { abortOnUnmount: true },
  });
  const chooseDomain = (value: string | null) => { rememberHeight(); setDomain(value); setContentPage(1); setSelectedUrl(null); };
  const localCitations = attempts.flatMap(attempt => visibleSourcesForAttempt(attempt, "cited")).map(source => ({ ...source, url: source.url || "", domain: source.domain || "" }));
  const localSources = attempts.flatMap(attempt => visibleSourcesForAttempt(attempt, "all")).map(source => ({ ...source, url: source.url || "", domain: source.domain || "" }));
  const citationRows = citations ? citations.contents.map(item => ({ ...item, url: item.url || "",
    siteName: localCitations.find(source => source.domain === item.domain && source.siteName)?.siteName })) : localCitations;
  const localPage = citationPage(citationRows, { domain, domainPage, contentPage }, "已读取的本地记录", brandNames, localSources);
  const page = scope ? live.data : localPage;
  const total = page?.total ?? sources?.cited ?? 0;
  const domainCount = page?.domainCount ?? 0;
  const contentCount = page?.contentCount ?? 0;
  const currentDomainPage = page?.domainPage ?? 1;
  const currentContentPage = page?.contentPage ?? 1;
  const domainRows = page?.domains ?? [];
  const contentRows = page?.contents ?? [];
  const filtered = contentRows;
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
    <header className="fm-ov-heading fm-ov-source-heading"><div><h2 id="overview-source-title">信源分析</h2></div><div className="fm-ov-view-switch" role="group" aria-label="切换信源排行或信源分布">{[{ id: "ranking", label: "信源排行" }, { id: "distribution", label: "信源分布" }].map(item => <button type="button" key={item.id} className={view === item.id ? "active" : ""} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}</div></header>
    <div className="fm-ov-heading"><span>{total} 次明确引用 · {sourceTotal} 条来源记录{view === "distribution" ? " · 类型与发布时间" : ""}</span><button type="button" className="fm-text-button" disabled={refreshing || live.isFetching} onClick={() => { void onRefresh(); if (scope) void live.refetch(); }}>{refreshing || live.isFetching ? "正在刷新…" : "刷新数据"}</button></div>
    {view === "ranking" ? scope && live.error ? <p role="alert" className="fm-ov-notice pending">信源读取失败：{live.error.message}<button type="button" className="fm-text-button" onClick={() => void live.refetch()}>重试</button></p> : scope && !live.data ? <section className="fm-ov-card fm-ov-ranking-loading" style={{ minHeight: loadingHeight }} aria-busy="true"><p role="status">正在读取引用域名和内容分页…</p></section> : <section className="fm-ov-card" ref={rankingRef}>{total > 0 ? <div className="fm-ov-source-grid"><aside className="fm-ov-domain-list" aria-label="按引用域名筛选">
      <header className="fm-ov-domain-heading"><h3>引用域名</h3><span>{domainCount} 个域名</span></header>
      <div className="fm-ov-domain-filter"><button type="button" aria-pressed={domain === null} className="fm-ov-all-sources" onClick={() => chooseDomain(null)}><span>全部信源</span><strong>{total} 次引用</strong></button></div>
      <ol className="fm-ov-domain-rows" start={(currentDomainPage - 1) * 5 + 1} aria-label="当前页引用域名">
        {domainRows.map((item, index) => <li key={item.domain}><button type="button" className="fm-ov-domain-choice" data-rank={(currentDomainPage - 1) * 5 + index + 1} aria-pressed={domain === item.domain} onClick={() => chooseDomain(item.domain)}><span className="fm-ov-domain-name"><small className="fm-ov-domain-index" aria-hidden="true">{(currentDomainPage - 1) * 5 + index + 1}</small><SourceIdentity domain={item.domain} siteName={item.siteName} category={item.category} /></span><span className="fm-ov-domain-stats"><strong>{item.count}</strong><small>{total ? (item.count / total * 100).toFixed(1) : "0.0"}%</small></span></button></li>)}
      </ol>
      <OverviewPagination source size={5} label="引用域名分页" unit="个域名" page={currentDomainPage} total={domainCount} onChange={value => { rememberHeight(); setDomainPage(value); }} />
    </aside><div className="fm-ov-source-content"><header className="fm-ov-source-content-heading"><h3>{domain === null ? "全部信源" : domain || "域名未知"} · 引用内容</h3><span>{contentCount} 项内容 · {total} 次总引用</span></header><div className="fm-table-scroll" role="region" aria-label="引用内容表格，可左右滚动" tabIndex={0}><table className="fm-data-table fm-ov-source-ranking"><thead><tr><th>序号</th><th>内容 / 信源</th><th>媒体类型</th><th>引用次数</th><th title={`以全部 ${total} 次引用为分母`}>占比</th><th>来源</th></tr></thead><tbody>{contentRows.map((item, index) => {
      const url = safeExternalUrl(item.url);
      const ratio = total ? item.count / total * 100 : 0;
      return <tr key={`${item.url}:${index}`} className={Boolean(selected && item.url && selected.url === item.url) ? "selected" : ""}><td>{(currentContentPage - 1) * 5 + index + 1}</td><td><button type="button" className="fm-ov-source-title" title={item.title || item.domain} aria-pressed={Boolean(selected && item.url && selected.url === item.url)} disabled={!item.url} onClick={() => setSelectedUrl(item.url || null)}>{item.title || item.domain}</button><SourceIdentity domain={item.domain} siteName={item.siteName} /></td><td><SourceCategoryBadge category={item.category} /></td><td><strong>{item.count}</strong></td><td>{ratio.toFixed(1)}%</td><td>{url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`打开来源：${item.title || item.domain}`}>打开 ↗</a> : "—"}</td></tr>;
    })}</tbody></table></div><OverviewPagination source size={5} label="引用内容分页" page={currentContentPage} total={contentCount} onChange={value => { rememberHeight(); setContentPage(value); setSelectedUrl(null); }} />{!filtered.length && <p className="fm-ov-note">当前域名没有引用内容。</p>}{selected ? <section className="fm-ov-source-related"><h4>已读取的关联回答 · {related.length} 条</h4><p className="fm-ov-note">{selected.title} · 仅列已读取快照，回答数与引用次数口径不同。</p>{related.length ? related.map(attempt => <button type="button" className="fm-ov-related-answer" key={attempt.id} onClick={() => onAnswer(attempt)}><strong>{attempt.question}</strong><span>{attempt.platformName} · {attempt.runId?.slice(0, 8)} · 查看回答 →</span></button>) : <p className="fm-ov-note">已读取快照中暂无该 URL 的明确引用，继续加载批次后可补全。</p>}</section> : null}</div></div> : <div className="fm-empty"><strong>当前筛选暂无明确文内引用</strong><span>未明确引用的答案参考不计入排行。</span></div>}</section> :
    <div className="fm-ov-two-columns">{scope && !live.data ? <section className="fm-ov-card"><h3>信源类型分布</h3><p role={live.error ? "alert" : "status"}>{live.error ? `信源读取失败：${live.error.message}` : "正在读取全部信源分类…"}</p>{live.error && <button type="button" onClick={() => void live.refetch()}>重试</button>}</section> : <Distribution title="信源类型分布" rows={(page?.typeCounts || []).map(item => ({ label: sourceCategoryLabels[item.category], count: item.count }))} note="按域名与站点名规则归类，供筛选参考，未经人工核实" />}<Distribution title="信源发布时间分布" rows={times.map((item) => ({ label: publicationLabels[item.bucket], count: item.discoveredCount, unknown: item.bucket === "unknown" }))} note="按全部来源记录的已返回发布日期统计，日期缺失单列。" /></div>}
  </section>;
}


