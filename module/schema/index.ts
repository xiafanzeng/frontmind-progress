import { sql } from "drizzle-orm";
import { type AnyMySqlColumn, bigint, boolean, datetime, decimal, foreignKey, index, int, json, longtext, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { KeywordEvaluation } from "@frontmind/monitoring-contracts";
import { monitoringQuestionCategories } from "@frontmind/monitoring-contracts";
export interface ProgressSchemaCore { users: { id: AnyMySqlColumn }; currentMonitoringEnterpriseProjectId(): string | null; }
const id = (name: string) => varchar(name, { length: 36 });

const createdAt = () =>
  timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { mode: "date", fsp: 3 })
    .notNull()
    .defaultNow()
    .onUpdateNow();

export const clientTypes = ["web", "mobile"] as const;

export const platformPricingClasses = ["domestic", "overseas"] as const;

export const monitorStatuses = [
  "draft",
  "active",
  "paused",
  "deleted",
] as const;

export const scheduleTypes = ["none", "daily", "weekly"] as const;

export const providerModes = ["search", "reasoning_search"] as const;

export const runTriggers = ["manual", "scheduled", "catch_up"] as const;

export const runStatuses = [
  "queued",
  "waiting_quota",
  "running",
  "completed",
  "partial_completed",
  "failed",
  "review_required",
  "cancelled",
] as const;

export const attemptStatuses = [
  "queued",
  "submitting",
  "submission_unknown",
  "accepted",
  "processing",
  "completed",
  "failed",
  "stopped",
  "error",
  "cancelled_before_submit",
  "review_required",
] as const;

export const quotaSettlements = ["reserved", "consumed", "released"] as const;

export const sentiments = [
  "positive",
  "neutral",
  "negative",
  "unknown",
] as const;
export function createProgressSchema(core: ProgressSchemaCore) {
const projects = mysqlTable(
  "projects",
  {
    enterpriseProjectId: id("enterprise_project_id"),
    id: id("id").primaryKey(),
    ownerId: id("owner_id")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("Asia/Shanghai"),
    currentBrandVersionId: id("current_brand_version_id"),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    purgeAfter: datetime("purge_after", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("projects_owner_created_idx").on(table.ownerId, table.createdAt),
    index("projects_enterprise_scope_idx").on(
      table.ownerId,
      table.enterpriseProjectId,
    ),
    index("projects_purge_idx").on(table.purgeAfter),
  ],
);

const projectBrandVersions = mysqlTable(
  "project_brand_versions",
  {
    id: id("id").primaryKey(),
    projectId: id("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: int("version", { unsigned: true }).notNull(),
    mainBrand: varchar("main_brand", { length: 120 }).notNull(),
    aliases: json("aliases").$type<string[]>().notNull(),
    competitors: json("competitors")
      .$type<Array<{ name: string; aliases: string[] }>>()
      .notNull(),
    createdBy: id("created_by")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("project_brand_versions_project_version_uq").on(
      table.projectId,
      table.version,
    ),
  ],
);

const platformCatalog = mysqlTable(
  "platform_catalog",
  {
    id: id("id").primaryKey(),
    providerCode: varchar("provider_code", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    clientType: mysqlEnum("client_type", clientTypes).notNull(),
    pricingClass: mysqlEnum("pricing_class", platformPricingClasses),
    enabled: boolean("enabled").notNull().default(false),
    verified: boolean("verified").notNull().default(false),
    supportsReasoning: boolean("supports_reasoning").notNull().default(false),
    supportsScreenshot: boolean("supports_screenshot").notNull().default(false),
    supportsDomesticRegion: boolean("supports_domestic_region")
      .notNull()
      .default(false),
    supportsOverseasRegion: boolean("supports_overseas_region")
      .notNull()
      .default(false),
    acceptanceRequired: boolean("acceptance_required").notNull().default(false),
    providerMetadata:
      json("provider_metadata").$type<Record<string, unknown>>(),
    acceptanceFingerprint: varchar("acceptance_fingerprint", { length: 64 }),
    discoveredAt: datetime("discovered_at", { mode: "date", fsp: 3 }).notNull(),
    verifiedAt: datetime("verified_at", { mode: "date", fsp: 3 }),
    updatedBy: id("updated_by").references(() => core.users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("platform_catalog_provider_client_uq").on(
      table.providerCode,
      table.clientType,
    ),
    index("platform_catalog_enabled_idx").on(table.enabled, table.verified),
  ],
);

const monitors = mysqlTable(
  "monitors",
  {
    id: id("id").primaryKey(),
    ownerId: id("owner_id")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    projectId: id("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    status: mysqlEnum("status", monitorStatuses).notNull().default("draft"),
    activeVersionId: id("active_version_id"),
    scheduleType: mysqlEnum("schedule_type", scheduleTypes)
      .notNull()
      .default("none"),
    scheduleTimezone: varchar("schedule_timezone", { length: 64 })
      .notNull()
      .default("Asia/Shanghai"),
    scheduleLocalTime: varchar("schedule_local_time", { length: 5 })
      .notNull()
      .default("09:00"),
    scheduleWeekday: int("schedule_weekday", { unsigned: true }),
    nextRunAt: datetime("next_run_at", { mode: "date", fsp: 3 }),
    lastScheduledFor: datetime("last_scheduled_for", { mode: "date", fsp: 3 }),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    purgeAfter: datetime("purge_after", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("monitors_owner_project_idx").on(
      table.ownerId,
      table.projectId,
      table.createdAt,
    ),
    index("monitors_due_idx").on(table.status, table.nextRunAt),
    index("monitors_purge_idx").on(table.purgeAfter),
  ],
);

const monitorVersions = mysqlTable(
  "monitor_versions",
  {
    id: id("id").primaryKey(),
    monitorId: id("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    projectBrandVersionId: id("project_brand_version_id")
      .notNull()
      .references(() => projectBrandVersions.id, { onDelete: "restrict" }),
    version: int("version", { unsigned: true }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    brandAliases: json("brand_aliases").$type<string[]>().notNull(),
    competitors: json("competitors")
      .$type<Array<{ name: string; aliases: string[] }>>()
      .notNull(),
    repetitions: int("repetitions", { unsigned: true }).notNull(),
    expectedAttempts: int("expected_attempts", { unsigned: true }).notNull(),
    configurationHash: varchar("configuration_hash", { length: 64 }).notNull(),
    createdBy: id("created_by")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("monitor_versions_monitor_version_uq").on(
      table.monitorId,
      table.version,
    ),
    index("monitor_versions_hash_idx").on(table.configurationHash),
  ],
);

const monitorQuestions = mysqlTable(
  "monitor_questions",
  {
    monitorVersionId: id("monitor_version_id")
      .notNull()
      .references(() => monitorVersions.id, { onDelete: "cascade" }),
    ordinal: int("ordinal", { unsigned: true }).notNull(),
    questionId: id("question_id")
      .notNull()
      .references(() => projectQuestions.id, { onDelete: "restrict" }),
    questionSnapshot: text("question_snapshot").notNull(),
    categorySnapshot: mysqlEnum("category_snapshot", monitoringQuestionCategories),
  },
  (table) => [
    primaryKey({ columns: [table.monitorVersionId, table.ordinal] }),
    uniqueIndex("monitor_questions_version_question_uq").on(
      table.monitorVersionId,
      table.questionId,
    ),
  ],
);

const monitorPlatforms = mysqlTable(
  "monitor_platforms",
  {
    monitorVersionId: id("monitor_version_id")
      .notNull()
      .references(() => monitorVersions.id, { onDelete: "cascade" }),
    ordinal: int("ordinal", { unsigned: true }).notNull(),
    platformId: id("platform_id")
      .notNull()
      .references(() => platformCatalog.id, { onDelete: "restrict" }),
    providerCodeSnapshot: varchar("provider_code_snapshot", {
      length: 64,
    }).notNull(),
    clientType: mysqlEnum("client_type", clientTypes).notNull(),
    mode: mysqlEnum("mode", providerModes).notNull(),
    screenshot: int("screenshot", { unsigned: true }).notNull().default(1),
    regionCode: varchar("region_code", { length: 64 }),
  },
  (table) => [
    primaryKey({ columns: [table.monitorVersionId, table.ordinal] }),
    uniqueIndex("monitor_platforms_version_platform_uq").on(
      table.monitorVersionId,
      table.platformId,
    ),
  ],
);

const runs = mysqlTable(
  "runs",
  {
    id: id("id").primaryKey(),
    ownerId: id("owner_id")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    projectId: id("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    projectBrandVersionId: id("project_brand_version_id")
      .notNull()
      .references(() => projectBrandVersions.id, { onDelete: "restrict" }),
    monitorId: id("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "restrict" }),
    monitorVersionId: id("monitor_version_id")
      .notNull()
      .references(() => monitorVersions.id, { onDelete: "restrict" }),
    scheduleOccurrenceId: id("schedule_occurrence_id").references(
      () => scheduleOccurrences.id,
      { onDelete: "set null" },
    ),
    trigger: mysqlEnum("trigger", runTriggers).notNull(),
    status: mysqlEnum("status", runStatuses).notNull().default("queued"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    expectedAttempts: int("expected_attempts", { unsigned: true }).notNull(),
    completedAttempts: int("completed_attempts", { unsigned: true })
      .notNull()
      .default(0),
    failedAttempts: int("failed_attempts", { unsigned: true })
      .notNull()
      .default(0),
    stoppedAttempts: int("stopped_attempts", { unsigned: true })
      .notNull()
      .default(0),
    submittedAttempts: int("submitted_attempts", { unsigned: true })
      .notNull()
      .default(0),
    startedAt: datetime("started_at", { mode: "date", fsp: 3 }),
    completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
    cancelRequestedAt: datetime("cancel_requested_at", {
      mode: "date",
      fsp: 3,
    }),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    purgeAfter: datetime("purge_after", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("runs_owner_idempotency_uq").on(
      table.ownerId,
      table.idempotencyKey,
    ),
    uniqueIndex("runs_occurrence_uq").on(table.scheduleOccurrenceId),
    index("runs_owner_monitor_created_idx").on(
      table.ownerId,
      table.monitorId,
      table.createdAt,
    ),
    index("runs_owner_monitor_created_id_idx").on(
      table.ownerId,
      table.monitorId,
      table.createdAt,
      table.id,
    ),
    index("runs_monitor_active_idx").on(
      table.monitorId,
      table.status,
      table.createdAt,
    ),
    index("runs_purge_idx").on(table.purgeAfter),
  ],
);

const attempts = mysqlTable(
  "attempts",
  {
    id: id("id").primaryKey(),
    runId: id("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    ownerId: id("owner_id")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    monitorQuestionOrdinal: int("monitor_question_ordinal", {
      unsigned: true,
    }).notNull(),
    monitorPlatformOrdinal: int("monitor_platform_ordinal", {
      unsigned: true,
    }).notNull(),
    repetition: int("repetition", { unsigned: true }).notNull(),
    question: text("question").notNull(),
    platformId: id("platform_id")
      .notNull()
      .references(() => platformCatalog.id, { onDelete: "restrict" }),
    providerCode: varchar("provider_code", { length: 64 }).notNull(),
    clientType: mysqlEnum("client_type", clientTypes).notNull(),
    mode: mysqlEnum("mode", providerModes).notNull(),
    screenshot: int("screenshot", { unsigned: true }).notNull(),
    regionCode: varchar("region_code", { length: 64 }),
    status: mysqlEnum("status", attemptStatuses).notNull().default("queued"),
    consumerTaskId: varchar("consumer_task_id", { length: 64 }).notNull(),
    providerTaskId: varchar("provider_task_id", { length: 128 }),
    providerSubTaskId: varchar("provider_sub_task_id", { length: 128 }),
    quotaSettlement: mysqlEnum("quota_settlement", quotaSettlements)
      .notNull()
      .default("reserved"),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    providerCreatedAtRaw: bigint("provider_created_at_raw", { mode: "number" }),
    providerUpdatedAtRaw: bigint("provider_updated_at_raw", { mode: "number" }),
    nextPollAt: datetime("next_poll_at", { mode: "date", fsp: 3 }),
    stopRequestedAt: datetime("stop_requested_at", { mode: "date", fsp: 3 }),
    stopAccepted: boolean("stop_accepted"),
    submittedAt: datetime("submitted_at", { mode: "date", fsp: 3 }),
    terminalAt: datetime("terminal_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("attempts_run_slot_uq").on(
      table.runId,
      table.monitorQuestionOrdinal,
      table.monitorPlatformOrdinal,
      table.repetition,
    ),
    uniqueIndex("attempts_consumer_task_uq").on(table.consumerTaskId),
    index("attempts_provider_task_idx").on(table.providerTaskId),
    index("attempts_run_status_idx").on(table.runId, table.status),
  ],
);

const resultRevisions = mysqlTable(
  "result_revisions",
  {
    id: id("id").primaryKey(),
    attemptId: id("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    revision: int("revision", { unsigned: true }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    normalizedPayload: json("normalized_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    rawObjectKey: varchar("raw_object_key", { length: 1_024 }),
    providerUpdatedAtRaw: bigint("provider_updated_at_raw", { mode: "number" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("result_revisions_attempt_revision_uq").on(
      table.attemptId,
      table.revision,
    ),
    uniqueIndex("result_revisions_attempt_hash_uq").on(
      table.attemptId,
      table.contentHash,
    ),
  ],
);

const attemptResults = mysqlTable(
  "attempt_results",
  {
    attemptId: id("attempt_id")
      .primaryKey()
      .references(() => attempts.id, { onDelete: "cascade" }),
    currentRevisionId: id("current_revision_id")
      .notNull()
      .references(() => resultRevisions.id, { onDelete: "restrict" }),
    revision: int("revision", { unsigned: true }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    answerMarkdown: longtext("answer_markdown").notNull(),
    reasoningMarkdown: longtext("reasoning_markdown"),
    searchKeywords: json("search_keywords").$type<string[]>().notNull(),
    sentiment: mysqlEnum("sentiment", sentiments).notNull().default("unknown"),
    brandMentioned: boolean("brand_mentioned").notNull().default(false),
    mentionPosition: int("mention_position", { unsigned: true }),
    competitorRankings: json("competitor_rankings")
      .$type<Array<Record<string, unknown>>>()
      .notNull(),
    keywordEvaluations: json("keyword_evaluations")
      .$type<KeywordEvaluation[]>()
      .notNull(),
    categoryRanking: json("category_ranking").$type<Record<string, unknown>>(),
    providerAmount: decimal("provider_amount", { precision: 14, scale: 4 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("attempt_results_sentiment_idx").on(table.sentiment),
    index("attempt_results_mention_idx").on(table.brandMentioned),
  ],
);

const resultSources = mysqlTable(
  "result_sources",
  {
    id: id("id").primaryKey(),
    revisionId: id("revision_id")
      .notNull()
      .references(() => resultRevisions.id, { onDelete: "cascade" }),
    ordinal: int("ordinal", { unsigned: true }).notNull(),
    providerPosition: int("provider_position", { unsigned: true }),
    url: text("url").notNull(),
    canonicalUrlHash: varchar("canonical_url_hash", { length: 64 }).notNull(),
    title: text("title").notNull(),
    domain: varchar("domain", { length: 255 }).notNull(),
    citedText: text("cited_text"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("result_sources_revision_ordinal_uq").on(
      table.revisionId,
      table.ordinal,
    ),
    index("result_sources_domain_idx").on(table.domain),
  ],
);

const resultDiscoveredSources = mysqlTable(
  "result_discovered_sources",
  {
    id: id("id").primaryKey(),
    revisionId: id("revision_id")
      .notNull()
      .references(() => resultRevisions.id, { onDelete: "cascade" }),
    ordinal: int("ordinal", { unsigned: true }).notNull(),
    providerPosition: int("provider_position", { unsigned: true }),
    url: text("url").notNull(),
    canonicalUrlHash: varchar("canonical_url_hash", { length: 64 }).notNull(),
    title: text("title").notNull(),
    domain: varchar("domain", { length: 255 }).notNull(),
    siteName: varchar("site_name", { length: 255 }),
    summary: text("summary"),
    publishedAt: varchar("published_at", { length: 10 }),
    providerIconUrl: text("provider_icon_url"),
    isCited: boolean("is_cited").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("result_discovered_sources_revision_ordinal_uq").on(
      table.revisionId,
      table.ordinal,
    ),
    uniqueIndex("result_discovered_sources_revision_url_uq").on(
      table.revisionId,
      table.canonicalUrlHash,
    ),
    index("result_discovered_sources_revision_cited_idx").on(
      table.revisionId,
      table.isCited,
    ),
    index("result_discovered_sources_domain_idx").on(table.domain),
  ],
);

const resultMedia = mysqlTable(
  "result_media",
  {
    id: id("id").primaryKey(),
    revisionId: id("revision_id")
      .notNull()
      .references(() => resultRevisions.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", [
      "screenshot",
      "image",
      "video",
      "goods",
      "raw_response",
    ] as const).notNull(),
    ordinal: int("ordinal", { unsigned: true }).notNull(),
    sourceUrl: text("source_url"),
    objectKey: varchar("object_key", { length: 1_024 }),
    thumbnailObjectKey: varchar("thumbnail_object_key", { length: 1_024 }),
    contentHash: varchar("content_hash", { length: 64 }),
    mimeType: varchar("mime_type", { length: 128 }),
    sizeBytes: bigint("size_bytes", { mode: "number", unsigned: true }),
    archiveStatus: mysqlEnum("archive_status", [
      "pending",
      "archived",
      "failed",
      "not_applicable",
    ] as const)
      .notNull()
      .default("pending"),
    archiveError: text("archive_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("result_media_revision_type_ordinal_uq").on(
      table.revisionId,
      table.type,
      table.ordinal,
    ),
    index("result_media_archive_idx").on(table.archiveStatus, table.createdAt),
  ],
);

const projectQuestions = mysqlTable(
  "project_questions",
  {
    id: id("id").primaryKey(),
    projectId: id("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    normalizedHash: varchar("normalized_hash", { length: 64 }).notNull(),
    question: text("question").notNull(),
    category: mysqlEnum("category", monitoringQuestionCategories),
    createdBy: id("created_by")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("project_questions_project_hash_uq").on(
      table.projectId,
      table.normalizedHash,
    ),
  ],
);

const scheduleOccurrences = mysqlTable(
  "schedule_occurrences",
  {
    id: id("id").primaryKey(),
    monitorId: id("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    monitorVersionId: id("monitor_version_id")
      .notNull()
      .references(() => monitorVersions.id, { onDelete: "restrict" }),
    scheduledFor: datetime("scheduled_for", { mode: "date", fsp: 3 }).notNull(),
    trigger: mysqlEnum("trigger", ["scheduled", "catch_up"] as const).notNull(),
    runId: id("run_id"),
    waitingForQuotaAt: datetime("waiting_for_quota_at", {
      mode: "date",
      fsp: 3,
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("schedule_occurrences_monitor_time_uq").on(
      table.monitorId,
      table.scheduledFor,
    ),
    index("schedule_occurrences_time_idx").on(table.scheduledFor),
    index("schedule_occurrences_quota_idx").on(
      table.waitingForQuotaAt,
      table.scheduledFor,
    ),
  ],
);
return { projects, projectBrandVersions, platformCatalog, monitors, monitorVersions, monitorQuestions, monitorPlatforms, runs, attempts, resultRevisions, attemptResults, resultSources, resultDiscoveredSources, resultMedia, projectQuestions, scheduleOccurrences };
}
export type ProgressSchema = ReturnType<typeof createProgressSchema>;
