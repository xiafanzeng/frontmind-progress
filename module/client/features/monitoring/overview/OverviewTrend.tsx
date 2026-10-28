import { useState } from "react";
import { trendCurve } from "./trendCurve";
import type { CompetitorInput, MonitorRun } from "../../../domain";
import { calculateEvidenceMetrics } from "../selectors";
import { formatDateTime } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { metricText, overviewMetrics, runSignature, scopedAttempts, subjectAttempts, type OverviewMetric } from "./overviewModel";

export default function OverviewTrend({ runs, query, competitors, currentBrand, loading, complete, onConfigure }: {
  runs: MonitorRun[]; query: MonitoringQueryState; competitors: CompetitorInput[];
  currentBrand: string; loading: boolean; complete: boolean; onConfigure: () => void;
}) {
  const [activePoint, setActivePoint] = useState("");
  const [metric, setMetric] = useState<OverviewMetric>("mentionRate");
  const [hidden, setHidden] = useState<string[]>([]);
  const ordered = runs.filter((run) => scopedAttempts(run, query).length).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const points = ordered.filter(run => Number.isFinite(Date.parse(run.createdAt)));
  const signatures = new Map(points.map((run) => [run.id, runSignature(run, query)]));
  const comparable = points.length > 1 && new Set(signatures.values()).size === 1;
  const series = [
    { name: query.subject === "self" ? currentBrand || "监控品牌待读取" : query.subject.slice(11), subject: query.subject },
    ...(query.subject === "self" ? [] : [{ name: currentBrand || "监控品牌待读取", subject: "self" as const }]),
    ...competitors.filter((item) => `competitor:${item.name}` !== query.subject).map((item) => ({ name: item.name, subject: `competitor:${item.name}` as const })),
  ].map((item) => ({ ...item, values: points.map((run) => {
    const selected = subjectAttempts(run, { ...query, subject: item.subject }, competitors, currentBrand);
    const values = calculateEvidenceMetrics(selected);
    return values.effective > 0 ? values[metric] : undefined;
  }) }));
  const effectivePoints = points.filter((_, index) => series.some(item => item.values[index] !== undefined));
  const max = metric === "mentionRate" || metric === "top3Rate" ? 100 : Math.max(1, ...series.flatMap((item) => item.values.flatMap((value) => value === undefined ? [] : [value])));
  const startTime = Date.parse(points[0]?.createdAt || "");
  const endTime = Date.parse(points.at(-1)?.createdAt || "");
  const x = (index: number) => endTime > startTime ? 48 + ((Date.parse(points[index]!.createdAt) - startTime) / (endTime - startTime)) * 694 : 395;
  const y = (value: number) => 210 - (value / max) * 180;
  const colors = ["#3d1560", "#427ec7", "#bb752b", "#218366", "#c45068", "#697586"];
  const paths = (values: Array<number | undefined>) => {
    const segments: Array<Array<{ x: number; y: number }>> = [];
    let segment: Array<{ x: number; y: number }> = [];
    values.forEach((value, index) => {
      const breakBefore = index > 0 && (values[index - 1] === undefined || x(index) <= x(index - 1) || signatures.get(points[index - 1]!.id) !== signatures.get(points[index]!.id) || points[index - 1]!.status !== "completed" || points[index]!.status !== "completed");
      if (value === undefined || breakBefore) { if (segment.length) segments.push(segment); segment = []; }
      if (value !== undefined) segment.push({ x: x(index), y: y(value) });
    });
    if (segment.length) segments.push(segment);
    return segments.filter(segment => segment.length > 1).map(trendCurve);
  };
  return <section className="fm-ov-section" aria-labelledby="overview-trend-title">
    <header className="fm-ov-heading"><h2 id="overview-trend-title">趋势分析</h2><span>按采集运行计算 · {metric === "averagePosition" ? "排名越小越靠前" : "有效回答作为统计基础"}</span></header>
    <section className="fm-ov-card fm-ov-trend-card"><header className="fm-ov-heading"><h3>品牌与竞品趋势</h3><div className="fm-segmented" role="group" aria-label="趋势指标">{overviewMetrics.map((item) => <button type="button" key={item.key} aria-pressed={metric === item.key} className={metric === item.key ? "active" : ""} onClick={() => { setMetric(item.key); setActivePoint(""); }}>{item.label}</button>)}</div></header>
    {loading ? <p role="status">正在读取运行快照，暂不判断趋势是否充足…</p> : effectivePoints.length === 0 ? <div className="fm-empty">
      <strong>{complete ? "当前筛选暂无有效采集点" : "已读取批次中暂无有效采集点"}</strong>
      <span>{complete ? "单个有效采集点显示真实值，两个及以上可比点才连线。" : "请继续加载批次后再确认趋势，尚未读取的运行不视为无数据。"}</span>
      {complete && <button type="button" className="fm-primary-button" onClick={onConfigure}>设置执行计划</button>}
    </div> : <>
      {effectivePoints.length === 1 && <p className="fm-ov-notice pending">当前仅有一个有效采集点，展示真实值，暂不连线。</p>}
      <p className={`fm-ov-notice ${comparable ? "verified" : "pending"}`}>{comparable ? "已核对：所示运行配置及计划采集次数一致。" : "存在配置或采集次数差异：不同口径的运行不连线，周期变化暂不作改善结论。"} {complete ? "已读取当前筛选的完整历史目录与批次证据。" : "当前展示已读取批次，继续加载可补全范围。"}</p>
      <div className="fm-ov-legend" role="group" aria-label="显示或隐藏品牌曲线">{series.map((item, index) => <button type="button" key={item.subject} aria-pressed={!hidden.includes(item.subject)} onClick={() => setHidden(value => value.includes(item.subject) ? value.filter(subject => subject !== item.subject) : [...value, item.subject])}><i style={{ background: colors[index % colors.length] }} />{item.name}</button>)}</div>
      <div className="fm-ov-chart"><svg viewBox="0 0 780 255" role="img" aria-label={`${overviewMetrics.find((item) => item.key === metric)?.label}按运行对比曲线；聚焦采集点可查看真实值`}>
        {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="48" y1={y(max * fraction)} x2="742" y2={y(max * fraction)} stroke="#e9e7ef" /><text x="4" y={y(max * fraction) + 4} fontSize="11" fill="#667085">{metricText(metric, max * fraction)}</text></g>)}
        {series.map((item, seriesIndex) => hidden.includes(item.subject) ? null : <g key={item.subject} stroke={colors[seriesIndex % colors.length]} fill={colors[seriesIndex % colors.length]}>
          {paths(item.values).map((path, index) => <path key={index} d={path} fill="none" strokeWidth="2.5" strokeLinejoin="round" />)}
          {item.values.map((value, index) => value === undefined ? null : <g key={points[index]!.id}>
            
            <circle cx={x(index)} cy={y(value)} r="3" tabIndex={0} role="button" aria-label={`${item.name}，${formatDateTime(points[index]!.createdAt)}，${metricText(metric, value)}，${calculateEvidenceMetrics(scopedAttempts(points[index]!, query)).effective} 条有效回答`} onFocus={() => setActivePoint(`${item.name} · ${formatDateTime(points[index]!.createdAt)} · ${metricText(metric, value)} · ${calculateEvidenceMetrics(scopedAttempts(points[index]!, query)).effective} 条有效回答`)} onMouseEnter={() => setActivePoint(`${item.name} · ${formatDateTime(points[index]!.createdAt)} · ${metricText(metric, value)} · ${calculateEvidenceMetrics(scopedAttempts(points[index]!, query)).effective} 条有效回答`)}><title>{item.name} · {formatDateTime(points[index]!.createdAt)} · {metricText(metric, value)}</title></circle>
          </g>)}
        </g>)}
        {points.map((run, index) => (index === 0 || (index === points.length - 1 && endTime > startTime)) && <text key={run.id} x={x(index)} y="239" textAnchor="middle" fontSize="10" fill="#667085">{formatDateTime(run.createdAt)}</text>)}
      </svg></div><p className="fm-ov-chart-readout" role="status">{activePoint || "悬停或聚焦采集点，查看真实值与有效回答数"}</p><p className="fm-ov-note">横轴按实际采集时间。三个及以上可比点平滑连线，两个点直线连接；缺失值、不同配置和未完成批次断开。曲线仅辅助阅读，不产生额外数据。</p>
      {series.every(item => hidden.includes(item.subject)) && <p role="status" className="fm-ov-note">曲线已全部隐藏，点击上方品牌名称重新显示。</p>}
      <div className="fm-ov-periods">{series.map((item) => {
        const values = item.values.filter((value): value is number => value !== undefined);
        return <p key={item.subject}><strong>{item.name}</strong> 本周期 {values.length ? `${metricText(metric, Math.min(...values))}–${metricText(metric, Math.max(...values))}` : "—"}<small>各运行范围{complete ? "" : " · 已读取部分"}</small></p>;
      })}</div>

    </>}</section>
  </section>;
}

