import type { KeywordEvaluation } from "../../domain";

export type SentimentCounts = {
  positive: number;
  neutral: number;
  negative: number;
  unknown: number;
};
export const SENTIMENT_BUCKETS = [
  { key: "positive", label: "正面", color: "#219b77" },
  { key: "neutral", label: "中性", color: "#7b91ac" },
  { key: "negative", label: "负面", color: "#df6a73" },
  { key: "unknown", label: "未判定", color: "#d7dce3" },
] as const;

export function sentimentDistribution(counts: SentimentCounts) {
  const safeCount = (value: number) =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  const total = SENTIMENT_BUCKETS.reduce(
    (sum, bucket) => sum + safeCount(counts[bucket.key]),
    0,
  );
  return {
    total,
    buckets: SENTIMENT_BUCKETS.map((bucket) => ({
      ...bucket,
      count: safeCount(counts[bucket.key]),
      percent: total ? (safeCount(counts[bucket.key]) / total) * 100 : 0,
    })),
  };
}

export function groupKeywordEvaluations(
  evaluations: readonly KeywordEvaluation[],
) {
  const groups: Record<KeywordEvaluation["nature"], KeywordEvaluation[]> = {
    positive: [],
    neutral: [],
    negative: [],
  };
  const seen = new Map<string, KeywordEvaluation>();
  for (const evaluation of evaluations) {
    const normalized = evaluation.keyword
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("zh-CN");
    if (!normalized || !groups[evaluation.nature]) continue;
    const key = `${evaluation.nature}:${normalized}`;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.context?.trim() && evaluation.context?.trim())
        existing.context = evaluation.context;
      continue;
    }
    const row = { ...evaluation, keyword: evaluation.keyword.trim() };
    seen.set(key, row);
    groups[evaluation.nature].push(row);
  }
  return groups;
}
