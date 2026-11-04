import type { RunAttempt } from "../../../domain";
import { percent, reportChange, reportObservations, reportObservationMetrics } from "./reportModel";

export default function ReportObservations({ before, after, comparable, enabled }: {
  before: RunAttempt[]; after: RunAttempt[]; comparable: boolean; enabled: boolean;
}) {
  const prior = reportObservations(before), current = reportObservations(after);
  return <section className="fm-pr-card" aria-label="真实回答观察指标">
    <h3>真实回答观察</h3>
    <p className="fm-pr-note">以下按所选批次的有效回答统计；正向情感和引用不能代替事实核验或内容达标评分。</p>
    <div className="fm-pr-grid">{reportObservationMetrics.map(metric => <article key={metric.key}>
      <h4>{metric.label}</h4>
      <strong className="fm-pr-value">{enabled ? `${percent(prior[metric.key])} → ${percent(current[metric.key])}` : "待评估"}</strong>
      <p>{reportChange(enabled ? prior[metric.key] : undefined, enabled ? current[metric.key] : undefined, comparable && enabled)}</p>
      <small>{metric.rule}</small>
    </article>)}</div>
    <p className="fm-pr-note">有效回答 {prior.effective} → {current.effective} 条；情感已知 {prior.knownSentiment} → {current.knownSentiment} 条；明确引用记录覆盖 {prior.explicit}/{prior.effective} → {current.explicit}/{current.effective} 条。</p>
    <p className="fm-pr-note">平均排名（仅已提及且排名已知的回答）：{enabled && prior.averagePosition !== undefined ? prior.averagePosition.toFixed(1) : "—"} → {enabled && current.averagePosition !== undefined ? current.averagePosition.toFixed(1) : "—"} 位；分母 {prior.positionCount} → {current.positionCount} 条。排名待确认 {prior.unknownRank} → {current.unknownRank} 条。</p>
  </section>;
}
