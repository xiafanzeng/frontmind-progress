import type { OverviewSentimentInput, OverviewSentimentData, OverviewSourcesInput, OverviewSourcesData } from "../contracts/overview.js";

export type Tone = "positive" | "neutral" | "negative";
export type KeywordState = "available" | "empty" | "not_returned" | "unavailable";
export type SentimentAnswer = {
  answerId: string; runId: string; questionId: string; question: string; platformName: string; capturedAt: string;
  revisionId: string; revision: number | null; targetBrand: string; sentiment: unknown; keywordState: KeywordState;
  evaluations: Array<{ keyword: string; nature: Tone; context?: string | null }>;
};
export const normalizedWord = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("zh-CN");
export function sentimentTone(value: unknown): Tone | null {
  return value === "positive" || value === "neutral" || value === "negative" ? value : null;
}
// A legacy normalized [] does not prove that the provider returned an empty list.
// Read the archived original field when present; never infer null from an absent field.
export function keywordReturnState(raw: unknown, normalized: readonly unknown[]): KeywordState {
  if (Array.isArray(raw)) return raw.length ? (normalized.length ? "available" : "unavailable") : "empty";
  if (raw === null) return "not_returned";
  return normalized.length ? "available" : "unavailable";
}
export function analyzeSentiment(answers: SentimentAnswer[], targetBrand: string, input: Pick<OverviewSentimentInput, "answerTone" | "keywordTone" | "keywordKey" | "page">, coverage: string): OverviewSentimentData {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  const keywordStates = { available: 0, empty: 0, not_returned: 0, unavailable: 0 };
  let brandMismatch = 0;
  const rows = answers.map(answer => {
    const matches = normalizedWord(answer.targetBrand) === normalizedWord(targetBrand);
    if (!matches) brandMismatch++;
    const sentiment = matches ? sentimentTone(answer.sentiment) : null;
    if (sentiment) counts[sentiment]++;
    const unique = new Map<string, { key: string; keyword: string; nature: Tone; context: string | null }>();
    for (const evaluation of matches ? answer.evaluations : []) {
      if (!sentimentTone(evaluation.nature) || !evaluation.keyword.trim()) continue;
      const key = `${evaluation.nature}:${normalizedWord(evaluation.keyword)}`;
      const context = evaluation.context?.trim() || null;
      // Retain distinct provider contexts; frequency still counts an answer once.
      unique.set(`${key}:${context || ""}`, { ...evaluation, key, context });
    }
    const keywordState = matches ? answer.keywordState : "unavailable";
    keywordStates[keywordState]++;
    return { ...answer, sentiment, keywordState, evaluations: [...unique.values()] };
  });
  const classified = counts.positive + counts.neutral + counts.negative;
  const filtered = rows.filter(row => input.answerTone === "all" || (input.answerTone === "missing" ? row.sentiment === null : row.sentiment === input.answerTone));
  const words = new Map<string, { key: string; keyword: string; nature: Tone; ids: Set<string> }>();
  const natures = new Map<string, Set<Tone>>();
  for (const row of filtered) for (const evaluation of row.evaluations) {
    const text = normalizedWord(evaluation.keyword);
    const tones = natures.get(text) || new Set<Tone>(); tones.add(evaluation.nature); natures.set(text, tones);
    if (input.keywordTone !== "all" && evaluation.nature !== input.keywordTone) continue;
    const word = words.get(evaluation.key) || { ...evaluation, ids: new Set<string>() };
    word.ids.add(row.answerId); words.set(evaluation.key, word);
  }
  const keywords = [...words.values()].map(({ ids, ...word }) => ({ key: word.key, keyword: word.keyword, nature: word.nature, answerCount: ids.size, conflicted: (natures.get(normalizedWord(word.keyword))?.size || 0) > 1 }))
    .sort((a, b) => b.answerCount - a.answerCount || a.key.localeCompare(b.key));
  const selected = filtered.map(row => ({ ...row, evaluations: row.evaluations.filter(word => (input.keywordTone === "all" || word.nature === input.keywordTone) && (!input.keywordKey || word.key === input.keywordKey)) }))
    .filter(row => (!input.keywordKey && input.keywordTone === "all") || row.evaluations.length > 0)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || a.answerId.localeCompare(b.answerId));
  const pageCount = Math.max(1, Math.ceil(selected.length / 10));
  const page = Math.min(input.page, pageCount);
  return { targetBrand, total: rows.length, classified, missing: rows.length - classified, brandMismatch, counts, keywordStates,
    filteredAnswers: filtered.length, keywords, rows: selected.slice((page - 1) * 10, page * 10), page, pageSize: 10, rowCount: selected.length, pageCount, coverage };
}

export type CitationRow = { title: string; url: string; domain: string; siteName?: string | null };
export function citationPage(citations: Iterable<CitationRow>, input: Pick<OverviewSourcesInput, "domain" | "domainPage" | "contentPage">, coverage: string): OverviewSourcesData {
  const domains = new Map<string, number>();
  const siteNames = new Map<string, Map<string, number>>();
  const contents = new Map<string, CitationRow & { count: number }>();
  let total = 0;
  for (const source of citations) {
    let url = source.url.trim();
    try { const parsed = new URL(url); parsed.hash = ""; url = parsed.toString(); } catch { /* Keep an opaque source identifier unchanged. */ }
    total++;
    domains.set(source.domain, (domains.get(source.domain) || 0) + 1);
    const name = source.siteName?.trim();
    if (name && name !== source.domain) {
      const names = siteNames.get(source.domain) || new Map<string, number>();
      names.set(name, (names.get(name) || 0) + 1); siteNames.set(source.domain, names);
    }
    const content = contents.get(url) || { ...source, url, count: 0 };
    content.count++; contents.set(url, content);
  }
  const rankedDomains = [...domains].map(([domain, count]) => ({ domain, count, siteName: [...(siteNames.get(domain) || [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
  const rankedContents = [...contents.values()].filter(item => input.domain === null || item.domain === input.domain).sort((a, b) => b.count - a.count || a.url.localeCompare(b.url));
  const domainPage = Math.min(input.domainPage, Math.max(1, Math.ceil(rankedDomains.length / 10)));
  const contentPage = Math.min(input.contentPage, Math.max(1, Math.ceil(rankedContents.length / 10)));
  return { total, domainCount: rankedDomains.length, contentCount: rankedContents.length, domainPage, contentPage, pageSize: 10,
    domains: rankedDomains.slice((domainPage - 1) * 10, domainPage * 10), contents: rankedContents.slice((contentPage - 1) * 10, contentPage * 10), coverage };
}
