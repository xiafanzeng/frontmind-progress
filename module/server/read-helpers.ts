import { eq, isNull, gte, lt, sql, inArray, type SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { CitationProvenance, MonitoringAnalysisInput, MonitoringAnswersListInput, MonitoringScope, Sentiment } from "@frontmind/monitoring-contracts";
import { RepositoryError } from "@frontmind/module-contracts/errors";
import { normalizeShareUrl } from "@frontmind/module-contracts/url";
import type { ProgressSchema } from "../schema/index.js";
declare const monitors: ProgressSchema["monitors"];
declare const monitorVersions: ProgressSchema["monitorVersions"];
declare const monitorQuestions: ProgressSchema["monitorQuestions"];
declare const attempts: ProgressSchema["attempts"];
declare const projectBrandVersions: ProgressSchema["projectBrandVersions"];
declare const resultDiscoveredSources: ProgressSchema["resultDiscoveredSources"];
export { RepositoryError } from "@frontmind/module-contracts/errors";
export const MONITORING_EVIDENCE_REVISION_BATCH_SIZE = 500 as const;

export const MONITORING_EVIDENCE_ROW_LIMIT = 100_000 as const;

export const MONITORING_FACT_LIMIT = 50_000 as const;

export const MONITORING_LEGACY_DISCOVERY_FALLBACK_LIMIT = 5_000 as const;

export function buildMonitoringAnalysis(
  kind: MonitoringAnalysisInput["kind"],
  facts: readonly MonitoringFact[],
  evidence: MonitoringEvidence,
  resolved: ResolvedMonitoringScope,
) {
  if (kind === "metrics") {
    const questions = resolved.scope.questionId
      ? resolved.questions.filter(
          (question) => question.questionId === resolved.scope.questionId,
        )
      : resolved.questions;
    return {
      kind: "metrics" as const,
      metrics: monitoringMetrics(facts, evidence, resolved.subject),
      rows: questions.map((question) => ({
        questionId: question.questionId,
        question: question.questionSnapshot,
        ordinal: question.ordinal,
        metrics: monitoringMetrics(
          facts.filter((fact) => fact.questionId === question.questionId),
          evidence,
          resolved.subject,
        ),
      })),
    };
  }
  if (kind === "trends") {
    const grouped = new Map<string, MonitoringFact[]>();
    for (const fact of facts) {
      const date = monitoringLocalDate(
        fact.runCreatedAt,
        resolved.projectTimezone,
      );
      const group = grouped.get(date) ?? [];
      group.push(fact);
      grouped.set(date, group);
    }
    return {
      kind: "trends" as const,
      granularity: "day" as const,
      points: [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, dayFacts]) => ({
          date,
          metrics: monitoringMetrics(dayFacts, evidence, resolved.subject),
        })),
    };
  }
  if (kind === "competitors") {
    return {
      kind: "competitors" as const,
      items: monitoringCompetitorAnalysisItems(
        facts,
        resolved.version.competitors,
      ),
    };
  }
  if (kind === "citations") {
    const domains = new Map<string, number>();
    let total = 0;
    const contents = new Map<
      string,
      { title: string; url: string; domain: string; count: number }
    >();
    for (const fact of facts.filter(isEffectiveMonitoringAnswer)) {
      if (!fact.revisionId) continue;
      for (const source of evidence.citationsByRevision.get(fact.revisionId) ??
        []) {
        total += 1;
        domains.set(source.domain, (domains.get(source.domain) ?? 0) + 1);
        const key = canonicalUrl(source.url);
        const content = contents.get(key) ?? {
          title: source.title,
          url: source.url,
          domain: source.domain,
          count: 0,
        };
        content.count += 1;
        contents.set(key, content);
      }
    }
    return {
      kind: "citations" as const,
      total,
      items: [...domains.entries()]
        .map(([domain, count]) => ({ domain, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.domain.localeCompare(right.domain),
        )
        .slice(0, 100),
      contents: [...contents.values()]
        .sort(
          (left, right) =>
            right.count - left.count || left.url.localeCompare(right.url),
        )
        .slice(0, 100),
    };
  }
  const domains = new Map<
    string,
    { discoveredCount: number; citedCount: number }
  >();
  let total = 0;
  let cited = 0;
  const publicationCounts = new Map<
    PublicationTimeBucket,
    { discoveredCount: number; citedCount: number }
  >();
  for (const fact of facts.filter(isEffectiveMonitoringAnswer)) {
    if (!fact.revisionId) continue;
    for (const source of evidence.referencesByRevision.get(fact.revisionId) ??
      []) {
      total += 1;
      const isCited =
        evidence.provenanceByRevision.get(fact.revisionId) === "explicit" &&
        source.isCited;
      cited += Number(isCited);
      const metric = domains.get(source.domain) ?? {
        discoveredCount: 0,
        citedCount: 0,
      };
      metric.discoveredCount += 1;
      metric.citedCount += Number(isCited);
      domains.set(source.domain, metric);
      const bucket = publicationTimeBucket(
        source.publishedAt,
        resolved.scope.to,
        resolved.projectTimezone,
      );
      const publicationMetric = publicationCounts.get(bucket) ?? {
        discoveredCount: 0,
        citedCount: 0,
      };
      publicationMetric.discoveredCount += 1;
      publicationMetric.citedCount += Number(isCited);
      publicationCounts.set(bucket, publicationMetric);
    }
  }
  return {
    kind: "sources" as const,
    total,
    cited,
    publicationTimeBuckets: publicationTimeBuckets.map((bucket) => ({
      bucket,
      discoveredCount: publicationCounts.get(bucket)?.discoveredCount ?? 0,
      citedCount: publicationCounts.get(bucket)?.citedCount ?? 0,
    })),
    items: [...domains.entries()]
      .map(([domain, metric]) => ({ domain, ...metric }))
      .sort(
        (left, right) =>
          right.discoveredCount - left.discoveredCount ||
          left.domain.localeCompare(right.domain),
      )
      .slice(0, 100),
  };
}

export function buildMonitoringEvidence(
  facts: readonly MonitoringFact[],
  sourceRows: readonly MonitoringSourceRow[],
  discoveredRows: readonly MonitoringDiscoveredRow[],
  screenshotRows: ReadonlyArray<{ revisionId: string }>,
  legacyDiscoveryPayloadByRevision: ReadonlyMap<
    string,
    Record<string, unknown>
  > = new Map(),
  evidenceRowLimit = MONITORING_EVIDENCE_ROW_LIMIT,
): MonitoringEvidence {
  let evidenceRowCount =
    sourceRows.length + discoveredRows.length + screenshotRows.length;
  if (evidenceRowCount > evidenceRowLimit) {
    throw new RepositoryError(
      "INVALID_STATE",
      `Monitoring scope exceeds the ${evidenceRowLimit.toLocaleString("en-US")} evidence row limit; narrow the date or dimension filters`,
    );
  }
  const evidence = emptyMonitoringEvidence();
  const sourcesByRevision = groupByRevision(sourceRows);
  const persistedReferencesByRevision = groupByRevision(discoveredRows);
  for (const screenshot of screenshotRows) {
    evidence.screenshotCountByRevision.set(
      screenshot.revisionId,
      (evidence.screenshotCountByRevision.get(screenshot.revisionId) ?? 0) + 1,
    );
  }
  for (const fact of facts) {
    if (!fact.revisionId) continue;
    const revisionId = fact.revisionId;
    const sources = sourcesByRevision.get(revisionId) ?? [];
    const provenance = monitoringFactCitationProvenance(
      fact,
      sources.length > 0,
    );
    evidence.provenanceByRevision.set(revisionId, provenance);
    let references = persistedReferencesByRevision.get(revisionId) ?? [];
    if (references.length === 0) {
      references = discoveredSourcesFromNormalizedPayload({
        revisionId,
        payload: legacyDiscoveryPayloadByRevision.get(revisionId) ?? null,
        citationProvenance: provenance,
        createdAt: fact.revisionCreatedAt ?? fact.runCreatedAt,
      }).map((source) => ({
        id: source.id,
        revisionId: source.revisionId,
        ordinal: source.ordinal,
        providerPosition: source.providerPosition,
        url: source.url,
        title: source.title,
        domain: source.domain,
        siteName: source.siteName,
        summary: source.summary,
        publishedAt: source.publishedAt,
        isCited: source.isCited,
        createdAt: source.createdAt,
      }));
      evidenceRowCount += references.length;
      if (evidenceRowCount > evidenceRowLimit) {
        throw new RepositoryError(
          "INVALID_STATE",
          `Monitoring scope exceeds the ${evidenceRowLimit.toLocaleString("en-US")} evidence row limit; narrow the date or dimension filters`,
        );
      }
    }
    const referencesByUrl = new Map(
      references.map((source) => [canonicalUrl(source.url), source]),
    );
    // Very old rows may have neither persisted discovery rows nor a normalized
    // reference list. Preserve them as unverified discoveries, never citations.
    for (const source of sources) {
      const key = canonicalUrl(source.url);
      if (!referencesByUrl.has(key)) {
        referencesByUrl.set(key, {
          id: source.id,
          revisionId,
          ordinal: source.ordinal,
          providerPosition: source.providerPosition,
          url: source.url,
          title: source.title,
          domain: source.domain,
          siteName: null,
          summary: null,
          publishedAt: null,
          isCited: false,
          createdAt: source.createdAt,
        });
      }
    }
    const explicitUrls = new Set(
      provenance === "explicit"
        ? sources.map((source) => canonicalUrl(source.url))
        : [],
    );
    const safeReferences = [...referencesByUrl.values()]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((source): MonitoringReference => ({
        id: source.id,
        revisionId,
        ordinal: source.ordinal,
        providerPosition: source.providerPosition,
        url: source.url,
        title: source.title,
        domain: source.domain,
        siteName: source.siteName,
        summary: source.summary,
        publishedAt: source.publishedAt,
        isCited:
          provenance === "explicit" &&
          (source.isCited || explicitUrls.has(canonicalUrl(source.url))),
      }));
    evidence.referencesByRevision.set(revisionId, safeReferences);
    evidence.citationsByRevision.set(
      revisionId,
      provenance === "explicit"
        ? sources.map((source): MonitoringCitation => {
            const discovered = referencesByUrl.get(canonicalUrl(source.url));
            return {
              id: source.id,
              revisionId,
              ordinal: source.ordinal,
              providerPosition:
                source.providerPosition ?? discovered?.providerPosition ?? null,
              url: source.url,
              title: source.title || discovered?.title || "",
              domain: discovered?.domain || source.domain,
              siteName: discovered?.siteName ?? null,
              summary: discovered?.summary ?? null,
              publishedAt: discovered?.publishedAt ?? null,
              citedText: source.citedText,
            };
          })
        : [],
    );
  }
  return evidence;
}

export function decodeMonitoringAnswerCursor(
  value: string,
  scope: MonitoringScope,
) {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      parsed.version !== 1 ||
      parsed.scope !== monitoringScopeFingerprint(scope) ||
      typeof parsed.runCreatedAt !== "string" ||
      typeof parsed.attemptId !== "string" ||
      !isUuid(parsed.attemptId)
    ) {
      throw new Error("cursor fields are invalid");
    }
    const runCreatedAt = new Date(parsed.runCreatedAt);
    if (
      !Number.isFinite(runCreatedAt.getTime()) ||
      runCreatedAt.toISOString() !== parsed.runCreatedAt
    ) {
      throw new Error("cursor timestamp is invalid");
    }
    return { runCreatedAt, attemptId: parsed.attemptId };
  } catch {
    throw new RepositoryError(
      "INVALID_STATE",
      "Invalid monitoring answer cursor",
    );
  }
}

export function encodeMonitoringAnswerCursor(
  scope: MonitoringScope,
  runCreatedAt: Date,
  attemptId: string,
) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      scope: monitoringScopeFingerprint(scope),
      runCreatedAt: runCreatedAt.toISOString(),
      attemptId,
    }),
    "utf8",
  ).toString("base64url");
}

export function monitoringDetailRowAsFact(
  row: Omit<
    Parameters<typeof monitoringListRowAsFact>[0],
    "hasNonEmptyAnswer" | "monitorCompetitors"
  > & {
    answerMarkdown: string;
  },
  monitorCompetitors: Array<{ name: string; aliases: string[] }>,
) {
  return monitoringListRowAsFact({
    ...row,
    monitorCompetitors,
    hasNonEmptyAnswer: row.answerMarkdown.trim().length > 0,
  });
}

export function monitoringListRowAsFact(row: {
  answerId: string;
  runId: string;
  runCreatedAt: Date;
  questionId: string;
  platformId: string;
  status: MonitoringFact["status"];
  currentRevisionId: string | null;
  hasNonEmptyAnswer: number | boolean;
  sentiment: Sentiment | null;
  brandMentioned: boolean | null;
  mentionPosition: number | null;
  competitorRankings: Array<Record<string, unknown>> | null;
  monitorCompetitors: Array<{ name: string; aliases: string[] }>;
  normalizedPayload: Record<string, unknown> | null;
  revisionCreatedAt: Date | null;
}): MonitoringFact {
  return {
    attemptId: row.answerId,
    runId: row.runId,
    runCreatedAt: row.runCreatedAt,
    questionId: row.questionId,
    platformId: row.platformId,
    status: row.status,
    revisionId: row.currentRevisionId,
    hasNonEmptyAnswer:
      row.hasNonEmptyAnswer === true || Number(row.hasNonEmptyAnswer) === 1,
    sentiment: row.sentiment,
    brandMentioned: row.brandMentioned,
    mentionPosition: row.mentionPosition,
    competitorRankings: row.competitorRankings,
    monitorCompetitors: row.monitorCompetitors,
    citationProvenanceHint: parseCitationProvenanceHint(
      row.normalizedPayload?.citationProvenance,
    ),
    hasLegacyCitationList: hasLegacyCitationList(row.normalizedPayload),
    revisionCreatedAt: row.revisionCreatedAt,
  };
}

export function monitoringMetrics(
  facts: readonly MonitoringFact[],
  evidence: MonitoringEvidence,
  subject: ResolvedMonitoringSubject,
) {
  const answers = facts.filter(isEffectiveMonitoringAnswer);
  const contributions = answers.map((fact) =>
    monitoringSubjectContribution(fact, subject),
  );
  const mentionedAnswers = contributions.filter(
    (contribution) => contribution.mentioned,
  ).length;
  const positions = contributions.flatMap((contribution) =>
    contribution.position === null ? [] : [contribution.position],
  );
  let citationCount = 0;
  let discoveredSourceCount = 0;
  const domains = new Set<string>();
  for (const fact of answers) {
    const revisionId = fact.revisionId!;
    citationCount += evidence.citationsByRevision.get(revisionId)?.length ?? 0;
    const references = evidence.referencesByRevision.get(revisionId) ?? [];
    discoveredSourceCount += references.length;
    for (const reference of references) domains.add(reference.domain);
  }
  const sentiments =
    subject.kind === "self"
      ? {
          positive: answers.filter((fact) => fact.sentiment === "positive")
            .length,
          neutral: answers.filter((fact) => fact.sentiment === "neutral")
            .length,
          negative: answers.filter((fact) => fact.sentiment === "negative")
            .length,
          unknown: answers.filter((fact) => fact.sentiment === "unknown")
            .length,
        }
      : null;
  const positionRates = monitoringPositionRates(positions, answers.length);
  return {
    runs: new Set(facts.map((fact) => fact.runId)).size,
    attempts: facts.length,
    answers: answers.length,
    mentionedAnswers,
    mentionRate:
      answers.length === 0 ? null : mentionedAnswers / answers.length,
    averagePosition:
      positions.length === 0
        ? null
        : positions.reduce((sum, position) => sum + position, 0) /
          positions.length,
    ...positionRates,
    citationCount,
    discoveredSourceCount,
    uniqueDomainCount: domains.size,
    sentiments,
  };
}

export function monitoringSubjectContribution(
  fact: MonitoringFact,
  subject: ResolvedMonitoringSubject,
) {
  if (subject.kind === "self") {
    return {
      mentioned: fact.brandMentioned ?? false,
      position: monitoringMentionPosition(
        fact.brandMentioned,
        fact.mentionPosition,
      ),
    };
  }
  const currentNames = new Set(
    [subject.name, ...subject.aliases].map(normalizedBrandName),
  );
  const historicalSubject = fact.monitorCompetitors.find((competitor) =>
    [competitor.name, ...competitor.aliases]
      .map(normalizedBrandName)
      .some((name) => currentNames.has(name)),
  );
  if (!historicalSubject) return { mentioned: false, position: null };
  const names = new Set(
    [historicalSubject.name, ...historicalSubject.aliases].map(
      normalizedBrandName,
    ),
  );
  const matches = safeRankingEntries(fact.competitorRankings).filter((entry) =>
    names.has(normalizedBrandName(entry.name)),
  );
  const positions = matches.flatMap((entry) =>
    !entry.mentioned || entry.position === null ? [] : [entry.position],
  );
  return {
    mentioned: matches.some((entry) => entry.mentioned),
    position: positions.length === 0 ? null : Math.min(...positions),
  };
}

export function normalizedMonitoringRankings(input: {
  mainBrand: string;
  competitors: Array<{ name: string; aliases: string[] }>;
  brandMentioned: boolean;
  mentionPosition: number | null;
  competitorRankings: Array<Record<string, unknown>>;
}) {
  const fact = {
    brandMentioned: input.brandMentioned,
    mentionPosition: input.mentionPosition,
    competitorRankings: input.competitorRankings,
    monitorCompetitors: input.competitors,
  } as MonitoringFact;
  return [
    {
      subject: { kind: "self" as const, name: input.mainBrand },
      mentioned: input.brandMentioned,
      position: monitoringMentionPosition(
        input.brandMentioned,
        input.mentionPosition,
      ),
    },
    ...input.competitors.map((competitor) => ({
      subject: { kind: "competitor" as const, name: competitor.name },
      ...monitoringSubjectContribution(fact, {
        kind: "competitor",
        name: competitor.name,
        aliases: competitor.aliases,
      }),
    })),
  ];
}

export function safeKeywordEvaluations(value: unknown): Array<{
  keyword: string;
  nature: "positive" | "neutral" | "negative";
  context: string | null;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const keyword = firstString(record.keyword);
    const nature = firstString(record.nature)?.toLowerCase();
    if (
      !keyword ||
      (nature !== "positive" && nature !== "neutral" && nature !== "negative")
    ) {
      return [];
    }
    return [
      {
        keyword,
        nature,
        context: firstString(record.context) ?? null,
      },
    ];
  });
}

export function monitoringAnswerShareUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const value = payload as Record<string, unknown>;
  const raw =
    value.raw && typeof value.raw === "object" && !Array.isArray(value.raw)
      ? (value.raw as Record<string, unknown>)
      : {};
  return (
    normalizeShareUrl(value.shareUrl) ?? normalizeShareUrl(raw.shareUrl) ?? null
  );
}

export function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function emptyMonitoringEvidence(): MonitoringEvidence {
  return {
    provenanceByRevision: new Map(),
    citationsByRevision: new Map(),
    referencesByRevision: new Map(),
    screenshotCountByRevision: new Map(),
  };
}

export function parseCitationProvenanceHint(
  value: unknown,
): CitationProvenance | null {
  return value === "explicit" ||
    value === "legacy_assumed" ||
    value === "unavailable"
    ? value
    : null;
}

export type MonitoringEvidence = {
  provenanceByRevision: Map<string, CitationProvenance>;
  citationsByRevision: Map<string, MonitoringCitation[]>;
  referencesByRevision: Map<string, MonitoringReference[]>;
  screenshotCountByRevision: Map<string, number>;
};

export type MonitoringFact = {
  attemptId: string;
  runId: string;
  runCreatedAt: Date;
  questionId: string;
  platformId: string;
  status: (typeof attempts.$inferSelect)["status"];
  revisionId: string | null;
  hasNonEmptyAnswer: boolean;
  sentiment: Sentiment | null;
  brandMentioned: boolean | null;
  mentionPosition: number | null;
  competitorRankings: Array<Record<string, unknown>> | null;
  monitorCompetitors: Array<{ name: string; aliases: string[] }>;
  citationProvenanceHint: CitationProvenance | null;
  hasLegacyCitationList: boolean;
  revisionCreatedAt: Date | null;
};

export type ResolvedMonitoringScope = {
  scope: MonitoringScope;
  monitor: typeof monitors.$inferSelect;
  version: typeof monitorVersions.$inferSelect;
  questions: Array<typeof monitorQuestions.$inferSelect>;
  platforms: Array<{
    monitorVersionId: string;
    ordinal: number;
    platformId: string;
    providerCode: string;
    clientType: (typeof attempts.$inferSelect)["clientType"];
    mode: (typeof attempts.$inferSelect)["mode"];
    displayName: string;
  }>;
  brand: typeof projectBrandVersions.$inferSelect;
  projectTimezone: string;
  subject: ResolvedMonitoringSubject;
};

export type ResolvedMonitoringSubject =
  { kind: "self" } | { kind: "competitor"; name: string; aliases: string[] };

export type MonitoringSourceRow = {
  id: string;
  revisionId: string;
  ordinal: number;
  providerPosition: number | null;
  url: string;
  title: string;
  domain: string;
  citedText: string | null;
  createdAt: Date;
};

export type MonitoringDiscoveredRow = {
  id: string;
  revisionId: string;
  ordinal: number;
  providerPosition: number | null;
  url: string;
  title: string;
  domain: string;
  siteName: string | null;
  summary: string | null;
  publishedAt: string | null;
  isCited: boolean;
  createdAt: Date;
};

export function monitoringLocalDate(value: Date, timezone: string) {
  const parts = zonedParts(value, timezone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function monitoringCompetitorAnalysisItems(
  facts: readonly MonitoringFact[],
  competitors: ReadonlyArray<{ name: string; aliases: string[] }>,
) {
  const effectiveAnswers = facts.filter(isEffectiveMonitoringAnswer);
  const answerCount = effectiveAnswers.length;
  const aggregates = competitors.map((competitor) => ({
    name: competitor.name,
    appearances: 0,
    positions: [] as number[],
  }));
  const currentIndexesByName = new Map<string, Set<number>>();
  competitors.forEach((competitor, index) => {
    for (const name of new Set(
      [competitor.name, ...competitor.aliases].map(normalizedBrandName),
    )) {
      const indexes = currentIndexesByName.get(name) ?? new Set<number>();
      indexes.add(index);
      currentIndexesByName.set(name, indexes);
    }
  });

  for (const fact of effectiveAnswers) {
    // Preserve the old `.find()` semantics: if multiple immutable historical
    // competitors overlap a current alias, the first snapshot entry wins.
    const historicalNamesByCurrentIndex = new Map<number, Set<string>>();
    for (const historical of fact.monitorCompetitors) {
      const historicalNames = new Set(
        [historical.name, ...historical.aliases].map(normalizedBrandName),
      );
      const matchingCurrentIndexes = new Set<number>();
      for (const name of historicalNames) {
        for (const index of currentIndexesByName.get(name) ?? []) {
          matchingCurrentIndexes.add(index);
        }
      }
      for (const index of matchingCurrentIndexes) {
        if (!historicalNamesByCurrentIndex.has(index)) {
          historicalNamesByCurrentIndex.set(index, historicalNames);
        }
      }
    }

    const rankingsByName = new Map<
      string,
      Array<{ mentioned: boolean; position: number | null }>
    >();
    for (const entry of safeRankingEntries(fact.competitorRankings)) {
      const name = normalizedBrandName(entry.name);
      const rankings = rankingsByName.get(name) ?? [];
      rankings.push({ mentioned: entry.mentioned, position: entry.position });
      rankingsByName.set(name, rankings);
    }

    for (const [index, historicalNames] of historicalNamesByCurrentIndex) {
      let mentioned = false;
      let position: number | null = null;
      for (const name of historicalNames) {
        for (const entry of rankingsByName.get(name) ?? []) {
          if (!entry.mentioned) continue;
          mentioned = true;
          if (
            entry.position !== null &&
            (position === null || entry.position < position)
          ) {
            position = entry.position;
          }
        }
      }
      if (mentioned) aggregates[index]!.appearances += 1;
      if (position !== null) aggregates[index]!.positions.push(position);
    }
  }

  return aggregates.map((aggregate) => ({
    name: aggregate.name,
    appearances: aggregate.appearances,
    answerCount,
    mentionRate: answerCount === 0 ? null : aggregate.appearances / answerCount,
    averagePosition:
      aggregate.positions.length === 0
        ? null
        : aggregate.positions.reduce((sum, value) => sum + value, 0) /
          aggregate.positions.length,
    highPositionExposure: monitoringPositionRates(
      aggregate.positions,
      answerCount,
    ).top3Rate,
  }));
}

export function isEffectiveMonitoringAnswer(
  fact: Pick<MonitoringFact, "status" | "revisionId" | "hasNonEmptyAnswer">,
) {
  return (
    fact.status === "completed" &&
    fact.revisionId !== null &&
    fact.hasNonEmptyAnswer
  );
}

export function canonicalUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

export type PublicationTimeBucket = (typeof publicationTimeBuckets)[number];

export function publicationTimeBucket(
  publishedAt: string | null,
  rangeEnd: Date,
  timezone = "UTC",
): PublicationTimeBucket {
  if (!publishedAt || !/^\d{4}-\d{2}-\d{2}$/u.test(publishedAt)) {
    return "unknown";
  }
  const published = new Date(`${publishedAt}T00:00:00.000Z`);
  const localRangeEnd = new Date(
    `${monitoringLocalDate(rangeEnd, timezone)}T00:00:00.000Z`,
  );
  if (
    !Number.isFinite(published.getTime()) ||
    !Number.isFinite(localRangeEnd.getTime()) ||
    published > localRangeEnd
  ) {
    return "unknown";
  }
  const ageDays = Math.floor(
    (localRangeEnd.getTime() - published.getTime()) / 86_400_000,
  );
  if (ageDays <= 7) return "last_7_days";
  if (ageDays <= 30) return "last_30_days";
  if (ageDays <= 90) return "last_90_days";
  return "older";
}

export const publicationTimeBuckets = [
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "older",
  "unknown",
] as const;

export function groupByRevision<T extends { revisionId: string }>(rows: readonly T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.revisionId) ?? [];
    group.push(row);
    grouped.set(row.revisionId, group);
  }
  return grouped;
}

export function monitoringFactCitationProvenance(
  fact: Pick<
    MonitoringFact,
    "citationProvenanceHint" | "hasLegacyCitationList"
  >,
  hasStoredSources: boolean,
): CitationProvenance {
  if (fact.citationProvenanceHint) return fact.citationProvenanceHint;
  if (fact.hasLegacyCitationList) return "explicit";
  return hasStoredSources ? "legacy_assumed" : "unavailable";
}

export function discoveredSourcesFromNormalizedPayload(input: {
  revisionId: string;
  payload: Record<string, unknown> | null;
  citationProvenance: CitationProvenance;
  createdAt: Date;
}): DiscoveredSourceRow[] {
  const allReferences = payloadArray(input.payload, "allReferences");
  const references = payloadArray(input.payload, "references");
  const citedReferences =
    input.citationProvenance === "explicit" ? references : [];
  const citedUrls = new Set(
    citedReferences.flatMap((value) => {
      const reference = safeNormalizedReference(value);
      return reference ? [reference.canonicalUrl] : [];
    }),
  );
  const merged = new Map<
    string,
    ReturnType<typeof safeNormalizedReference> & { isCited: boolean }
  >();
  const accept = (value: unknown, cited: boolean) => {
    const reference = safeNormalizedReference(value);
    if (!reference) return;
    const existing = merged.get(reference.canonicalUrl);
    if (!existing) {
      merged.set(reference.canonicalUrl, {
        ...reference,
        isCited: cited || citedUrls.has(reference.canonicalUrl),
      });
      return;
    }
    const preferredProviderPosition =
      cited && reference.providerPosition !== null
        ? reference.providerPosition
        : existing.providerPosition;
    merged.set(reference.canonicalUrl, {
      ...existing,
      title: existing.title || reference.title,
      siteName: existing.siteName ?? reference.siteName,
      summary: existing.summary ?? reference.summary,
      publishedAt: existing.publishedAt ?? reference.publishedAt,
      providerPosition: preferredProviderPosition ?? reference.providerPosition,
      isCited:
        existing.isCited || cited || citedUrls.has(reference.canonicalUrl),
    });
  };
  for (const value of allReferences) accept(value, false);
  for (const value of references) {
    accept(value, input.citationProvenance === "explicit");
  }

  return [...merged.values()].flatMap((source, ordinal) =>
    source
      ? [
          {
            id: deterministicUuid(
              `discovered-source:${input.revisionId}:${source.canonicalUrl}`,
            ),
            revisionId: input.revisionId,
            ordinal,
            providerPosition: source.providerPosition,
            url: source.url,
            canonicalUrlHash: sha256(source.canonicalUrl),
            title: source.title,
            domain: source.domain.slice(0, 255),
            siteName: source.siteName?.slice(0, 255) ?? null,
            summary: source.summary,
            publishedAt: source.publishedAt,
            providerIconUrl: null,
            isCited: source.isCited,
            createdAt: input.createdAt,
          },
        ]
      : [],
  );
}

export type MonitoringReference = Omit<MonitoringCitation, "citedText"> & {
  isCited: boolean;
};

export type MonitoringCitation = {
  id: string;
  revisionId: string;
  ordinal: number;
  providerPosition: number | null;
  url: string;
  title: string;
  domain: string;
  siteName: string | null;
  summary: string | null;
  publishedAt: string | null;
  citedText: string | null;
};

export function monitoringScopeFingerprint(scope: MonitoringScope) {
  return sha256(
    stableJson({
      monitorId: scope.monitorId,
      from: scope.from.toISOString(),
      to: scope.to.toISOString(),
      questionId: scope.questionId ?? null,
      questionCategory: scope.questionCategory ?? null,
      platformId: scope.platformId ?? null,
      subject:
        scope.subject.kind === "self"
          ? { kind: "self" }
          : { kind: "competitor", name: scope.subject.name },
    }),
  );
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

export function hasLegacyCitationList(payload: Record<string, unknown> | null) {
  const raw = payload?.raw;
  return (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Array.isArray((raw as Record<string, unknown>).citationList)
  );
}

export function monitoringPositionRates(
  positions: readonly number[],
  effectiveAnswerCount: number,
) {
  if (effectiveAnswerCount === 0) {
    return { top1Rate: null, top3Rate: null, top10Rate: null };
  }
  return {
    top1Rate:
      positions.filter((position) => position <= 1).length /
      effectiveAnswerCount,
    top3Rate:
      positions.filter((position) => position <= 3).length /
      effectiveAnswerCount,
    top10Rate:
      positions.filter((position) => position <= 10).length /
      effectiveAnswerCount,
  };
}

export function monitoringMentionPosition(
  mentioned: boolean | null | undefined,
  position: number | null,
) {
  return mentioned === true ? position : null;
}

export function normalizedBrandName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function safeRankingEntries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const nestedSubject =
      record.subject &&
      typeof record.subject === "object" &&
      !Array.isArray(record.subject)
        ? (record.subject as Record<string, unknown>)
        : null;
    const name = firstString(
      record.name,
      record.brand,
      record.brandName,
      record.competitorName,
      record.keyword,
      nestedSubject?.name,
    );
    if (!name) return [];
    const rawPosition = firstNumber(
      record.position,
      record.rank,
      record.ranking,
    );
    const position =
      rawPosition !== undefined &&
      Number.isInteger(rawPosition) &&
      rawPosition > 0
        ? rawPosition
        : null;
    const explicitlyMentioned = firstBoolean(
      record.mentioned,
      record.isMentioned,
      record.brandMentioned,
    );
    const mentioned = explicitlyMentioned ?? position !== null;
    return [
      {
        name,
        mentioned,
        position: mentioned ? position : null,
      },
    ];
  });
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function zonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const weekdayText =
    parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const weekdays: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    weekday: weekdays[weekdayText] ?? 1,
  };
}

export type DiscoveredSourceRow = typeof resultDiscoveredSources.$inferSelect;

export function payloadArray(
  payload: Record<string, unknown> | null,
  key: string,
): unknown[] {
  const value = payload?.[key];
  return Array.isArray(value) ? value : [];
}

export function safeNormalizedReference(value: unknown): {
  canonicalUrl: string;
  url: string;
  title: string;
  domain: string;
  siteName: string | null;
  summary: string | null;
  publishedAt: string | null;
  providerPosition: number | null;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const raw =
    record.raw && typeof record.raw === "object" && !Array.isArray(record.raw)
      ? (record.raw as Record<string, unknown>)
      : {};
  const rawUrl = firstString(record.url);
  if (!rawUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password
  ) {
    return null;
  }
  const url = parsed.toString();
  const publishedAt = firstString(
    record.publishedAt,
    raw.publishTime,
    raw.publishedAt,
    raw.publishDate,
  );
  return {
    canonicalUrl: canonicalUrl(url),
    url,
    title: firstString(record.title, raw.title, raw.name) ?? "",
    domain: parsed.hostname,
    siteName:
      firstString(record.siteName, raw.siteName, raw.site)?.slice(0, 255) ??
      null,
    summary:
      firstString(record.snippet, raw.snippet, raw.summary, raw.description) ??
      null,
    publishedAt:
      publishedAt && /^\d{4}-\d{2}-\d{2}$/u.test(publishedAt)
        ? publishedAt
        : null,
    providerPosition: positiveInteger(
      firstNumber(record.position, raw.position, raw.index),
    ),
  };
}

export function deterministicUuid(material: string): string {
  const hash = sha256(material);
  const variant = ((Number.parseInt(hash[16] ?? "0", 16) & 0x3) | 0x8).toString(
    16,
  );
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+$/u.test(value.trim())) {
      return Number(value.trim());
    }
  }
  return undefined;
}

export function firstBoolean(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === "boolean");
}

export function positiveInteger(value: number | undefined): number | null {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export interface ProgressScopePorts {
  tables: ProgressSchema;
  monitoringChildOwnerPredicate(table: ProgressSchema["runs"], ownerId: string): SQL;
  monitoringProjectOwnerPredicate(table: ProgressSchema["projects"], ownerId: string): SQL;
}
export function monitoringFactConditions(ownerId: string, scope: MonitoringScope & { questionIds?: string[]; platformIds?: string[] }, core: ProgressScopePorts) {
 const { attempts, runs, monitorQuestions } = core.tables;
 const monitoringChildOwnerPredicate = core.monitoringChildOwnerPredicate;
  // Array filters are used only by the report export contract.

  const conditions = [
    eq(attempts.ownerId, ownerId),
    monitoringChildOwnerPredicate(runs, ownerId),
    eq(runs.monitorId, scope.monitorId),
    isNull(runs.deletedAt),
    gte(runs.createdAt, scope.from),
    lt(runs.createdAt, scope.to),
    sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${runs.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
  ];
  if (scope.questionId) {
    conditions.push(eq(monitorQuestions.questionId, scope.questionId));
  }
  if (scope.questionIds) conditions.push(inArray(monitorQuestions.questionId, scope.questionIds));
  if (scope.platformIds) conditions.push(inArray(attempts.platformId, scope.platformIds));
  if (scope.platformId) {
    conditions.push(eq(attempts.platformId, scope.platformId));
  }
  if (scope.questionCategory) {
    conditions.push(
      eq(monitorQuestions.categorySnapshot, scope.questionCategory),
    );
  }
  return conditions;
}
