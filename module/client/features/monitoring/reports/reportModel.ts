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
    (!question || item.questionId === question) && (!query.questionCategory || item.questionCategory === query.questionCategory)) || [];
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
