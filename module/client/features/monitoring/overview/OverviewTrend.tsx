import { useState } from "react";
import { monitoringLocalCalendarDate } from "../queryState";
import { calendarTrendDays } from "./trendCalendar";
import { trendCurve } from "./trendCurve";
import type { CompetitorInput, MonitorRun } from "../../../domain";
import { calculateEvidenceMetrics } from "../selectors";
import { formatDateTime } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { metricText, overviewMetrics, runSignature, scopedAttempts, subjectAttempts, type OverviewMetric } from "./overviewModel";

export default function OverviewTrend({ runs, query, timezone, competitors, currentBrand, loading, complete, onConfigure }: {
  runs: MonitorRun[]; query: MonitoringQueryState; timezone: string; competitors: CompetitorInput[];
  currentBrand: string; loading: boolean; complete: boolean; onConfigure: () => void;
}) {
  const [activePoint, setActivePoint] = useState("");
  const [metric, setMetric] = useState<OverviewMetric>("mentionRate");
  const [hidden, setHidden] = useState<string[]>([]);
  const days = calendarTrendDays(runs, query, timezone);
  const recordedDates = new Set(runs.filter(run => scopedAttempts(run, query).length && Number.isFinite(Date.parse(run.createdAt))).map(run => monitoringLocalCalendarDate(new Date(run.createdAt), timezone)));
  const signatures = days.map(day => day.run ? runSignature(day.run, query) : undefined);
  const series = [
    { name: query.subject === "self" ? currentBrand || "监控品牌待读取" : query.subject.slice(11), subject: query.subject },
    ...(query.subject === "self" ? [] : [{ name: currentBrand || "监控品牌待读取", subject: "self" as const }]),
    ...competitors.filter((item) => `competitor:${item.name}` !== query.subject).map((item) => ({ name: item.name, subject: `competitor:${item.name}` as const })),
  ].map((item) => {
    const metrics = days.map(day => day.run ? calculateEvidenceMetrics(subjectAttempts(day.run, { ...query, subject: item.subject }, competitors, currentBrand)) : undefined);
    const observations = metrics.map(value => value && value.effective > 0 ? value[metric] : undefined);
    return { ...item, metrics, observations, values: observations.map((value, index) => !recordedDates.has(days[index]!.date) && complete && !loading ? 0 : value) };
  });
  const effectiveDays = days.filter((_, index) => series.some(item => item.observations[index] !== undefined));
  const max = metric === "mentionRate" || metric === "top3Rate" ? 100 : Math.max(1, ...series.flatMap(item => item.values.flatMap(value => value === undefined ? [] : [value])));
  const chartWidth = Math.max(780, (days.length - 1) * 22 + 96);
  const x = (index: number) => days.length > 1 ? 48 + index / (days.length - 1) * (chartWidth - 86) : chartWidth / 2;
  const labelEvery = Math.max(1, Math.ceil(72 / ((chartWidth - 86) / Math.max(1, days.length - 1))));
  const pointLabel = (item: typeof series[number], index: number) => !days[index]!.run ? `${item.name} · ${days[index]!.date} · 无采集记录，按 0 展示` : `${item.name} · ${days[index]!.date} · ${formatDateTime(days[index]!.run!.completedAt || days[index]!.run!.createdAt)} · ${metricText(metric, item.values[index])} · ${item.metrics[index]!.effective} 条有效回答`;
  const y = (value: number) => 210 - (value / max) * 180;
  const colors = ["#3d1560", "#427ec7", "#bb752b", "#218366", "#c45068", "#697586"];
  const paths = (values: Array<number | undefined>) => {
    const segments: Array<Array<{ x: number; y: number }>> = [];
    let segment: Array<{ x: number; y: number }> = [];
    let previousSignature: string | undefined;
    values.forEach((value, index) => {
      if (!days[index]?.run) {
        if (value !== undefined) segment.push({ x: x(index), y: y(value) });
        else { if (segment.length) segments.push(segment); segment = []; previousSignature = undefined; }
        return;
      }
      if (value === undefined || (previousSignature !== undefined && previousSignature !== signatures[index])) {
        if (segment.length) segments.push(segment);
        segment = [];
      }
      if (value !== undefined) segment.push({ x: x(index), y: y(value) });
      previousSignature = signatures[index];
    });
    if (segment.length) segments.push(segment);
    return segments.filter(segment => segment.length > 1).map(trendCurve);
  };
  return <section className="fm-ov-section" aria-labelledby="overview-trend-title">
    <header className="fm-ov-heading"><h2 id="overview-trend-title">趋势分析</h2><span>按自然日展示 · {metric === "averagePosition" ? "排名越小越靠前" : "有效回答作为统计基础"}</span></header>
    <section className="fm-ov-card fm-ov-trend-card" aria-busy={loading}><header className="fm-ov-heading"><h3>品牌与竞品趋势</h3><div className="fm-segmented" role="group" aria-label="趋势指标">{overviewMetrics.map((item) => <button type="button" key={item.key} aria-pressed={metric === item.key} className={metric === item.key ? "active" : ""} onClick={() => { setMetric(item.key); setActivePoint(""); }}>{item.label}</button>)}</div></header>
    {loading && !runs.length ? <p role="status">正在读取运行快照，暂不判断趋势是否充足…</p> : <>
      {effectiveDays.length === 0 && <div className="fm-empty">
        <strong>{complete ? "当前筛选暂无有效采集点" : "已读取批次中暂无有效采集点"}</strong>
        <span>{complete ? "无采集记录的日期按 0 绘图，不计入真实采集数量。" : "请继续加载批次后再确认趋势，尚未读取的运行不视为无数据。"}</span>
        {complete && <button type="button" className="fm-primary-button" onClick={onConfigure}>设置执行计划</button>}
      </div>}
      {effectiveDays.length === 1 && <p className="fm-ov-notice pending">当前仅有一个真实采集点；已完整读取范围内的无采集日期按 0 连线。</p>}
      <div className="fm-ov-legend" role="group" aria-label="显示或隐藏品牌曲线">{series.map((item, index) => <button type="button" key={item.subject} aria-pressed={!hidden.includes(item.subject)} onClick={() => setHidden(value => value.includes(item.subject) ? value.filter(subject => subject !== item.subject) : [...value, item.subject])}><i style={{ background: colors[index % colors.length] }} />{item.name}</button>)}</div>
      <div className="fm-ov-chart fm-ov-daily-chart"><svg viewBox={`0 0 ${chartWidth} 255`} style={{ minWidth: chartWidth }} role="img" aria-label={`${overviewMetrics.find((item) => item.key === metric)?.label}按自然日对比曲线；聚焦采集点可查看真实值`}>
        {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="48" y1={y(max * fraction)} x2={chartWidth - 38} y2={y(max * fraction)} stroke="#e9e7ef" /><text x="4" y={y(max * fraction) + 4} fontSize="11" fill="#667085">{metricText(metric, max * fraction)}</text></g>)}
        {series.map((item, seriesIndex) => hidden.includes(item.subject) ? null : <g key={item.subject} stroke={colors[seriesIndex % colors.length]} fill={colors[seriesIndex % colors.length]}>
          {paths(item.values).map((path, index) => <path key={index} d={path} fill="none" strokeWidth="2.5" strokeLinejoin="round" />)}
          {item.values.map((value, index) => value === undefined ? null : <g key={days[index]!.date}>
            <circle cx={x(index)} cy={y(value)} r="3" tabIndex={0} role="button" aria-label={pointLabel(item, index)} onFocus={() => setActivePoint(pointLabel(item, index))} onMouseEnter={() => setActivePoint(pointLabel(item, index))}><title>{pointLabel(item, index)}</title></circle>
          </g>)}
        </g>)}
        {days.map((day, index) => <g key={day.date}>
          {(index === 0 || index === days.length - 1 || (index % labelEvery === 0 && days.length - 1 - index >= labelEvery / 2)) && <text x={x(index)} y="239" textAnchor="middle" fontSize="10" fill="#667085">{day.date}</text>}
        </g>)}
      </svg></div><p className="fm-ov-chart-readout" role="status">{activePoint || "悬停或聚焦查看数值；无采集记录的日期按 0 绘图，不计入真实采集数量"}</p>
      {series.every(item => hidden.includes(item.subject)) && <p role="status" className="fm-ov-note">曲线已全部隐藏，点击上方品牌名称重新显示。</p>}
      <div className="fm-ov-periods">{series.map((item) => {
        const values = item.observations.filter((value): value is number => value !== undefined);
        return <p key={item.subject}><strong>{item.name}</strong> 本周期 {values.length ? `${metricText(metric, Math.min(...values))}–${metricText(metric, Math.max(...values))}` : "—"}<small>每日末次完成运行范围{complete ? "" : " · 已读取部分"}</small></p>;
      })}</div>

    </>}</section>
  </section>;
}

