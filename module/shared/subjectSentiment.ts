import { keywordReturnState, normalizedWord, sentimentTone } from "./overviewAnalysis.js";

type Evaluation = { keyword: string; nature: "positive" | "neutral" | "negative"; context: string | null };
export type SentimentSubject = { kind: "self" } | { kind: "competitor"; name: string; aliases: string[] };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function jsonField(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}
function providerTone(value: unknown) {
  const fields = record(value);
  const label = typeof value === "string" ? value : [fields.sentiment, fields.nature, fields.type, fields.label].find(item => typeof item === "string");
  return { tone: sentimentTone(typeof label === "string" ? label.trim().toLowerCase() : label), raw: typeof label === "string" ? label : null };
}
function providerRows(value: unknown): unknown[] {
  const parsed = jsonField(value);
  if (Array.isArray(parsed)) return parsed;
  const wrapper = record(parsed);
  return Array.isArray(wrapper.list) ? wrapper.list : Array.isArray(wrapper.records) ? wrapper.records : [];
}
export function evaluationWords(value: unknown): Evaluation[] {
  const entries = providerRows(value);
  const unique = new Map<string, Evaluation>();
  for (const item of Array.isArray(entries) ? entries : []) {
    const row = record(item);
    const nature = providerTone(row.nature).tone;
    const keyword = typeof row.keyword === "string" ? row.keyword.trim() : "";
    if (!keyword || !nature) continue;
    const context = typeof row.context === "string" ? row.context.trim() : "";
    unique.set(`${nature}:${normalizedWord(keyword)}:${context}`, { keyword, nature, context: context || null });
  }
  return [...unique.values()];
}

/** Resolve only the selected identity. Missing competitor data never falls back to self. */
export function subjectSentiment(payloadValue: unknown, subject: SentimentSubject, fallback?: { sentiment?: unknown; evaluations?: unknown }) {
  const payload = record(jsonField(payloadValue));
  const raw = record(payload.raw);
  let field: Record<string, unknown> = payload;
  let original: Record<string, unknown> = raw;
  if (subject.kind === "competitor") {
    const hasOriginalCompetitors = Object.prototype.hasOwnProperty.call(raw, "competitorEvaluations");
    const entries = jsonField(hasOriginalCompetitors ? raw.competitorEvaluations : payload.competitorEvaluations);
    const rows = providerRows(entries).map(record);
    const exact = rows.filter(row => typeof row.name === "string" && normalizedWord(row.name) === normalizedWord(subject.name));
    const names = new Set([subject.name, ...subject.aliases].map(normalizedWord));
    const matches = exact.length ? exact : rows.filter(row => typeof row.name === "string" && names.has(normalizedWord(row.name)));
    field = matches.length === 1 ? matches[0]! : {};
    original = hasOriginalCompetitors ? field : {};
    fallback = undefined;
  }
  const rawLabel = Object.prototype.hasOwnProperty.call(original, "sentiment") ? original.sentiment
    : Object.prototype.hasOwnProperty.call(field, "sentiment") ? field.sentiment : fallback?.sentiment;
  const hasOriginalWords = Object.prototype.hasOwnProperty.call(original, "keywordEvaluations") && original.keywordEvaluations !== undefined;
  const rawWords = hasOriginalWords ? original.keywordEvaluations : undefined;
  // Normalized legacy [] cannot tell whether the original field was absent,
  // null or an empty list. Only original payloads establish that distinction.
  const evaluations = evaluationWords(hasOriginalWords ? rawWords : field.keywordEvaluations ?? fallback?.evaluations);
  return {
    sentiment: providerTone(rawLabel).tone,
    rawSentiment: providerTone(rawLabel).raw,
    evaluations,
    keywordState: keywordReturnState(jsonField(rawWords), evaluations),
  };
}
