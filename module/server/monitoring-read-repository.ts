/** Progress-owned monitoring SQL and aggregation. Core supplies identity scoping in-process. */
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { ProgressSchema } from "../schema/index.js";
import type { ProgressScopePorts } from "./read-helpers.js";
import {
  MONITORING_EVIDENCE_REVISION_BATCH_SIZE, MONITORING_EVIDENCE_ROW_LIMIT, MONITORING_FACT_LIMIT, MONITORING_LEGACY_DISCOVERY_FALLBACK_LIMIT, buildMonitoringAnalysis, buildMonitoringEvidence, decodeMonitoringAnswerCursor, encodeMonitoringAnswerCursor, monitoringDetailRowAsFact, monitoringFactConditions, monitoringListRowAsFact, monitoringMetrics, monitoringSubjectContribution, normalizedMonitoringRankings, safeKeywordEvaluations, monitoringAnswerShareUrl, chunks, emptyMonitoringEvidence, parseCitationProvenanceHint, type MonitoringEvidence, type MonitoringFact, type ResolvedMonitoringScope, type ResolvedMonitoringSubject, type MonitoringSourceRow, type MonitoringDiscoveredRow, RepositoryError } from "./read-helpers.js";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { MonitoringAnalysisInput, MonitoringAnswersListInput, MonitoringScope } from "@frontmind/monitoring-contracts";
type Database = MySql2Database<any>;

export interface ProgressMonitorReader extends ProgressScopePorts {
 getMonitor(ownerId: string, monitorId: string): Promise<{ monitor: ResolvedMonitoringScope["monitor"]; version: ResolvedMonitoringScope["version"]; questions: ResolvedMonitoringScope["questions"] }>;
}

export class ProgressMonitoringReadRepository {
 private get tables() { return this.core.tables; }
  constructor(
    public readonly db: Database,
    private readonly core: ProgressMonitorReader,
  ) {}

  async getMonitoringSummary(ownerId: string, scope: MonitoringScope) {
    const { attempts, attemptResults, monitors, monitorQuestions, monitorVersions, monitorPlatforms, platformCatalog, projectBrandVersions, projects, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runs, projectQuestions, scheduleOccurrences } = this.tables;
    const { monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate } = this.core;

    const resolved = await this.resolveMonitoringReadScope(ownerId, scope);
    const facts = await this.readMonitoringFacts(ownerId, resolved);
    const evidence = await this.readMonitoringEvidence(facts);
    const historicalQuestions = await this.readHistoricalMonitoringQuestions(
      ownerId,
      scope,
    );
    const questionCatalog = new Map(
      resolved.questions
        .filter(
          (question) =>
            !scope.questionCategory ||
            question.categorySnapshot === scope.questionCategory,
        )
        .map((question) => [
          question.questionId,
          {
            id: question.questionId,
            ordinal: question.ordinal,
            label: question.questionSnapshot,
            category: question.categorySnapshot,
          },
        ]),
    );
    const configuredQuestionIds = new Set(
      resolved.questions.map((question) => question.questionId),
    );
    for (const question of historicalQuestions) {
      if (!questionCatalog.has(question.id))
        questionCatalog.set(question.id, question);
      else if (
        !scope.questionCategory &&
        !configuredQuestionIds.has(question.id) &&
        questionCatalog.get(question.id)!.category !== question.category
      ) {
        questionCatalog.set(question.id, { ...question, category: null });
      }
    }
    return {
      monitor: {
        id: resolved.monitor.id,
        name: resolved.monitor.name,
        status: resolved.monitor.status,
        activeVersionId: resolved.monitor.activeVersionId,
        activeVersion: resolved.version.version,
      },
      filters: {
        questions: [...questionCatalog.values()],
        platforms: resolved.platforms.map((platform) => ({
          id: platform.platformId,
          ordinal: platform.ordinal,
          providerCode: platform.providerCode,
          displayName: platform.displayName,
          clientType: platform.clientType,
          mode: platform.mode,
        })),
        subjects: [
          { kind: "self" as const, label: resolved.brand.mainBrand },
          ...resolved.version.competitors.map((competitor) => ({
            kind: "competitor" as const,
            name: competitor.name,
            label: competitor.name,
          })),
        ],
      },
      metrics: monitoringMetrics(facts, evidence, resolved.subject),
    };
  }

  async listMonitoringAnswers(
    ownerId: string,
    input: MonitoringAnswersListInput,
  ) {
    const { attempts, attemptResults, monitors, monitorQuestions, monitorVersions, monitorPlatforms, platformCatalog, projectBrandVersions, projects, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runs, projectQuestions, scheduleOccurrences } = this.tables;
    const { monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate } = this.core;

    const resolved = await this.resolveMonitoringReadScope(
      ownerId,
      input.scope,
    );
    const cursor = input.cursor
      ? decodeMonitoringAnswerCursor(input.cursor, resolved.scope)
      : null;
    const conditions = monitoringFactConditions(ownerId, resolved.scope, this.core);
    if (cursor) {
      conditions.push(
        or(
          lt(runs.createdAt, cursor.runCreatedAt),
          and(
            eq(runs.createdAt, cursor.runCreatedAt),
            lt(attempts.id, cursor.attemptId),
          ),
        )!,
      );
    }
    const rows = await this.db
      .select({
        answerId: attempts.id,
        runId: runs.id,
        runCreatedAt: runs.createdAt,
        questionId: monitorQuestions.questionId,
        question: attempts.question,
        questionCategory: monitorQuestions.categorySnapshot,
        platformId: attempts.platformId,
        providerCode: attempts.providerCode,
        platformDisplayName: platformCatalog.displayName,
        clientType: attempts.clientType,
        mode: attempts.mode,
        repetition: attempts.repetition,
        status: attempts.status,
        currentRevisionId: attemptResults.currentRevisionId,
        answerPreview: sql<
          string | null
        >`CASE WHEN ${attemptResults.attemptId} IS NULL THEN NULL ELSE LEFT(${attemptResults.answerMarkdown}, 280) END`,
        hasNonEmptyAnswer: sql<number>`CASE WHEN ${attemptResults.attemptId} IS NOT NULL AND CHAR_LENGTH(TRIM(${attemptResults.answerMarkdown})) > 0 THEN 1 ELSE 0 END`,
        sentiment: attemptResults.sentiment,
        brandMentioned: attemptResults.brandMentioned,
        mentionPosition: attemptResults.mentionPosition,
        competitorRankings: attemptResults.competitorRankings,
        monitorCompetitors: monitorVersions.competitors,
        resultUpdatedAt: attemptResults.updatedAt,
        normalizedPayload: resultRevisions.normalizedPayload,
        revisionCreatedAt: resultRevisions.createdAt,
      })
      .from(attempts)
      .innerJoin(runs, eq(attempts.runId, runs.id))
      .innerJoin(monitorVersions, eq(runs.monitorVersionId, monitorVersions.id))
      .innerJoin(
        monitorQuestions,
        and(
          eq(monitorQuestions.monitorVersionId, runs.monitorVersionId),
          eq(monitorQuestions.ordinal, attempts.monitorQuestionOrdinal),
        ),
      )
      .innerJoin(platformCatalog, eq(attempts.platformId, platformCatalog.id))
      .leftJoin(attemptResults, eq(attemptResults.attemptId, attempts.id))
      .leftJoin(
        resultRevisions,
        eq(resultRevisions.id, attemptResults.currentRevisionId),
      )
      .where(and(...conditions))
      .orderBy(desc(runs.createdAt), desc(attempts.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const facts = page.map(monitoringListRowAsFact);
    const evidence = await this.readMonitoringEvidence(facts);
    return {
      items: page.map((row, index) => {
        const fact = facts[index]!;
        const subject = monitoringSubjectContribution(fact, resolved.subject);
        const provenance = evidence.provenanceByRevision.get(
          row.currentRevisionId ?? "",
        );
        return {
          answerId: row.answerId,
          runId: row.runId,
          runCreatedAt: row.runCreatedAt,
          questionId: row.questionId,
          question: row.question,
          questionCategory: row.questionCategory,
          platform: {
            id: row.platformId,
            providerCode: row.providerCode,
            displayName: row.platformDisplayName,
            clientType: row.clientType,
            mode: row.mode,
          },
          repetition: row.repetition,
          status: row.status,
          result:
            row.currentRevisionId &&
            row.answerPreview !== null &&
            row.sentiment &&
            row.brandMentioned !== null &&
            row.resultUpdatedAt
              ? {
                  answerPreview: row.answerPreview,
                  sentiment: row.sentiment,
                  mentioned: subject.mentioned,
                  position: subject.position,
                  citationProvenance: provenance ?? "unavailable",
                  citationCount:
                    evidence.citationsByRevision.get(row.currentRevisionId)
                      ?.length ?? 0,
                  referenceCount:
                    evidence.referencesByRevision.get(row.currentRevisionId)
                      ?.length ?? 0,
                  screenshotCount:
                    evidence.screenshotCountByRevision.get(
                      row.currentRevisionId,
                    ) ?? 0,
                  updatedAt: row.resultUpdatedAt,
                }
              : null,
        };
      }),
      nextCursor:
        rows.length > input.limit && page.length > 0
          ? encodeMonitoringAnswerCursor(
              resolved.scope,
              page.at(-1)!.runCreatedAt,
              page.at(-1)!.answerId,
            )
          : null,
    };
  }

  async getMonitoringAnswer(
    ownerId: string,
    monitorId: string,
    answerId: string,
    subject: MonitoringScope["subject"] = { kind: "self" },
  ) {
    const { attempts, attemptResults, monitors, monitorQuestions, monitorVersions, monitorPlatforms, platformCatalog, projectBrandVersions, projects, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runs, projectQuestions, scheduleOccurrences } = this.tables;
    const { monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate } = this.core;

    // Resolving the current version first both enforces tenant ownership and
    // keeps the monitor boundary explicit even though the answer belongs to an
    // immutable historical version.
    const current = await this.core.getMonitor(ownerId, monitorId);
    let resolvedSubject: ResolvedMonitoringSubject = { kind: "self" };
    if (subject.kind === "competitor") {
      const competitor = current.version.competitors.find(
        (candidate) => candidate.name === subject.name,
      );
      if (!competitor) {
        throw new RepositoryError(
          "INVALID_STATE",
          "Competitor is not in the current monitor configuration",
        );
      }
      resolvedSubject = {
        kind: "competitor",
        name: competitor.name,
        aliases: competitor.aliases,
      };
    }
    const [row] = await this.db
      .select({
        answerId: attempts.id,
        runId: runs.id,
        runCreatedAt: runs.createdAt,
        monitorVersionId: runs.monitorVersionId,
        projectBrandVersionId: runs.projectBrandVersionId,
        questionId: monitorQuestions.questionId,
        question: attempts.question,
        questionCategory: monitorQuestions.categorySnapshot,
        platformId: attempts.platformId,
        providerCode: attempts.providerCode,
        platformDisplayName: platformCatalog.displayName,
        clientType: attempts.clientType,
        mode: attempts.mode,
        screenshotPolicy: attempts.screenshot,
        repetition: attempts.repetition,
        status: attempts.status,
        currentRevisionId: attemptResults.currentRevisionId,
        answerMarkdown: attemptResults.answerMarkdown,
        reasoningMarkdown: attemptResults.reasoningMarkdown,
        searchKeywords: attemptResults.searchKeywords,
        keywordEvaluations: attemptResults.keywordEvaluations,
        sentiment: attemptResults.sentiment,
        brandMentioned: attemptResults.brandMentioned,
        mentionPosition: attemptResults.mentionPosition,
        competitorRankings: attemptResults.competitorRankings,
        normalizedPayload: resultRevisions.normalizedPayload,
        revisionCreatedAt: resultRevisions.createdAt,
        resultUpdatedAt: attemptResults.updatedAt,
      })
      .from(attempts)
      .innerJoin(runs, eq(attempts.runId, runs.id))
      .innerJoin(
        monitorQuestions,
        and(
          eq(monitorQuestions.monitorVersionId, runs.monitorVersionId),
          eq(monitorQuestions.ordinal, attempts.monitorQuestionOrdinal),
        ),
      )
      .innerJoin(platformCatalog, eq(attempts.platformId, platformCatalog.id))
      .innerJoin(attemptResults, eq(attemptResults.attemptId, attempts.id))
      .innerJoin(
        resultRevisions,
        eq(resultRevisions.id, attemptResults.currentRevisionId),
      )
      .where(
        and(
          eq(attempts.id, answerId),
          eq(attempts.ownerId, ownerId),
          monitoringChildOwnerPredicate(runs, ownerId),
          eq(runs.monitorId, monitorId),
          isNull(runs.deletedAt),
          sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${runs.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
        ),
      )
      .limit(1);
    if (!row)
      throw new RepositoryError("NOT_FOUND", "Monitoring answer not found");
    const [[version], [brand]] = await Promise.all([
      this.db
        .select()
        .from(monitorVersions)
        .where(
          and(
            eq(monitorVersions.id, row.monitorVersionId),
            eq(monitorVersions.monitorId, monitorId),
          ),
        )
        .limit(1),
      this.db
        .select()
        .from(projectBrandVersions)
        .where(eq(projectBrandVersions.id, row.projectBrandVersionId))
        .limit(1),
    ]);
    if (!version || !brand) {
      throw new RepositoryError(
        "NOT_FOUND",
        "Monitoring answer configuration not found",
      );
    }
    const fact = monitoringDetailRowAsFact(row, version.competitors);
    const contribution = monitoringSubjectContribution(fact, resolvedSubject);
    const evidence = await this.readMonitoringEvidence([fact]);
    const revisionId = row.currentRevisionId;
    const provenance =
      evidence.provenanceByRevision.get(revisionId) ?? "unavailable";
    const citations = evidence.citationsByRevision.get(revisionId) ?? [];
    const references = evidence.referencesByRevision.get(revisionId) ?? [];
    const screenshots = await this.db
      .select({
        id: resultMedia.id,
        ordinal: resultMedia.ordinal,
        archiveStatus: resultMedia.archiveStatus,
        thumbnailObjectKey: resultMedia.thumbnailObjectKey,
        mimeType: resultMedia.mimeType,
        sizeBytes: resultMedia.sizeBytes,
      })
      .from(resultMedia)
      .where(
        and(
          eq(resultMedia.revisionId, revisionId),
          eq(resultMedia.type, "screenshot"),
        ),
      )
      .orderBy(asc(resultMedia.ordinal));
    return {
      answerId: row.answerId,
      runId: row.runId,
      runCreatedAt: row.runCreatedAt,
      questionId: row.questionId,
      question: row.question,
      questionCategory: row.questionCategory,
      platform: {
        id: row.platformId,
        providerCode: row.providerCode,
        displayName: row.platformDisplayName,
        clientType: row.clientType,
        mode: row.mode,
      },
      repetition: row.repetition,
      status: row.status,
      answerMarkdown: row.answerMarkdown,
      shareUrl: monitoringAnswerShareUrl(row.normalizedPayload),
      screenshotPolicy: row.screenshotPolicy === 0 || row.screenshotPolicy === 1 || row.screenshotPolicy === 2 ? row.screenshotPolicy as 0 | 1 | 2 : null,
      screenshotBrandMentioned: row.brandMentioned,
      keywordEvaluations: safeKeywordEvaluations(row.keywordEvaluations),
      reasoningMarkdown: row.reasoningMarkdown,
      searchKeywords: Array.isArray(row.searchKeywords)
        ? row.searchKeywords.filter(
            (keyword): keyword is string => typeof keyword === "string",
          )
        : [],
      sentiment: row.sentiment,
      mentioned: contribution.mentioned,
      position: contribution.position,
      rankings: normalizedMonitoringRankings({
        mainBrand: brand.mainBrand,
        competitors: version.competitors,
        brandMentioned: row.brandMentioned,
        mentionPosition: row.mentionPosition,
        competitorRankings: row.competitorRankings,
      }),
      citationProvenance: provenance,
      citationList: citations.map((source) => ({
        id: source.id,
        ordinal: source.ordinal,
        providerPosition: source.providerPosition,
        url: source.url,
        title: source.title,
        domain: source.domain,
        siteName: source.siteName,
        summary: source.summary,
        publishedAt: source.publishedAt,
        citedText: source.citedText,
      })),
      referenceList: references.map((source) => ({
        id: source.id,
        ordinal: source.ordinal,
        providerPosition: source.providerPosition,
        url: source.url,
        title: source.title,
        domain: source.domain,
        siteName: source.siteName,
        summary: source.summary,
        publishedAt: source.publishedAt,
        isCited: provenance === "explicit" && source.isCited,
      })),
      archivedScreenshots: screenshots.map((media) => ({
        id: media.id,
        ordinal: media.ordinal,
        archiveStatus: media.archiveStatus,
        accessPath:
          media.archiveStatus === "archived" ? `/api/monitoring/media/${media.id}` : null,
        thumbnailAccessPath:
          media.archiveStatus === "archived" && media.thumbnailObjectKey
            ? `/api/monitoring/media/${media.id}?variant=thumbnail`
            : null,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
      })),
    };
  }

  async getMonitoringAnalysis(ownerId: string, input: MonitoringAnalysisInput) {
    const { attempts, attemptResults, monitors, monitorQuestions, monitorVersions, monitorPlatforms, platformCatalog, projectBrandVersions, projects, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runs, projectQuestions, scheduleOccurrences } = this.tables;
    const { monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate } = this.core;

    const resolved = await this.resolveMonitoringReadScope(
      ownerId,
      input.scope,
    );
    const facts = await this.readMonitoringFacts(ownerId, resolved);
    const evidence = await this.readMonitoringEvidence(facts);
    return buildMonitoringAnalysis(input.kind, facts, evidence, resolved);
  }

  async readHistoricalMonitoringQuestions(
    ownerId: string,
    scope: MonitoringScope,
  ) {
    const { attempts, attemptResults, monitors, monitorQuestions, monitorVersions, monitorPlatforms, platformCatalog, projectBrandVersions, projects, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runs, projectQuestions, scheduleOccurrences } = this.tables;
    const { monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate } = this.core;

    return this.db
      .select({
        id: monitorQuestions.questionId,
        ordinal: sql<number>`MIN(${monitorQuestions.ordinal})`.mapWith(Number),
        label: monitorQuestions.questionSnapshot,
        category: monitorQuestions.categorySnapshot,
      })
      .from(runs)
      .innerJoin(
        monitorQuestions,
        eq(monitorQuestions.monitorVersionId, runs.monitorVersionId),
      )
      .where(
        and(
          monitoringChildOwnerPredicate(runs, ownerId),
          eq(runs.monitorId, scope.monitorId),
          isNull(runs.deletedAt),
          gte(runs.createdAt, scope.from),
          lt(runs.createdAt, scope.to),
          sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${runs.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
          scope.questionCategory
            ? eq(monitorQuestions.categorySnapshot, scope.questionCategory)
            : undefined,
        ),
      )
      .groupBy(
        monitorQuestions.questionId,
        monitorQuestions.questionSnapshot,
        monitorQuestions.categorySnapshot,
      )
      .orderBy(
        asc(monitorQuestions.questionSnapshot),
        asc(monitorQuestions.questionId),
      );
  }

  async resolveMonitoringReadScope(
    ownerId: string,
    scope: MonitoringScope,
  ): Promise<ResolvedMonitoringScope> {
    const { attempts, attemptResults, monitors, monitorQuestions, monitorVersions, monitorPlatforms, platformCatalog, projectBrandVersions, projects, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runs, projectQuestions, scheduleOccurrences } = this.tables;
    const { monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate } = this.core;

    const detail = await this.core.getMonitor(ownerId, scope.monitorId);
    const [[brand], [project], platforms] = await Promise.all([
      this.db
        .select()
        .from(projectBrandVersions)
        .where(
          eq(projectBrandVersions.id, detail.version.projectBrandVersionId),
        )
        .limit(1),
      this.db
        .select({ timezone: projects.timezone })
        .from(projects)
        .where(
          and(
            eq(projects.id, detail.monitor.projectId),
            monitoringProjectOwnerPredicate(projects, ownerId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1),
      this.db
        .select({
          monitorVersionId: monitorPlatforms.monitorVersionId,
          ordinal: monitorPlatforms.ordinal,
          platformId: monitorPlatforms.platformId,
          providerCode: monitorPlatforms.providerCodeSnapshot,
          clientType: monitorPlatforms.clientType,
          mode: monitorPlatforms.mode,
          displayName: platformCatalog.displayName,
        })
        .from(monitorPlatforms)
        .innerJoin(
          platformCatalog,
          eq(monitorPlatforms.platformId, platformCatalog.id),
        )
        .where(eq(monitorPlatforms.monitorVersionId, detail.version.id))
        .orderBy(asc(monitorPlatforms.ordinal)),
    ]);
    if (!brand || !project)
      throw new RepositoryError(
        "NOT_FOUND",
        "Monitor project or brand configuration not found",
      );
    if (
      scope.questionId &&
      !detail.questions.some(
        (question) => question.questionId === scope.questionId,
      ) &&
      !(await this.readHistoricalMonitoringQuestions(ownerId, scope)).some(
        (question) => question.id === scope.questionId,
      )
    ) {
      throw new RepositoryError(
        "INVALID_STATE",
        "Question is not in the current configuration or scoped monitoring history",
      );
    }
    if (
      scope.platformId &&
      !platforms.some((platform) => platform.platformId === scope.platformId)
    ) {
      throw new RepositoryError(
        "INVALID_STATE",
        "Platform is not in the current monitor configuration",
      );
    }
    const competitorName =
      scope.subject.kind === "competitor" ? scope.subject.name : null;
    const competitor =
      competitorName !== null
        ? detail.version.competitors.find(
            (candidate) => candidate.name === competitorName,
          )
        : null;
    if (scope.subject.kind === "competitor" && !competitor) {
      throw new RepositoryError(
        "INVALID_STATE",
        "Competitor is not in the current monitor configuration",
      );
    }
    return {
      scope,
      monitor: detail.monitor,
      version: detail.version,
      questions: detail.questions,
      platforms,
      brand,
      projectTimezone: project.timezone,
      subject:
        scope.subject.kind === "self"
          ? ({ kind: "self" } as const)
          : ({
              kind: "competitor" as const,
              name: competitor!.name,
              aliases: competitor!.aliases,
            } as const),
    };
  }

  async readMonitoringFacts(
    ownerId: string,
    resolved: ResolvedMonitoringScope,
  ): Promise<MonitoringFact[]> {
    const { attempts, attemptResults, monitors, monitorQuestions, monitorVersions, monitorPlatforms, platformCatalog, projectBrandVersions, projects, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runs, projectQuestions, scheduleOccurrences } = this.tables;
    const { monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate } = this.core;

    const conditions = monitoringFactConditions(ownerId, resolved.scope, this.core);
    const rows = await this.db
      .select({
        attemptId: attempts.id,
        runId: runs.id,
        runCreatedAt: runs.createdAt,
        questionId: monitorQuestions.questionId,
        platformId: attempts.platformId,
        status: attempts.status,
        revisionId: attemptResults.currentRevisionId,
        hasNonEmptyAnswer: sql<number>`CASE WHEN ${attemptResults.attemptId} IS NOT NULL AND CHAR_LENGTH(TRIM(${attemptResults.answerMarkdown})) > 0 THEN 1 ELSE 0 END`,
        sentiment: attemptResults.sentiment,
        brandMentioned: attemptResults.brandMentioned,
        mentionPosition: attemptResults.mentionPosition,
        competitorRankings: attemptResults.competitorRankings,
        monitorCompetitors: monitorVersions.competitors,
        citationProvenanceHint: sql<
          string | null
        >`JSON_UNQUOTE(JSON_EXTRACT(${resultRevisions.normalizedPayload}, '$.citationProvenance'))`,
        hasLegacyCitationList: sql<number>`CASE WHEN JSON_TYPE(JSON_EXTRACT(${resultRevisions.normalizedPayload}, '$.raw.citationList')) = 'ARRAY' THEN 1 ELSE 0 END`,
        revisionCreatedAt: resultRevisions.createdAt,
      })
      .from(attempts)
      .innerJoin(runs, eq(attempts.runId, runs.id))
      .innerJoin(monitorVersions, eq(runs.monitorVersionId, monitorVersions.id))
      .innerJoin(
        monitorQuestions,
        and(
          eq(monitorQuestions.monitorVersionId, runs.monitorVersionId),
          eq(monitorQuestions.ordinal, attempts.monitorQuestionOrdinal),
        ),
      )
      .leftJoin(attemptResults, eq(attemptResults.attemptId, attempts.id))
      .leftJoin(
        resultRevisions,
        eq(resultRevisions.id, attemptResults.currentRevisionId),
      )
      .where(and(...conditions))
      .limit(MONITORING_FACT_LIMIT + 1);
    if (rows.length > MONITORING_FACT_LIMIT) {
      throw new RepositoryError(
        "INVALID_STATE",
        `Monitoring scope exceeds the ${MONITORING_FACT_LIMIT.toLocaleString("en-US")} attempt aggregation limit; narrow the date or dimension filters`,
      );
    }
    return rows.map((row) => ({
      ...row,
      hasNonEmptyAnswer: Number(row.hasNonEmptyAnswer) === 1,
      citationProvenanceHint: parseCitationProvenanceHint(
        row.citationProvenanceHint,
      ),
      hasLegacyCitationList: Number(row.hasLegacyCitationList) === 1,
    }));
  }

  async readMonitoringEvidence(
    facts: readonly MonitoringFact[],
  ): Promise<MonitoringEvidence> {
    const { attempts, attemptResults, monitors, monitorQuestions, monitorVersions, monitorPlatforms, platformCatalog, projectBrandVersions, projects, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runs, projectQuestions, scheduleOccurrences } = this.tables;
    const { monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate } = this.core;

    const revisionIdSet = new Set<string>();
    for (const fact of facts) {
      if (fact.revisionId) revisionIdSet.add(fact.revisionId);
    }
    const revisionIds = [...revisionIdSet];
    if (revisionIds.length === 0) return emptyMonitoringEvidence();
    const sources: MonitoringSourceRow[] = [];
    const discovered: MonitoringDiscoveredRow[] = [];
    const screenshotRows: Array<{ revisionId: string }> = [];
    let evidenceRowCount = 0;
    const acceptRows = <T>(target: T[], rows: readonly T[]) => {
      if (evidenceRowCount + rows.length > MONITORING_EVIDENCE_ROW_LIMIT) {
        throw new RepositoryError(
          "INVALID_STATE",
          `Monitoring scope exceeds the ${MONITORING_EVIDENCE_ROW_LIMIT.toLocaleString("en-US")} evidence row limit; narrow the date or dimension filters`,
        );
      }
      for (const row of rows) target.push(row);
      evidenceRowCount += rows.length;
    };

    for (const batch of chunks(
      revisionIds,
      MONITORING_EVIDENCE_REVISION_BATCH_SIZE,
    )) {
      const remaining = MONITORING_EVIDENCE_ROW_LIMIT - evidenceRowCount;
      const rows = await this.db
        .select({
          id: resultSources.id,
          revisionId: resultSources.revisionId,
          ordinal: resultSources.ordinal,
          providerPosition: resultSources.providerPosition,
          url: resultSources.url,
          title: resultSources.title,
          domain: resultSources.domain,
          citedText: resultSources.citedText,
          createdAt: resultSources.createdAt,
        })
        .from(resultSources)
        .where(inArray(resultSources.revisionId, batch))
        .orderBy(asc(resultSources.revisionId), asc(resultSources.ordinal))
        .limit(remaining + 1);
      acceptRows(sources, rows);
    }
    for (const batch of chunks(
      revisionIds,
      MONITORING_EVIDENCE_REVISION_BATCH_SIZE,
    )) {
      const remaining = MONITORING_EVIDENCE_ROW_LIMIT - evidenceRowCount;
      const rows = await this.db
        .select({
          id: resultDiscoveredSources.id,
          revisionId: resultDiscoveredSources.revisionId,
          ordinal: resultDiscoveredSources.ordinal,
          providerPosition: resultDiscoveredSources.providerPosition,
          url: resultDiscoveredSources.url,
          title: resultDiscoveredSources.title,
          domain: resultDiscoveredSources.domain,
          siteName: resultDiscoveredSources.siteName,
          summary: resultDiscoveredSources.summary,
          publishedAt: resultDiscoveredSources.publishedAt,
          isCited: resultDiscoveredSources.isCited,
          createdAt: resultDiscoveredSources.createdAt,
        })
        .from(resultDiscoveredSources)
        .where(inArray(resultDiscoveredSources.revisionId, batch))
        .orderBy(
          asc(resultDiscoveredSources.revisionId),
          asc(resultDiscoveredSources.ordinal),
        )
        .limit(remaining + 1);
      acceptRows(discovered, rows);
    }
    for (const batch of chunks(
      revisionIds,
      MONITORING_EVIDENCE_REVISION_BATCH_SIZE,
    )) {
      const remaining = MONITORING_EVIDENCE_ROW_LIMIT - evidenceRowCount;
      const rows = await this.db
        .select({ revisionId: resultMedia.revisionId })
        .from(resultMedia)
        .where(
          and(
            inArray(resultMedia.revisionId, batch),
            eq(resultMedia.type, "screenshot"),
            eq(resultMedia.archiveStatus, "archived"),
          ),
        )
        .limit(remaining + 1);
      acceptRows(screenshotRows, rows);
    }

    const persistedDiscoveryRevisionIds = new Set(
      discovered.map((source) => source.revisionId),
    );
    const factByRevision = new Map<string, MonitoringFact>();
    for (const fact of facts) {
      if (fact.revisionId) factByRevision.set(fact.revisionId, fact);
    }
    const legacyFallbackRevisionIds = revisionIds.filter((revisionId) => {
      const fact = factByRevision.get(revisionId);
      return (
        fact !== undefined &&
        fact.citationProvenanceHint === null &&
        !persistedDiscoveryRevisionIds.has(revisionId)
      );
    });
    if (
      legacyFallbackRevisionIds.length >
      MONITORING_LEGACY_DISCOVERY_FALLBACK_LIMIT
    ) {
      throw new RepositoryError(
        "INVALID_STATE",
        `Monitoring scope exceeds the ${MONITORING_LEGACY_DISCOVERY_FALLBACK_LIMIT.toLocaleString("en-US")} legacy evidence fallback limit; narrow the date or dimension filters`,
      );
    }
    const legacyDiscoveryPayloadByRevision = new Map<
      string,
      Record<string, unknown>
    >();
    for (const batch of chunks(
      legacyFallbackRevisionIds,
      MONITORING_EVIDENCE_REVISION_BATCH_SIZE,
    )) {
      const rows = await this.db
        .select({
          revisionId: resultRevisions.id,
          discoveryPayload: sql<Record<string, unknown>>`JSON_OBJECT(
            'allReferences', COALESCE(JSON_EXTRACT(${resultRevisions.normalizedPayload}, '$.allReferences'), JSON_ARRAY()),
            'references', COALESCE(JSON_EXTRACT(${resultRevisions.normalizedPayload}, '$.references'), JSON_ARRAY())
          )`.mapWith(resultRevisions.normalizedPayload),
        })
        .from(resultRevisions)
        .where(inArray(resultRevisions.id, batch))
        .limit(batch.length);
      for (const row of rows) {
        legacyDiscoveryPayloadByRevision.set(
          row.revisionId,
          row.discoveryPayload,
        );
      }
    }
    return buildMonitoringEvidence(
      facts,
      sources,
      discovered,
      screenshotRows,
      legacyDiscoveryPayloadByRevision,
      MONITORING_EVIDENCE_ROW_LIMIT,
    );
  }
}
