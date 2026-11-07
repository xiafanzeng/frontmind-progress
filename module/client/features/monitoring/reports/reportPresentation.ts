import type { MonitorRun, RunAttempt } from "../../../domain";
import type { MonitoringHighlight } from "../MonitoringMarkdown";
import { validAnswers } from "./reportModel";
import { measurementText, reportPlatformKey, type QuestionReportMetric, type ReportMeasurement } from "./questionReportModel";

/** Presentation of persisted fields only; never infer a rank from answer text. */
export function actualRank(answer: RunAttempt) {
  const rank = answer.mentionPosition;
  return answer.brandMentioned === true && typeof rank === "number" && Number.isInteger(rank) && rank > 0 ? rank : undefined;
}

export function compactMeasurement(measurement: ReportMeasurement, metric: QuestionReportMetric) {
  if (metric === "averagePosition" && (measurement.ranks?.length || 0) > 1) {
    return measurement.numerator ? `${measurement.numerator} 条已知排名` : "待评估";
  }
  return measurementText(measurement.value, metric);
}

export function reportDetailCounts(attempts: RunAttempt[]) {
  const answers = validAnswers(attempts);
  const ranks = answers.map(actualRank).filter((rank): rank is number => rank !== undefined);
  const mentioned = answers.filter(answer => answer.brandMentioned === true).length;
  const unmentioned = answers.filter(answer => answer.brandMentioned === false).length;
  const positive = answers.filter(answer => answer.sentiment === "positive").length;
  const neutral = answers.filter(answer => answer.sentiment === "neutral").length;
  const negative = answers.filter(answer => answer.sentiment === "negative").length;
  return {
    effective: answers.length, attempts: attempts.length, mentioned, unmentioned,
    mentionUnknown: answers.length - mentioned - unmentioned,
    platforms: new Set(attempts.map(reportPlatformKey)).size,
    effectivePlatforms: new Set(answers.map(reportPlatformKey)).size,
    rankKnown: ranks.length, rank1: ranks.filter(rank => rank === 1).length,
    rank2: ranks.filter(rank => rank === 2).length, rank3: ranks.filter(rank => rank === 3).length,
    rankOutside: ranks.filter(rank => rank > 3).length,
    mentionedRankUnknown: mentioned - ranks.length,
    positive, neutral, negative, sentimentUnknown: answers.length - positive - neutral - negative,
  };
}

export const sentimentLabel = { positive: "正面", neutral: "中性", negative: "负面", unknown: "未判定" } as const;

export function answerHighlights(answer: RunAttempt, run?: MonitorRun): MonitoringHighlight[] {
  const brands = [run?.config.brandName || "", ...(run?.config.brandAliases || [])];
  return [
    ...brands.filter(Boolean).map(text => ({ text, kind: "brand" as const })),
    ...(answer.keywordEvaluations || []).map(item => ({ text: item.keyword, kind: "keyword" as const })),
  ];
}

/** An explicit citation is an observed citation, not a verified knowledge fact. */
export function explicitCitations(answer?: RunAttempt) {
  if (!answer || answer.citationProvenance !== "explicit") return undefined;
  return answer.sources.filter(source => source.isCited && (!source.citationProvenance || source.citationProvenance === "explicit"));
}

export function answerExcerpt(answer?: RunAttempt, terms: string[] = []) {
  const body = answer?.answer?.trim();
  if (!body) return "暂无有效回答正文";
  const lower = body.toLocaleLowerCase();
  const positions = terms.filter(Boolean).map(term => lower.indexOf(term.toLocaleLowerCase())).filter(index => index >= 0);
  const start = positions.length ? Math.max(0, Math.min(...positions) - 36) : 0;
  const end = Math.min(body.length, start + 240);
  return `${start ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}
