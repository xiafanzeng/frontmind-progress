import type { MonitorRun, RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { comparisonReason } from "./reportInsights";
import { reportObservations, validAnswers } from "./reportModel";

export type QuestionReportMetric = NonNullable<MonitoringQueryState["reportMetric"]>;
export type QuestionReportPhase = NonNullable<MonitoringQueryState["reportPhase"]>;

export const questionReportMetrics = [
  { key: "mentionRate", label: "品牌提及率", caption: "被看见的情况", title: "品牌有没有被大模型提及？", rule: "提及目标品牌的有效回答数 ÷ 同一范围内有效回答数", interpretation: "先查看有效回答数量，再核查品牌提及判定；未返回判定不按未提及计算。" },
  { key: "top3Rate", label: "Top3 推荐率", caption: "进入前三的情况", title: "品牌有没有进入前三？", rule: "品牌明确进入前三的有效回答数 ÷ 同一范围内有效回答数", interpretation: "仅在行业排名问题中观察。提及但排名缺失时保持待评估，不能视为未进入前三。" },
  { key: "averagePosition", label: "平均排名", caption: "已知排名的平均值", title: "品牌平均排在什么位置？", rule: "已提及且排名已知的有效回答排名之和 ÷ 排名已知回答数", interpretation: "只统计已提及且返回正整数排名的有效回答；数值越小，平均位置越靠前。" },
  { key: "positiveRate", label: "正面评价率", caption: "回答的情感倾向", title: "已判定回答中有多少正面评价？", rule: "正面回答数 ÷ 情感已判定的有效回答数", interpretation: "标签缺失单独展示，不算作中性。正面评价不等于事实准确，也不代表建议正确。" },
] as const;

export const questionReportPhases = [
  { key: "before", label: "优化前", description: "查看所选问题的基准表现" },
  { key: "compare", label: "优化前后对比", description: "并排查看指标与回答证据" },
  { key: "after", label: "优化后", description: "查看所选问题的复测表现" },
] as const;

export type ReportMeasurement = {
  value?: number;
  effective: number;
  attempts: number;
  numerator: number;
  denominator: number;
  basis: string;
  coverage: string;
  missing?: string;
};

/** Reads persisted answer facts only. No model call, text scoring, or fabricated rank. */
export function measureQuestion(attempts: RunAttempt[], metric: QuestionReportMetric, enabled = true): ReportMeasurement {
  const answers = validAnswers(attempts);
  const observations = reportObservations(attempts);
  const base = { effective: answers.length, attempts: attempts.length, numerator: 0, denominator: 0, basis: "暂无统计样本", coverage: `有效回答 ${answers.length} / 采集 ${attempts.length}` };
  if (!enabled) return { ...base, missing: "当前四项指标以各批次监控主品牌为对象；请切换本品查看，竞品仍可查看原始证据。" };
  if (!answers.length) return { ...base, missing: attempts.length ? "当前问题没有已完成且有正文的回答。" : "所选批次未采集当前问题或模型。" };
  if (metric === "mentionRate") {
    const known = answers.filter(answer => typeof answer.brandMentioned === "boolean").length;
    const mentioned = answers.filter(answer => answer.brandMentioned === true).length;
    return { ...base, value: observations.mentionRate, numerator: mentioned, denominator: answers.length,
      basis: `${mentioned} 条已确认提及 / ${answers.length} 条有效回答`, coverage: `提及已判定 ${known}/${answers.length}`,
      missing: known < answers.length ? `${answers.length - known} 条提及判定未返回，暂不计算整体提及率。` : undefined };
  }
  if (metric === "positiveRate") {
    const known = answers.filter(answer => ["positive", "neutral", "negative"].includes(answer.sentiment || ""));
    const positive = known.filter(answer => answer.sentiment === "positive").length;
    return { ...base, value: known.length ? positive / known.length * 100 : undefined, numerator: positive, denominator: known.length,
      basis: `${positive} 条正面 / ${known.length} 条已判定`, coverage: `情感已判定 ${known.length}/${answers.length} · 标签缺失 ${answers.length - known.length} 条`,
      missing: known.length ? undefined : "当前问题尚无明确的情感标签。" };
  }
  // The export and existing question report only define ranking for industry questions.
  // Removing the category selector must not manufacture ranking applicability.
  if (attempts.some(answer => answer.questionCategory !== "industry")) {
    return { ...base, missing: "当前问题缺少适用的行业排名快照，排名指标待评估。" };
  }
  const mentioned = answers.filter(answer => answer.brandMentioned === true).length;
  if (metric === "top3Rate") return { ...base, value: observations.top3Rate, numerator: observations.top3, denominator: answers.length,
    basis: `${observations.top3} 条明确进入前三 / ${answers.length} 条有效回答`, coverage: `排名判定完整 ${answers.length - observations.unknownRank}/${answers.length}`,
    missing: observations.unknownRank ? `${observations.unknownRank} 条提及或排名依据缺失，暂不计算整体 Top3 推荐率。` : undefined };
  return { ...base, value: observations.averagePosition,
    numerator: observations.averagePosition === undefined ? 0 : observations.averagePosition * observations.positionCount,
    denominator: observations.positionCount, basis: `${observations.positionCount} 条提及且排名已知`,
    coverage: `排名已知 ${observations.positionCount}/${mentioned} 条提及回答`,
    missing: observations.positionCount ? undefined : "当前问题没有已提及且排名已知的回答。" };
}

export function measurementText(value: number | undefined, metric: QuestionReportMetric) {
  if (value === undefined || !Number.isFinite(value)) return "待评估";
  return `${value.toFixed(1)}${metric === "averagePosition" ? " 位" : "%"}`;
}

export function questionComparisonReason(before: MonitorRun | undefined, after: MonitorRun | undefined, query: MonitoringQueryState, questionId?: string) {
  if (!questionId) return "请先选择一个具体问题。";
  const reason = comparisonReason(before, after, { ...query, question: questionId, questionCategory: undefined });
  if (reason) return reason;
  if (!before?.attempts.some(answer => answer.questionId === questionId) || !after?.attempts.some(answer => answer.questionId === questionId)) {
    return "至少一个批次未采集该问题，暂不输出变化。";
  }
  return undefined;
}

export function measurementChange(before: ReportMeasurement, after: ReportMeasurement, metric: QuestionReportMetric, reason?: string) {
  if (reason) return { title: "暂不比较", description: reason };
  if (before.value === undefined || after.value === undefined) return { title: "待评估", description: "至少一个时期缺少可计算的数据。" };
  const change = Number((after.value - before.value).toFixed(1));
  if (metric === "averagePosition") return { title: change === 0 ? "持平" : `${change < 0 ? "改善" : "下降"} ${Math.abs(change).toFixed(1)} 位`, description: "仅比较已知排名；两期的排名覆盖样本可能不同。" };
  return { title: change === 0 ? "持平" : `${change > 0 ? "+" : ""}${change.toFixed(1)} 个百分点`, description: "优化后相较优化前的观察变化，不代表因果效果。" };
}

/** Platform/device/mode/region distinguish collection conditions in answer navigation. */
export function reportPlatformKey(attempt: RunAttempt) {
  return JSON.stringify([attempt.platformCode, attempt.clientType, attempt.mode, attempt.regionCode || ""]);
}

export function reportPlatformLabel(attempt: RunAttempt) {
  const client = attempt.clientType === "mobile" ? "手机版" : "网页版";
  const mode = { standard: "标准", reasoning: "深度思考", search: "搜索", reasoning_search: "思考与搜索" }[attempt.mode];
  const name = attempt.platformName.includes(client) ? attempt.platformName : `${attempt.platformName} · ${client}`;
  return `${name} · ${mode}${attempt.regionCode ? ` · ${attempt.regionCode}` : ""}`;
}
