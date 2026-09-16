import type { ProgressRouter as AppRouter } from "../../../server/client-router";
import type { inferRouterOutputs } from "@trpc/server";

import type { ResultSource, RunAttempt } from "../../domain";
import { isMonitoringUuid } from "../../identifiers";
import { trpc } from "../../trpc";
import { calendarDateRangeToUtc } from "./queryState";
import type { MonitoringQueryState, MonitoringTab } from "./types";

type ApiOutputs = inferRouterOutputs<AppRouter>;
export type MonitoringSummaryData = ApiOutputs["monitoring"]["summary"];
export type MonitoringAnalysisData = ApiOutputs["monitoring"]["analysis"];
export type MonitoringAnswerListItem =
  ApiOutputs["monitoring"]["answers"]["list"]["items"][number];
export type MonitoringAnswerDetail = ApiOutputs["monitoring"]["answers"]["get"];

const NIL_ID = "00000000-0000-0000-0000-000000000000";
// These reads use our persisted monitoring results. Polling runs alone does not
// update this separate query cache when the worker stores an answer or media.
const LIVE_RESULT_REFRESH_MS = 10_000;
const liveReadOptions = {
  refetchInterval: LIVE_RESULT_REFRESH_MS,
  refetchIntervalInBackground: false,
  trpc: { abortOnUnmount: true },
};

function analysisKind(tab: MonitoringTab) {
  return (
    ["metrics", "trends", "competitors", "citations", "sources"] as const
  ).find((kind) => kind === tab);
}

function sourceFromApi(
  source: Pick<
    MonitoringAnswerDetail["referenceList"][number],
    | "id"
    | "title"
    | "url"
    | "domain"
    | "ordinal"
    | "providerPosition"
    | "siteName"
    | "summary"
    | "publishedAt"
  >,
  isCited: boolean,
  citationProvenance: MonitoringAnswerDetail["citationProvenance"],
): ResultSource {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    domain: source.domain,
    order: source.ordinal,
    providerPosition: source.providerPosition,
    isCited,
    citationProvenance,
    siteName: source.siteName,
    summary: source.summary,
    publishedAt: source.publishedAt,
  };
}

function sourceIdentityKeys(source: Pick<ResultSource, "id" | "url">) {
  const keys = [`id:${source.id}`];
  if (!source.url) return keys;
  try {
    const url = new URL(source.url);
    url.hash = "";
    keys.unshift(`url:${url.toString()}`);
  } catch {
    const url = source.url.trim();
    if (url) keys.unshift(`url:${url}`);
  }
  return keys;
}

function mergeAnswerSources(
  references: readonly ResultSource[],
  citations: readonly ResultSource[],
) {
  const merged: ResultSource[] = [];
  const indexByIdentity = new Map<string, number>();
  const accept = (source: ResultSource) => {
    const keys = sourceIdentityKeys(source);
    const existingIndex = keys
      .map((key) => indexByIdentity.get(key))
      .find((index): index is number => index !== undefined);
    if (existingIndex === undefined) {
      const index = merged.push(source) - 1;
      for (const key of keys) indexByIdentity.set(key, index);
      return;
    }
    const existing = merged[existingIndex]!;
    const next = {
      ...existing,
      title: existing.title || source.title,
      url: existing.url || source.url,
      domain: existing.domain || source.domain,
      providerPosition:
        existing.providerPosition ?? source.providerPosition ?? null,
      citedText: existing.citedText || source.citedText,
      isCited: existing.isCited || source.isCited,
      citationProvenance:
        existing.citationProvenance ?? source.citationProvenance,
      siteName: existing.siteName ?? source.siteName,
      summary: existing.summary ?? source.summary,
      publishedAt: existing.publishedAt ?? source.publishedAt,
    } satisfies ResultSource;
    merged[existingIndex] = next;
    for (const key of sourceIdentityKeys(next)) {
      indexByIdentity.set(key, existingIndex);
    }
    for (const key of keys) indexByIdentity.set(key, existingIndex);
  };
  references.forEach(accept);
  citations.forEach(accept);
  return merged;
}

export function attemptFromList(item: MonitoringAnswerListItem): RunAttempt {
  return {
    id: item.answerId,
    runId: item.runId,
    questionId: item.questionId,
    question: item.question,
    questionCategory: item.questionCategory,
    platformId: item.platform.id,
    platformCode: item.platform.providerCode,
    platformName: item.platform.displayName,
    clientType: item.platform.clientType,
    mode: item.platform.mode,
    screenshotPolicy: null,
    repetition: item.repetition,
    status: item.status,
    answerPreview: item.result?.answerPreview,
    capturedAt: item.result?.updatedAt
      ? new Date(item.result.updatedAt).toISOString()
      : undefined,
    sentiment: item.result?.sentiment,
    brandMentioned: item.result?.mentioned,
    mentionPosition: item.result?.position,
    citationProvenance: item.result?.citationProvenance,
    sources: [],
    allSources: [],
    assets: [],
  };
}

export function attemptFromDetail(detail: MonitoringAnswerDetail): RunAttempt {
  const cited = detail.citationList.map((source) => ({
    ...sourceFromApi(source, true, detail.citationProvenance),
    citedText: source.citedText || undefined,
  }));
  const references = detail.referenceList.map((source) =>
    sourceFromApi(source, source.isCited, detail.citationProvenance),
  );
  return {
    id: detail.answerId,
    runId: detail.runId,
    questionId: detail.questionId,
    question: detail.question,
    questionCategory: detail.questionCategory,
    platformId: detail.platform.id,
    platformCode: detail.platform.providerCode,
    platformName: detail.platform.displayName,
    clientType: detail.platform.clientType,
    mode: detail.platform.mode,
    screenshotPolicy: detail.screenshotPolicy ?? null,
    screenshotBrandMentioned: detail.screenshotBrandMentioned ?? null,
    repetition: detail.repetition,
    status: detail.status,
    answer: detail.answerMarkdown,
    shareUrl: detail.shareUrl,
    keywordEvaluations: detail.keywordEvaluations,
    reasoning: detail.reasoningMarkdown || undefined,
    capturedAt: new Date(detail.runCreatedAt).toISOString(),
    sentiment: detail.sentiment,
    brandMentioned: detail.mentioned,
    mentionPosition: detail.position,
    citationProvenance: detail.citationProvenance,
    sources: cited,
    allSources: mergeAnswerSources(references, cited),
    assets: detail.archivedScreenshots.map((asset) => ({
      id: asset.id,
      type: "screenshot" as const,
      title: "回答截图",
      url: asset.accessPath || undefined,
      thumbnailUrl: asset.thumbnailAccessPath || undefined,
      archiveStatus: asset.archiveStatus,
    })),
    searchKeywords: detail.searchKeywords,
    competitorRankings: detail.rankings
      .filter((ranking) => ranking.subject.kind === "competitor")
      .map((ranking) => ({
        name: ranking.subject.name,
        mentioned: ranking.mentioned,
        position: ranking.position,
      })),
  };
}

export function attemptsFromAnswerPages(
  pages: readonly { items: readonly MonitoringAnswerListItem[] }[] | undefined,
) {
  return [
    ...new Map(
      pages?.flatMap((page) =>
        page.items.map(
          (item) => [item.answerId, attemptFromList(item)] as const,
        ),
      ) || [],
    ).values(),
  ];
}

export function answerDetailLoadDecision(
  answerId: string | undefined,
  answersReady: boolean,
  items: readonly MonitoringAnswerListItem[],
) {
  const validAnswerId = isMonitoringUuid(answerId);
  const listedItem = validAnswerId
    ? items.find((item) => item.answerId === answerId)
    : undefined;
  const listedWithoutResult = Boolean(listedItem && listedItem.result === null);
  return {
    validAnswerId,
    listedWithoutResult,
    shouldFetch: answersReady && validAnswerId && !listedWithoutResult,
  };
}

export function monitoringAnswerMatchesScope(
  detail: MonitoringAnswerDetail,
  bounds: { from: string; to: string },
  scope: {
    questionId?: string;
    questionCategory?: MonitoringQueryState["questionCategory"];
    platformId?: string;
    subject: { kind: "self" } | { kind: "competitor"; name: string };
  },
) {
  const timestamp = new Date(detail.runCreatedAt).getTime();
  // A subject selects the metrics projection for the same answer set; it is
  // not an answer-list dimension. In particular, a historical answer can use
  // the former canonical competitor name while the active version reaches it
  // through an alias. That alias bridge is intentionally resolved server-side
  // and is not present in answer-detail rankings, so comparing ranking names
  // here would reject a valid cross-version deep link.
  return (
    timestamp >= new Date(bounds.from).getTime() &&
    timestamp < new Date(bounds.to).getTime() &&
    (!scope.questionId || detail.questionId === scope.questionId) &&
    (!scope.questionCategory ||
      detail.questionCategory === scope.questionCategory) &&
    (!scope.platformId || detail.platform.id === scope.platformId)
  );
}

export function useMonitoringDataSource({
  enabled,
  query,
  timezone,
}: {
  enabled: boolean;
  query: MonitoringQueryState;
  timezone: string;
}) {
  const validMonitor = Boolean(enabled && isMonitoringUuid(query.monitorId));
  const bounds = calendarDateRangeToUtc(query.from, query.to, timezone);
  const catalogScope = {
    monitorId: validMonitor ? query.monitorId! : NIL_ID,
    from: new Date(bounds.from),
    to: new Date(bounds.to),
    subject: { kind: "self" } as const,
  };
  const catalog = trpc.monitoring.summary.useQuery(catalogScope, {
    ...liveReadOptions,
    enabled: validMonitor,
    staleTime: 30_000,
  });
  // Resolve selectable questions without the selected question itself. A
  // retired historical question can otherwise make both filtered reads fail
  // before the workspace receives the catalog needed to repair its selection.
  const categoryCatalog = trpc.monitoring.summary.useQuery(
    {
      ...catalogScope,
      ...(query.questionCategory
        ? { questionCategory: query.questionCategory }
        : {}),
    },
    {
      ...liveReadOptions,
      enabled: validMonitor && Boolean(query.questionCategory),
      staleTime: 30_000,
    },
  );
  const questionCatalog = query.questionCategory ? categoryCatalog : catalog;
  const questionCatalogReady =
    validMonitor && catalog.isSuccess && questionCatalog.isSuccess;
  const validQuestion = Boolean(
    query.question &&
      isMonitoringUuid(query.question) &&
      questionCatalog.data?.filters.questions.some(
        (item) => item.id === query.question,
      ),
  );
  // Global catalog category=null can represent the same historical question
  // under several categories. Membership in the scoped catalog is authoritative.
  const scopeReady = questionCatalogReady && (!query.question || validQuestion);
  const validModel = Boolean(
    query.model &&
      catalog.data?.filters.platforms.some((item) => item.id === query.model),
  );
  const competitorName = query.subject.startsWith("competitor:")
    ? query.subject.slice("competitor:".length)
    : undefined;
  const validCompetitor = Boolean(
    competitorName &&
      catalog.data?.filters.subjects.some(
        (item) => item.kind === "competitor" && item.name === competitorName,
      ),
  );
  const scope = {
    ...catalogScope,
    subject: validCompetitor
      ? ({ kind: "competitor", name: competitorName! } as const)
      : ({ kind: "self" } as const),
    ...(validQuestion ? { questionId: query.question! } : {}),
    ...(query.questionCategory
      ? { questionCategory: query.questionCategory }
      : {}),
    ...(validModel ? { platformId: query.model! } : {}),
  };
  const summary = trpc.monitoring.summary.useQuery(scope, {
    ...liveReadOptions,
    enabled: scopeReady,
    staleTime: 30_000,
  });
  const answers = trpc.monitoring.answers.list.useInfiniteQuery(
    { scope, limit: 50 },
    {
      ...liveReadOptions,
      enabled: scopeReady,
      staleTime: 15_000,
      getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    },
  );
  const answerItems = scopeReady
    ? answers.data?.pages.flatMap((page) => page.items) || []
    : [];
  const hasQuestionsInScope = Boolean(
    questionCatalog.data?.filters.questions.length,
  );
  const detailDecision = answerDetailLoadDecision(
    query.answerId,
    scopeReady && hasQuestionsInScope && answers.isSuccess,
    answerItems,
  );
  const answerDetail = trpc.monitoring.answers.get.useQuery(
    {
      monitorId: validMonitor ? query.monitorId! : NIL_ID,
      answerId: detailDecision.validAnswerId ? query.answerId! : NIL_ID,
      subject: scope.subject,
    },
    {
      ...liveReadOptions,
      enabled: scopeReady && detailDecision.shouldFetch,
      staleTime: 30_000,
    },
  );
  const kind = analysisKind(query.tab);
  const analysis = trpc.monitoring.analysis.useQuery(
    { scope, kind: kind || "metrics" },
    {
      ...liveReadOptions,
      enabled: scopeReady && Boolean(kind),
      staleTime: 30_000,
    },
  );
  const listAttempts = scopeReady
    ? attemptsFromAnswerPages(answers.data?.pages)
    : [];
  const detailMatchesScope = Boolean(
    scopeReady &&
      answerDetail.data &&
      monitoringAnswerMatchesScope(answerDetail.data, bounds, scope),
  );
  const detailAttempt =
    answerDetail.data && detailMatchesScope
      ? attemptFromDetail(answerDetail.data)
      : undefined;
  // A deep-linked answer may live beyond the pages loaded so far. Keep it
  // separately available to the reader; prepending it would make Next jump
  // back to the newest answer instead of continuing in cursor order.
  const attempts = detailAttempt
    ? listAttempts.map((attempt) =>
        attempt.id === detailAttempt.id ? detailAttempt : attempt,
      )
    : listAttempts;

  return {
    catalogSummary: catalog.data,
    questionCatalogSummary: questionCatalog.data,
    questionCatalogReady,
    summary: scopeReady ? summary.data : undefined,
    attempts,
    detailAttempt,
    analysis: scopeReady ? analysis.data : undefined,
    summaryReady: scopeReady && summary.isSuccess,
    answersReady: scopeReady && answers.isSuccess,
    answerDetailLoading:
      detailDecision.shouldFetch &&
      !detailAttempt &&
      (answerDetail.isLoading || answerDetail.isFetching),
    answerDetailError: detailDecision.shouldFetch && answerDetail.isError,
    retryAnswerDetail: () => {
      if (detailDecision.shouldFetch) void answerDetail.refetch();
    },
    answerDetailSettled:
      !query.answerId ||
      (questionCatalogReady && !hasQuestionsInScope) ||
      !detailDecision.validAnswerId ||
      detailDecision.listedWithoutResult ||
      answerDetail.isSuccess ||
      answerDetail.isError,
    hasMoreAnswers: scopeReady && Boolean(answers.hasNextPage),
    loadingMoreAnswers: scopeReady && answers.isFetchingNextPage,
    loadMoreAnswers: async () => {
      if (scopeReady && answers.hasNextPage && !answers.isFetchingNextPage) {
        const next = await answers.fetchNextPage();
        if (next.isError) throw next.error;
        return {
          attempts: attemptsFromAnswerPages(next.data?.pages),
          hasMore: Boolean(next.hasNextPage),
        };
      }
      return { attempts, hasMore: scopeReady && Boolean(answers.hasNextPage) };
    },
    loading:
      catalog.isLoading ||
      questionCatalog.isLoading ||
      summary.isLoading ||
      answers.isLoading ||
      answerDetail.isLoading ||
      analysis.isLoading,
    error:
      catalog.error?.message ||
      questionCatalog.error?.message ||
      (scopeReady
        ? summary.error?.message ||
          answers.error?.message ||
          (detailDecision.shouldFetch
            ? answerDetail.error?.message
            : undefined) ||
          analysis.error?.message
        : undefined),
    refresh: async () => {
      if (!validMonitor) return;
      const requests: Array<Promise<unknown>> = [catalog.refetch()];
      if (query.questionCategory) requests.push(categoryCatalog.refetch());
      if (scopeReady) {
        requests.push(summary.refetch(), answers.refetch());
        if (detailDecision.shouldFetch) requests.push(answerDetail.refetch());
        if (kind) requests.push(analysis.refetch());
      }
      await Promise.all(requests);
    },
  };
}
