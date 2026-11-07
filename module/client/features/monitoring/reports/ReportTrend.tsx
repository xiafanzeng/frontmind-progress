import { useState } from "react";
import type { MonitorRun, RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { rangeBounds } from "../overview/overviewModel";
import { trendCurve } from "../overview/trendCurve";
import { reportAttempts } from "./reportModel";
import { measureQuestion, measurementText, reportPlatformKey, reportPlatformLabel, type QuestionReportMetric } from "./questionReportModel";

const rankSlot = (answer: RunAttempt) => JSON.stringify([reportPlatformKey(answer), answer.repetition]);

/** Compare view only. Actual loaded batches; no interpolation across missing values. */
export default function ReportTrend({ runs, query, questionId, metric, before, after, timezone, date, unavailable }: {
  runs: MonitorRun[]; query: MonitoringQueryState; questionId?: string; metric: QuestionReportMetric;
  before?: MonitorRun; after?: MonitorRun; timezone: string; date: (run?: MonitorRun) => string; unavailable?: string;
}) {
  const [slot, setSlot] = useState("");
  const [focusedId, setFocusedId] = useState("");
  const bounds = rangeBounds(query, timezone);
  const history = runs.filter(run => Date.parse(run.createdAt) >= bounds.from && Date.parse(run.createdAt) < bounds.to);
  const slots = [...new Map(history.flatMap(run => questionId ? reportAttempts(run, query, questionId) : []).map(answer => [rankSlot(answer), `${reportPlatformLabel(answer)} · 第 ${answer.repetition} 次`])).entries()];
  const selectedSlot = slots.some(([key]) => key === slot) ? slot : slots[0]?.[0];
  const brand = after?.config.brandName || before?.config.brandName;
  const rows = history.map(run => {
    const attempts = questionId ? reportAttempts(run, query, questionId) : [];
    const scoped = metric === "averagePosition" ? attempts.filter(answer => rankSlot(answer) === selectedSlot) : attempts;
    const measurement = measureQuestion(scoped, metric, query.subject === "self");
    const missing = run.status !== "completed" ? "批次尚未完成" : run.config.brandName !== brand ? "品牌快照不同" : metric === "averagePosition" && scoped.length > 1 ? "相同采集序号有多条记录" : undefined;
    return { run, measurement, value: missing ? undefined : measurement.value, missing: missing || measurement.missing };
  });
  const valid = rows.filter(row => row.value !== undefined);
  const rank = metric === "averagePosition";
  const maximum = rank ? Math.max(2, ...valid.map(row => row.value!)) : 100;
  const firstTime = history.length ? Date.parse(history[0]!.createdAt) : 0;
  const lastTime = history.length ? Date.parse(history.at(-1)!.createdAt) : firstTime;
  const x = (run: MonitorRun) => lastTime === firstTime ? 460 : 64 + (Date.parse(run.createdAt) - firstTime) / (lastTime - firstTime) * 792;
  const y = (value: number) => rank ? 28 + (value - 1) / (maximum - 1) * 184 : 212 - value / 100 * 184;
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: Array<{ x: number; y: number }> = [];
  for (const row of rows) {
    if (row.value === undefined) { if (segment.length) segments.push(segment); segment = []; continue; }
    const point = { x: x(row.run), y: y(row.value) };
    // The existing curve requires increasing x; duplicate timestamps start a new segment.
    if (segment.length && point.x <= segment.at(-1)!.x) { segments.push(segment); segment = []; }
    segment.push(point);
  }
  if (segment.length) segments.push(segment);
  const focus = rows.find(row => row.run.id === focusedId) || rows.find(row => row.run.id === after?.id) || rows.at(-1);
  const ticks = rank ? [...new Set([1, Math.ceil(maximum / 2), maximum])] : [100, 50, 0];
  return <section className="fm-qpr-panel fm-qpr-trend" aria-label="指标趋势">
    <header className="fm-qpr-section-heading"><div><h3>指标趋势</h3><p>所选日期内已读取 {history.length} 个批次{rank ? " · 同一采集条件和回答序号的实际排名" : " · 每个点对应一次真实采集批次"}</p></div>
      {rank && <label className="fm-qpr-platform">采集记录<select aria-label="排名趋势采集记录" value={selectedSlot || ""} disabled={!slots.length} onChange={event => { setSlot(event.target.value); setFocusedId(""); }}>{!slots.length && <option value="">暂无记录</option>}{slots.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
    </header>
    {unavailable ? <p className="fm-pr-empty">{unavailable}</p> : !valid.length ? <p className="fm-pr-empty">当前日期与筛选范围内没有可绘制的有效数据。</p> : <>
      <div className="fm-qpr-trend-chart"><svg viewBox="0 0 920 258" aria-label={rank ? "品牌实际排名趋势，排名越小越靠前" : "指标百分比趋势"}>
        {ticks.map(tick => <g key={tick}><line x1="64" x2="856" y1={y(tick)} y2={y(tick)} className="fm-qpr-gridline" /><text x="50" y={y(tick) + 4} textAnchor="end">{rank ? tick : `${tick}%`}</text></g>)}
        {segments.filter(points => points.length > 1).map((points, index) => <path key={index} d={trendCurve(points)} className="fm-qpr-trend-line" />)}
        {valid.map(row => <circle key={row.run.id} cx={x(row.run)} cy={y(row.value!)} r={row.run.id === focus?.run.id ? 6 : 4} className={`fm-qpr-trend-point${row.run.id === before?.id ? " is-before" : row.run.id === after?.id ? " is-after" : ""}`} tabIndex={0} role="button"
          aria-label={`${date(row.run)}：${measurementText(row.value, metric)}，${row.measurement.coverage}`} onFocus={() => setFocusedId(row.run.id)} onMouseEnter={() => setFocusedId(row.run.id)} onClick={() => setFocusedId(row.run.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFocusedId(row.run.id); } }}>
          <title>{date(row.run)} · V{row.run.version} · {measurementText(row.value, metric)}</title>
        </circle>)}
        <text x="64" y="246">{date(history[0])}</text>{history.length > 1 && <text x="856" y="246" textAnchor="end">{date(history.at(-1))}</text>}
      </svg></div>
      {focus && <div className="fm-qpr-trend-readout" aria-live="polite"><span>{date(focus.run)} · V{focus.run.version}{focus.run.id === before?.id ? " · 优化前" : focus.run.id === after?.id ? " · 优化后" : ""}</span><b>{measurementText(focus.value, metric)}</b><small>{focus.missing || focus.measurement.coverage}</small></div>}
    </>}
    <p className="fm-qpr-muted">仅展示已读取批次；缺失、未完成及不同品牌快照不连线。{rank ? "排名不取平均值。" : "不同批次的样本数量和平台构成可能不同。"}</p>
    {!!rows.length && <details className="fm-qpr-trend-records"><summary>查看采集点与样本数</summary><div className="fm-pr-table fm-qpr-table"><table><thead><tr><th>采集批次</th><th>指标值</th><th>统计依据</th></tr></thead><tbody>{rows.map(row => <tr key={row.run.id}><th scope="row">{date(row.run)} · V{row.run.version}</th><td>{measurementText(row.value, metric)}</td><td>{row.missing || row.measurement.basis}<small>{row.measurement.coverage}</small></td></tr>)}</tbody></table></div></details>}
  </section>;
}
