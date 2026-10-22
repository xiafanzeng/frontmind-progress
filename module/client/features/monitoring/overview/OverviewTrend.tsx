import { useState } from "react";
import type { CompetitorInput, MonitorRun } from "../../../domain";
import { calculateEvidenceMetrics } from "../selectors";
import { formatDateTime } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { metricText, overviewMetrics, runSignature, scopedAttempts, subjectAttempts, type OverviewMetric } from "./overviewModel";

export default function OverviewTrend({ runs, query, competitors, loading, complete, onConfigure }: {
  runs: MonitorRun[]; query: MonitoringQueryState; competitors: CompetitorInput[];
  loading: boolean; complete: boolean; onConfigure: () => void;
}) {
  const [metric, setMetric] = useState<OverviewMetric>("mentionRate");
  const ordered = runs.filter((run) => scopedAttempts(run, query).length).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const points = ordered.filter((run) => calculateEvidenceMetrics(scopedAttempts(run, query)).effective > 0);
  const signatures = new Map(points.map((run) => [run.id, runSignature(run, query)]));
  const comparable = points.length > 1 && new Set(signatures.values()).size === 1;
  const series = [
    { name: query.subject === "self" ? "当前品牌" : query.subject.slice(11), subject: query.subject },
    ...(query.subject === "self" ? [] : [{ name: "当前品牌", subject: "self" as const }]),
    ...competitors.filter((item) => `competitor:${item.name}` !== query.subject).map((item) => ({ name: item.name, subject: `competitor:${item.name}` as const })),
  ].map((item) => ({ ...item, values: points.map((run) => {
    const name = item.subject === "self" ? undefined : item.subject.slice(11);
    const configured = !name || run.config.competitors.some((competitor) =>
      [competitor.name, ...competitor.aliases].some((alias) => alias === name || competitors.find((entry) => entry.name === name)?.aliases.includes(alias)));
    return configured ? calculateEvidenceMetrics(subjectAttempts(run, { ...query, subject: item.subject }, competitors))[metric] : undefined;
  }) }));
  const max = metric === "mentionRate" || metric === "top3Rate" ? 100 : Math.max(1, ...series.flatMap((item) => item.values.flatMap((value) => value === undefined ? [] : [value])));
  const x = (index: number) => 48 + (index / Math.max(1, points.length - 1)) * 694;
  const y = (value: number) => 210 - (value / max) * 180;
  const colors = ["#7950d5", "#2e90b7", "#ef9c3d", "#28a787", "#d46a98", "#697586"];
  return <section className="fm-ov-section" aria-labelledby="overview-trend-title">
    <header className="fm-ov-heading"><h2 id="overview-trend-title">趋势分析</h2><span>按采集运行计算 · {metric === "averagePosition" ? "排名越小越靠前" : "有效回答作为统计基础"}</span></header>
    <div className="fm-segmented" role="group" aria-label="趋势指标">{overviewMetrics.map((item) => <button type="button" key={item.key} aria-pressed={metric === item.key} className={metric === item.key ? "active" : ""} onClick={() => setMetric(item.key)}>{item.label}</button>)}</div>
    <p className="fm-ov-note">对比条件：问题及分类、模型及模式、地区、时窗、每题采集次数与品牌配置一致。概览先合并有效回答再计算比例，不平均每日百分比。</p>
    {loading ? <p role="status">正在读取运行快照，暂不判断趋势是否充足…</p> : points.length < 2 ? <div className="fm-empty">
      <strong>{complete ? "再运行一次，即可查看趋势" : "已读取的有效运行不足两次"}</strong>
      <span>{complete ? "当前筛选至少需要两个含有效回答的运行。" : "请继续加载批次后再确认趋势，尚未读取的运行不视为无数据。"}</span>
      {complete && <button type="button" className="fm-primary-button" onClick={onConfigure}>设置执行计划</button>}
    </div> : <>
      <p className={`fm-ov-notice ${comparable ? "verified" : "pending"}`}>{comparable ? "已核对：所示运行配置及计划采集次数一致。" : "存在配置或采集次数差异：不同口径的运行不连线，周期变化暂不作改善结论。"} {complete ? "已读取当前及上一周期全部批次。" : "当前展示已读取批次，继续加载可补全范围。"}</p>
      <div className="fm-ov-chart"><svg viewBox="0 0 780 255" role="img" aria-label={`${overviewMetrics.find((item) => item.key === metric)?.label}按运行对比曲线；下方提供完整数据表`}>
        {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="48" y1={y(max * fraction)} x2="742" y2={y(max * fraction)} stroke="#e9e7ef" /><text x="4" y={y(max * fraction) + 4} fontSize="11" fill="#667085">{metricText(metric, max * fraction)}</text></g>)}
        {series.map((item, seriesIndex) => <g key={item.subject} stroke={colors[seriesIndex % colors.length]} fill={colors[seriesIndex % colors.length]}>
          {item.values.map((value, index) => value === undefined ? null : <g key={points[index]!.id}>
            {index > 0 && item.values[index - 1] !== undefined && signatures.get(points[index - 1]!.id) === signatures.get(points[index]!.id) && <line x1={x(index - 1)} y1={y(item.values[index - 1]!)} x2={x(index)} y2={y(value)} strokeWidth="2" />}
            <circle cx={x(index)} cy={y(value)} r="4"><title>{item.name} · {formatDateTime(points[index]!.createdAt)} · {metricText(metric, value)}</title></circle>
          </g>)}
        </g>)}
        {points.map((run, index) => (points.length <= 10 || index === 0 || index === points.length - 1) && <text key={run.id} x={x(index)} y="239" textAnchor="middle" fontSize="10" fill="#667085">{formatDateTime(run.createdAt)}</text>)}
      </svg></div>
      <div className="fm-ov-legend">{series.map((item, index) => <span key={item.subject}><i style={{ background: colors[index % colors.length] }} />{item.name}</span>)}</div>
      <div className="fm-ov-periods">{series.map((item) => {
        const values = item.values.filter((value): value is number => value !== undefined);
        return <p key={item.subject}><strong>{item.name}</strong> 本周期 {values.length ? `${metricText(metric, Math.min(...values))}–${metricText(metric, Math.max(...values))}` : "—"}<small>各运行范围{complete ? "" : " · 已读取部分"}</small></p>;
      })}</div>
      <div className="fm-table-scroll"><table className="fm-data-table"><caption>按运行的真实指标；缺失值不补零、不插值</caption><thead><tr><th>采集运行</th>{series.map((item) => <th key={item.subject}>{item.name}</th>)}</tr></thead><tbody>{points.map((run, index) => <tr key={run.id}><th>{formatDateTime(run.createdAt)} · {run.id.slice(0, 8)}</th>{series.map((item) => <td key={item.subject}>{metricText(metric, item.values[index])}</td>)}</tr>)}</tbody></table></div>
    </>}
  </section>;
}
