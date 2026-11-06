import { Info } from "lucide-react";
import type { RunAttempt } from "../../../domain";
import { percent, reportChange, reportObservations, reportObservationMetrics, validAnswers } from "./reportModel";
import type { GapKind } from "./reportInsights";
import ReportGaps from "./ReportGaps";

export default function ReportObservations({ before, after, comparable, enabled, onGap }: {
  before: RunAttempt[]; after: RunAttempt[]; comparable: boolean; enabled: boolean; onGap: (kind: GapKind) => void;
}) {
  const prior = reportObservations(before), current = reportObservations(after);
  const knownMention = validAnswers(after).filter(item => typeof item.brandMentioned === "boolean").length;
  const missing = (key: typeof reportObservationMetrics[number]["key"]) => !enabled ? "当前观察指标以监控本品为对象" : !current.effective ? "当前范围没有有效回答" : key === "mentionRate" ? "部分回答未返回提及判定" : key === "top3Rate" ? `${current.unknownRank} 条排名依据待确认` : key === "positiveRate" ? "尚无已判定情感的回答" : "部分回答的引用记录不完整";
  const coverage = (key: typeof reportObservationMetrics[number]["key"]) => !enabled ? "当前未计算竞品观察指标" : key === "mentionRate" ? `已判定提及 ${knownMention} / 有效回答 ${current.effective}` : key === "top3Rate" ? `排名依据完整 ${current.effective - current.unknownRank} / 有效回答 ${current.effective}` : key === "positiveRate" ? `已判定 ${current.knownSentiment} 条 · 未判定 ${current.effective - current.knownSentiment} 条` : `引用记录完整 ${current.explicit} / 有效回答 ${current.effective}`;
  return <section className="fm-pr-card fm-pr-observations" aria-label="真实回答观察指标">
    <header className="fm-pr-observations-heading"><div><h3>真实回答观察</h3><p className="fm-pr-note">查看本次结果与可比批次变化</p></div><span className="fm-pr-sample-count">有效回答 {current.effective} 条</span></header>
    <div className="fm-pr-observation-grid">{reportObservationMetrics.map(metric => {
      const value = enabled ? current[metric.key] : undefined;
      const canCompare = enabled && comparable && prior[metric.key] !== undefined && value !== undefined;
      return <article className="fm-pr-observation-metric" key={metric.key}>
        <div className="fm-pr-observation-main"><header><h4>{metric.label}</h4><details className="fm-pr-metric-info"><summary aria-label={`${metric.label}统计说明`} title="统计说明"><Info size={16} aria-hidden="true" /></summary><p>{metric.rule}。{metric.key === "positiveRate" ? "未判定回答不计入占比分母。" : ""}缺失字段不按零计算。</p></details></header>
          <span className="fm-pr-current-label">本次</span><strong className="fm-pr-value">{value === undefined ? "—" : percent(value)}</strong>
          {value === undefined && <p className="fm-pr-note">{missing(metric.key)}</p>}
          {canCompare && <div className="fm-pr-observation-comparison"><span>起点 {percent(prior[metric.key])}</span><span>变化 · {reportChange(prior[metric.key], value, true)}</span></div>}
        </div><footer>{coverage(metric.key)}</footer>
      </article>;
    })}</div>
    <div className="fm-pr-rank-summary"><span>平均排名 <strong>{enabled && current.averagePosition !== undefined ? current.averagePosition.toFixed(1) : "—"}</strong> 位</span><span title="仅统计已提及且返回正整数排名的有效回答">排名已知 {enabled ? current.positionCount : "—"} 条</span></div>
    {enabled && <ReportGaps attempts={after} onOpen={onGap} />}
  </section>;
}
