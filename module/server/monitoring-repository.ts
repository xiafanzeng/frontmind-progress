import {affectedRows,pricingDimensionsKey} from "./repository-utils.js";
import { monitoringFactConditions as progressMonitoringFactConditions } from "./read-helpers.js";
import { MONITORING_EVIDENCE_REVISION_BATCH_SIZE, MONITORING_EVIDENCE_ROW_LIMIT, MONITORING_FACT_LIMIT, MONITORING_LEGACY_DISCOVERY_FALLBACK_LIMIT, buildMonitoringAnalysis, buildMonitoringEvidence, decodeMonitoringAnswerCursor, encodeMonitoringAnswerCursor, monitoringDetailRowAsFact, monitoringListRowAsFact, monitoringMetrics, monitoringSubjectContribution, normalizedMonitoringRankings, safeKeywordEvaluations, monitoringAnswerShareUrl, chunks, emptyMonitoringEvidence, parseCitationProvenanceHint, monitoringLocalDate, monitoringCompetitorAnalysisItems, isEffectiveMonitoringAnswer, canonicalUrl, publicationTimeBucket, publicationTimeBuckets, groupByRevision, monitoringFactCitationProvenance, discoveredSourcesFromNormalizedPayload, monitoringScopeFingerprint, isUuid, hasLegacyCitationList, monitoringPositionRates, monitoringMentionPosition, normalizedBrandName, safeRankingEntries, firstString, zonedParts, payloadArray, safeNormalizedReference, deterministicUuid, sha256, stableJson, firstNumber, firstBoolean, positiveInteger, type MonitoringEvidence, type MonitoringFact, type ResolvedMonitoringScope, type ResolvedMonitoringSubject, type MonitoringSourceRow, type MonitoringDiscoveredRow, type PublicationTimeBucket, type MonitoringReference, type MonitoringCitation, type DiscoveredSourceRow } from "./read-helpers.js";
export { MONITORING_EVIDENCE_REVISION_BATCH_SIZE, MONITORING_EVIDENCE_ROW_LIMIT, MONITORING_FACT_LIMIT, MONITORING_LEGACY_DISCOVERY_FALLBACK_LIMIT, buildMonitoringAnalysis, buildMonitoringEvidence, decodeMonitoringAnswerCursor, encodeMonitoringAnswerCursor, monitoringDetailRowAsFact, monitoringListRowAsFact, monitoringMetrics, monitoringSubjectContribution, normalizedMonitoringRankings, safeKeywordEvaluations, monitoringAnswerShareUrl, chunks, emptyMonitoringEvidence, parseCitationProvenanceHint, monitoringLocalDate, monitoringCompetitorAnalysisItems, isEffectiveMonitoringAnswer, canonicalUrl, publicationTimeBucket, publicationTimeBuckets, groupByRevision, monitoringFactCitationProvenance, discoveredSourcesFromNormalizedPayload, monitoringScopeFingerprint, isUuid, hasLegacyCitationList, monitoringPositionRates, monitoringMentionPosition, normalizedBrandName, safeRankingEntries, firstString, zonedParts, payloadArray, safeNormalizedReference, deterministicUuid, sha256, stableJson, firstNumber, firstBoolean, positiveInteger, type MonitoringEvidence, type MonitoringFact, type ResolvedMonitoringScope, type ResolvedMonitoringSubject, type MonitoringSourceRow, type MonitoringDiscoveredRow, type PublicationTimeBucket, type MonitoringReference, type MonitoringCitation, type DiscoveredSourceRow };
import { createHash, randomUUID } from "node:crypto";
import type {
  AdminOperationsListInput,
  BillingQuoteInput,
  CitationProvenance,
  MonitoringAnalysisInput,
  MonitoringAnswersListInput,
  MonitorConfiguration,
  MonitoringQuestionCategory,
  MonitoringScope,
  MonitoringReportScope,
  PlatformAcceptancePlanInput,
  PlatformAcceptanceStartInput,
  ProjectCreateInput,
  RunTrigger,
  Sentiment,
} from "@frontmind/monitoring-contracts";
import { calculateAttemptCount } from "@frontmind/monitoring-contracts";
import { moliEffectiveReasoningSupport, moliEffectiveScreenshotSupport, normalizeShareUrl } from "@frontmind/monitoring-provider-moli";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  like,
  not,
  or,
  sql,
} from "drizzle-orm";
import { RepositoryError } from "@frontmind/module-contracts/errors";
import {
  acceptanceSha256,
  buildPlatformAcceptancePlan,
  platformAcceptanceFingerprint,
  platformAcceptancePlanFingerprint,
} from "./platform-acceptance.js";
import type {
  PlatformAcceptanceCheckPlan,
  PlatformAcceptanceDimension,
  PlatformAcceptanceStatus,
} from "./platform-acceptance-types.js";
import { ProgressMonitoringReadRepository } from "./monitoring-read-repository.js";


import type {ProgressRepositoryCore, ProgressDatabase as Database, ProgressTransaction as Transaction, RequestAudit} from './persistence-core.js';
export type {RequestAudit} from './persistence-core.js';
export function createProgressRepository(core: ProgressRepositoryCore) {
 const {tables, currentMonitoringEnterpriseProjectId, monitoringProjectOwnerPredicate, monitoringChildOwnerPredicate, assertMonitoringEnterpriseProjectActive, lockMoneyWallet, insertMoneyLedger, insertAudit, settleAttemptMoney, MONEY_CURRENCY, moneyToApiString} = core;
 const {attempts, attemptMoneySettlements, attemptPriceSnapshots, attemptResults, jobs, monitorPlatforms, monitorQuestions, monitors, monitorVersions, platformCatalog, platformAcceptanceBatches, platformAcceptanceChecks, projectBrandVersions, projectQuestions, projects, providerCosts, providerReconciliationState, providerRegions, providerTaskTombstones, resultDiscoveredSources, resultMedia, resultRevisions, resultSources, runMetrics, runs, scheduleOccurrences, workerHeartbeats} = tables;
 const progressReadTables = tables;
 const monitoringFactConditions = (ownerId:string,scope:MonitoringScope & {questionIds?:string[];platformIds?:string[]}) => progressMonitoringFactConditions(ownerId,scope,{tables,monitoringChildOwnerPredicate,monitoringProjectOwnerPredicate});
 class ProgressRepository {
 constructor(public readonly db: Database) {}
 async writeAudit(...args: Parameters<ProgressRepositoryCore['insertAudit']> extends [unknown, ...infer R] ? R : never) { await insertAudit(this.db, ...args); }
progressMonitoringReadRepository() {
    return new ProgressMonitoringReadRepository(this.db, {
      tables, monitoringChildOwnerPredicate, monitoringProjectOwnerPredicate,
      getMonitor: (ownerId, monitorId) => this.getMonitor(ownerId, monitorId),
    });
  }

async lockProjectAdmission(tx: Transaction, ownerId: string, projectId: string) {
    const [project] = await tx.select({ enterpriseProjectId: projects.enterpriseProjectId })
      .from(projects).where(and(eq(projects.id, projectId), monitoringProjectOwnerPredicate(projects, ownerId))).limit(1);
    if (!project) throw new RepositoryError("NOT_FOUND", "Project not found");
    await assertMonitoringEnterpriseProjectActive(tx, project.enterpriseProjectId, ownerId);
  }

async lockMonitorAdmission(tx: Transaction, ownerId: string, monitorId: string) {
    const [monitor] = await tx.select({ projectId: monitors.projectId }).from(monitors)
      .where(and(eq(monitors.id, monitorId), monitoringChildOwnerPredicate(monitors, ownerId))).limit(1);
    if (!monitor) throw new RepositoryError("NOT_FOUND", "Monitor not found");
    await this.lockProjectAdmission(tx, ownerId, monitor.projectId);
  }

async createProject(
    ownerId: string,
    input: ProjectCreateInput,
    audit: RequestAudit,
  ) {
    const projectId = randomUUID();
    const brandVersionId = randomUUID();
    await this.db.transaction(async (tx) => {
      await assertMonitoringEnterpriseProjectActive(tx, currentMonitoringEnterpriseProjectId(), ownerId);
      await tx.insert(projects).values({
        enterpriseProjectId: currentMonitoringEnterpriseProjectId(),
        id: projectId,
        ownerId,
        name: input.name,
        timezone: input.timezone,
        currentBrandVersionId: brandVersionId,
      });
      await tx.insert(projectBrandVersions).values({
        id: brandVersionId,
        projectId,
        version: 1,
        mainBrand: input.mainBrand,
        aliases: uniqueTrimmed(input.aliases),
        competitors: normalizeCompetitors(input.competitors),
        createdBy: ownerId,
      });
      await insertAudit(
        tx,
        audit,
        "project.created",
        "project",
        projectId,
        ownerId,
        { name: input.name },
      );
    });
    return this.getProject(ownerId, projectId);
  }

async listProjects(ownerId: string) {
    return this.db
      .select({
        id: projects.id,
        name: projects.name,
        timezone: projects.timezone,
        createdAt: projects.createdAt,
        mainBrand: projectBrandVersions.mainBrand,
        aliases: projectBrandVersions.aliases,
        competitors: projectBrandVersions.competitors,
      })
      .from(projects)
      .innerJoin(
        projectBrandVersions,
        eq(projects.currentBrandVersionId, projectBrandVersions.id),
      )
      .where(and(monitoringProjectOwnerPredicate(projects, ownerId), isNull(projects.deletedAt)))
      .orderBy(asc(projects.createdAt));
  }

async listDeletedProjects(ownerId: string) {
    return this.db
      .select({
        id: projects.id,
        name: projects.name,
        deletedAt: projects.deletedAt,
        purgeAfter: projects.purgeAfter,
      })
      .from(projects)
      .where(
        and(
          monitoringProjectOwnerPredicate(projects, ownerId),
          sql`${projects.deletedAt} IS NOT NULL`,
        ),
      )
      .orderBy(desc(projects.deletedAt));
  }

async softDeleteProject(
    ownerId: string,
    projectId: string,
    audit: RequestAudit,
  ) {
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 86_400_000);
    await this.db.transaction(async (tx) => {
      const result = await tx
        .update(projects)
        .set({ deletedAt: now, purgeAfter })
        .where(
          and(
            eq(projects.id, projectId),
            monitoringProjectOwnerPredicate(projects, ownerId),
            isNull(projects.deletedAt),
          ),
        );
      if (affectedRows(result) !== 1)
        throw new RepositoryError("NOT_FOUND", "Project not found");
      await tx
        .update(monitors)
        .set({ nextRunAt: null })
        .where(
          and(eq(monitors.projectId, projectId), isNull(monitors.deletedAt)),
        );
      const projectMonitorRows = await tx
        .select({ id: monitors.id })
        .from(monitors)
        .where(
          and(eq(monitors.projectId, projectId), isNull(monitors.deletedAt)),
        );
      if (projectMonitorRows.length > 0) {
        // Deletion is the cancellation boundary for schedule occurrences that
        // have not yet become runs. Bound occurrences remain historical data.
        await tx.delete(scheduleOccurrences).where(
          and(
            inArray(
              scheduleOccurrences.monitorId,
              projectMonitorRows.map((monitor) => monitor.id),
            ),
            isNull(scheduleOccurrences.runId),
          ),
        );
      }
      await tx.insert(jobs).values({
        id: randomUUID(),
        type: "purge_soft_deleted",
        dedupeKey: `purge:project:${projectId}`,
        payload: { entityType: "project", entityId: projectId },
        availableAt: purgeAfter,
      });
      await insertAudit(
        tx,
        audit,
        "project.deleted",
        "project",
        projectId,
        ownerId,
        { purgeAfter: purgeAfter.toISOString() },
      );
    });
  }

async restoreProject(
    ownerId: string,
    projectId: string,
    audit: RequestAudit,
  ) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await this.lockProjectAdmission(tx, ownerId, projectId);
      const [project] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            monitoringProjectOwnerPredicate(projects, ownerId),
            sql`${projects.deletedAt} IS NOT NULL`,
          ),
        )
        .for("update")
        .limit(1);
      if (!project || (project.purgeAfter && project.purgeAfter <= now))
        throw new RepositoryError("NOT_FOUND", "Restorable project not found");
      await tx
        .update(projects)
        .set({ deletedAt: null, purgeAfter: null })
        .where(eq(projects.id, projectId));
      const ownedMonitors = await tx
        .select({ id: monitors.id })
        .from(monitors)
        .where(
          and(eq(monitors.projectId, projectId), isNull(monitors.deletedAt)),
        );
      if (ownedMonitors.length > 0) {
        const monitorIds = ownedMonitors.map((monitor) => monitor.id);
        await tx
          .update(monitors)
          .set({ status: "paused", nextRunAt: null, lastScheduledFor: now })
          .where(inArray(monitors.id, monitorIds));
        await tx
          .delete(scheduleOccurrences)
          .where(
            and(
              inArray(scheduleOccurrences.monitorId, monitorIds),
              isNull(scheduleOccurrences.runId),
            ),
          );
      }
      // Removing the future purge job allows a restored entity to be deleted
      // again later without colliding with the jobs.dedupe_key constraint.
      await tx
        .delete(jobs)
        .where(eq(jobs.dedupeKey, `purge:project:${projectId}`));
      await insertAudit(
        tx,
        audit,
        "project.restored",
        "project",
        projectId,
        ownerId,
        {},
      );
    });
  }

async getProject(ownerId: string, projectId: string) {
    const [project] = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        timezone: projects.timezone,
        createdAt: projects.createdAt,
        brandVersionId: projectBrandVersions.id,
        brandVersion: projectBrandVersions.version,
        mainBrand: projectBrandVersions.mainBrand,
        aliases: projectBrandVersions.aliases,
        competitors: projectBrandVersions.competitors,
      })
      .from(projects)
      .innerJoin(
        projectBrandVersions,
        eq(projects.currentBrandVersionId, projectBrandVersions.id),
      )
      .where(
        and(
          eq(projects.id, projectId),
          monitoringProjectOwnerPredicate(projects, ownerId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!project) throw new RepositoryError("NOT_FOUND", "Project not found");
    return project;
  }

async updateProjectBrand(
    ownerId: string,
    input: {
      projectId: string;
      name?: string;
      timezone?: string;
      mainBrand: string;
      aliases: string[];
      competitors: Array<{ name: string; aliases: string[] }>;
    },
    audit: RequestAudit,
  ) {
    const versionId = randomUUID();
    await this.db.transaction(async (tx) => {
      await this.lockProjectAdmission(tx, ownerId, input.projectId);
      const [project] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            monitoringProjectOwnerPredicate(projects, ownerId),
            isNull(projects.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!project) throw new RepositoryError("NOT_FOUND", "Project not found");
      await core.assertOwnerActive(tx, ownerId);
      const [latest] = await tx
        .select({ version: projectBrandVersions.version })
        .from(projectBrandVersions)
        .where(eq(projectBrandVersions.projectId, input.projectId))
        .orderBy(desc(projectBrandVersions.version))
        .limit(1);
      const version = (latest?.version ?? 0) + 1;
      const aliases = uniqueTrimmed(input.aliases);
      const competitors = normalizeCompetitors(input.competitors);
      await tx.insert(projectBrandVersions).values({
        id: versionId,
        projectId: input.projectId,
        version,
        mainBrand: input.mainBrand,
        aliases,
        competitors,
        createdBy: ownerId,
      });

      // Brand settings are project-scoped. Derive an immutable monitor version
      // for every live monitor so future manual and newly materialized scheduled
      // runs use the new brand snapshot without making the user edit monitors
      // one by one. Existing runs and already materialized occurrences keep
      // their previous monitorVersionId and therefore remain historically exact.
      const projectMonitors = await tx
        .select()
        .from(monitors)
        .where(
          and(
            eq(monitors.projectId, input.projectId),
            monitoringChildOwnerPredicate(monitors, ownerId),
            isNull(monitors.deletedAt),
          ),
        )
        .orderBy(asc(monitors.id))
        .for("update");
      for (const monitor of projectMonitors) {
        if (!monitor.activeVersionId) {
          throw new RepositoryError(
            "INVALID_STATE",
            "Monitor has no active configuration",
          );
        }
        const [activeVersion] = await tx
          .select()
          .from(monitorVersions)
          .where(
            and(
              eq(monitorVersions.id, monitor.activeVersionId),
              eq(monitorVersions.monitorId, monitor.id),
            ),
          )
          .limit(1);
        if (!activeVersion) {
          throw new RepositoryError(
            "INVALID_STATE",
            "Monitor active configuration is invalid",
          );
        }
        const [latestMonitorVersion] = await tx
          .select({ version: monitorVersions.version })
          .from(monitorVersions)
          .where(eq(monitorVersions.monitorId, monitor.id))
          .orderBy(desc(monitorVersions.version))
          .limit(1);
        const monitorVersion = (latestMonitorVersion?.version ?? 0) + 1;
        const newMonitorVersionId = randomUUID();
        const [questions, platforms] = await Promise.all([
          tx
            .select()
            .from(monitorQuestions)
            .where(eq(monitorQuestions.monitorVersionId, activeVersion.id))
            .orderBy(asc(monitorQuestions.ordinal)),
          tx
            .select()
            .from(monitorPlatforms)
            .where(eq(monitorPlatforms.monitorVersionId, activeVersion.id))
            .orderBy(asc(monitorPlatforms.ordinal)),
        ]);
        const configurationSnapshot = {
          name: activeVersion.name,
          brandAliases: aliases,
          competitors,
          questions: questions.map((question) => question.questionSnapshot),
          platforms: platforms.map((platform) => ({
            platformId: platform.platformId,
            providerCode: platform.providerCodeSnapshot,
            clientType: platform.clientType,
            mode: platform.mode,
            screenshot: platform.screenshot,
            regionCode: platform.regionCode,
          })),
          repetitions: activeVersion.repetitions,
          schedule: {
            type: monitor.scheduleType,
            timezone: monitor.scheduleTimezone,
            localTime: monitor.scheduleLocalTime,
            weekday: monitor.scheduleWeekday,
          },
        };
        await tx.insert(monitorVersions).values({
          id: newMonitorVersionId,
          monitorId: monitor.id,
          projectBrandVersionId: versionId,
          version: monitorVersion,
          name: activeVersion.name,
          brandAliases: aliases,
          competitors,
          repetitions: activeVersion.repetitions,
          expectedAttempts: activeVersion.expectedAttempts,
          configurationHash: monitorConfigurationSnapshotHash(
            configurationSnapshot,
            Object.fromEntries(
              questions.flatMap((question) =>
                question.categorySnapshot
                  ? [[question.questionSnapshot, question.categorySnapshot]]
                  : [],
              ),
            ),
          ),
          createdBy: ownerId,
        });
        if (questions.length > 0) {
          await tx.insert(monitorQuestions).values(
            questions.map((question) => ({
              monitorVersionId: newMonitorVersionId,
              ordinal: question.ordinal,
              questionId: question.questionId,
              questionSnapshot: question.questionSnapshot,
              categorySnapshot: question.categorySnapshot,
            })),
          );
        }
        if (platforms.length > 0) {
          await tx.insert(monitorPlatforms).values(
            platforms.map((platform) => ({
              monitorVersionId: newMonitorVersionId,
              ordinal: platform.ordinal,
              platformId: platform.platformId,
              providerCodeSnapshot: platform.providerCodeSnapshot,
              clientType: platform.clientType,
              mode: platform.mode,
              screenshot: platform.screenshot,
              regionCode: platform.regionCode,
            })),
          );
        }
        await tx
          .update(monitors)
          .set({ activeVersionId: newMonitorVersionId })
          .where(eq(monitors.id, monitor.id));
        await insertAudit(
          tx,
          audit,
          "monitor.version_created",
          "monitor",
          monitor.id,
          ownerId,
          {
            version: monitorVersion,
            expectedAttempts: activeVersion.expectedAttempts,
            reason: "project_brand_updated",
            projectBrandVersion: version,
          },
        );
      }
      await tx
        .update(projects)
        .set({
          currentBrandVersionId: versionId,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        })
        .where(eq(projects.id, input.projectId));
      await insertAudit(
        tx,
        audit,
        "project.updated",
        "project",
        input.projectId,
        ownerId,
        {
          version,
          propagatedMonitors: projectMonitors.length,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        },
      );
    });
    return this.getProject(ownerId, input.projectId);
  }

async listPlatforms(includeAdministrativeFields = false) {
    let rows;
    if (includeAdministrativeFields) {
      rows = await this.db
        .select()
        .from(platformCatalog)
        .orderBy(
          asc(platformCatalog.displayName),
          asc(platformCatalog.clientType),
        );
    } else {
      rows = await this.db
        .select({
          id: platformCatalog.id,
          providerCode: platformCatalog.providerCode,
          displayName: platformCatalog.displayName,
          clientType: platformCatalog.clientType,
          pricingClass: platformCatalog.pricingClass,
          enabled: platformCatalog.enabled,
          verified: platformCatalog.verified,
          supportsReasoning: platformCatalog.supportsReasoning,
          supportsScreenshot: platformCatalog.supportsScreenshot,
          supportsDomesticRegion: platformCatalog.supportsDomesticRegion,
          supportsOverseasRegion: platformCatalog.supportsOverseasRegion,
          acceptanceRequired: platformCatalog.acceptanceRequired,
          acceptanceFingerprint: platformCatalog.acceptanceFingerprint,
          providerMetadata: platformCatalog.providerMetadata,
          discoveredAt: platformCatalog.discoveredAt,
          verifiedAt: platformCatalog.verifiedAt,
        })
        .from(platformCatalog)
        .orderBy(
          asc(platformCatalog.displayName),
          asc(platformCatalog.clientType),
        );
    }
    const { acceptance, passedEvidence } =
      await this.platformAcceptanceStates(rows);
    return rows.map((row) => {
      const reasoningSupport = currentPlatformReasoningSupport(
        row,
        passedEvidence,
      );
      return {
        ...row,
        reasoningSupport,
        supportsReasoning: reasoningSupport === "supported",
        // Capabilities and diagnostic acceptance results remain independent.
        supportsScreenshot: moliEffectiveScreenshotSupport(),
        acceptance: acceptance.get(row.id),
      };
    });
  }

async platformAcceptanceStates(
    rows: ReadonlyArray<{
      id: string;
      providerCode: string;
      clientType: "web" | "mobile";
      providerMetadata: Record<string, unknown> | null;
      acceptanceRequired: boolean;
      acceptanceFingerprint: string | null;
      verified: boolean;
      supportsReasoning: boolean;
      supportsScreenshot: boolean;
      supportsDomesticRegion: boolean;
      supportsOverseasRegion: boolean;
    }>,
  ) {
    const result = new Map<
      string,
      {
        catalogFingerprint: string | null;
        searchDefault: PlatformAcceptanceStatus;
        reasoningSearch: PlatformAcceptanceStatus;
        screenshotMention: PlatformAcceptanceStatus;
        screenshotAll: PlatformAcceptanceStatus;
        regionDefault: PlatformAcceptanceStatus;
        regionDomestic: PlatformAcceptanceStatus;
        regionOverseas: PlatformAcceptanceStatus;
        mobileNoRegion: PlatformAcceptanceStatus;
      }
    >();
    if (rows.length === 0) return { acceptance: result, passedEvidence: [] };
    const checks = await this.db
      .select()
      .from(platformAcceptanceChecks)
      .where(
        inArray(
          platformAcceptanceChecks.platformId,
          rows.map(({ id }) => id),
        ),
      )
      .orderBy(desc(platformAcceptanceChecks.updatedAt));
    for (const platform of rows) {
      const catalogFingerprint =
        platform.acceptanceFingerprint ??
        platformAcceptanceFingerprint(platform);
      const current = new Map<
        PlatformAcceptanceDimension,
        PlatformAcceptanceStatus
      >();
      for (const check of checks) {
        if (
          check.platformId === platform.id &&
          check.platformFingerprint === catalogFingerprint &&
          !current.has(check.dimension)
        ) {
          current.set(check.dimension, check.status);
        }
      }
      const pendingOrLegacy = (
        legacySupported: boolean,
      ): PlatformAcceptanceStatus => {
        if (platform.acceptanceRequired) return "pending";
        return legacySupported ? "passed" : "unsupported";
      };
      const state = (
        dimension: PlatformAcceptanceDimension,
        legacySupported: boolean,
      ) => current.get(dimension) ?? pendingOrLegacy(legacySupported);
      result.set(platform.id, {
        catalogFingerprint,
        searchDefault: state("search_default", platform.verified),
        reasoningSearch: state("reasoning_search", platform.supportsReasoning),
        screenshotMention: state(
          "screenshot_mention",
          moliEffectiveScreenshotSupport(),
        ),
        screenshotAll: state("screenshot_all", moliEffectiveScreenshotSupport()),
        regionDefault: state("region_default", platform.verified),
        regionDomestic: state(
          "region_domestic",
          platform.supportsDomesticRegion,
        ),
        regionOverseas: state(
          "region_overseas",
          platform.supportsOverseasRegion,
        ),
        mobileNoRegion: state("mobile_no_region", platform.verified),
      });
    }
    return {
      acceptance: result,
      passedEvidence: checks.filter((check) => check.status === "passed"),
    };
  }

async upsertPlatform(
    input: {
      platformId?: string;
      providerCode: string;
      displayName: string;
      clientType: "web" | "mobile";
      enabled: boolean;
      verified: boolean;
      supportsReasoning: boolean;
      supportsScreenshot: boolean;
      supportsDomesticRegion: boolean;
      supportsOverseasRegion: boolean;
      pricingClass?: "domestic" | "overseas" | null;
    },
    audit: RequestAudit,
  ) {
    const [existing] = await this.db
      .select()
      .from(platformCatalog)
      .where(
        and(
          eq(platformCatalog.providerCode, input.providerCode),
          eq(platformCatalog.clientType, input.clientType),
        ),
      )
      .limit(1);
    const platformId = existing?.id ?? input.platformId ?? randomUUID();
    const now = new Date();
    await this.db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(platformCatalog)
          .set({
            displayName: input.displayName,
            enabled: input.enabled,
            acceptanceRequired: true,
            ...(input.pricingClass !== undefined
              ? { pricingClass: input.pricingClass }
              : {}),
            updatedBy: audit.actorId,
          })
          .where(eq(platformCatalog.id, platformId));
      } else {
        await tx.insert(platformCatalog).values({
          id: platformId,
          providerCode: input.providerCode,
          displayName: input.displayName,
          clientType: input.clientType,
          enabled: input.enabled,
          pricingClass: input.pricingClass ?? null,
          discoveredAt: now,
          acceptanceRequired: true,
          verified: false,
          supportsReasoning: false,
          supportsScreenshot: false,
          supportsDomesticRegion: false,
          supportsOverseasRegion: false,
          verifiedAt: null,
          updatedBy: audit.actorId,
        });
      }
      await insertAudit(
        tx,
        audit,
        "admin.platform_upserted",
        "platform",
        platformId,
        null,
        {
          providerCode: input.providerCode,
          enabled: input.enabled,
          requestedVerified: input.verified,
          verificationSource: "acceptance_required",
        },
      );
    });
    return platformId;
  }

async preparePlatformAcceptancePlan(
    input: PlatformAcceptancePlanInput,
  ) {
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          monitoringProjectOwnerPredicate(projects, input.ownerId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!project) {
      throw new RepositoryError(
        "NOT_FOUND",
        "Acceptance test project does not belong to the selected customer",
      );
    }
    const selectedIds = input.platformIds
      ? [...new Set(input.platformIds)]
      : null;
    const platformRows = selectedIds
      ? await this.db
          .select()
          .from(platformCatalog)
          .where(inArray(platformCatalog.id, selectedIds))
      : await this.db
          .select()
          .from(platformCatalog)
          .where(eq(platformCatalog.acceptanceRequired, true));
    if (
      platformRows.length === 0 ||
      (selectedIds && platformRows.length !== selectedIds.length)
    ) {
      throw new RepositoryError(
        "INVALID_STATE",
        "The acceptance plan contains a missing platform",
      );
    }
    const {pricingVersion, activePrices: prices} = await core.activePricing(this.db);
    const regions = await this.db
      .select({ code: providerRegions.code, scope: providerRegions.scope })
      .from(providerRegions)
      .orderBy(asc(providerRegions.name), asc(providerRegions.code));
    const domesticRegionCode =
      input.domesticRegionCode ??
      regions.find(({ scope }) => scope === "domestic")?.code ??
      null;
    const overseasRegionCode =
      input.overseasRegionCode ??
      regions.find(({ scope }) => scope === "overseas")?.code ??
      null;
    if (
      input.domesticRegionCode &&
      !regions.some(
        ({ code, scope }) =>
          code === input.domesticRegionCode && scope === "domestic",
      )
    ) {
      throw new RepositoryError(
        "INVALID_STATE",
        "The selected domestic region is not in the synchronized provider catalog",
      );
    }
    if (
      input.overseasRegionCode &&
      !regions.some(
        ({ code, scope }) =>
          code === input.overseasRegionCode && scope === "overseas",
      )
    ) {
      throw new RepositoryError(
        "INVALID_STATE",
        "The selected overseas region is not in the synchronized provider catalog",
      );
    }
    if (
      platformRows.some(({ clientType }) => clientType === "web") &&
      (!domesticRegionCode || !overseasRegionCode)
    ) {
      throw new RepositoryError(
        "INVALID_STATE",
        "Both domestic and overseas region catalogs must be synchronized before testing web models",
      );
    }
    let checks: PlatformAcceptanceCheckPlan[];
    try {
      checks = buildPlatformAcceptancePlan({
        platforms: platformRows,
        prices,
        domesticRegionCode,
        overseasRegionCode,
      });
    } catch (error) {
      throw new RepositoryError(
        "INVALID_STATE",
        error instanceof Error ? error.message : "Acceptance plan is invalid",
      );
    }
    if (checks.length === 0 || checks.length > 500) {
      throw new RepositoryError(
        "INVALID_STATE",
        `An acceptance batch must contain 1-500 attempts; received ${checks.length}`,
      );
    }
    const questionHash = acceptanceSha256(input.question.trim());
    const planFingerprint = platformAcceptancePlanFingerprint({
      ownerId: input.ownerId,
      projectId: input.projectId,
      questionHash,
      checks,
    });
    const totalAmountTenThousandths = checks.reduce(
      (total, check) => total + check.unitAmountTenThousandths,
      0n,
    );
    return {
      planFingerprint,
      questionHash,
      checks,
      totalAmountTenThousandths,
    };
  }

async planPlatformAcceptance(input: PlatformAcceptancePlanInput) {
    const plan = await this.preparePlatformAcceptancePlan(input);
    return {
      planFingerprint: plan.planFingerprint,
      currency: MONEY_CURRENCY,
      scale: 4 as const,
      attemptCount: plan.checks.length,
      totalAmountTenThousandths: moneyToApiString(
        plan.totalAmountTenThousandths,
      ),
      checks: plan.checks.map((check) => ({
        ...check,
        unitAmountTenThousandths: moneyToApiString(
          check.unitAmountTenThousandths,
        ),
      })),
    };
  }

async startPlatformAcceptanceBatch(
    input: PlatformAcceptanceStartInput,
    audit: RequestAudit,
  ) {
    const plan = await this.preparePlatformAcceptancePlan(input);
    const requestedBy = audit.actorId;
    if (!requestedBy) {
      throw new RepositoryError(
        "INVALID_STATE",
        "An authenticated administrator is required",
      );
    }
    if (plan.planFingerprint !== input.planFingerprint) {
      throw new RepositoryError(
        "CONFLICT",
        "The platform catalog or pricing changed; review a fresh acceptance quote",
      );
    }
    if (
      plan.totalAmountTenThousandths !==
      BigInt(input.confirmedTotalAmountTenThousandths)
    ) {
      throw new RepositoryError(
        "CONFLICT",
        "The confirmed acceptance budget does not match the current quote",
      );
    }
    const [duplicate] = await this.db
      .select()
      .from(platformAcceptanceBatches)
      .where(
        and(
          eq(platformAcceptanceBatches.requestedBy, requestedBy),
          eq(platformAcceptanceBatches.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (duplicate) {
      if (duplicate.planFingerprint !== input.planFingerprint) {
        throw new RepositoryError(
          "CONFLICT",
          "The idempotency key is already bound to another acceptance plan",
        );
      }
      return this.getPlatformAcceptanceBatch(duplicate.id);
    }
    const batchId = randomUUID();
    await this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({
          id: projects.id,
          currentBrandVersionId: projects.currentBrandVersionId,
        })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            monitoringProjectOwnerPredicate(projects, input.ownerId),
            isNull(projects.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!project?.currentBrandVersionId) {
        throw new RepositoryError("NOT_FOUND", "Test project not found");
      }
      const [brand] = await tx
        .select()
        .from(projectBrandVersions)
        .where(eq(projectBrandVersions.id, project.currentBrandVersionId))
        .limit(1);
      if (!brand) {
        throw new RepositoryError(
          "INVALID_STATE",
          "Test project brand snapshot is missing",
        );
      }
      const startedAt = new Date();
      await tx.insert(platformAcceptanceBatches).values({
        id: batchId,
        ownerId: input.ownerId,
        projectId: input.projectId,
        requestedBy,
        planFingerprint: plan.planFingerprint,
        questionHash: plan.questionHash,
        questionSnapshot: input.question.trim(),
        status: "running",
        attemptCount: plan.checks.length,
        totalAmountTenThousandths: plan.totalAmountTenThousandths,
        idempotencyKey: input.idempotencyKey,
        startedAt,
      });
      const actualAttemptIds: string[] = [];
      for (const [ordinal, check] of plan.checks.entries()) {
        const checkId = randomUUID();
        const monitorId = randomUUID();
        const versionId = randomUUID();
        const configuration: MonitorConfiguration = {
          name: `[能力验收] ${check.displayName} ${check.dimension}`.slice(
            0,
            120,
          ),
          brandAliases: brand.aliases,
          competitors: brand.competitors,
          questions: [input.question.trim()],
          platforms: [
            {
              platformId: check.platformId,
              providerCode: check.providerCode,
              clientType: check.clientType,
              mode: check.mode,
              screenshot: check.screenshot,
              regionCode:
                check.clientType === "mobile" ? null : check.regionCode,
            },
          ],
          repetitions: 1,
          schedule: {
            type: "none",
            timezone: "Asia/Shanghai",
            localTime: "09:00",
            weekday: null,
          },
        };
        await tx.insert(platformAcceptanceChecks).values({
          id: checkId,
          batchId,
          platformId: check.platformId,
          providerCodeSnapshot: check.providerCode,
          displayNameSnapshot: check.displayName,
          clientType: check.clientType,
          platformFingerprint: check.platformFingerprint,
          dimension: check.dimension,
          mode: check.mode,
          screenshot: check.screenshot,
          regionCode: check.regionCode,
          status: "pending",
        });
        await tx.insert(monitors).values({
          id: monitorId,
          ownerId: input.ownerId,
          projectId: input.projectId,
          name: configuration.name,
          status: "paused",
          activeVersionId: versionId,
          scheduleType: "none",
          scheduleTimezone: "Asia/Shanghai",
          scheduleLocalTime: "09:00",
          scheduleWeekday: null,
          nextRunAt: null,
        });
        await tx.insert(monitorVersions).values({
          id: versionId,
          monitorId,
          projectBrandVersionId: project.currentBrandVersionId,
          version: 1,
          name: configuration.name,
          brandAliases: configuration.brandAliases,
          competitors: configuration.competitors,
          repetitions: 1,
          expectedAttempts: 1,
          configurationHash: sha256(stableJson(configuration)),
          createdBy: input.ownerId,
        });
        await insertVersionChildren(
          tx,
          input.projectId,
          input.ownerId,
          versionId,
          configuration,
        );
        const run = await this.createRun(
          input.ownerId,
          monitorId,
          `acceptance:${batchId}:${ordinal}`,
          "manual",
          null,
          versionId,
          tx,
          {
            acceptanceProbeFingerprints: new Map([
              [check.platformId, check.platformFingerprint],
            ]),
          },
        );
        const [attempt] = await tx
          .select({ id: attempts.id })
          .from(attempts)
          .where(eq(attempts.runId, run.run.id))
          .limit(1);
        if (!attempt) {
          throw new RepositoryError(
            "INVALID_STATE",
            "Acceptance attempt was not created",
          );
        }
        actualAttemptIds.push(attempt.id);
        await tx
          .update(platformAcceptanceChecks)
          .set({
            status: "running",
            runId: run.run.id,
            attemptId: attempt.id,
            startedAt,
          })
          .where(eq(platformAcceptanceChecks.id, checkId));
      }
      const actualPrices = await tx
        .select({ amount: attemptPriceSnapshots.amountTenThousandths })
        .from(attemptPriceSnapshots)
        .where(inArray(attemptPriceSnapshots.attemptId, actualAttemptIds));
      const actualTotal = actualPrices.reduce(
        (total, row) => total + row.amount,
        0n,
      );
      if (actualTotal !== plan.totalAmountTenThousandths) {
        throw new RepositoryError(
          "CONFLICT",
          "Pricing changed while the acceptance batch was being created",
        );
      }
      await insertAudit(
        tx,
        audit,
        "admin.platform_acceptance_started",
        "platform_acceptance_batch",
        batchId,
        input.ownerId,
        {
          attemptCount: plan.checks.length,
          totalAmountTenThousandths: moneyToApiString(
            plan.totalAmountTenThousandths,
          ),
          planFingerprint: plan.planFingerprint,
        },
      );
    });
    return this.getPlatformAcceptanceBatch(batchId);
  }

async refreshPlatformAcceptanceBatch(batchId: string) {
    const checks = await this.db
      .select()
      .from(platformAcceptanceChecks)
      .where(eq(platformAcceptanceChecks.batchId, batchId))
      .orderBy(asc(platformAcceptanceChecks.createdAt));
    if (checks.length === 0) return;
    const platformIds = [
      ...new Set(checks.map(({ platformId }) => platformId)),
    ];
    const platformRows = await this.db
      .select()
      .from(platformCatalog)
      .where(inArray(platformCatalog.id, platformIds));
    const platformById = new Map(platformRows.map((row) => [row.id, row]));
    const attemptIds = checks.flatMap(({ attemptId }) =>
      attemptId ? [attemptId] : [],
    );
    const attemptRows =
      attemptIds.length > 0
        ? await this.db
            .select({
              id: attempts.id,
              status: attempts.status,
              clientType: attempts.clientType,
              mode: attempts.mode,
              screenshot: attempts.screenshot,
              regionCode: attempts.regionCode,
              errorCode: attempts.errorCode,
              terminalAt: attempts.terminalAt,
              submittedAt: attempts.submittedAt,
            })
            .from(attempts)
            .where(inArray(attempts.id, attemptIds))
        : [];
    const resultRows =
      attemptIds.length > 0
        ? await this.db
            .select({
              attemptId: attemptResults.attemptId,
              currentRevisionId: attemptResults.currentRevisionId,
              contentHash: attemptResults.contentHash,
              answerMarkdown: attemptResults.answerMarkdown,
              reasoningMarkdown: attemptResults.reasoningMarkdown,
              searchKeywords: attemptResults.searchKeywords,
            })
            .from(attemptResults)
            .where(inArray(attemptResults.attemptId, attemptIds))
        : [];
    const revisionIds = resultRows.map(
      ({ currentRevisionId }) => currentRevisionId,
    );
    const screenshotRows =
      revisionIds.length > 0
        ? await this.db
            .select({
              revisionId: resultMedia.revisionId,
              archiveStatus: resultMedia.archiveStatus,
              contentHash: resultMedia.contentHash,
              objectKey: resultMedia.objectKey,
            })
            .from(resultMedia)
            .where(
              and(
                inArray(resultMedia.revisionId, revisionIds),
                eq(resultMedia.type, "screenshot"),
              ),
            )
        : [];
    const attemptById = new Map(attemptRows.map((row) => [row.id, row]));
    const resultByAttempt = new Map(
      resultRows.map((row) => [row.attemptId, row]),
    );
    const screenshotsByRevision = new Map<string, typeof screenshotRows>();
    for (const screenshot of screenshotRows) {
      const group = screenshotsByRevision.get(screenshot.revisionId) ?? [];
      group.push(screenshot);
      screenshotsByRevision.set(screenshot.revisionId, group);
    }
    const terminalFailures = new Set([
      "failed",
      "stopped",
      "error",
      "cancelled_before_submit",
      "review_required",
    ]);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      for (const check of checks) {
        const platform = platformById.get(check.platformId);
        const currentFingerprint = platform
          ? (platform.acceptanceFingerprint ??
            platformAcceptanceFingerprint(platform))
          : null;
        let status: PlatformAcceptanceStatus = check.status;
        let resultHash = check.resultHash;
        let screenshotHash = check.screenshotHash;
        let errorCode = check.errorCode;
        let errorSummary = check.errorSummary;
        let completedAt = check.completedAt;
        if (!platform || currentFingerprint !== check.platformFingerprint) {
          status = "stale";
          errorCode = "CATALOG_CHANGED";
          errorSummary = "Provider model metadata changed after this probe";
          completedAt = completedAt ?? now;
        } else if (check.status !== "unsupported") {
          const attempt = check.attemptId
            ? attemptById.get(check.attemptId)
            : undefined;
          const result = check.attemptId
            ? resultByAttempt.get(check.attemptId)
            : undefined;
          if (!attempt) {
            status = "pending";
          } else if (terminalFailures.has(attempt.status)) {
            status = "failed";
            errorCode = attempt.errorCode ?? "PROBE_FAILED";
            errorSummary = "Provider probe ended without a valid answer";
            completedAt = attempt.terminalAt ?? now;
          } else if (attempt.status !== "completed" || !result) {
            status = "running";
          } else {
            const submittedDimensionsMatch =
              attempt.clientType === check.clientType &&
              attempt.mode === check.mode &&
              attempt.screenshot === check.screenshot &&
              attempt.regionCode === check.regionCode;
            const answerPresent = result.answerMarkdown.trim().length > 0;
            const screenshots =
              screenshotsByRevision.get(result.currentRevisionId) ?? [];
            const archivedScreenshot = screenshots.find(
              (media) =>
                media.archiveStatus === "archived" &&
                Boolean(media.objectKey) &&
                Boolean(media.contentHash),
            );
            const screenshotPending = screenshots.some(
              ({ archiveStatus }) => archiveStatus === "pending",
            );
            let evidencePresent = answerPresent;
            if (check.dimension === "reasoning_search") {
              evidencePresent =
                evidencePresent &&
                (Boolean(result.reasoningMarkdown?.trim()) ||
                  result.searchKeywords.length > 0);
            }
            if (
              check.dimension === "screenshot_mention" ||
              check.dimension === "screenshot_all"
            ) {
              if (screenshotPending && !archivedScreenshot) {
                status = "running";
                resultHash = result.contentHash;
                errorCode = null;
                errorSummary = null;
                await tx
                  .update(platformAcceptanceChecks)
                  .set({ status, resultHash, errorCode, errorSummary })
                  .where(eq(platformAcceptanceChecks.id, check.id));
                continue;
              }
              evidencePresent = evidencePresent && Boolean(archivedScreenshot);
            }
            if (check.dimension === "mobile_no_region") {
              evidencePresent =
                evidencePresent &&
                attempt.clientType === "mobile" &&
                attempt.regionCode === null;
            }
            if (
              check.dimension === "region_default" ||
              check.dimension === "search_default"
            ) {
              evidencePresent = evidencePresent && attempt.regionCode === null;
            }
            status =
              submittedDimensionsMatch && evidencePresent ? "passed" : "failed";
            resultHash = result.contentHash;
            screenshotHash = archivedScreenshot?.contentHash ?? null;
            errorCode = status === "passed" ? null : "EVIDENCE_MISSING";
            errorSummary =
              status === "passed"
                ? null
                : "Authoritative result did not contain the required capability evidence";
            completedAt = attempt.terminalAt ?? now;
          }
        }
        await tx
          .update(platformAcceptanceChecks)
          .set({
            status,
            resultHash,
            screenshotHash,
            errorCode,
            errorSummary,
            completedAt,
          })
          .where(eq(platformAcceptanceChecks.id, check.id));
      }

      const refreshedChecks = await tx
        .select()
        .from(platformAcceptanceChecks)
        .where(inArray(platformAcceptanceChecks.platformId, platformIds))
        .orderBy(desc(platformAcceptanceChecks.completedAt));
      for (const platform of platformRows) {
        if (!platform.acceptanceRequired) continue;
        const fingerprint =
          platform.acceptanceFingerprint ??
          platformAcceptanceFingerprint(platform);
        const passed = new Map<PlatformAcceptanceDimension, Date | null>();
        for (const check of refreshedChecks) {
          if (
            check.platformId === platform.id &&
            check.platformFingerprint === fingerprint &&
            check.status === "passed" &&
            !passed.has(check.dimension)
          ) {
            passed.set(check.dimension, check.completedAt);
          }
        }
        const basePassed = passed.has("search_default");
        const defaultTransportPassed =
          platform.clientType === "mobile"
            ? passed.has("mobile_no_region")
            : passed.has("region_default");
        const verified = basePassed && defaultTransportPassed;
        await tx
          .update(platformCatalog)
          .set({
            verified,
            supportsReasoning: passed.has("reasoning_search"),
            supportsDomesticRegion: passed.has("region_domestic"),
            supportsOverseasRegion: passed.has("region_overseas"),
            verifiedAt: verified ? (passed.get("search_default") ?? now) : null,
          })
          .where(eq(platformCatalog.id, platform.id));
      }

      const batchChecks = await tx
        .select({
          status: platformAcceptanceChecks.status,
          dimension: platformAcceptanceChecks.dimension,
        })
        .from(platformAcceptanceChecks)
        .where(eq(platformAcceptanceChecks.batchId, batchId));
      let batchStatus: PlatformAcceptanceStatus;
      if (batchChecks.some(({ status }) => status === "stale")) {
        batchStatus = "stale";
      } else if (
        batchChecks.some(
          ({ status }) => status === "pending" || status === "running",
        )
      ) {
        batchStatus = "running";
      } else if (
        batchChecks.some(
          ({ status, dimension }) =>
            status === "failed" ||
            (dimension === "search_default" && status === "unsupported"),
        )
      ) {
        batchStatus = "failed";
      } else {
        batchStatus = "passed";
      }
      await tx
        .update(platformAcceptanceBatches)
        .set({
          status: batchStatus,
          completedAt: batchStatus === "running" ? null : now,
        })
        .where(eq(platformAcceptanceBatches.id, batchId));
    });
  }

async getPlatformAcceptanceBatch(batchId: string) {
    const [existing] = await this.db
      .select({ id: platformAcceptanceBatches.id })
      .from(platformAcceptanceBatches)
      .where(eq(platformAcceptanceBatches.id, batchId))
      .limit(1);
    if (!existing) {
      throw new RepositoryError(
        "NOT_FOUND",
        "Platform acceptance batch not found",
      );
    }
    await this.refreshPlatformAcceptanceBatch(batchId);
    const [batch, checks] = await Promise.all([
      this.db
        .select()
        .from(platformAcceptanceBatches)
        .where(eq(platformAcceptanceBatches.id, batchId))
        .limit(1),
      this.db
        .select()
        .from(platformAcceptanceChecks)
        .where(eq(platformAcceptanceChecks.batchId, batchId))
        .orderBy(asc(platformAcceptanceChecks.createdAt)),
    ]);
    const row = batch[0];
    if (!row) {
      throw new RepositoryError(
        "NOT_FOUND",
        "Platform acceptance batch not found",
      );
    }
    return {
      ...row,
      totalAmountTenThousandths: moneyToApiString(
        row.totalAmountTenThousandths,
      ),
      checks: checks.map((check) => ({
        id: check.id,
        batchId: check.batchId,
        platformId: check.platformId,
        providerCode: check.providerCodeSnapshot,
        displayName: check.displayNameSnapshot,
        clientType: check.clientType,
        platformFingerprint: check.platformFingerprint,
        dimension: check.dimension,
        mode: check.mode,
        screenshot: (check.screenshot === 0 ||
        check.screenshot === 1 ||
        check.screenshot === 2
          ? check.screenshot
          : 0) as 0 | 1 | 2,
        regionCode: check.regionCode,
        status: check.status,
        runId: check.runId,
        attemptId: check.attemptId,
        resultHash: check.resultHash,
        screenshotHash: check.screenshotHash,
        errorCode: check.errorCode,
        errorSummary: check.errorSummary,
        startedAt: check.startedAt,
        completedAt: check.completedAt,
        createdAt: check.createdAt,
        updatedAt: check.updatedAt,
      })),
    };
  }

async listPlatformAcceptanceBatches(limit = 30) {
    const rows = await this.db
      .select({ id: platformAcceptanceBatches.id })
      .from(platformAcceptanceBatches)
      .orderBy(desc(platformAcceptanceBatches.createdAt))
      .limit(Math.max(1, Math.min(limit, 100)));
    return Promise.all(
      rows.map(({ id }) => this.getPlatformAcceptanceBatch(id)),
    );
  }

async createMonitor(
    ownerId: string,
    projectId: string,
    configuration: MonitorConfiguration,
    audit: RequestAudit,
    transaction?: Transaction,
  ) {
    const execute = async (tx: Transaction) => {
      await this.lockProjectAdmission(tx, ownerId, projectId);
      const [project] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            monitoringProjectOwnerPredicate(projects, ownerId),
            isNull(projects.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!project?.currentBrandVersionId)
        throw new RepositoryError("NOT_FOUND", "Project not found");
      await validatePlatforms(tx, configuration);

      const monitorId = randomUUID();
      const versionId = randomUUID();
      const expectedAttempts = calculateAttemptCount(
        configuration.questions.length,
        configuration.platforms.length,
        configuration.repetitions,
      );
      if (expectedAttempts > 500)
        throw new RepositoryError(
          "INVALID_STATE",
          "A run may contain at most 500 attempts",
        );
      const nextRunAt = computeNextRunAt(configuration.schedule, new Date());
      await tx.insert(monitors).values({
        id: monitorId,
        ownerId,
        projectId,
        name: configuration.name,
        status: "active",
        activeVersionId: versionId,
        scheduleType: configuration.schedule.type,
        scheduleTimezone: configuration.schedule.timezone,
        scheduleLocalTime: configuration.schedule.localTime,
        scheduleWeekday: configuration.schedule.weekday,
        nextRunAt,
      });
      await tx.insert(monitorVersions).values({
        id: versionId,
        monitorId,
        projectBrandVersionId: project.currentBrandVersionId,
        version: 1,
        name: configuration.name,
        brandAliases: configuration.brandAliases,
        competitors: configuration.competitors,
        repetitions: configuration.repetitions,
        expectedAttempts,
        configurationHash: sha256(stableJson(configuration)),
        createdBy: ownerId,
      });
      await insertVersionChildren(
        tx,
        projectId,
        ownerId,
        versionId,
        configuration,
      );
      await insertAudit(
        tx,
        audit,
        "monitor.created",
        "monitor",
        monitorId,
        ownerId,
        { version: 1, expectedAttempts },
      );
      return { monitorId, versionId, expectedAttempts };
    };
    return transaction ? execute(transaction) : this.db.transaction(execute);
  }

async updateMonitor(
    ownerId: string,
    monitorId: string,
    configuration: MonitorConfiguration,
    audit: RequestAudit,
    transaction?: Transaction,
  ) {
    const execute = async (tx: Transaction) => {
      await this.lockMonitorAdmission(tx, ownerId, monitorId);
      const [monitor] = await tx
        .select()
        .from(monitors)
        .where(
          and(
            eq(monitors.id, monitorId),
            monitoringChildOwnerPredicate(monitors, ownerId),
            isNull(monitors.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!monitor) throw new RepositoryError("NOT_FOUND", "Monitor not found");
      const [project] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, monitor.projectId),
            monitoringProjectOwnerPredicate(projects, ownerId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      if (!project?.currentBrandVersionId)
        throw new RepositoryError("NOT_FOUND", "Project not found");
      await validatePlatforms(tx, configuration);
      const [latest] = await tx
        .select({ version: monitorVersions.version })
        .from(monitorVersions)
        .where(eq(monitorVersions.monitorId, monitorId))
        .orderBy(desc(monitorVersions.version))
        .limit(1);
      const version = (latest?.version ?? 0) + 1;
      const versionId = randomUUID();
      const expectedAttempts = calculateAttemptCount(
        configuration.questions.length,
        configuration.platforms.length,
        configuration.repetitions,
      );
      if (expectedAttempts > 500)
        throw new RepositoryError(
          "INVALID_STATE",
          "A run may contain at most 500 attempts",
        );
      await tx.insert(monitorVersions).values({
        id: versionId,
        monitorId,
        projectBrandVersionId: project.currentBrandVersionId,
        version,
        name: configuration.name,
        brandAliases: configuration.brandAliases,
        competitors: configuration.competitors,
        repetitions: configuration.repetitions,
        expectedAttempts,
        configurationHash: sha256(stableJson(configuration)),
        createdBy: ownerId,
      });
      await insertVersionChildren(
        tx,
        monitor.projectId,
        ownerId,
        versionId,
        configuration,
      );
      await tx
        .update(monitors)
        .set({
          name: configuration.name,
          activeVersionId: versionId,
          scheduleType: configuration.schedule.type,
          scheduleTimezone: configuration.schedule.timezone,
          scheduleLocalTime: configuration.schedule.localTime,
          scheduleWeekday: configuration.schedule.weekday,
          nextRunAt:
            monitor.status === "active"
              ? computeNextRunAt(configuration.schedule, new Date())
              : null,
        })
        .where(eq(monitors.id, monitorId));
      await insertAudit(
        tx,
        audit,
        "monitor.version_created",
        "monitor",
        monitorId,
        ownerId,
        { version, expectedAttempts },
      );
      return { monitorId, versionId, version, expectedAttempts };
    };
    return transaction ? execute(transaction) : this.db.transaction(execute);
  }

async createMonitorAndRun(
    ownerId: string,
    projectId: string,
    configuration: MonitorConfiguration,
    idempotencyKey: string,
    audit: RequestAudit,
  ) {
    return this.db.transaction(async (tx) => {
      await this.lockProjectAdmission(tx, ownerId, projectId);
      // Enterprise admission precedes all wallet/monitor locks. The wallet is
      // the stable per-owner serialization point available before
      // a new monitor has an id. Taking this lock before the replay lookup makes
      // concurrent double submits observe the first committed run instead of
      // creating a second monitor that only fails later on the run unique key.
      await lockMoneyWallet(tx, ownerId);

      const duplicate = await findRunByIdempotencyKey(
        tx,
        ownerId,
        idempotencyKey,
        true,
      );
      if (duplicate) {
        if (duplicate.projectId !== projectId) {
          throw new RepositoryError(
            "CONFLICT",
            "Idempotency key is already bound to another project run",
          );
        }
        return {
          monitorId: duplicate.monitorId,
          versionId: duplicate.monitorVersionId,
          expectedAttempts: duplicate.expectedAttempts,
          run: { run: duplicate, duplicate: true },
        };
      }

      const monitor = await this.createMonitor(
        ownerId,
        projectId,
        configuration,
        audit,
        tx,
      );
      const run = await this.createRun(
        ownerId,
        monitor.monitorId,
        idempotencyKey,
        "manual",
        null,
        monitor.versionId,
        tx,
      );
      return { ...monitor, run };
    });
  }

async updateMonitorAndRun(
    ownerId: string,
    monitorId: string,
    configuration: MonitorConfiguration,
    idempotencyKey: string,
    audit: RequestAudit,
  ) {
    return this.db.transaction(async (tx) => {
      await this.lockMonitorAdmission(tx, ownerId, monitorId);
      const [lockedMonitor] = await tx
        .select({ id: monitors.id })
        .from(monitors)
        .where(
          and(
            eq(monitors.id, monitorId),
            monitoringChildOwnerPredicate(monitors, ownerId),
            isNull(monitors.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!lockedMonitor)
        throw new RepositoryError("NOT_FOUND", "Monitor not found");

      await lockMoneyWallet(tx, ownerId);

      const duplicate = await findRunByIdempotencyKey(
        tx,
        ownerId,
        idempotencyKey,
        true,
      );
      if (duplicate) {
        if (duplicate.monitorId !== monitorId) {
          throw new RepositoryError(
            "CONFLICT",
            "Idempotency key is already bound to another monitor run",
          );
        }
        const [version] = await tx
          .select({ version: monitorVersions.version })
          .from(monitorVersions)
          .where(eq(monitorVersions.id, duplicate.monitorVersionId))
          .limit(1);
        if (!version)
          throw new RepositoryError(
            "INVALID_STATE",
            "Idempotent monitor version is missing",
          );
        return {
          monitorId,
          versionId: duplicate.monitorVersionId,
          version: version.version,
          expectedAttempts: duplicate.expectedAttempts,
          run: { run: duplicate, duplicate: true },
        };
      }

      const monitor = await this.updateMonitor(
        ownerId,
        monitorId,
        configuration,
        audit,
        tx,
      );
      const run = await this.createRun(
        ownerId,
        monitorId,
        idempotencyKey,
        "manual",
        null,
        monitor.versionId,
        tx,
      );
      return { ...monitor, run };
    });
  }

async listMonitors(ownerId: string, projectId?: string) {
    const conditions = [
      monitoringChildOwnerPredicate(monitors, ownerId),
      isNull(monitors.deletedAt),
      sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${monitors.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
    ];
    if (projectId) conditions.push(eq(monitors.projectId, projectId));
    return this.db
      .select({
        id: monitors.id,
        projectId: monitors.projectId,
        name: monitors.name,
        status: monitors.status,
        activeVersionId: monitors.activeVersionId,
        scheduleType: monitors.scheduleType,
        scheduleTimezone: monitors.scheduleTimezone,
        scheduleLocalTime: monitors.scheduleLocalTime,
        scheduleWeekday: monitors.scheduleWeekday,
        nextRunAt: monitors.nextRunAt,
        createdAt: monitors.createdAt,
        activeVersion: monitorVersions.version,
        expectedAttempts: monitorVersions.expectedAttempts,
        repetitions: monitorVersions.repetitions,
        questionsCount: sql<number>`(SELECT COUNT(*) FROM monitor_questions mq WHERE mq.monitor_version_id = ${monitors.activeVersionId})`,
        platformsCount: sql<number>`(SELECT COUNT(*) FROM monitor_platforms mp WHERE mp.monitor_version_id = ${monitors.activeVersionId})`,
        lastRunId: sql<
          string | null
        >`(SELECT r.id FROM runs r WHERE r.monitor_id = ${monitors.id} AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1)`,
        lastRunStatus: sql<
          string | null
        >`(SELECT r.status FROM runs r WHERE r.monitor_id = ${monitors.id} AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1)`,
        lastRunCompletedAttempts: sql<
          number | null
        >`(SELECT r.completed_attempts FROM runs r WHERE r.monitor_id = ${monitors.id} AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1)`,
        lastRunExpectedAttempts: sql<
          number | null
        >`(SELECT r.expected_attempts FROM runs r WHERE r.monitor_id = ${monitors.id} AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1)`,
        lastRunCompletedAt: sql<Date | null>`(SELECT r.completed_at FROM runs r WHERE r.monitor_id = ${monitors.id} AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1)`,
        waitingQuotaOccurrences: sql<number>`(SELECT COUNT(*) FROM schedule_occurrences so WHERE so.monitor_id = ${monitors.id} AND so.run_id IS NULL AND so.waiting_for_quota_at IS NOT NULL)`,
      })
      .from(monitors)
      .leftJoin(
        monitorVersions,
        eq(monitors.activeVersionId, monitorVersions.id),
      )
      .where(and(...conditions))
      .orderBy(desc(monitors.createdAt));
  }

async getMonitor(ownerId: string, monitorId: string) {
    const [monitor] = await this.db
      .select()
      .from(monitors)
      .where(
        and(
          eq(monitors.id, monitorId),
          monitoringChildOwnerPredicate(monitors, ownerId),
          isNull(monitors.deletedAt),
          sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${monitors.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
        ),
      )
      .limit(1);
    if (!monitor?.activeVersionId)
      throw new RepositoryError("NOT_FOUND", "Monitor not found");
    const [version] = await this.db
      .select()
      .from(monitorVersions)
      .where(eq(monitorVersions.id, monitor.activeVersionId))
      .limit(1);
    if (!version)
      throw new RepositoryError("NOT_FOUND", "Monitor version not found");
    const [questions, platforms] = await Promise.all([
      this.db
        .select()
        .from(monitorQuestions)
        .where(eq(monitorQuestions.monitorVersionId, version.id))
        .orderBy(asc(monitorQuestions.ordinal)),
      this.db
        .select()
        .from(monitorPlatforms)
        .where(eq(monitorPlatforms.monitorVersionId, version.id))
        .orderBy(asc(monitorPlatforms.ordinal)),
    ]);
    return { monitor, version, questions, platforms };
  }

async setMonitorPaused(
    ownerId: string,
    monitorId: string,
    paused: boolean,
    audit: RequestAudit,
  ) {
    const [monitor] = await this.db
      .select()
      .from(monitors)
      .where(
        and(
          eq(monitors.id, monitorId),
          monitoringChildOwnerPredicate(monitors, ownerId),
          isNull(monitors.deletedAt),
          sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${monitors.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
        ),
      )
      .limit(1);
    if (!monitor) throw new RepositoryError("NOT_FOUND", "Monitor not found");
    if (monitor.status === "deleted")
      throw new RepositoryError(
        "INVALID_STATE",
        "Deleted monitor cannot be changed",
      );
    const now = new Date();
    const nextRunAt = paused
      ? null
      : computeNextRunAt(
          {
            type: monitor.scheduleType,
            timezone: monitor.scheduleTimezone,
            localTime: monitor.scheduleLocalTime,
            weekday: monitor.scheduleWeekday,
          },
          now,
        );
    await this.db.transaction(async (tx) => {
      const [project] = await tx.select({ enterpriseProjectId: projects.enterpriseProjectId }).from(projects)
        .where(and(eq(projects.id, monitor.projectId), eq(projects.ownerId, ownerId))).limit(1);
      if (!project) throw new RepositoryError("NOT_FOUND", "Project not found");
      await assertMonitoringEnterpriseProjectActive(tx, project.enterpriseProjectId, ownerId);
      await tx
        .update(monitors)
        .set({
          status: paused ? "paused" : "active",
          nextRunAt,
          lastScheduledFor: now,
        })
        .where(eq(monitors.id, monitorId));
      await insertAudit(
        tx,
        audit,
        paused ? "monitor.paused" : "monitor.resumed",
        "monitor",
        monitorId,
        ownerId,
        {},
      );
    });
  }

async softDeleteMonitor(
    ownerId: string,
    monitorId: string,
    audit: RequestAudit,
  ) {
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 86_400_000);
    await this.db.transaction(async (tx) => {
      const result = await tx
        .update(monitors)
        .set({ status: "deleted", deletedAt: now, purgeAfter, nextRunAt: null })
        .where(
          and(
            eq(monitors.id, monitorId),
            monitoringChildOwnerPredicate(monitors, ownerId),
            isNull(monitors.deletedAt),
          ),
        );
      if (affectedRows(result) !== 1)
        throw new RepositoryError("NOT_FOUND", "Monitor not found");
      await tx
        .delete(scheduleOccurrences)
        .where(
          and(
            eq(scheduleOccurrences.monitorId, monitorId),
            isNull(scheduleOccurrences.runId),
          ),
        );
      await tx.insert(jobs).values({
        id: randomUUID(),
        type: "purge_soft_deleted",
        dedupeKey: `purge:monitor:${monitorId}`,
        payload: { entityType: "monitor", entityId: monitorId },
        availableAt: purgeAfter,
      });
      await insertAudit(
        tx,
        audit,
        "monitor.deleted",
        "monitor",
        monitorId,
        ownerId,
        { purgeAfter: purgeAfter.toISOString() },
      );
    });
  }

async listDeletedMonitors(ownerId: string) {
    return this.db
      .select({
        id: monitors.id,
        projectId: monitors.projectId,
        name: monitors.name,
        deletedAt: monitors.deletedAt,
        purgeAfter: monitors.purgeAfter,
      })
      .from(monitors)
      .where(
        and(
          monitoringChildOwnerPredicate(monitors, ownerId),
          sql`${monitors.deletedAt} IS NOT NULL`,
        ),
      )
      .orderBy(desc(monitors.deletedAt));
  }

async restoreMonitor(
    ownerId: string,
    monitorId: string,
    audit: RequestAudit,
  ) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await this.lockMonitorAdmission(tx, ownerId, monitorId);
      const [monitor] = await tx
        .select()
        .from(monitors)
        .where(
          and(
            eq(monitors.id, monitorId),
            monitoringChildOwnerPredicate(monitors, ownerId),
            sql`${monitors.deletedAt} IS NOT NULL`,
          ),
        )
        .for("update")
        .limit(1);
      if (!monitor || (monitor.purgeAfter && monitor.purgeAfter <= now))
        throw new RepositoryError("NOT_FOUND", "Restorable monitor not found");
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, monitor.projectId),
            monitoringProjectOwnerPredicate(projects, ownerId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      if (!project)
        throw new RepositoryError(
          "INVALID_STATE",
          "Restore the parent project first",
        );
      await tx
        .update(monitors)
        .set({
          status: "paused",
          deletedAt: null,
          purgeAfter: null,
          nextRunAt: null,
          lastScheduledFor: now,
        })
        .where(eq(monitors.id, monitorId));
      await tx
        .delete(scheduleOccurrences)
        .where(
          and(
            eq(scheduleOccurrences.monitorId, monitorId),
            isNull(scheduleOccurrences.runId),
          ),
        );
      await tx
        .delete(jobs)
        .where(eq(jobs.dedupeKey, `purge:monitor:${monitorId}`));
      await insertAudit(
        tx,
        audit,
        "monitor.restored",
        "monitor",
        monitorId,
        ownerId,
        {},
      );
    });
  }

async createRun(
    ownerId: string,
    monitorId: string,
    idempotencyKey: string,
    trigger: RunTrigger = "manual",
    occurrenceId: string | null = null,
    monitorVersionOverrideId: string | null = null,
    transaction?: Transaction,
    platformValidation?: {
      acceptanceProbeFingerprints: ReadonlyMap<string, string>;
    },
  ) {
    const execute = async (tx: Transaction) => {
      // Workers have no request scope: recover the immutable project binding.
      const [admission] = await tx.select({ enterpriseProjectId: projects.enterpriseProjectId })
        .from(monitors).innerJoin(projects, eq(projects.id, monitors.projectId))
        .where(and(eq(monitors.id, monitorId), eq(monitors.ownerId, ownerId), eq(projects.ownerId, ownerId))).limit(1);
      if (!admission) throw new RepositoryError("NOT_FOUND", "Monitor not found");
      await assertMonitoringEnterpriseProjectActive(tx, admission.enterpriseProjectId, ownerId);
      const duplicate = await findRunByIdempotencyKey(
        tx,
        ownerId,
        idempotencyKey,
      );
      if (duplicate) {
        if (duplicate.monitorId !== monitorId) {
          throw new RepositoryError(
            "CONFLICT",
            "Idempotency key is already bound to another monitor run",
          );
        }
        return { run: duplicate, duplicate: true };
      }
      const [monitor] = await tx
        .select()
        .from(monitors)
        .where(
          and(
            eq(monitors.id, monitorId),
            monitoringChildOwnerPredicate(monitors, ownerId),
            isNull(monitors.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!monitor?.activeVersionId)
        throw new RepositoryError("NOT_FOUND", "Monitor not found");
      if (monitor.status === "paused" && trigger !== "manual")
        throw new RepositoryError(
          "INVALID_STATE",
          "Paused monitor cannot be scheduled",
        );
      const [activeRun] = await tx
        .select({ id: runs.id })
        .from(runs)
        .where(
          and(
            eq(runs.monitorId, monitorId),
            inArray(runs.status, [
              "queued",
              "waiting_quota",
              "running",
              "review_required",
            ]),
            isNull(runs.deletedAt),
          ),
        )
        .orderBy(asc(runs.createdAt))
        .limit(1);
      const versionId = monitorVersionOverrideId ?? monitor.activeVersionId;
      const [version] = await tx
        .select()
        .from(monitorVersions)
        .where(
          and(
            eq(monitorVersions.id, versionId),
            eq(monitorVersions.monitorId, monitor.id),
          ),
        )
        .limit(1);
      if (!version)
        throw new RepositoryError(
          "INVALID_STATE",
          "Monitor has no active configuration",
        );
      const [project] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, monitor.projectId),
            monitoringProjectOwnerPredicate(projects, ownerId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      if (!project?.currentBrandVersionId)
        throw new RepositoryError("NOT_FOUND", "Project not found");
      const [brandVersion] = await tx
        .select({ id: projectBrandVersions.id })
        .from(projectBrandVersions)
        .where(
          and(
            eq(projectBrandVersions.id, version.projectBrandVersionId),
            eq(projectBrandVersions.projectId, project.id),
          ),
        )
        .limit(1);
      if (!brandVersion)
        throw new RepositoryError(
          "INVALID_STATE",
          "Monitor configuration brand snapshot is invalid",
        );
      await core.assertOwnerActive(tx, ownerId);

      const wallet = await lockMoneyWallet(tx, ownerId);
      // A concurrent operation can commit the same owner-scoped key while this
      // transaction waits for the wallet lock. Recheck under that lock before
      // reserving quota or inserting attempts.
      const duplicateAfterWalletLock = await findRunByIdempotencyKey(
        tx,
        ownerId,
        idempotencyKey,
        true,
      );
      if (duplicateAfterWalletLock) {
        if (duplicateAfterWalletLock.monitorId !== monitorId) {
          throw new RepositoryError(
            "CONFLICT",
            "Idempotency key is already bound to another monitor run",
          );
        }
        return { run: duplicateAfterWalletLock, duplicate: true };
      }
      const [questionRows, platformRows] = await Promise.all([
        tx
          .select()
          .from(monitorQuestions)
          .where(eq(monitorQuestions.monitorVersionId, version.id))
          .orderBy(asc(monitorQuestions.ordinal)),
        tx
          .select({
            monitorVersionId: monitorPlatforms.monitorVersionId,
            ordinal: monitorPlatforms.ordinal,
            platformId: monitorPlatforms.platformId,
            providerCodeSnapshot: monitorPlatforms.providerCodeSnapshot,
            clientType: monitorPlatforms.clientType,
            mode: monitorPlatforms.mode,
            screenshot: monitorPlatforms.screenshot,
            regionCode: monitorPlatforms.regionCode,
            pricingClass: platformCatalog.pricingClass,
          })
          .from(monitorPlatforms)
          .innerJoin(
            platformCatalog,
            eq(monitorPlatforms.platformId, platformCatalog.id),
          )
          .where(eq(monitorPlatforms.monitorVersionId, version.id))
          .orderBy(asc(monitorPlatforms.ordinal)),
      ]);
      const expected = calculateAttemptCount(
        questionRows.length,
        platformRows.length,
        version.repetitions,
      );
      if (expected !== version.expectedAttempts || expected > 500)
        throw new RepositoryError(
          "INVALID_STATE",
          "Monitor configuration attempt count is inconsistent",
        );
      await validatePlatforms(
        tx,
        {
          platforms: platformRows.map((platform) => ({
            platformId: platform.platformId,
            providerCode: platform.providerCodeSnapshot,
            clientType: platform.clientType,
            mode: platform.mode,
            screenshot: monitoringScreenshotPolicy(platform.screenshot),
            regionCode:
              platform.clientType === "mobile" ? null : platform.regionCode,
          })),
        },
        platformValidation,
      );

      const {pricingVersion, activePrices} = await core.activePricing(tx);
      const priceByDimensions = new Map(
        activePrices.map((price) => [pricingDimensionsKey(price), price]),
      );
      const priceByPlatformOrdinal = new Map(
        platformRows.map((platform) => {
          if (!platform.pricingClass) {
            throw new RepositoryError(
              "INVALID_STATE",
              `Platform ${platform.providerCodeSnapshot} has no confirmed pricing class`,
            );
          }
          const price = priceByDimensions.get(
            pricingDimensionsKey({
              pricingClass: platform.pricingClass,
              mode: platform.mode,
              screenshotEnabled: platform.screenshot !== 0,
            }),
          );
          if (!price) {
            throw new RepositoryError(
              "INVALID_STATE",
              `Platform ${platform.providerCodeSnapshot} has no active price`,
            );
          }
          return [platform.ordinal, price] as const;
        }),
      );
      const reservedAmount = platformRows.reduce((total, platform) => {
        const price = priceByPlatformOrdinal.get(platform.ordinal);
        if (!price)
          throw new RepositoryError(
            "INVALID_STATE",
            "Attempt price snapshot cannot be created",
          );
        return (
          total +
          price.amountTenThousandths *
            BigInt(questionRows.length * version.repetitions)
        );
      }, 0n);
      const availableAmount =
        wallet.balanceTenThousandths - wallet.reservedTenThousandths - wallet.frozenTenThousandths;
      if (availableAmount < reservedAmount)
        throw new RepositoryError(
          "BALANCE_INSUFFICIENT",
          "Available balance is insufficient",
        );

      const runId = randomUUID();
      const reservationId = randomUUID();
      await tx.insert(runs).values({
        id: runId,
        ownerId,
        projectId: monitor.projectId,
        projectBrandVersionId: version.projectBrandVersionId,
        monitorId,
        monitorVersionId: version.id,
        scheduleOccurrenceId: occurrenceId,
        trigger,
        status: "queued",
        idempotencyKey,
        expectedAttempts: expected,
      });
      const attemptRows: Array<typeof attempts.$inferInsert> = [];
      for (const question of questionRows) {
        for (const platform of platformRows) {
          for (
            let repetition = 1;
            repetition <= version.repetitions;
            repetition += 1
          ) {
            const attemptId = randomUUID();
            attemptRows.push({
              id: attemptId,
              runId,
              ownerId,
              monitorQuestionOrdinal: question.ordinal,
              monitorPlatformOrdinal: platform.ordinal,
              repetition,
              question: question.questionSnapshot,
              platformId: platform.platformId,
              providerCode: platform.providerCodeSnapshot,
              clientType: platform.clientType,
              mode: platform.mode,
              screenshot: platform.screenshot,
              regionCode:
                platform.clientType === "mobile" ? null : platform.regionCode,
              consumerTaskId: `fm${sha256(attemptId).slice(0, 62)}`,
            });
          }
        }
      }
      for (let offset = 0; offset < attemptRows.length; offset += 100) {
        await tx
          .insert(attempts)
          .values(attemptRows.slice(offset, offset + 100));
      }
      const nextReservedAmount = wallet.reservedTenThousandths + reservedAmount;
      await core.reserveFunds(tx, {ownerId, runId, reservationId, reservedAmount, nextReservedAmount});
      const priceSnapshots = attemptRows.map((attempt) => {
        const price = priceByPlatformOrdinal.get(
          attempt.monitorPlatformOrdinal,
        );
        if (!price)
          throw new RepositoryError(
            "INVALID_STATE",
            "Attempt price snapshot cannot be created",
          );
        return {
          attemptId: attempt.id,
          pricingVersionId: pricingVersion.id,
          pricingItemId: price.id,
          pricingClass: price.pricingClass,
          mode: price.mode,
          screenshotEnabled: price.screenshotEnabled,
          amountTenThousandths: price.amountTenThousandths,
        };
      });
      const attemptSettlements = attemptRows.map((attempt) => ({
        attemptId: attempt.id,
        reservationId,
      }));
      for (let offset = 0; offset < priceSnapshots.length; offset += 100) {
        await tx
          .insert(attemptPriceSnapshots)
          .values(priceSnapshots.slice(offset, offset + 100));
        await tx
          .insert(attemptMoneySettlements)
          .values(attemptSettlements.slice(offset, offset + 100));
      }
      await insertMoneyLedger(tx, {
        userId: ownerId,
        type: "reserve",
        balanceDelta: 0n,
        reservedDelta: reservedAmount,
        nextBalance: wallet.balanceTenThousandths,
        nextReserved: nextReservedAmount,
        idempotencyKey: `reserve:${runId}`,
        reservationId,
        reason: "Run balance reservation",
        referenceType: "run",
        referenceId: runId,
      });
      if (!activeRun) {
        const submitJobs = attemptRows.map((attempt) => ({
          id: randomUUID(),
          type: "submit_attempt" as const,
          dedupeKey: `submit:${attempt.id}`,
          payload: { attemptId: attempt.id },
          availableAt: new Date(),
        }));
        for (let offset = 0; offset < submitJobs.length; offset += 100) {
          await tx.insert(jobs).values(submitJobs.slice(offset, offset + 100));
        }
      }
      if (occurrenceId) {
        await tx
          .update(scheduleOccurrences)
          .set({ runId, waitingForQuotaAt: null })
          .where(eq(scheduleOccurrences.id, occurrenceId));
      }
      const [created] = await tx
        .select()
        .from(runs)
        .where(eq(runs.id, runId))
        .limit(1);
      if (!created)
        throw new RepositoryError("INVALID_STATE", "Run creation failed");
      return { run: created, duplicate: false };
    };
    return transaction ? execute(transaction) : this.db.transaction(execute);
  }

async cancelRun(ownerId: string, runId: string, audit: RequestAudit) {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.id, runId),
            monitoringChildOwnerPredicate(runs, ownerId),
            isNull(runs.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!run) throw new RepositoryError("NOT_FOUND", "Run not found");
      if (
        ["completed", "partial_completed", "failed", "cancelled"].includes(
          run.status,
        )
      )
        return run;
      const queued = await tx
        .select({ id: attempts.id })
        .from(attempts)
        .innerJoin(
          attemptMoneySettlements,
          eq(attempts.id, attemptMoneySettlements.attemptId),
        )
        .where(
          and(
            eq(attempts.runId, runId),
            eq(attempts.status, "queued"),
            eq(attemptMoneySettlements.status, "reserved"),
          ),
        )
        .for("update");
      const now = new Date();
      if (queued.length > 0) {
        const ids = queued.map((row) => row.id);
        await tx
          .update(attempts)
          .set({
            status: "cancelled_before_submit",
            terminalAt: now,
          })
          .where(and(inArray(attempts.id, ids), eq(attempts.status, "queued")));
        for (const attempt of queued) {
          await settleAttemptMoney(tx, {
            attemptId: attempt.id,
            settlement: "released",
            settledAt: now,
            reason: "Cancelled before provider submission",
          });
        }
      }
      await tx
        .update(runs)
        .set({ cancelRequestedAt: now })
        .where(eq(runs.id, runId));
      const activeAttempts = await tx
        .select({ id: attempts.id })
        .from(attempts)
        .where(
          and(
            eq(attempts.runId, runId),
            inArray(attempts.status, [
              "submitting",
              "submission_unknown",
              "accepted",
              "processing",
            ]),
          ),
        );
      if (activeAttempts.length > 0) {
        await tx
          .insert(jobs)
          .values(
            activeAttempts.map((attempt) => ({
              id: randomUUID(),
              type: "stop_attempt" as const,
              dedupeKey: `stop:${attempt.id}`,
              payload: { attemptId: attempt.id },
              availableAt: now,
            })),
          )
          .onDuplicateKeyUpdate({ set: { dedupeKey: sql`${jobs.dedupeKey}` } });
      }
      const attemptStates = await tx
        .select({ status: attempts.status })
        .from(attempts)
        .where(eq(attempts.runId, runId));
      const completed = attemptStates.filter(
        (attempt) => attempt.status === "completed",
      ).length;
      const failed = attemptStates.filter(
        (attempt) => attempt.status === "failed" || attempt.status === "error",
      ).length;
      const stopped = attemptStates.filter(
        (attempt) =>
          attempt.status === "stopped" ||
          attempt.status === "cancelled_before_submit",
      ).length;
      if (
        completed + failed + stopped === attemptStates.length &&
        attemptStates.length > 0
      ) {
        await tx
          .update(runs)
          .set({
            status: completed > 0 ? "partial_completed" : "cancelled",
            completedAttempts: completed,
            failedAttempts: failed,
            stoppedAttempts: stopped,
            submittedAttempts: attemptStates.filter(
              (attempt) =>
                !["queued", "cancelled_before_submit"].includes(attempt.status),
            ).length,
            completedAt: now,
          })
          .where(eq(runs.id, runId));
        await enqueueNextSerializedRun(tx, run.monitorId, run.id, now);
      }
      await insertAudit(
        tx,
        audit,
        "run.cancel_requested",
        "run",
        runId,
        ownerId,
        { releasedBeforeSubmit: queued.length },
      );
      const [updated] = await tx
        .select()
        .from(runs)
        .where(eq(runs.id, runId))
        .limit(1);
      return updated;
    });
  }

async getMonitoringSummary(ownerId: string, scope: MonitoringScope) {
    return this.progressMonitoringReadRepository().getMonitoringSummary(ownerId, scope);
  }

async listMonitoringAnswers(ownerId: string, input: MonitoringAnswersListInput) {
    return this.progressMonitoringReadRepository().listMonitoringAnswers(ownerId, input);
  }

async getMonitoringAnswer(
    ownerId: string,
    monitorId: string,
    answerId: string,
    subject: MonitoringScope["subject"] = { kind: "self" },
  ) {
    return this.progressMonitoringReadRepository().getMonitoringAnswer(ownerId, monitorId, answerId, subject);
  }

async getMonitoringAnalysis(ownerId: string, input: MonitoringAnalysisInput) {
    return this.progressMonitoringReadRepository().getMonitoringAnalysis(ownerId, input);
  }

async getMonitoringReportCatalog(ownerId: string, scope: MonitoringScope) {
    const base = { ...scope, questionId: undefined, platformId: undefined, questionIds: undefined, platformIds: undefined, questionCategory: undefined };
    const resolved = await this.resolveMonitoringReadScope(ownerId, base);
    const history = await this.db.selectDistinct({
      questionId: monitorQuestions.questionId, question: monitorQuestions.questionSnapshot,
      category: monitorQuestions.categorySnapshot, platformId: attempts.platformId,
      displayName: platformCatalog.displayName, clientType: attempts.clientType,
    }).from(attempts)
      .innerJoin(runs, eq(attempts.runId, runs.id))
      .innerJoin(monitorQuestions, and(eq(monitorQuestions.monitorVersionId, runs.monitorVersionId), eq(monitorQuestions.ordinal, attempts.monitorQuestionOrdinal)))
      .innerJoin(platformCatalog, eq(platformCatalog.id, attempts.platformId))
      .where(and(...monitoringFactConditions(ownerId, base))).limit(MONITORING_FACT_LIMIT + 1);
    if (history.length > MONITORING_FACT_LIMIT) throw new RepositoryError("INVALID_STATE", "请缩小日期范围后下载报告");
    const questions = new Map(resolved.questions.map((q) => [q.questionId, { id: q.questionId, label: q.questionSnapshot, category: q.categorySnapshot }]));
    const platforms = new Map(resolved.platforms.map((p) => [p.platformId, { id: p.platformId, label: p.displayName, clientType: p.clientType }]));
    for (const row of history) {
      if (!questions.has(row.questionId)) questions.set(row.questionId, { id: row.questionId, label: row.question, category: row.category });
      if (!platforms.has(row.platformId)) platforms.set(row.platformId, { id: row.platformId, label: row.displayName, clientType: row.clientType });
    }
    return { questions: [...questions.values()], platforms: [...platforms.values()] };
  }

async getMonitoringReportData(ownerId: string, scope: MonitoringReportScope, signal?: AbortSignal) {
    return this.db.transaction(async (tx) => {
      const reader = new ProgressRepository(tx as unknown as Database);
      const checkAborted = () => { if (signal?.aborted) throw new RepositoryError("INVALID_STATE", "下载已取消"); };
      checkAborted();
      const resolved = await reader.resolveMonitoringReadScope(ownerId, scope);
      const catalog = await reader.getMonitoringReportCatalog(ownerId, scope);
      if (scope.questionIds?.some((id) => !catalog.questions.some((q) => q.id === id)) || scope.platformIds?.some((id) => !catalog.platforms.some((p) => p.id === id))) {
        throw new RepositoryError("INVALID_STATE", "所选问题或模型不属于当前监控范围");
      }
      const conditions = monitoringFactConditions(ownerId, scope);
      const shareUrl = sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(${resultRevisions.normalizedPayload}, '$.shareUrl'))`;
      const legacyShareUrl = sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(${resultRevisions.normalizedPayload}, '$.raw.shareUrl'))`;
      const answerConditions = [...conditions, sql`CHAR_LENGTH(TRIM(${attemptResults.answerMarkdown})) > 0`];
      const bounded = tx.select({ bytes: sql<number>`(${MONITORING_ANSWER_EXPORT_ROW_OVERHEAD_BYTES}
        + OCTET_LENGTH(${attempts.question}) + OCTET_LENGTH(${attemptResults.answerMarkdown})
        + COALESCE(OCTET_LENGTH(${attemptResults.reasoningMarkdown}), 0)
        + COALESCE(OCTET_LENGTH(CAST(${attemptResults.searchKeywords} AS CHAR)), 0)
        + COALESCE(OCTET_LENGTH(CAST(${attemptResults.keywordEvaluations} AS CHAR)), 0)
        + COALESCE(OCTET_LENGTH(CAST(${attemptResults.competitorRankings} AS CHAR)), 0)
        + COALESCE(OCTET_LENGTH(${shareUrl}), 0) + COALESCE(OCTET_LENGTH(${legacyShareUrl}), 0))`.as("bytes")
      }).from(attempts).innerJoin(runs, eq(runs.id, attempts.runId))
        .innerJoin(monitorQuestions, and(eq(monitorQuestions.monitorVersionId, runs.monitorVersionId), eq(monitorQuestions.ordinal, attempts.monitorQuestionOrdinal)))
        .innerJoin(attemptResults, eq(attemptResults.attemptId, attempts.id))
        .innerJoin(resultRevisions, eq(resultRevisions.id, attemptResults.currentRevisionId))
        .where(and(...answerConditions)).limit(MONITORING_ANSWER_EXPORT_ROW_LIMIT + 1).as("report_size");
      const [preflight] = await tx.select({ rowCount: sql<number>`COUNT(*)`.mapWith(Number), bytes: sql<number>`COALESCE(SUM(${bounded.bytes}), 0)`.mapWith(Number) }).from(bounded);
      assertMonitoringAnswerExportPreflight(preflight?.rowCount ?? NaN, preflight?.bytes ?? NaN);
      checkAborted();
      const rows = await tx.select({
        answerId: attempts.id, runId: runs.id, runCreatedAt: runs.createdAt,
        mainBrand: projectBrandVersions.mainBrand,
        questionId: monitorQuestions.questionId, questionCategory: monitorQuestions.categorySnapshot,
        question: attempts.question, platformId: attempts.platformId,
        platformDisplayName: platformCatalog.displayName, clientType: attempts.clientType,
        mode: attempts.mode, repetition: attempts.repetition, status: attempts.status,
        currentRevisionId: attemptResults.currentRevisionId, answerMarkdown: attemptResults.answerMarkdown,
        reasoningMarkdown: attemptResults.reasoningMarkdown, searchKeywords: attemptResults.searchKeywords,
        sentiment: attemptResults.sentiment, keywordEvaluations: attemptResults.keywordEvaluations,
        shareUrl, legacyShareUrl,
      }).from(attempts).innerJoin(runs, eq(runs.id, attempts.runId))
        .innerJoin(projectBrandVersions, eq(projectBrandVersions.id, runs.projectBrandVersionId))
        .innerJoin(monitorQuestions, and(eq(monitorQuestions.monitorVersionId, runs.monitorVersionId), eq(monitorQuestions.ordinal, attempts.monitorQuestionOrdinal)))
        .innerJoin(platformCatalog, eq(platformCatalog.id, attempts.platformId))
        .innerJoin(attemptResults, eq(attemptResults.attemptId, attempts.id))
        .innerJoin(resultRevisions, eq(resultRevisions.id, attemptResults.currentRevisionId))
        .where(and(...answerConditions)).orderBy(asc(runs.createdAt), asc(attempts.id))
        .limit(MONITORING_ANSWER_EXPORT_ROW_LIMIT + 1);
      assertMonitoringAnswerExportPreflight(rows.length, preflight!.bytes);
      const facts = await reader.readMonitoringFacts(ownerId, resolved);
      const answerIds = new Set(rows.map((row) => row.answerId));
      const answerFacts = facts.filter((fact) => answerIds.has(fact.attemptId));
      const revisions = [...new Set(rows.map((row) => row.currentRevisionId))];
      let projectedBytes = preflight!.bytes;
      let evidenceRows = 0;
      // Count source text before materializing it; the total shares the 32 MiB budget.
      for (const ids of chunks(revisions, MONITORING_EVIDENCE_REVISION_BATCH_SIZE)) {
        checkAborted();
        for (const table of [resultSources, resultDiscoveredSources]) {
          const metadataBytes = table === resultSources
            ? sql`COALESCE(OCTET_LENGTH(${resultSources.citedText}), 0)`
            : sql`COALESCE(OCTET_LENGTH(${resultDiscoveredSources.summary}), 0) + COALESCE(OCTET_LENGTH(${resultDiscoveredSources.siteName}), 0)`;
          const [size] = await tx.select({ count: sql<number>`COUNT(*)`.mapWith(Number), bytes: sql<number>`COALESCE(SUM(OCTET_LENGTH(${table.url}) + OCTET_LENGTH(${table.title}) + OCTET_LENGTH(${table.domain}) + ${metadataBytes} + 512), 0)`.mapWith(Number) }).from(table).where(inArray(table.revisionId, ids));
          evidenceRows += size?.count ?? 0; projectedBytes += size?.bytes ?? 0;
        }
        if (evidenceRows > MONITORING_EVIDENCE_ROW_LIMIT) throw new RepositoryError("INVALID_STATE", "信源过多，请缩小日期或问题范围");
        assertMonitoringAnswerExportPreflight(rows.length, projectedBytes);
      }
      const evidence = await reader.readMonitoringEvidence(answerFacts);
      const screenshots: Array<{ id: string; revisionId: string; ordinal: number }> = [];
      for (const ids of chunks(revisions, MONITORING_EVIDENCE_REVISION_BATCH_SIZE)) {
        checkAborted();
        const media = await tx.select({ id: resultMedia.id, revisionId: resultMedia.revisionId, ordinal: resultMedia.ordinal }).from(resultMedia)
          .where(and(inArray(resultMedia.revisionId, ids), eq(resultMedia.type, "screenshot"), eq(resultMedia.archiveStatus, "archived")))
          .orderBy(asc(resultMedia.ordinal)).limit(MONITORING_EVIDENCE_ROW_LIMIT - evidenceRows + 1);
        evidenceRows += media.length; projectedBytes += media.length * 512;
        if (evidenceRows > MONITORING_EVIDENCE_ROW_LIMIT) throw new RepositoryError("INVALID_STATE", "截图过多，请缩小下载范围");
        assertMonitoringAnswerExportPreflight(rows.length, projectedBytes);
        screenshots.push(...media);
      }
      const factsById = new Map(answerFacts.map((fact) => [fact.attemptId, fact]));
      const mediaByRevision = new Map<string, string[]>();
      for (const media of screenshots) {
        const ids = mediaByRevision.get(media.revisionId) ?? [];
        if (ids.length >= 100) throw new RepositoryError("INVALID_STATE", "单条回答截图过多，请缩小下载范围");
        ids.push(media.id); mediaByRevision.set(media.revisionId, ids);
      }
      const answers = rows.map((row) => {
        const fact = factsById.get(row.answerId)!;
        const configuredNames = new Set(fact.monitorCompetitors.flatMap((c) => [c.name, ...c.aliases]).map(normalizedBrandName));
        const rankings = safeRankingEntries(fact.competitorRankings);
        return { ...row, legacyShareUrl: undefined,
          shareUrl: monitoringAnswerShareUrl({ shareUrl: row.shareUrl, raw: { shareUrl: row.legacyShareUrl } }),
          ...monitoringSubjectContribution(fact, resolved.subject),
          configuredCompetitors: fact.monitorCompetitors.map((competitor) => ({ name: competitor.name, ...monitoringSubjectContribution(fact, { kind: "competitor", ...competitor }) })),
          otherBrands: rankings.filter((ranking) => !configuredNames.has(normalizedBrandName(ranking.name)) && normalizedBrandName(ranking.name) !== normalizedBrandName(row.mainBrand)),
          screenshots: mediaByRevision.get(row.currentRevisionId) ?? [],
        };
      });
      const sources = answers.flatMap((answer) => (evidence.referencesByRevision.get(answer.currentRevisionId) ?? []).map((source) => ({
        ...source, answerId: answer.answerId, question: answer.question, platformDisplayName: answer.platformDisplayName,
        clientType: answer.clientType, runCreatedAt: answer.runCreatedAt,
        isCited: evidence.provenanceByRevision.get(answer.currentRevisionId) === "explicit" && source.isCited,
      })));
      // Legacy source fallback, word contexts and metadata are included in the final byte guard.
      assertMonitoringAnswerExportPreflight(answers.length, Buffer.byteLength(JSON.stringify({ answers, sources }), "utf8"));
      checkAborted();
      const omitted = facts.filter((fact) => !answerIds.has(fact.attemptId));
      return { monitor: { id: scope.monitorId, name: resolved.monitor.name, mainBrand: resolved.brand.mainBrand, timezone: resolved.projectTimezone }, scope, answers, sources,
        attemptedCount: facts.length, omittedCount: omitted.length,
        omittedStatuses: [...new Set(omitted.map((fact) => fact.status))].map((status) => ({ status, count: omitted.filter((fact) => fact.status === status).length })),
      };
    }, MONITORING_ANSWER_EXPORT_TRANSACTION_CONFIG);
  }

async getMonitoringExportData(
    ownerId: string,
    scope: MonitoringScope,
    sections: readonly MonitoringExportSection[],
  ) {
    if (
      sections.length === 0 ||
      sections.some((section) => !monitoringExportSections.includes(section))
    ) {
      throw new RepositoryError(
        "INVALID_STATE",
        "Invalid monitoring export section",
      );
    }
    const resolved = await this.resolveMonitoringReadScope(ownerId, scope);
    const answerRows = sections.includes("answers")
      ? await this.readMonitoringExportAnswers(ownerId, resolved.scope)
      : [];
    const facts = await this.readMonitoringFacts(ownerId, resolved);
    const evidence = await this.readMonitoringEvidence(facts);
    const factsByAttempt = new Map(
      facts.map((fact) => [fact.attemptId, fact] as const),
    );
    const metrics = monitoringMetrics(facts, evidence, resolved.subject);
    const trends = buildMonitoringAnalysis("trends", facts, evidence, resolved);
    const competitors = buildMonitoringAnalysis(
      "competitors",
      facts,
      evidence,
      resolved,
    );
    return {
      monitor: {
        id: resolved.monitor.id,
        name: resolved.monitor.name,
        status: resolved.monitor.status,
        version: resolved.version.version,
        mainBrand: resolved.brand.mainBrand,
        timezone: resolved.projectTimezone,
      },
      scope,
      sections: [...new Set(sections)],
      metrics,
      trends: trends.kind === "trends" ? trends.points : [],
      competitors: competitors.kind === "competitors" ? competitors.items : [],
      answers: answerRows.map((row) => {
        const fact = factsByAttempt.get(row.answerId);
        const contribution = fact
          ? monitoringSubjectContribution(fact, resolved.subject)
          : { mentioned: false, position: null };
        const revisionId = row.currentRevisionId;
        return {
          answerId: row.answerId,
          runId: row.runId,
          runCreatedAt: row.runCreatedAt,
          questionId: row.questionId,
          question: row.question,
          questionCategory: row.questionCategory,
          platformId: row.platformId,
          platformDisplayName: row.platformDisplayName,
          clientType: row.clientType,
          mode: row.mode,
          repetition: row.repetition,
          status: row.status,
          answerMarkdown: row.answerMarkdown ?? "",
          shareUrl: monitoringAnswerShareUrl({
            shareUrl: row.shareUrl,
            raw: { shareUrl: row.legacyShareUrl },
          }),
          reasoningMarkdown: row.reasoningMarkdown,
          searchKeywords: Array.isArray(row.searchKeywords)
            ? row.searchKeywords.filter(
                (keyword): keyword is string => typeof keyword === "string",
              )
            : [],
          sentiment: row.sentiment,
          mentioned: contribution.mentioned,
          position: contribution.position,
          citationProvenance: revisionId
            ? (evidence.provenanceByRevision.get(revisionId) ?? "unavailable")
            : "unavailable",
          citationCount: revisionId
            ? (evidence.citationsByRevision.get(revisionId)?.length ?? 0)
            : 0,
          referenceCount: revisionId
            ? (evidence.referencesByRevision.get(revisionId)?.length ?? 0)
            : 0,
        };
      }),
      citations: facts.filter(isEffectiveMonitoringAnswer).flatMap((fact) =>
        fact.revisionId
          ? (evidence.citationsByRevision.get(fact.revisionId) ?? []).map(
              (source) => ({
                answerId: fact.attemptId,
                runCreatedAt: fact.runCreatedAt,
                ...source,
              }),
            )
          : [],
      ),
      sources: facts.filter(isEffectiveMonitoringAnswer).flatMap((fact) =>
        fact.revisionId
          ? (evidence.referencesByRevision.get(fact.revisionId) ?? []).map(
              (source) => ({
                answerId: fact.attemptId,
                runCreatedAt: fact.runCreatedAt,
                ...source,
                isCited:
                  evidence.provenanceByRevision.get(fact.revisionId!) ===
                    "explicit" && source.isCited,
              }),
            )
          : [],
      ),
      answerCount: facts.filter(isEffectiveMonitoringAnswer).length,
    };
  }

async readMonitoringExportAnswers(
    ownerId: string,
    scope: MonitoringScope,
  ) {
    const conditions = monitoringFactConditions(ownerId, scope);
    // Select only the two URL fields, keeping full result payloads outside the
    // bounded answer export and counting both strings in its size preflight.
    const shareUrl = sql<
      string | null
    >`JSON_UNQUOTE(JSON_EXTRACT(${resultRevisions.normalizedPayload}, '$.shareUrl'))`;
    const legacyShareUrl = sql<
      string | null
    >`JSON_UNQUOTE(JSON_EXTRACT(${resultRevisions.normalizedPayload}, '$.raw.shareUrl'))`;
    return this.db.transaction(async (tx) => {
      const boundedAnswers = tx
        .select({
          projectedBytes: sql<number>`(
              ${MONITORING_ANSWER_EXPORT_ROW_OVERHEAD_BYTES}
              + OCTET_LENGTH(LEFT(${attempts.question}, ${MONITORING_ANSWER_EXPORT_CELL_READ_LENGTH}))
              + COALESCE(OCTET_LENGTH(LEFT(${attemptResults.answerMarkdown}, ${MONITORING_ANSWER_EXPORT_CELL_READ_LENGTH})), 0)
              + COALESCE(OCTET_LENGTH(LEFT(${attemptResults.reasoningMarkdown}, ${MONITORING_ANSWER_EXPORT_CELL_READ_LENGTH})), 0)
              + COALESCE(OCTET_LENGTH(CAST(${attemptResults.searchKeywords} AS CHAR CHARACTER SET utf8mb4)), 0)
              + COALESCE(OCTET_LENGTH(${shareUrl}), 0)
              + COALESCE(OCTET_LENGTH(${legacyShareUrl}), 0)
            )`.as("projected_bytes"),
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
        .leftJoin(attemptResults, eq(attemptResults.attemptId, attempts.id))
        .leftJoin(
          resultRevisions,
          eq(resultRevisions.id, attemptResults.currentRevisionId),
        )
        .where(and(...conditions))
        .limit(MONITORING_ANSWER_EXPORT_ROW_LIMIT + 1)
        .as("bounded_monitoring_export_answers");
      const [preflight] = await tx
        .select({
          rowCount: sql<number>`COUNT(*)`.mapWith(Number),
          projectedBytes:
            sql<number>`COALESCE(SUM(${boundedAnswers.projectedBytes}), 0)`.mapWith(
              Number,
            ),
        })
        .from(boundedAnswers);
      assertMonitoringAnswerExportPreflight(
        preflight?.rowCount ?? Number.NaN,
        preflight?.projectedBytes ?? Number.NaN,
      );

      const rows = await tx
        .select({
          answerId: attempts.id,
          runId: runs.id,
          runCreatedAt: runs.createdAt,
          questionId: monitorQuestions.questionId,
          questionCategory: monitorQuestions.categorySnapshot,
          question: sql<string>`LEFT(${attempts.question}, ${MONITORING_ANSWER_EXPORT_CELL_READ_LENGTH})`,
          platformId: attempts.platformId,
          platformDisplayName: platformCatalog.displayName,
          clientType: attempts.clientType,
          mode: attempts.mode,
          repetition: attempts.repetition,
          status: attempts.status,
          currentRevisionId: attemptResults.currentRevisionId,
          answerMarkdown: sql<
            string | null
          >`LEFT(${attemptResults.answerMarkdown}, ${MONITORING_ANSWER_EXPORT_CELL_READ_LENGTH})`,
          reasoningMarkdown: sql<
            string | null
          >`LEFT(${attemptResults.reasoningMarkdown}, ${MONITORING_ANSWER_EXPORT_CELL_READ_LENGTH})`,
          searchKeywords: attemptResults.searchKeywords,
          sentiment: attemptResults.sentiment,
          shareUrl,
          legacyShareUrl,
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
        .leftJoin(attemptResults, eq(attemptResults.attemptId, attempts.id))
        .leftJoin(
          resultRevisions,
          eq(resultRevisions.id, attemptResults.currentRevisionId),
        )
        .where(and(...conditions))
        .orderBy(desc(runs.createdAt), desc(attempts.id))
        .limit(MONITORING_ANSWER_EXPORT_ROW_LIMIT + 1);
      if (rows.length > MONITORING_ANSWER_EXPORT_ROW_LIMIT) {
        throw new RepositoryError(
          "INVALID_STATE",
          `Monitoring answer export exceeds the ${MONITORING_ANSWER_EXPORT_ROW_LIMIT.toLocaleString("en-US")} row limit; narrow the date or dimension filters`,
        );
      }
      return rows;
    }, MONITORING_ANSWER_EXPORT_TRANSACTION_CONFIG);
  }

async resolveMonitoringExportRun(
    ownerId: string,
    monitorId: string,
    runId?: string,
  ) {
    await this.getMonitor(ownerId, monitorId);
    const conditions = [
      monitoringChildOwnerPredicate(runs, ownerId),
      eq(runs.monitorId, monitorId),
      isNull(runs.deletedAt),
      sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${runs.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
    ];
    if (runId) conditions.push(eq(runs.id, runId));
    const [run] = await this.db
      .select({ id: runs.id })
      .from(runs)
      .where(and(...conditions))
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(1);
    if (!run)
      throw new RepositoryError("NOT_FOUND", "Monitoring run not found");
    return run.id;
  }

async readHistoricalMonitoringQuestions(
    ownerId: string,
    scope: MonitoringScope,
  ) {
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
    const detail = await this.getMonitor(ownerId, scope.monitorId);
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
    const conditions = monitoringFactConditions(ownerId, resolved.scope);
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

async listRuns(ownerId: string, monitorId: string, limit = 30) {
    const rows = await this.db
      .select({
        run: runs,
        configurationVersion: monitorVersions.version,
        effectiveAnswers: runMetrics.effectiveAnswers,
        brandMentionedAnswers: runMetrics.brandMentionedAnswers,
        averageMentionPosition: sql<
          string | null
        >`CASE WHEN ${runMetrics.mentionPositionCount} IS NULL OR ${runMetrics.mentionPositionCount} = 0 THEN NULL ELSE ${runMetrics.mentionPositionSum} / ${runMetrics.mentionPositionCount} END`,
        citationCount: runMetrics.citationCount,
        uniqueDomainCount: runMetrics.uniqueDomainCount,
        positiveCount: runMetrics.positiveCount,
        neutralCount: runMetrics.neutralCount,
        negativeCount: runMetrics.negativeCount,
        unknownCount: runMetrics.unknownCount,
        modelMetrics: runMetrics.modelMetrics,
        competitorMetrics: runMetrics.competitorMetrics,
      })
      .from(runs)
      .innerJoin(monitorVersions, eq(runs.monitorVersionId, monitorVersions.id))
      .leftJoin(runMetrics, eq(runMetrics.runId, runs.id))
      .where(
        and(
          monitoringChildOwnerPredicate(runs, ownerId),
          eq(runs.monitorId, monitorId),
          isNull(runs.deletedAt),
          sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${runs.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
        ),
      )
      .orderBy(desc(runs.createdAt))
      .limit(limit);
    return rows.map(
      ({
        run,
        configurationVersion,
        effectiveAnswers,
        brandMentionedAnswers,
        averageMentionPosition,
        citationCount,
        uniqueDomainCount,
        positiveCount,
        neutralCount,
        negativeCount,
        unknownCount,
        modelMetrics,
        competitorMetrics,
      }) => ({
        ...run,
        configurationVersion,
        metrics: {
          effectiveAnswers: Number(effectiveAnswers ?? 0),
          brandMentionedAnswers: Number(brandMentionedAnswers ?? 0),
          averageMentionPosition:
            averageMentionPosition === null
              ? null
              : Number(averageMentionPosition),
          citationCount: Number(citationCount ?? 0),
          uniqueDomainCount: Number(uniqueDomainCount ?? 0),
          positiveCount: Number(positiveCount ?? 0),
          neutralCount: Number(neutralCount ?? 0),
          negativeCount: Number(negativeCount ?? 0),
          unknownCount: Number(unknownCount ?? 0),
          modelMetrics: modelMetrics ?? [],
          competitorMetrics: competitorMetrics ?? [],
        },
      }),
    );
  }

async listDeletedRuns(ownerId: string, limit = 100) {
    return this.db
      .select({
        id: runs.id,
        monitorId: runs.monitorId,
        status: runs.status,
        deletedAt: runs.deletedAt,
        purgeAfter: runs.purgeAfter,
        createdAt: runs.createdAt,
      })
      .from(runs)
      .where(and(monitoringChildOwnerPredicate(runs, ownerId), sql`${runs.deletedAt} IS NOT NULL`))
      .orderBy(desc(runs.deletedAt))
      .limit(limit);
  }

async softDeleteRun(ownerId: string, runId: string, audit: RequestAudit) {
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 86_400_000);
    await this.db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.id, runId),
            monitoringChildOwnerPredicate(runs, ownerId),
            isNull(runs.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!run) throw new RepositoryError("NOT_FOUND", "Run not found");
      if (
        ["queued", "waiting_quota", "running", "review_required"].includes(
          run.status,
        )
      ) {
        throw new RepositoryError(
          "INVALID_STATE",
          "Cancel the active run before deleting it",
        );
      }
      await tx
        .update(runs)
        .set({ deletedAt: now, purgeAfter })
        .where(eq(runs.id, runId));
      await tx.insert(jobs).values({
        id: randomUUID(),
        type: "purge_soft_deleted",
        dedupeKey: `purge:run:${runId}`,
        payload: { entityType: "run", entityId: runId },
        availableAt: purgeAfter,
      });
      await insertAudit(tx, audit, "run.deleted", "run", runId, ownerId, {
        purgeAfter: purgeAfter.toISOString(),
      });
    });
  }

async restoreRun(ownerId: string, runId: string, audit: RequestAudit) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.id, runId),
            monitoringChildOwnerPredicate(runs, ownerId),
            sql`${runs.deletedAt} IS NOT NULL`,
          ),
        )
        .for("update")
        .limit(1);
      if (!run || (run.purgeAfter && run.purgeAfter <= now))
        throw new RepositoryError("NOT_FOUND", "Restorable run not found");
      const [monitor] = await tx
        .select({ id: monitors.id })
        .from(monitors)
        .where(
          and(
            eq(monitors.id, run.monitorId),
            monitoringChildOwnerPredicate(monitors, ownerId),
            isNull(monitors.deletedAt),
          ),
        )
        .limit(1);
      if (!monitor)
        throw new RepositoryError(
          "INVALID_STATE",
          "Restore the parent monitor first",
        );
      await tx
        .update(runs)
        .set({ deletedAt: null, purgeAfter: null })
        .where(eq(runs.id, runId));
      await tx.delete(jobs).where(eq(jobs.dedupeKey, `purge:run:${runId}`));
      await insertAudit(tx, audit, "run.restored", "run", runId, ownerId, {});
    });
  }

async getRun(ownerId: string, runId: string) {
    const [run] = await this.db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.id, runId),
          monitoringChildOwnerPredicate(runs, ownerId),
          isNull(runs.deletedAt),
          sql`EXISTS (SELECT 1 FROM projects p WHERE p.id = ${runs.projectId} AND p.owner_id = ${ownerId} AND p.deleted_at IS NULL)`,
        ),
      )
      .limit(1);
    if (!run) throw new RepositoryError("NOT_FOUND", "Run not found");
    const attemptRows = await this.db
      .select({
        attempt: attempts,
        result: attemptResults,
        normalizedPayload: resultRevisions.normalizedPayload,
        revisionCreatedAt: resultRevisions.createdAt,
      })
      .from(attempts)
      .leftJoin(attemptResults, eq(attempts.id, attemptResults.attemptId))
      .leftJoin(
        resultRevisions,
        eq(attemptResults.currentRevisionId, resultRevisions.id),
      )
      .where(eq(attempts.runId, runId))
      .orderBy(
        asc(attempts.monitorQuestionOrdinal),
        asc(attempts.monitorPlatformOrdinal),
        asc(attempts.repetition),
      );
    const revisionIds = attemptRows.flatMap((row) =>
      row.result ? [row.result.currentRevisionId] : [],
    );
    const [sources, persistedDiscoveredSources, mediaRows] =
      revisionIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            this.db
              .select()
              .from(resultSources)
              .where(inArray(resultSources.revisionId, revisionIds))
              .orderBy(asc(resultSources.ordinal)),
            this.db
              .select()
              .from(resultDiscoveredSources)
              .where(inArray(resultDiscoveredSources.revisionId, revisionIds))
              .orderBy(asc(resultDiscoveredSources.ordinal)),
            this.db
              .select()
              .from(resultMedia)
              .where(inArray(resultMedia.revisionId, revisionIds))
              .orderBy(asc(resultMedia.ordinal)),
          ]);
    const sourceRevisionIds = new Set(
      sources.map((source) => source.revisionId),
    );
    const citationProvenanceByRevision = new Map<string, CitationProvenance>();
    for (const row of attemptRows) {
      if (!row.result) continue;
      citationProvenanceByRevision.set(
        row.result.currentRevisionId,
        inferCitationProvenance(
          row.normalizedPayload,
          sourceRevisionIds.has(row.result.currentRevisionId),
        ),
      );
    }
    const persistedRevisionIds = new Set(
      persistedDiscoveredSources.map((source) => source.revisionId),
    );
    const fallbackDiscoveredSources = attemptRows.flatMap((row) => {
      if (
        !row.result ||
        persistedRevisionIds.has(row.result.currentRevisionId)
      ) {
        return [];
      }
      return discoveredSourcesFromNormalizedPayload({
        revisionId: row.result.currentRevisionId,
        payload: row.normalizedPayload,
        citationProvenance:
          citationProvenanceByRevision.get(row.result.currentRevisionId) ??
          "unavailable",
        createdAt: row.revisionCreatedAt ?? row.result.createdAt,
      });
    });
    const discoveredSources = orderDiscoveredSourcesByAttempt(attemptRows, [
      ...persistedDiscoveredSources,
      ...fallbackDiscoveredSources,
    ]);
    const discoveredByCanonicalUrl = new Map(
      discoveredSources.map((source) => [
        `${source.revisionId}:${sha256(canonicalUrl(source.url))}`,
        source,
      ]),
    );
    const [version] = await this.db
      .select()
      .from(monitorVersions)
      .where(eq(monitorVersions.id, run.monitorVersionId))
      .limit(1);
    const [brand] = await this.db
      .select()
      .from(projectBrandVersions)
      .where(eq(projectBrandVersions.id, run.projectBrandVersionId))
      .limit(1);
    if (!version || !brand)
      throw new RepositoryError(
        "NOT_FOUND",
        "Run configuration snapshot not found",
      );
    const [questionRows, platformRows] = await Promise.all([
      this.db
        .select()
        .from(monitorQuestions)
        .where(eq(monitorQuestions.monitorVersionId, version.id))
        .orderBy(asc(monitorQuestions.ordinal)),
      this.db
        .select({
          monitorVersionId: monitorPlatforms.monitorVersionId,
          ordinal: monitorPlatforms.ordinal,
          platformId: monitorPlatforms.platformId,
          providerCodeSnapshot: monitorPlatforms.providerCodeSnapshot,
          clientType: monitorPlatforms.clientType,
          mode: monitorPlatforms.mode,
          screenshot: monitorPlatforms.screenshot,
          regionCode: monitorPlatforms.regionCode,
          displayName: platformCatalog.displayName,
        })
        .from(monitorPlatforms)
        .leftJoin(
          platformCatalog,
          eq(monitorPlatforms.platformId, platformCatalog.id),
        )
        .where(eq(monitorPlatforms.monitorVersionId, version.id))
        .orderBy(asc(monitorPlatforms.ordinal)),
    ]);
    return {
      run,
      attempts: attemptRows.map(({ attempt, result, normalizedPayload }) => ({
        attempt: {
          id: attempt.id,
          monitorQuestionOrdinal: attempt.monitorQuestionOrdinal,
          monitorPlatformOrdinal: attempt.monitorPlatformOrdinal,
          repetition: attempt.repetition,
          question: attempt.question,
          platformId: attempt.platformId,
          providerCode: attempt.providerCode,
          clientType: attempt.clientType,
          mode: attempt.mode,
          screenshot: attempt.screenshot,
          regionCode: attempt.regionCode,
          status: attempt.status,
          errorMessage: attempt.errorMessage,
          submittedAt: attempt.submittedAt,
          terminalAt: attempt.terminalAt,
          createdAt: attempt.createdAt,
          updatedAt: attempt.updatedAt,
        },
        result: result
          ? {
              attemptId: result.attemptId,
              currentRevisionId: result.currentRevisionId,
              revision: result.revision,
              answerMarkdown: result.answerMarkdown,
              shareUrl: monitoringAnswerShareUrl(normalizedPayload),
              reasoningMarkdown: result.reasoningMarkdown,
              searchKeywords: result.searchKeywords,
              sentiment: result.sentiment,
              brandMentioned: result.brandMentioned,
              mentionPosition: result.mentionPosition,
              competitorRankings: result.competitorRankings,
              keywordEvaluations: safeKeywordEvaluations(
                result.keywordEvaluations,
              ),
              citationProvenance:
                citationProvenanceByRevision.get(result.currentRevisionId) ??
                inferCitationProvenance(
                  normalizedPayload,
                  sourceRevisionIds.has(result.currentRevisionId),
                ),
              categoryRanking: result.categoryRanking,
              createdAt: result.createdAt,
              updatedAt: result.updatedAt,
            }
          : null,
      })),
      sources: sources.map((source) => {
        const discovered = discoveredByCanonicalUrl.get(
          `${source.revisionId}:${source.canonicalUrlHash}`,
        );
        const citationProvenance =
          citationProvenanceByRevision.get(source.revisionId) ??
          "legacy_assumed";
        return {
          id: source.id,
          revisionId: source.revisionId,
          ordinal: source.ordinal,
          providerPosition:
            citationProvenance === "legacy_assumed"
              ? null
              : (source.providerPosition ??
                discovered?.providerPosition ??
                null),
          url: source.url,
          title: source.title || discovered?.title || "",
          domain: discovered?.domain || source.domain,
          siteName: discovered?.siteName ?? null,
          summary: discovered?.summary ?? null,
          publishedAt: discovered?.publishedAt ?? null,
          citationProvenance,
          citedText: source.citedText,
          createdAt: source.createdAt,
        };
      }),
      discoveredSources: discoveredSources.map((source) => {
        const citationProvenance =
          citationProvenanceByRevision.get(source.revisionId) ??
          "legacy_assumed";
        return {
          id: source.id,
          revisionId: source.revisionId,
          ordinal: source.ordinal,
          providerPosition:
            citationProvenance === "legacy_assumed"
              ? null
              : (source.providerPosition ?? null),
          url: source.url,
          title: source.title,
          domain: source.domain,
          siteName: source.siteName,
          summary: source.summary,
          publishedAt: source.publishedAt,
          citationProvenance,
          isCited: citationProvenance === "explicit" && source.isCited,
          createdAt: source.createdAt,
        };
      }),
      media: mediaRows.map((media) => ({
        id: media.id,
        revisionId: media.revisionId,
        type: media.type,
        ordinal: media.ordinal,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        archiveStatus: media.archiveStatus,
        accessPath:
          media.archiveStatus === "archived"
            ? `/api/monitoring/media/${media.id}`
            : null,
        thumbnailAccessPath:
          media.archiveStatus === "archived" && media.thumbnailObjectKey
            ? `/api/monitoring/media/${media.id}?variant=thumbnail`
            : null,
      })),
      configuration: {
        version,
        brand,
        questions: questionRows,
        platforms: platformRows,
      },
    };
  }

async getRunExportData(ownerId: string, runId: string) {
    const detail = await this.getRun(ownerId, runId);
    const billing = await this.db
      .select({
        attemptId: attempts.id,
        quotedTenThousandths: attemptPriceSnapshots.amountTenThousandths,
        settlementStatus: attemptMoneySettlements.status,
        settledTenThousandths: attemptMoneySettlements.settledTenThousandths,
        currency: attemptPriceSnapshots.currency,
      })
      .from(attempts)
      .innerJoin(
        attemptPriceSnapshots,
        eq(attemptPriceSnapshots.attemptId, attempts.id),
      )
      .innerJoin(
        attemptMoneySettlements,
        eq(attemptMoneySettlements.attemptId, attempts.id),
      )
      .where(eq(attempts.runId, runId));
    if (billing.some((row) => row.currency !== "CNY"))
      throw new RepositoryError(
        "INVALID_STATE",
        "Run billing snapshot currency is invalid",
      );
    return {
      ...detail,
      attempts: detail.attempts.map((row) => ({
        ...row,
        questionCategory:
          detail.configuration.questions.find(
            (question) =>
              question.ordinal === row.attempt.monitorQuestionOrdinal,
          )?.categorySnapshot ?? null,
        shareUrl: row.result?.shareUrl ?? null,
      })),
      version: detail.configuration.version,
      brand: detail.configuration.brand,
      questionRows: detail.configuration.questions,
      platformRows: detail.configuration.platforms,
      billing: billing.map((row) => ({
        attemptId: row.attemptId,
        quotedTenThousandths: row.quotedTenThousandths.toString(),
        settlementStatus: row.settlementStatus,
        settledTenThousandths: row.settledTenThousandths.toString(),
        currency: "CNY" as const,
      })),
    };
  }

async getRunForAdmin(runId: string, audit: RequestAudit) {
    const [run] = await this.db
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
    if (!run) throw new RepositoryError("NOT_FOUND", "Run not found");
    await this.writeAudit(
      audit,
      "admin.content_viewed",
      "run",
      runId,
      run.ownerId,
      {},
    );
    return this.getRun(run.ownerId, runId);
  }

async getMediaForOwner(ownerId: string, mediaId: string) {
    const [row] = await this.db
      .select({
        media: resultMedia,
        attemptId: attempts.id,
        runId: runs.id,
        ownerId: runs.ownerId,
      })
      .from(resultMedia)
      .innerJoin(
        resultRevisions,
        eq(resultMedia.revisionId, resultRevisions.id),
      )
      .innerJoin(attempts, eq(resultRevisions.attemptId, attempts.id))
      .innerJoin(runs, eq(attempts.runId, runs.id))
      .innerJoin(projects, eq(runs.projectId, projects.id))
      .where(
        and(
          eq(resultMedia.id, mediaId),
          monitoringChildOwnerPredicate(runs, ownerId),
          isNull(runs.deletedAt),
          monitoringProjectOwnerPredicate(projects, ownerId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new RepositoryError("NOT_FOUND", "Media not found");
    return row;
  }

async getMediaForAdmin(mediaId: string, audit: RequestAudit) {
    const [row] = await this.db
      .select({ ownerId: runs.ownerId })
      .from(resultMedia)
      .innerJoin(
        resultRevisions,
        eq(resultMedia.revisionId, resultRevisions.id),
      )
      .innerJoin(attempts, eq(resultRevisions.attemptId, attempts.id))
      .innerJoin(runs, eq(attempts.runId, runs.id))
      .where(eq(resultMedia.id, mediaId))
      .limit(1);
    if (!row) throw new RepositoryError("NOT_FOUND", "Media not found");
    await this.writeAudit(
      audit,
      "admin.media_viewed",
      "media",
      mediaId,
      row.ownerId,
      {},
    );
    return this.getMediaForOwner(row.ownerId, mediaId);
  }

async listRegions(scope?: "domestic" | "overseas") {
    return this.db
      .select()
      .from(providerRegions)
      .where(scope ? eq(providerRegions.scope, scope) : undefined)
      .orderBy(asc(providerRegions.scope), asc(providerRegions.name));
  }

async enqueueProviderCatalogSync(audit: RequestAudit) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .insert(jobs)
        .values({
          id: randomUUID(),
          type: "sync_provider_catalog",
          dedupeKey: "admin:sync-provider-catalog",
          payload: { requestedBy: audit.actorId },
          availableAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            status: "ready",
            availableAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            attempts: 0,
            completedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
      await insertAudit(
        tx,
        audit,
        "admin.platform_sync_requested",
        "provider",
        null,
        null,
        {},
      );
    });
  }

async getAdminOverview(observedAt = new Date()) {
    const [
      jobCounts,
      runCounts,
      costSummary,
      reconciliation,
      heartbeats,
      submissionUnknown,
      mediaArchiveFailures,
      recentDeadJobs,
    ] = await Promise.all([
      this.db
        .select({ status: jobs.status, count: sql<number>`COUNT(*)` })
        .from(jobs)
        .groupBy(jobs.status),
      this.db
        .select({ status: runs.status, count: sql<number>`COUNT(*)` })
        .from(runs)
        .where(isNull(runs.deletedAt))
        .groupBy(runs.status),
      this.db
        .select({
          totalAmount: sql<string>`COALESCE(SUM(${providerCosts.amount}), 0)`,
          unreconciled: sql<number>`SUM(CASE WHEN ${providerCosts.reconciledAt} IS NULL THEN 1 ELSE 0 END)`,
        })
        .from(providerCosts),
      this.db
        .select()
        .from(providerReconciliationState)
        .where(eq(providerReconciliationState.id, "moli"))
        .limit(1),
      this.db
        .select()
        .from(workerHeartbeats)
        .orderBy(desc(workerHeartbeats.heartbeatAt))
        .limit(20),
      this.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(attempts)
        .where(eq(attempts.status, "submission_unknown")),
      this.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(resultMedia)
        .where(eq(resultMedia.archiveStatus, "failed")),
      this.db
        .select({
          id: jobs.id,
          type: jobs.type,
          lastErrorCode: jobs.lastErrorCode,
          lastErrorMessage: jobs.lastErrorMessage,
          updatedAt: jobs.updatedAt,
        })
        .from(jobs)
        .where(eq(jobs.status, "dead"))
        .orderBy(desc(jobs.updatedAt))
        .limit(20),
    ]);
    const [oldestReady] = await this.db
      .select({ availableAt: jobs.availableAt })
      .from(jobs)
      .where(inArray(jobs.status, ["ready", "retry_wait"]))
      .orderBy(asc(jobs.availableAt))
      .limit(1);
    const latestHeartbeatAt = heartbeats[0]?.heartbeatAt ?? null;
    const executionService = executionServiceHealth(
      latestHeartbeatAt,
      observedAt,
    );
    const latestAuthenticationFailureAt = recentDeadJobs.reduce<Date | null>(
      (latest, job) => {
        if (
          !/auth|unauthorized|401|403|token/iu.test(
            `${job.lastErrorCode ?? ""} ${job.lastErrorMessage ?? ""}`,
          )
        ) {
          return latest;
        }
        return !latest || job.updatedAt > latest ? job.updatedAt : latest;
      },
      null,
    );
    const verifiedAt = reconciliation[0]?.reconciledAt ?? null;
    return {
      jobs: Object.fromEntries(
        jobCounts.map((row) => [row.status, Number(row.count)]),
      ),
      runs: Object.fromEntries(
        runCounts.map((row) => [row.status, Number(row.count)]),
      ),
      oldestReadyAt: oldestReady?.availableAt ?? null,
      providerCost: costSummary[0] ?? { totalAmount: "0", unreconciled: 0 },
      provider: reconciliation[0] ?? null,
      workers: heartbeats,
      executionService,
      providerAuthentication: providerAuthenticationHealth(
        executionService.status,
        verifiedAt,
        latestAuthenticationFailureAt,
      ),
      submissionUnknownCount: Number(submissionUnknown[0]?.count ?? 0),
      mediaArchiveFailureCount: Number(mediaArchiveFailures[0]?.count ?? 0),
      recentDeadJobs,
    };
  }

async listProviderCosts(limit = 100) {
    return this.db
      .select()
      .from(providerCosts)
      .orderBy(desc(providerCosts.occurredAt))
      .limit(limit);
  }

async enqueueProviderCallback(
    providerTaskId: string,
    _callbackMetadata: Record<string, unknown>,
  ) {
    const providerTaskHash = sha256(providerTaskId);
    const [tombstone] = await this.db
      .select({ hash: providerTaskTombstones.providerTaskHash })
      .from(providerTaskTombstones)
      .where(eq(providerTaskTombstones.providerTaskHash, providerTaskHash))
      .limit(1);
    if (tombstone) return { accepted: false, discarded: true };
    const [attempt] = await this.db
      .select({ id: attempts.id })
      .from(attempts)
      .where(eq(attempts.providerTaskId, providerTaskId))
      .limit(1);
    if (!attempt) return { accepted: false, discarded: true };
    const availableAt = new Date();
    await this.db
      .insert(jobs)
      .values({
        id: randomUUID(),
        type: "poll_attempt",
        dedupeKey: pollAttemptJobDedupeKey(attempt.id),
        payload: { attemptId: attempt.id },
        availableAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          status: "ready",
          availableAt,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
    return { accepted: true, discarded: false };
  }
}

const monitoringExportSections = [
  "overview",
  "answers",
  "metrics",
  "trends",
  "competitors",
  "citations",
  "sources",
] as const;

type MonitoringExportSection = (typeof monitoringExportSections)[number];

const MONITORING_ANSWER_EXPORT_ROW_LIMIT = 10_000 as const;

const MONITORING_ANSWER_EXPORT_PROJECTED_BYTE_LIMIT = 32 * 1_024 * 1_024;

const MONITORING_ANSWER_EXPORT_CELL_READ_LENGTH = 32_001 as const;

const MONITORING_ANSWER_EXPORT_ROW_OVERHEAD_BYTES = 512 as const;

const MONITORING_ANSWER_EXPORT_TRANSACTION_CONFIG = {
  isolationLevel: "repeatable read",
  withConsistentSnapshot: true,
} as const;

function assertMonitoringAnswerExportPreflight(
  rowCount: number,
  projectedBytes: number,
) {
  if (
    !Number.isSafeInteger(rowCount) ||
    rowCount < 0 ||
    !Number.isSafeInteger(projectedBytes) ||
    projectedBytes < 0
  ) {
    throw new RepositoryError(
      "INVALID_STATE",
      "Monitoring answer export size could not be measured safely",
    );
  }
  if (rowCount > MONITORING_ANSWER_EXPORT_ROW_LIMIT) {
    throw new RepositoryError(
      "INVALID_STATE",
      `Monitoring answer export exceeds the ${MONITORING_ANSWER_EXPORT_ROW_LIMIT.toLocaleString("en-US")} row limit; narrow the date or dimension filters`,
    );
  }
  if (projectedBytes > MONITORING_ANSWER_EXPORT_PROJECTED_BYTE_LIMIT) {
    throw new RepositoryError(
      "INVALID_STATE",
      "Monitoring answer export exceeds the 32 MiB projected payload limit; narrow the date or dimension filters",
    );
  }
}

function pollAttemptJobDedupeKey(attemptId: string): string {
  return `poll:${attemptId}`;
}

const EXECUTION_SERVICE_HEARTBEAT_THRESHOLD_SECONDS = 90 as const;

function executionServiceHealth(
  lastHeartbeatAt: Date | null,
  observedAt = new Date(),
) {
  if (!lastHeartbeatAt) {
    return {
      status: "never_seen" as const,
      lastHeartbeatAt: null,
      observedAt,
      ageSeconds: null,
      thresholdSeconds: EXECUTION_SERVICE_HEARTBEAT_THRESHOLD_SECONDS,
    };
  }
  const ageMilliseconds = Math.max(
    0,
    observedAt.getTime() - lastHeartbeatAt.getTime(),
  );
  return {
    status:
      ageMilliseconds <= EXECUTION_SERVICE_HEARTBEAT_THRESHOLD_SECONDS * 1_000
        ? ("online" as const)
        : ("offline" as const),
    lastHeartbeatAt,
    observedAt,
    ageSeconds: Math.floor(ageMilliseconds / 1_000),
    thresholdSeconds: EXECUTION_SERVICE_HEARTBEAT_THRESHOLD_SECONDS,
  };
}

function providerAuthenticationHealth(
  executionServiceStatus: "online" | "offline" | "never_seen",
  verifiedAt: Date | null,
  failedAt: Date | null,
) {
  if (executionServiceStatus !== "online") {
    return { status: "unknown" as const, verifiedAt, failedAt };
  }
  if (failedAt && (!verifiedAt || failedAt > verifiedAt)) {
    return { status: "unhealthy" as const, verifiedAt, failedAt };
  }
  if (verifiedAt) {
    return { status: "healthy" as const, verifiedAt, failedAt };
  }
  return { status: "unknown" as const, verifiedAt, failedAt };
}

async function findRunByIdempotencyKey(
  tx: Transaction,
  ownerId: string,
  idempotencyKey: string,
  forUpdate = false,
) {
  const condition = and(
    monitoringChildOwnerPredicate(runs, ownerId),
    eq(runs.idempotencyKey, idempotencyKey),
  );
  if (forUpdate) {
    const [run] = await tx
      .select()
      .from(runs)
      .where(condition)
      .for("update")
      .limit(1);
    return run ?? null;
  }
  const [run] = await tx.select().from(runs).where(condition).limit(1);
  return run ?? null;
}

async function insertVersionChildren(
  tx: Transaction,
  projectId: string,
  ownerId: string,
  versionId: string,
  configuration: MonitorConfiguration,
) {
  const categorySnapshots: Record<string, MonitoringQuestionCategory> =
    Object.create(null);
  for (const [ordinal, question] of configuration.questions.entries()) {
    const normalizedHash = sha256(question.trim());
    let [row] = await tx
      .select()
      .from(projectQuestions)
      .where(
        and(
          eq(projectQuestions.projectId, projectId),
          eq(projectQuestions.normalizedHash, normalizedHash),
        ),
      )
      .limit(1);
    const explicitCategory =
      configuration.questionCategories &&
      Object.prototype.hasOwnProperty.call(
        configuration.questionCategories,
        question,
      )
        ? configuration.questionCategories[question]
        : undefined;
    const category = explicitCategory ?? row?.category ?? null;
    if (category) categorySnapshots[question] = category;
    if (!row) {
      const questionId = randomUUID();
      await tx.insert(projectQuestions).values({
        id: questionId,
        projectId,
        normalizedHash,
        question,
        category,
        createdBy: ownerId,
      });
      [row] = await tx
        .select()
        .from(projectQuestions)
        .where(eq(projectQuestions.id, questionId))
        .limit(1);
    }
    if (!row)
      throw new RepositoryError("INVALID_STATE", "Question creation failed");
    if (explicitCategory !== undefined && row.category !== explicitCategory) {
      await tx
        .update(projectQuestions)
        .set({ category: explicitCategory })
        .where(eq(projectQuestions.id, row.id));
    }
    await tx.insert(monitorQuestions).values({
      monitorVersionId: versionId,
      ordinal,
      questionId: row.id,
      questionSnapshot: question,
      categorySnapshot: category,
    });
  }
  await tx.insert(monitorPlatforms).values(
    configuration.platforms.map((platform, ordinal) => ({
      monitorVersionId: versionId,
      ordinal,
      platformId: platform.platformId,
      providerCodeSnapshot: platform.providerCode,
      clientType: platform.clientType,
      mode: platform.mode,
      screenshot: platform.screenshot,
      regionCode: platform.clientType === "mobile" ? null : platform.regionCode,
    })),
  );
  // Hash the category values actually persisted on this new version, including
  // inherited project categories. Older immutable versions are never changed.
  await tx
    .update(monitorVersions)
    .set({
      configurationHash: monitorConfigurationSnapshotHash(
        configuration,
        categorySnapshots,
      ),
    })
    .where(eq(monitorVersions.id, versionId));
}

function monitorConfigurationSnapshotHash(
  configuration: object,
  categories: Record<string, MonitoringQuestionCategory>,
) {
  const snapshot: Record<string, unknown> = { ...configuration };
  if (Object.keys(categories).length) snapshot.questionCategories = categories;
  else delete snapshot.questionCategories;
  return sha256(stableJson(snapshot));
}

async function validatePlatforms(
  tx: Transaction,
  configuration: Pick<MonitorConfiguration, "platforms">,
  options?: {
    acceptanceProbeFingerprints: ReadonlyMap<string, string>;
  },
) {
  const ids = configuration.platforms.map((platform) => platform.platformId);
  const regionCodes = uniqueTrimmed(
    configuration.platforms.flatMap((platform) =>
      platform.regionCode ? [platform.regionCode] : [],
    ),
  );
  const [rows, regionRows, acceptanceRows] = await Promise.all([
    tx.select().from(platformCatalog).where(inArray(platformCatalog.id, ids)),
    regionCodes.length > 0
      ? tx
          .select()
          .from(providerRegions)
          .where(inArray(providerRegions.code, regionCodes))
      : Promise.resolve([]),
    tx
      .select({
        platformId: platformAcceptanceChecks.platformId,
        platformFingerprint: platformAcceptanceChecks.platformFingerprint,
        dimension: platformAcceptanceChecks.dimension,
      })
      .from(platformAcceptanceChecks)
      .where(
        and(
          inArray(platformAcceptanceChecks.platformId, ids),
          eq(platformAcceptanceChecks.status, "passed"),
        ),
      ),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const regionScopes = new Map<string, Set<"domestic" | "overseas">>();
  for (const region of regionRows) {
    const scopes =
      regionScopes.get(region.code) ?? new Set<"domestic" | "overseas">();
    scopes.add(region.scope);
    regionScopes.set(region.code, scopes);
  }
  for (const selected of configuration.platforms) {
    const platform = byId.get(selected.platformId);
    const acceptanceProbeFingerprint = options
      ? options.acceptanceProbeFingerprints.get(selected.platformId)
      : undefined;
    const blocker = currentPlatformSelectionBlocker({
      platform,
      selection: selected,
      acceptanceEvidence: acceptanceRows,
      regionScopes: selected.regionCode
        ? regionScopes.get(selected.regionCode)
        : undefined,
      ...(options ? { acceptanceProbeFingerprint } : {}),
    });
    if (blocker) throw new RepositoryError("INVALID_STATE", blocker);
  }
}

type CurrentPlatform = Pick<
  typeof platformCatalog.$inferSelect,
  | "id"
  | "providerCode"
  | "displayName"
  | "clientType"
  | "enabled"
  | "verified"
  | "supportsReasoning"
  | "supportsScreenshot"
  | "supportsDomesticRegion"
  | "supportsOverseasRegion"
  | "acceptanceRequired"
  | "acceptanceFingerprint"
  | "providerMetadata"
>;

type CurrentPlatformSelection = MonitorConfiguration["platforms"][number];

type CurrentPlatformAcceptanceEvidence = {
  platformId: string;
  platformFingerprint: string;
  dimension: PlatformAcceptanceDimension;
};

function currentPlatformReasoningSupport(
  platform: Pick<
    CurrentPlatform,
    | "id"
    | "providerCode"
    | "clientType"
    | "providerMetadata"
    | "acceptanceFingerprint"
  >,
  passedEvidence: readonly CurrentPlatformAcceptanceEvidence[],
) {
  const currentFingerprint =
    platform.acceptanceFingerprint ?? platformAcceptanceFingerprint(platform);
  return moliEffectiveReasoningSupport(
    platform.providerCode,
    passedEvidence.some(
      (check) =>
        check.platformId === platform.id &&
        check.platformFingerprint === currentFingerprint &&
        check.dimension === "reasoning_search",
    ),
  );
}

function currentPlatformSelectionBlocker(input: {
  platform: CurrentPlatform | undefined;
  selection: CurrentPlatformSelection;
  acceptanceEvidence: readonly CurrentPlatformAcceptanceEvidence[];
  regionScopes?: ReadonlySet<"domestic" | "overseas">;
  acceptanceProbeFingerprint?: string;
}): string | null {
  const { platform, selection } = input;
  if (!platform) {
    return `Platform ${selection.providerCode} is not available`;
  }
  if (
    platform.providerCode !== selection.providerCode ||
    platform.clientType !== selection.clientType
  ) {
    return `Platform ${selection.providerCode} does not match the catalog`;
  }
  if (selection.clientType === "mobile" && selection.regionCode !== null) {
    return "Mobile platforms cannot use a region override";
  }
  const regionResolution = selection.regionCode
    ? singleRegionScope(selection.regionCode, input.regionScopes)
    : { scope: null };
  if (regionResolution.error) return regionResolution.error;
  const selectedRegionScope = regionResolution.scope;

  if (input.acceptanceProbeFingerprint !== undefined) {
    const currentFingerprint =
      platform.acceptanceFingerprint ?? platformAcceptanceFingerprint(platform);
    return currentFingerprint === input.acceptanceProbeFingerprint
      ? null
      : `${platform.displayName} catalog changed after the acceptance quote`;
  }

  // Catalog enablement and per-dimension acceptance evidence no longer gate
  // customer selections: the operator opened the full provider catalog
  // (2026-09). Real capability mismatches below still fail closed. Screenshot
  // policy 0/1/2 is accepted by the vendor submit API for every model, so the
  // stored value is validated (0|1|2) upstream and never blocked here.
  if (selection.mode === "reasoning_search") {
    const reasoningSupport = currentPlatformReasoningSupport(
      platform,
      input.acceptanceEvidence,
    );
    if (reasoningSupport === "unsupported") {
      return `${platform.displayName} 暂不支持深度思考，请关闭深度思考或取消选择该平台`;
    }
    if (reasoningSupport === "unknown") {
      return `${platform.displayName} 的深度思考能力待确认，请关闭深度思考或取消选择该平台`;
    }
  }
  if (selectedRegionScope === "domestic" && !platform.supportsDomesticRegion) {
    return `${platform.displayName} does not support the selected region`;
  }
  if (selectedRegionScope === "overseas" && !platform.supportsOverseasRegion) {
    return `${platform.displayName} does not support the selected region`;
  }
  return null;
}

function singleRegionScope(
  regionCode: string,
  scopes: ReadonlySet<"domestic" | "overseas"> | undefined,
): {
  scope: "domestic" | "overseas" | null;
  error?: string;
} {
  if (!scopes || scopes.size === 0) {
    return { scope: null, error: `Region ${regionCode} is not available` };
  }
  if (scopes.size !== 1) {
    return {
      scope: null,
      error: `Region ${regionCode} has an ambiguous scope`,
    };
  }
  return { scope: scopes.has("domestic") ? "domestic" : "overseas" };
}

function monitoringScreenshotPolicy(value: number): 0 | 1 | 2 {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new RepositoryError(
    "INVALID_STATE",
    "Monitor configuration contains an invalid screenshot policy",
  );
}

async function enqueueNextSerializedRun(
  tx: Transaction,
  monitorId: string,
  completedRunId: string,
  availableAt: Date,
) {
  const [nextRun] = await tx
    .select({ id: runs.id })
    .from(runs)
    .leftJoin(
      scheduleOccurrences,
      eq(runs.scheduleOccurrenceId, scheduleOccurrences.id),
    )
    .where(
      and(
        eq(runs.monitorId, monitorId),
        eq(runs.status, "queued"),
        isNull(runs.deletedAt),
        sql`${runs.id} <> ${completedRunId}`,
      ),
    )
    .orderBy(
      asc(
        sql`COALESCE(${scheduleOccurrences.scheduledFor}, ${runs.createdAt})`,
      ),
      asc(runs.createdAt),
      asc(runs.id),
    )
    .limit(1);
  if (!nextRun) return;
  const queuedAttempts = await tx
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.runId, nextRun.id), eq(attempts.status, "queued")));
  for (const attempt of queuedAttempts) {
    await tx
      .insert(jobs)
      .values({
        id: randomUUID(),
        type: "submit_attempt",
        dedupeKey: `submit:${attempt.id}`,
        payload: { attemptId: attempt.id },
        availableAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          status: "ready",
          availableAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: null,
        },
      });
  }
}

function orderDiscoveredSourcesByAttempt(
  attemptRows: ReadonlyArray<{
    result: { currentRevisionId: string } | null;
  }>,
  sources: readonly DiscoveredSourceRow[],
): DiscoveredSourceRow[] {
  const byRevision = new Map<string, DiscoveredSourceRow[]>();
  for (const source of sources) {
    const group = byRevision.get(source.revisionId) ?? [];
    group.push(source);
    byRevision.set(source.revisionId, group);
  }
  for (const group of byRevision.values()) {
    group.sort((left, right) => left.ordinal - right.ordinal);
  }
  return attemptRows.flatMap((row) =>
    row.result ? (byRevision.get(row.result.currentRevisionId) ?? []) : [],
  );
}

function inferCitationProvenance(
  payload: Record<string, unknown> | null,
  hasStoredSources: boolean,
): CitationProvenance {
  const direct = payload?.citationProvenance;
  if (
    direct === "explicit" ||
    direct === "legacy_assumed" ||
    direct === "unavailable"
  ) {
    return direct;
  }

  // Pre-provenance revisions retained the original provider result under raw.
  // Only an actual citationList array proves that the old normalizer used the
  // explicit list. A malformed field is no stronger than a missing field;
  // otherwise persisted result_sources were legacy fallback assumptions and
  // must not be presented as authoritative citations.
  const raw = payload?.raw;
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Array.isArray((raw as Record<string, unknown>).citationList)
  ) {
    return "explicit";
  }
  return hasStoredSources ? "legacy_assumed" : "unavailable";
}

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeCompetitors(
  values: ReadonlyArray<{ name: string; aliases: string[] }>,
) {
  const seen = new Set<string>();
  return values.flatMap((competitor) => {
    const name = competitor.name.trim();
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [{ name, aliases: uniqueTrimmed(competitor.aliases) }];
  });
}

function computeNextRunAt(
  schedule: {
    type: "none" | "daily" | "weekly";
    timezone: string;
    localTime: string;
    weekday: number | null;
  },
  after: Date,
): Date | null {
  if (schedule.type === "none") return null;
  const [hourText, minuteText] = schedule.localTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const local = zonedParts(after, schedule.timezone);
  let date = { year: local.year, month: local.month, day: local.day };
  if (schedule.type === "weekly") {
    if (schedule.weekday === null)
      throw new RepositoryError(
        "INVALID_STATE",
        "Weekly schedule requires a weekday",
      );
    const currentWeekday = local.weekday;
    const delta = (schedule.weekday - currentWeekday + 7) % 7;
    date = addCalendarDays(date, delta);
  }
  let candidate = zonedDateTimeToUtc(
    { ...date, hour, minute },
    schedule.timezone,
  );
  if (candidate.getTime() <= after.getTime()) {
    candidate = zonedDateTimeToUtc(
      {
        ...addCalendarDays(date, schedule.type === "daily" ? 1 : 7),
        hour,
        minute,
      },
      schedule.timezone,
    );
  }
  return candidate;
}

function addCalendarDays(
  date: { year: number; month: number; day: number },
  days: number,
) {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

function zonedDateTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  },
  timezone: string,
) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
    0,
  );
  let guess = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedParts(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      0,
      0,
    );
    const correction = target - actualAsUtc;
    if (correction === 0) break;
    guess += correction;
  }
  return new Date(guess);
}
return {ProgressRepository, uniqueTrimmed, monitoringExportSections, MONITORING_ANSWER_EXPORT_ROW_LIMIT, MONITORING_ANSWER_EXPORT_PROJECTED_BYTE_LIMIT, MONITORING_ANSWER_EXPORT_CELL_READ_LENGTH, MONITORING_ANSWER_EXPORT_ROW_OVERHEAD_BYTES, MONITORING_ANSWER_EXPORT_TRANSACTION_CONFIG, assertMonitoringAnswerExportPreflight, pollAttemptJobDedupeKey, EXECUTION_SERVICE_HEARTBEAT_THRESHOLD_SECONDS, executionServiceHealth, providerAuthenticationHealth, currentPlatformSelectionBlocker, inferCitationProvenance, computeNextRunAt, monitoringFactConditions: (ownerId: string, scope: MonitoringScope & {questionIds?:string[];platformIds?:string[]}) => progressMonitoringFactConditions(ownerId, scope, {tables, monitoringChildOwnerPredicate,monitoringProjectOwnerPredicate})};
}
