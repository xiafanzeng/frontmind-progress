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
  { key: "unknown", label: "标签缺失", color: "#d7dce3" },
] as const;

export function sentimentDistribution(counts: SentimentCounts) {
  const safeCount = (value: number) =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  const total = SENTIMENT_BUCKETS.reduce(
    (sum, bucket) => sum + safeCount(counts[bucket.key]),
    0,
  );
  const classified = safeCount(counts.positive) + safeCount(counts.neutral) + safeCount(counts.negative);
  return {
    total, classified, missing: safeCount(counts.unknown),
    buckets: SENTIMENT_BUCKETS.filter(bucket => bucket.key !== "unknown").map((bucket) => ({
      ...bucket,
      count: safeCount(counts[bucket.key]),
      percent: classified ? (safeCount(counts[bucket.key]) / classified) * 100 : 0,
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
    const key = JSON.stringify([evaluation.nature, normalized, evaluation.context?.trim() || ""]);
    if (seen.has(key)) continue;
    const row = { ...evaluation, keyword: evaluation.keyword.trim() };
    seen.set(key, row);
    groups[evaluation.nature].push(row);
  }
  return groups;
}
