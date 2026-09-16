import { BarChart3, Medal, RadioTower, Target } from "lucide-react";

import {
  type MonitorRun,
  type MonitorSummary,
  type RunAttempt,
} from "../../../domain";
import { calculateEvidenceMetrics } from "../selectors";
import type { MonitoringSubject } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";

function percentage(value?: number) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "—";
}

/**
 * The six headline metric cards shown above the answer detail workspace.
 * Kept intentionally compact: 提问次数 / 提及率 / 平均排名 / Top1 / Top3 / Top10.
 */
export default function MonitoringMetricCards({
  monitor,
  run,
  attempts,
  subject,
  summary,
}: {
  monitor: MonitorSummary;
  run?: MonitorRun;
  attempts: RunAttempt[];
  subject: MonitoringSubject;
  summary?: MonitoringSummaryData;
}) {
  void monitor;
  const evidence = summary
    ? {
        total: summary.metrics.attempts,
        mentionRate:
          summary.metrics.mentionRate === null
            ? undefined
            : summary.metrics.mentionRate * 100,
        top1Rate:
          summary.metrics.top1Rate === null
            ? undefined
            : summary.metrics.top1Rate * 100,
        top3Rate:
          summary.metrics.top3Rate === null
            ? undefined
            : summary.metrics.top3Rate * 100,
        top10Rate:
          summary.metrics.top10Rate === null
            ? undefined
            : summary.metrics.top10Rate * 100,
        averagePosition: summary.metrics.averagePosition ?? undefined,
      }
    : calculateEvidenceMetrics(attempts);
  void subject;

  const cards = [
    {
      key: "total",
      icon: <RadioTower size={18} />,
      label: "提问次数",
      value: String(evidence.total ?? 0),
      hint: "日期范围内全部尝试",
      tone: "violet",
    },
    {
      key: "mention",
      icon: <Target size={18} />,
      label: "提及率",
      value: percentage(evidence.mentionRate),
      hint: "有效回答中提及品牌",
      tone: "blue",
    },
    {
      key: "position",
      icon: <BarChart3 size={18} />,
      label: "平均排名",
      value: evidence.averagePosition?.toFixed(1) || "—",
      hint: "仅有效且提及的回答",
      tone: "cyan",
    },
    {
      key: "top1",
      icon: <Medal size={18} />,
      label: "Top1",
      value: percentage(evidence.top1Rate),
      hint: "首位曝光",
      tone: "amber",
    },
    {
      key: "top3",
      icon: <Medal size={18} />,
      label: "Top3",
      value: percentage(evidence.top3Rate),
      hint: "前三曝光",
      tone: "green",
    },
    {
      key: "top10",
      icon: <Medal size={18} />,
      label: "Top10",
      value: percentage(evidence.top10Rate),
      hint: "前十曝光",
      tone: "rose",
    },
  ];

  return (
    <div className="fm-metric-grid" aria-label="监控指标">
      {cards.map((card) => (
        <article key={card.key} className={`fm-metric-card ${card.tone}`}>
          <span className="fm-metric-icon">{card.icon}</span>
          <span className="fm-metric-label">{card.label}</span>
          <strong className="fm-metric-value">{card.value}</strong>
          <small>{card.hint}</small>
        </article>
      ))}
    </div>
  );
}
