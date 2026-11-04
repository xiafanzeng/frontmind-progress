import type { MonitorRun, RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { runSignature } from "../overview/overviewModel";

export const reportCategories = [
  { key: "industry", label: "行业排名", metric: "Top3 推荐率", rule: "本品明确进入前三推荐的回答数 ÷ 有效回答数", color: "#3268db" },
  { key: "competitor_comparison", label: "竞品对比", metric: "有据优势呈现率", rule: "有资料支持本品对指定对手优势的回答数 ÷ 有效对比回答数", color: "#8251ce" },
  { key: "reputation", label: "美誉舆情", metric: "关键事实准确率", rule: "核验正确的关键断言数 ÷ 纳入核验的关键断言总数", color: "#b77715" },
  { key: "product_scenario", label: "产品场景", metric: "场景回答达标率", rule: "全部必要条件满足且事实约束通过的回答数 ÷ 有效回答数", color: "#158e86" },
] as const;

export function validAnswers(attempts: RunAttempt[]) {
  return attempts.filter(item => item.status === "completed" && Boolean(item.answer?.trim()));
}

export function reportAttempts(run: MonitorRun | undefined, query: MonitoringQueryState, question?: string) {
  return run?.attempts.filter(item => (!query.model || item.platformId === query.model || `${item.platformCode}:${item.clientType}` === query.model) &&
    (!query.question || item.questionId === query.question) && (!question || item.questionId === question) &&
    (!query.questionCategory || item.questionCategory === query.questionCategory)) || [];
}

export function reportComparable(before: MonitorRun | undefined, after: MonitorRun | undefined, query: MonitoringQueryState) {
  return Boolean(before && after && before.id !== after.id && before.status === "completed" && after.status === "completed" &&
    Date.parse(before.createdAt) < Date.parse(after.createdAt) &&
    before.version === after.version && runSignature(before, query) === runSignature(after, query));
}

/** Only an observation, never a replacement for the prototype's evidence-based scores. */
export function observedMentionRate(attempts: RunAttempt[]) {
  const valid = validAnswers(attempts);
  if (!valid.length || valid.some(item => typeof item.brandMentioned !== "boolean")) return undefined;
  return valid.filter(item => item.brandMentioned).length / valid.length * 100;
}

export function percent(value: number | undefined) {
  return value === undefined ? "待评估" : `${Number(value.toFixed(1))}%`;
}

export const reportObservationMetrics = [
  { key: "mentionRate", label: "品牌提及率", rule: "提及本品的有效回答 / 全部有效回答；须全部返回提及判定" },
  { key: "top3Rate", label: "Top3 推荐率", rule: "本品明确进入前三的回答 / 全部有效回答；提及但排名缺失时待评估" },
  { key: "positiveRate", label: "正向情感占比", rule: "正向回答 / 情感已知的有效回答；不代表关键事实准确率" },
  { key: "citationRate", label: "明确引用回答率", rule: "有明确引用的回答 / 全部有效回答；须引用记录完整，不代表目标内容引用率" },
] as const;
export type ReportObservationMetric = typeof reportObservationMetrics[number]["key"];

/** Classify persisted provider observations, never infer a fact/advantage score. */
export function top3Observation(attempt: RunAttempt): "pass" | "fail" | "pending" {
  if (attempt.brandMentioned === false) return "fail";
  if (attempt.brandMentioned !== true || typeof attempt.mentionPosition !== "number" ||
    !Number.isInteger(attempt.mentionPosition) || attempt.mentionPosition < 1) return "pending";
  return attempt.mentionPosition <= 3 ? "pass" : "fail";
}

export function reportObservations(attempts: RunAttempt[]) {
  const answers = validAnswers(attempts);
  const knownSentiment = answers.filter(item => item.sentiment && item.sentiment !== "unknown");
  const explicit = answers.filter(item => item.citationProvenance === "explicit");
  const cited = explicit.filter(item => item.sources.some(source => source.isCited));
  const top3 = answers.filter(item => top3Observation(item) === "pass").length;
  const unknownRank = answers.filter(item => top3Observation(item) === "pending").length;
  const positions = answers.filter(item => item.brandMentioned === true).map(item => item.mentionPosition)
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0);
  return {
    effective: answers.length, top3, unknownRank, knownSentiment: knownSentiment.length,
    explicit: explicit.length, cited: cited.length,
    mentionRate: observedMentionRate(attempts),
    top3Rate: answers.length && !unknownRank ? top3 / answers.length * 100 : undefined,
    positiveRate: knownSentiment.length ? knownSentiment.filter(item => item.sentiment === "positive").length / knownSentiment.length * 100 : undefined,
    citationRate: answers.length && explicit.length === answers.length ? cited.length / answers.length * 100 : undefined,
    averagePosition: positions.length ? positions.reduce((sum, value) => sum + value, 0) / positions.length : undefined,
    positionCount: positions.length,
  };
}

export function questionMainScore(run: MonitorRun | undefined, query: MonitoringQueryState, question: { id: string; category?: string | null }) {
  if (query.subject !== "self" || question.category !== "industry") return undefined;
  const attempts = reportAttempts(run, query, question.id);
  if (attempts.some(item => item.questionCategory !== "industry")) return undefined;
  return reportObservations(attempts).top3Rate;
}

export function categoryMainScore(run: MonitorRun | undefined, query: MonitoringQueryState, questions: Array<{ id: string; category?: string | null }>) {
  const values = questions.map(question => questionMainScore(run, query, question));
  if (!values.length || values.some(value => value === undefined)) return undefined;
  return values.reduce<number>((sum, value) => sum + value!, 0) / values.length;
}

export function reportChange(before: number | undefined, after: number | undefined, comparable: boolean) {
  if (!comparable) return "不可直接比较";
  if (before === undefined || after === undefined) return "待评估";
  const change = Number((after - before).toFixed(1));
  return change === 0 ? "持平" : `${change > 0 ? "提升" : "下降"} ${Math.abs(change)} 个百分点`;
}
