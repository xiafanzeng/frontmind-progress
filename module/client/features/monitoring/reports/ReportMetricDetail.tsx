import type { RunAttempt } from "../../../domain";
import { compactMeasurement, reportDetailCounts } from "./reportPresentation";
import { measureQuestion, questionReportMetrics, type QuestionReportMetric } from "./questionReportModel";

type Segment = { label: string; count: number; color: string };
export default function ReportMetricDetail({ attempts, metric, enabled, period }: {
  attempts: RunAttempt[]; metric: QuestionReportMetric; enabled: boolean; period: string;
}) {
  const counts = reportDetailCounts(attempts);
  const measurement = measureQuestion(attempts, metric, enabled);
  const definition = questionReportMetrics.find(item => item.key === metric)!;
  const applicable = metric !== "top3Rate" || (attempts.length > 0 && attempts.every(answer => answer.questionCategory === "industry"));
  const unknown = { label: "提及未判定", count: counts.mentionUnknown, color: "#b3bac8" };
  const unmentioned = { label: "未提及", count: counts.unmentioned, color: "#d1d7e2" };
  const noRank = { label: "已提及 · 排名缺失", count: counts.mentionedRankUnknown, color: "#b79bcd" };
  const segments: Segment[] = metric === "mentionRate" ? [
    { label: "已提及", count: counts.mentioned, color: "#4a86cf" }, unmentioned, unknown,
  ] : metric === "positiveRate" ? [
    { label: "正面", count: counts.positive, color: "#319b81" },
    { label: "中性", count: counts.neutral, color: "#7893ba" },
    { label: "负面", count: counts.negative, color: "#c66b80" },
    { label: "标签缺失", count: counts.sentimentUnknown, color: "#b3bac8" },
  ] : [
    { label: "第 1 名", count: counts.rank1, color: "#379b85" },
    { label: "第 2 名", count: counts.rank2, color: "#6b9ccc" },
    { label: "第 3 名", count: counts.rank3, color: "#9d81bc" },
    { label: "第 4 名及以后", count: counts.rankOutside, color: "#d0b17e" }, noRank, unmentioned, unknown,
  ];
  const tiles = metric === "mentionRate" ? [
    { label: "已提及回答", value: counts.mentioned, note: "明确返回提及判定" },
    { label: "未提及回答", value: counts.unmentioned, note: "明确返回未提及判定" },
    { label: "待判定回答", value: counts.mentionUnknown, note: "不按未提及计算" },
    { label: "有效采集条件", value: `${counts.effectivePlatforms} / ${counts.platforms}`, note: "平台、端、模式及地区" },
  ] : metric === "positiveRate" ? [
    { label: "正面回答", value: counts.positive, note: "已返回正面标签" },
    { label: "中性回答", value: counts.neutral, note: "已返回中性标签" },
    { label: "负面回答", value: counts.negative, note: "已返回负面标签" },
    { label: "标签缺失", value: counts.sentimentUnknown, note: "不计入评价率分母" },
  ] : [
    { label: "第 1 名", value: counts.rank1, note: "实际排名记录" },
    { label: "第 2–3 名", value: counts.rank2 + counts.rank3, note: "实际排名记录" },
    { label: "第 4 名及以后", value: counts.rankOutside, note: "已返回有效排名" },
    { label: "已提及 · 排名缺失", value: counts.mentionedRankUnknown, note: "不补零、不推测排名" },
  ];
  return <section className="fm-qpr-panel fm-qpr-detail" aria-label={`${period}指标细化`}>
    <header className="fm-qpr-section-heading"><div><h3>{period} · 指标细化</h3><p>{definition.rule}</p></div><small>有效回答 {counts.effective} / 采集 {counts.attempts}</small></header>
    {!enabled || !applicable || !counts.effective ? <div className="fm-pr-empty">{measurement.missing || "当前问题不适用 Top3 推荐率。"}</div> : <>
      <div className="fm-qpr-detail-layout"><div className={`fm-qpr-detail-primary is-${metric}`}><span>{definition.label}</span><strong>{compactMeasurement(measurement, metric)}</strong><small>{measurement.coverage}</small></div>
        <div className="fm-qpr-detail-tiles">{tiles.map(tile => <div key={tile.label}><span>{tile.label}</span><strong>{tile.value}</strong><small>{tile.note}</small></div>)}</div></div>
      <div className="fm-qpr-distribution"><div className="fm-qpr-distribution-track" aria-hidden="true">{segments.map(segment => <span key={segment.label} style={{ width: `${segment.count / counts.effective * 100}%`, background: segment.color }} />)}</div>
        <ul>{segments.map(segment => <li key={segment.label}><i style={{ background: segment.color }} aria-hidden="true" />{segment.label}<b>{segment.count}</b></li>)}</ul>
        <p>{metric === "positiveRate" ? "分布展示全部有效回答；正面评价率仅以已判定情感的回答为分母。" : "分布展示全部有效回答；未判定与未提及分别保留。"}</p>
      </div>
      {measurement.missing && <p className="fm-qpr-muted">{measurement.missing}</p>}
    </>}
  </section>;
}
