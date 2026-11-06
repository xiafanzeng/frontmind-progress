import type { MonitorRun, RunAttempt } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import { runSignature } from "../overview/overviewModel";
import { reportComparable, top3Observation, validAnswers } from "./reportModel";

export function comparisonReason(before: MonitorRun | undefined, after: MonitorRun | undefined, query: MonitoringQueryState) {
  if (query.subject !== "self") return "批次观察以各次监控品牌快照为对象；竞品标签请查看“情感与评价词”。";
  if (!after) return "当前范围没有运行记录。";
  if (!before) return "当前已读取范围没有更早的可比批次，先查看本次结果。";
  if (before.id === after.id) return "起点与本次是同一次运行，不能计算变化。";
  if (Date.parse(before.createdAt) >= Date.parse(after.createdAt)) return "起点必须早于本次运行。";
  if (before.status !== "completed" || after.status !== "completed") return "所选批次尚未全部完成，当前仅展示已返回结果。";
  if (before.config.brandName !== after.config.brandName) return "两次运行的监控品牌不同，历史标签不能跨品牌比较。";
  if (before.version !== after.version || runSignature(before, query) !== runSignature(after, query)) return "两次配置版本或问题、模型、采集条件不同，不输出升降结论。";
  return undefined;
}

export function latestComparable(runs: MonitorRun[], after: MonitorRun | undefined, query: MonitoringQueryState) {
  return runs.filter(run => reportComparable(run, after, query)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

export const gapDefinitions = [
  { key: "sentiment", label: "情感未判定", reason: "供应商未返回明确正面、中性或负面标签；不计入情感占比分母。" },
  { key: "rank", label: "排名依据不完整", reason: "提及判定或正整数排名未返回，无法确认是否进入前三。" },
  { key: "mention", label: "提及判定未返回", reason: "缺少明确的品牌提及字段，不能按未提及计零。" },
  { key: "citation", label: "引用记录不完整", reason: "缺少明确引用口径，不将空列表直接解释为未引用。" },
  { key: "category", label: "问题未分类", reason: "历史采集没有问题分类快照；保留原回答，不替历史补写分类。" },
  { key: "failed", label: "采集失败", reason: "采集失败或错误，不计入有效回答。" },
  { key: "empty", label: "尚无有效正文", reason: "运行未完成、已取消或未返回非空回答正文，不计入有效回答。" },
] as const;
export type GapKind = typeof gapDefinitions[number]["key"];
export function matchesGap(attempt: RunAttempt, kind: GapKind) {
  const valid = attempt.status === "completed" && Boolean(attempt.answer?.trim());
  if (kind === "failed") return attempt.status === "failed" || attempt.status === "error";
  if (kind === "empty") return !valid && attempt.status !== "failed" && attempt.status !== "error";
  if (kind === "category") return !attempt.questionCategory;
  if (!valid) return false;
  if (kind === "sentiment") return !["positive", "neutral", "negative"].includes(attempt.sentiment || "");
  if (kind === "rank") return top3Observation(attempt) === "pending";
  if (kind === "mention") return typeof attempt.brandMentioned !== "boolean";
  return attempt.citationProvenance !== "explicit";
}
export function reportGaps(attempts: RunAttempt[]) {
  return gapDefinitions.map(gap => ({ ...gap, attempts: attempts.filter(attempt => matchesGap(attempt, gap.key)) })).filter(gap => gap.attempts.length);
}

export type CitationEntry = { key: string; title: string; url?: string; domain: string; answers: RunAttempt[] };
export function citationInventory(attempts: RunAttempt[]) {
  const entries = new Map<string, CitationEntry>();
  for (const answer of validAnswers(attempts)) {
    if (answer.citationProvenance !== "explicit") continue;
    for (const source of answer.sources.filter(item => item.isCited)) {
      let url: string | undefined;
      try { const parsed = new URL(source.url || ""); if (["http:", "https:"].includes(parsed.protocol)) { parsed.hash = ""; url = parsed.href; } } catch { /* Keep evidence without a navigable URL. */ }
      const key = url || `unlinked:${answer.id}:${source.id}`;
      const entry = entries.get(key) || { key, title: source.title || source.domain || "未返回标题", url, domain: url ? new URL(url).hostname : source.domain || "域名未知", answers: [] };
      if (!entry.answers.some(item => item.id === answer.id)) entry.answers.push(answer);
      entries.set(key, entry);
    }
  }
  return entries;
}
export function citationChanges(before: RunAttempt[], after: RunAttempt[], comparable: boolean) {
  const prior = citationInventory(before), current = citationInventory(after);
  const complete = [before, after].every(attempts => { const answers = validAnswers(attempts); return answers.length > 0 && answers.every(answer => answer.citationProvenance === "explicit"); });
  const canCompare = comparable && complete;
  const keys = canCompare ? new Set([...current.keys(), ...[...prior.values()].filter(entry => entry.url).map(entry => entry.key)]) : new Set(current.keys());
  const rows = [...keys].map(key => {
    const previous = prior.get(key), next = current.get(key);
    return { ...(next || previous)!, before: previous?.answers || [], after: next?.answers || [],
      state: !canCompare || !((next || previous)?.url) ? "observed" : previous && next ? "retained" : next ? "added" : "absent" };
  }).sort((a, b) => b.after.length - a.after.length || a.key.localeCompare(b.key));
  return { rows, canCompare, prior, current };
}
