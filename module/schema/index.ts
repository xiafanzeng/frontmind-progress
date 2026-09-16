import { sql } from "drizzle-orm";
import { type AnyMySqlColumn, bigint, boolean, datetime, decimal, foreignKey, index, int, json, longtext, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { KeywordEvaluation } from "@frontmind/monitoring-contracts";
import { monitoringQuestionCategories } from "@frontmind/monitoring-contracts";
export interface ProgressSchemaCore { users: { id: AnyMySqlColumn }; pricingVersions?: {id:AnyMySqlColumn}; pricingItems?: {id:AnyMySqlColumn}; moneyReservations?: {id:AnyMySqlColumn}; currentMonitoringEnterpriseProjectId(): string | null; }
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
export const platformAcceptanceStatuses = [
  "pending",
  "running",
  "passed",
  "failed",
  "unsupported",
  "stale",
] as const;

export const platformAcceptanceDimensions = [
  "search_default",
  "reasoning_search",
  "screenshot_mention",
  "screenshot_all",
  "region_default",
  "region_domestic",
  "region_overseas",
  "mobile_no_region",
] as const;

export const moneySettlementStatuses = [
  "reserved",
  "consumed",
  "released",
] as const;

export const jobStatuses = [
  "ready",
  "leased",
  "retry_wait",
  "succeeded",
  "dead",
] as const;

export const jobTypes = [
  "submit_attempt",
  "stop_attempt",
  "poll_attempt",
  "fetch_result",
  "archive_media",
  "schedule_catch_up",
  "dispatch_occurrences",
  "purge_soft_deleted",
  "reconcile_billing",
  "sync_provider_catalog",
] as const;

export type RunModelMetric = {
  platformId: string;
  providerCode: string;
  clientType: (typeof clientTypes)[number];
  mode: (typeof providerModes)[number];
  effectiveAnswers: number;
  brandMentionedAnswers: number;
  mentionPositionSum: number;
  mentionPositionCount: number;
  citationCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  unknownCount: number;
};

export type RunCompetitorMetric = {
  name: string;
  appearances: number;
  positionSum: number;
  positionCount: number;
};

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
const runMetrics = mysqlTable("run_metrics", {
  runId: id("run_id")
    .primaryKey()
    .references(() => runs.id, { onDelete: "cascade" }),
  effectiveAnswers: int("effective_answers", { unsigned: true })
    .notNull()
    .default(0),
  brandMentionedAnswers: int("brand_mentioned_answers", { unsigned: true })
    .notNull()
    .default(0),
  mentionPositionSum: bigint("mention_position_sum", {
    mode: "number",
    unsigned: true,
  })
    .notNull()
    .default(0),
  mentionPositionCount: int("mention_position_count", { unsigned: true })
    .notNull()
    .default(0),
  citationCount: int("citation_count", { unsigned: true }).notNull().default(0),
  uniqueDomainCount: int("unique_domain_count", { unsigned: true })
    .notNull()
    .default(0),
  positiveCount: int("positive_count", { unsigned: true }).notNull().default(0),
  neutralCount: int("neutral_count", { unsigned: true }).notNull().default(0),
  negativeCount: int("negative_count", { unsigned: true }).notNull().default(0),
  unknownCount: int("unknown_count", { unsigned: true }).notNull().default(0),
  modelMetrics: json("model_metrics").$type<RunModelMetric[]>().notNull(),
  competitorMetrics: json("competitor_metrics")
    .$type<RunCompetitorMetric[]>()
    .notNull(),
  updatedAt: updatedAt(),
});

const runMetricDomains = mysqlTable(
  "run_metric_domains",
  {
    runId: id("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 255 }).notNull(),
    referenceCount: int("reference_count", { unsigned: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.domain] })],
);

const platformAcceptanceBatches = mysqlTable(
  "platform_acceptance_batches",
  {
    id: id("id").primaryKey(),
    ownerId: id("owner_id")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    projectId: id("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    requestedBy: id("requested_by")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    planFingerprint: varchar("plan_fingerprint", { length: 64 }).notNull(),
    questionHash: varchar("question_hash", { length: 64 }).notNull(),
    questionSnapshot: text("question_snapshot").notNull(),
    status: mysqlEnum("status", platformAcceptanceStatuses)
      .notNull()
      .default("pending"),
    attemptCount: int("attempt_count", { unsigned: true }).notNull(),
    totalAmountTenThousandths: bigint("total_amount_ten_thousandths", {
      mode: "bigint",
      unsigned: true,
    }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    startedAt: datetime("started_at", { mode: "date", fsp: 3 }),
    completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("platform_acceptance_request_uq").on(
      table.requestedBy,
      table.idempotencyKey,
    ),
    index("platform_acceptance_owner_created_idx").on(
      table.ownerId,
      table.createdAt,
    ),
    index("platform_acceptance_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

const platformAcceptanceChecks = mysqlTable(
  "platform_acceptance_checks",
  {
    id: id("id").primaryKey(),
    batchId: id("batch_id").notNull(),
    platformId: id("platform_id")
      .notNull()
      .references(() => platformCatalog.id, { onDelete: "restrict" }),
    providerCodeSnapshot: varchar("provider_code_snapshot", {
      length: 64,
    }).notNull(),
    displayNameSnapshot: varchar("display_name_snapshot", {
      length: 100,
    }).notNull(),
    clientType: mysqlEnum("client_type", clientTypes).notNull(),
    platformFingerprint: varchar("platform_fingerprint", {
      length: 64,
    }).notNull(),
    dimension: mysqlEnum("dimension", platformAcceptanceDimensions).notNull(),
    mode: mysqlEnum("mode", providerModes).notNull(),
    screenshot: int("screenshot", { unsigned: true }).notNull(),
    regionCode: varchar("region_code", { length: 64 }),
    status: mysqlEnum("status", platformAcceptanceStatuses)
      .notNull()
      .default("pending"),
    runId: id("run_id").references(() => runs.id, { onDelete: "set null" }),
    attemptId: id("attempt_id").references(() => attempts.id, {
      onDelete: "set null",
    }),
    resultHash: varchar("result_hash", { length: 64 }),
    screenshotHash: varchar("screenshot_hash", { length: 64 }),
    errorCode: varchar("error_code", { length: 64 }),
    errorSummary: varchar("error_summary", { length: 240 }),
    startedAt: datetime("started_at", { mode: "date", fsp: 3 }),
    completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "platform_acceptance_checks_batch_fk",
      columns: [table.batchId],
      foreignColumns: [platformAcceptanceBatches.id],
    }).onDelete("cascade"),
    uniqueIndex("platform_acceptance_batch_dimension_uq").on(
      table.batchId,
      table.platformId,
      table.dimension,
    ),
    uniqueIndex("platform_acceptance_attempt_uq").on(table.attemptId),
    index("platform_acceptance_platform_evidence_idx").on(
      table.platformId,
      table.platformFingerprint,
      table.dimension,
      table.status,
    ),
    index("platform_acceptance_batch_status_idx").on(
      table.batchId,
      table.status,
    ),
  ],
);

const jobs = mysqlTable(
  "jobs",
  {
    id: id("id").primaryKey(),
    type: mysqlEnum("type", jobTypes).notNull(),
    status: mysqlEnum("status", jobStatuses).notNull().default("ready"),
    dedupeKey: varchar("dedupe_key", { length: 191 }).notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    availableAt: datetime("available_at", { mode: "date", fsp: 3 }).notNull(),
    leaseOwner: varchar("lease_owner", { length: 128 }),
    leaseExpiresAt: datetime("lease_expires_at", { mode: "date", fsp: 3 }),
    attempts: int("attempts", { unsigned: true }).notNull().default(0),
    maxAttempts: int("max_attempts", { unsigned: true }).notNull().default(20),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    lastErrorMessage: text("last_error_message"),
    completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("jobs_dedupe_uq").on(table.dedupeKey),
    index("jobs_claim_idx").on(
      table.status,
      table.availableAt,
      table.leaseExpiresAt,
    ),
  ],
);

const providerCosts = mysqlTable(
  "provider_costs",
  {
    id: id("id").primaryKey(),
    attemptId: id("attempt_id").references(() => attempts.id, {
      onDelete: "restrict",
    }),
    providerTaskId: varchar("provider_task_id", { length: 128 }).notNull(),
    amount: decimal("amount", { precision: 14, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("CNY"),
    providerRecordId: varchar("provider_record_id", { length: 128 }),
    occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
    rawMetadata: json("raw_metadata").$type<Record<string, unknown>>(),
    reconciledAt: datetime("reconciled_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("provider_costs_record_uq").on(table.providerRecordId),
    index("provider_costs_task_idx").on(table.providerTaskId),
  ],
);

const attemptPriceSnapshots = mysqlTable(
  "attempt_price_snapshots",
  {
    attemptId: id("attempt_id")
      .primaryKey()
      .references(() => attempts.id, { onDelete: "cascade" }),
    pricingVersionId: id("pricing_version_id")
      .notNull()
      .references(() => core.pricingVersions!.id, { onDelete: "restrict" }),
    pricingItemId: id("pricing_item_id")
      .notNull()
      .references(() => core.pricingItems!.id, { onDelete: "restrict" }),
    pricingClass: mysqlEnum("pricing_class", platformPricingClasses).notNull(),
    mode: mysqlEnum("mode", providerModes).notNull(),
    screenshotEnabled: boolean("screenshot_enabled").notNull(),
    amountTenThousandths: bigint("amount_ten_thousandths", {
      mode: "bigint",
      unsigned: true,
    }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("CNY"),
    createdAt: createdAt(),
  },
  (table) => [
    index("attempt_price_snapshots_version_idx").on(table.pricingVersionId),
  ],
);

const attemptMoneySettlements = mysqlTable(
  "attempt_money_settlements",
  {
    attemptId: id("attempt_id")
      .primaryKey()
      .references(() => attempts.id, { onDelete: "cascade" }),
    reservationId: id("reservation_id")
      .notNull()
      .references(() => core.moneyReservations!.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", moneySettlementStatuses)
      .notNull()
      .default("reserved"),
    settledTenThousandths: bigint("settled_ten_thousandths", {
      mode: "bigint",
      unsigned: true,
    })
      .notNull()
      .default(sql`0`),
    settledAt: datetime("settled_at", { mode: "date", fsp: 3 }),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("attempt_money_settlements_reservation_idx").on(table.reservationId),
  ],
);

const providerTaskTombstones = mysqlTable(
  "provider_task_tombstones",
  {
    providerTaskHash: varchar("provider_task_hash", {
      length: 64,
    }).primaryKey(),
    deletedEntityType: varchar("deleted_entity_type", { length: 32 }).notNull(),
    deletedEntityIdHash: varchar("deleted_entity_id_hash", {
      length: 64,
    }).notNull(),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("provider_task_tombstones_expiry_idx").on(table.expiresAt)],
);

const workerHeartbeats = mysqlTable("worker_heartbeats", {
  workerId: varchar("worker_id", { length: 128 }).primaryKey(),
  heartbeatAt: datetime("heartbeat_at", { mode: "date", fsp: 3 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

const providerDispatchDays = mysqlTable("provider_dispatch_days", {
  dayKey: varchar("day_key", { length: 10 }).primaryKey(),
  dispatched: int("dispatched", { unsigned: true }).notNull().default(0),
  updatedAt: updatedAt(),
});

const providerDispatchSlots = mysqlTable(
  "provider_dispatch_slots",
  {
    attemptId: id("attempt_id")
      .primaryKey()
      .references(() => attempts.id, { onDelete: "cascade" }),
    dayKey: varchar("day_key", { length: 10 }).notNull(),
    acquiredAt: datetime("acquired_at", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => [index("provider_dispatch_slots_day_idx").on(table.dayKey)],
);

const providerSubmissionGate = mysqlTable("provider_submission_gate", {
  id: varchar("id", { length: 32 }).primaryKey(),
  nextAllowedAt: datetime("next_allowed_at", {
    mode: "date",
    fsp: 3,
  }).notNull(),
  updatedAt: updatedAt(),
});

const providerObservations = mysqlTable(
  "provider_observations",
  {
    id: id("id").primaryKey(),
    attemptId: id("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", [
      "submission",
      "status",
      "stop",
      "failure",
    ] as const).notNull(),
    status: varchar("status", { length: 64 }),
    payload: json("payload").$type<Record<string, unknown>>(),
    observedAt: datetime("observed_at", { mode: "date", fsp: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("provider_observations_attempt_idx").on(
      table.attemptId,
      table.observedAt,
    ),
  ],
);

const providerRegions = mysqlTable(
  "provider_regions",
  {
    code: varchar("code", { length: 64 }).notNull(),
    scope: mysqlEnum("scope", ["domestic", "overseas"] as const).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    providerMetadata: json("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull(),
    syncedAt: datetime("synced_at", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.code, table.scope] })],
);

const providerReconciliationState = mysqlTable(
  "provider_reconciliation_state",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    cursor: json("cursor")
      .$type<{
        startDate: string;
        endDate: string;
        page: number;
        pageSize: number;
      }>()
      .notNull(),
    balance: json("balance").$type<Record<string, unknown>>(),
    summary: json("summary").$type<Record<string, unknown>>(),
    reconciledAt: datetime("reconciled_at", { mode: "date", fsp: 3 }),
    updatedAt: updatedAt(),
  },
);

const dailyRunAggregates = mysqlTable(
  "daily_run_aggregates",
  {
    ownerId: id("owner_id")
      .notNull()
      .references(() => core.users.id, { onDelete: "restrict" }),
    monitorId: id("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    monitorVersionId: id("monitor_version_id")
      .notNull()
      .references(() => monitorVersions.id, { onDelete: "restrict" }),
    aggregateDate: datetime("aggregate_date", { mode: "date" }).notNull(),
    totalAnswers: int("total_answers", { unsigned: true }).notNull().default(0),
    brandMentions: int("brand_mentions", { unsigned: true })
      .notNull()
      .default(0),
    citationCount: int("citation_count", { unsigned: true })
      .notNull()
      .default(0),
    uniqueDomainCount: int("unique_domain_count", { unsigned: true })
      .notNull()
      .default(0),
    positiveCount: int("positive_count", { unsigned: true })
      .notNull()
      .default(0),
    neutralCount: int("neutral_count", { unsigned: true }).notNull().default(0),
    negativeCount: int("negative_count", { unsigned: true })
      .notNull()
      .default(0),
    unknownCount: int("unknown_count", { unsigned: true }).notNull().default(0),
    metrics: json("metrics").$type<Record<string, unknown>>().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.monitorId, table.monitorVersionId, table.aggregateDate],
    }),
    index("daily_run_aggregates_owner_date_idx").on(
      table.ownerId,
      table.aggregateDate,
    ),
  ],
);
return { runMetrics, runMetricDomains, platformAcceptanceBatches, platformAcceptanceChecks, jobs, providerCosts, attemptPriceSnapshots, attemptMoneySettlements, providerTaskTombstones, workerHeartbeats, providerDispatchDays, providerDispatchSlots, providerSubmissionGate, providerObservations, providerRegions, providerReconciliationState, dailyRunAggregates, projects, projectBrandVersions, platformCatalog, monitors, monitorVersions, monitorQuestions, monitorPlatforms, runs, attempts, resultRevisions, attemptResults, resultSources, resultDiscoveredSources, resultMedia, projectQuestions, scheduleOccurrences };
}
export type ProgressSchema = ReturnType<typeof createProgressSchema>;
