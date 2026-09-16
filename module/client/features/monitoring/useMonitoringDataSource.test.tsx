import "@testing-library/jest-dom/vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { TRPCClientError } from "@trpc/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trpc } from "../../trpc";
import type { MonitoringQueryState } from "./types";
import {
  useMonitoringDataSource,
  attemptFromDetail,
  monitoringAnswerMatchesScope,
  type MonitoringAnswerDetail,
  type MonitoringAnswerListItem,
  type MonitoringSummaryData,
} from "./useMonitoringDataSource";

const monitorId = "10000000-0000-4000-8000-000000000001";
const answerId = "10000000-0000-4000-8000-000000000002";
const questionId = "10000000-0000-4000-8000-000000000003";
const platform = {
  id: "10000000-0000-4000-8000-000000000004",
  providerCode: "verified-model",
  displayName: "模型",
  clientType: "web" as const,
  mode: "search" as const,
};
const runId = "10000000-0000-4000-8000-000000000005";
const createdAt = "2026-09-13T04:00:00Z";
const query: MonitoringQueryState = {
  monitorId,
  answerId,
  tab: "answers",
  subject: "self",
  range: "7d",
  from: "2026-09-07",
  to: "2026-09-14",
  sourceScope: "all",
  fullscreen: false,
};
const metrics: MonitoringSummaryData["metrics"] = {
  runs: 1,
  attempts: 1,
  answers: 0,
  mentionedAnswers: 0,
  mentionRate: null,
  averagePosition: null,
  top1Rate: null,
  top3Rate: null,
  top10Rate: null,
  citationCount: 0,
  discoveredSourceCount: 0,
  uniqueDomainCount: 0,
  sentiments: null,
};
const listItem: MonitoringAnswerListItem = {
  answerId,
  runId,
  runCreatedAt: createdAt,
  questionId,
  question: "如何选择品牌监控工具？",
  questionCategory: "industry",
  platform,
  repetition: 1,
  status: "processing",
  result: null,
};
const detail: MonitoringAnswerDetail = {
  ...listItem,
  status: "completed",
  answerMarkdown:
    "# 真实返回的回答\n\n请根据覆盖模型、更新频次和引用证据选择工具。",
  reasoningMarkdown: null,
  shareUrl: "https://example.com/answer/original",
  keywordEvaluations: [
    { keyword: "可靠", nature: "positive", context: "品牌提供可靠的服务。" },
  ],
  searchKeywords: ["品牌监控"],
  sentiment: "neutral",
  mentioned: false,
  position: null,
  rankings: [],
  citationProvenance: "explicit",
  citationList: [],
  referenceList: [],
  archivedScreenshots: [
    {
      id: "10000000-0000-4000-8000-000000000006",
      ordinal: 0,
      archiveStatus: "pending",
      accessPath: null,
      thumbnailAccessPath: null,
      mimeType: null,
      sizeBytes: null,
    },
  ],
};

function setup(options: { delayLists?: boolean } = {}) {
  let completed = false;
  let archived = false;
  const cancelledListScopes: unknown[] = [];
  const read = vi.fn((path: string, _input?: any) => {
    if (path === "monitoring.summary") {
      const summary: MonitoringSummaryData = {
        monitor: {
          id: monitorId,
          name: "问题监控",
          status: "active",
          activeVersionId: null,
          activeVersion: 1,
        },
        filters: {
          questions: [
            {
              id: questionId,
              ordinal: 0,
              label: listItem.question,
              category: "industry",
            },
          ],
          platforms: [{ ...platform, ordinal: 0 }],
          subjects: [{ kind: "self", label: "品牌" }],
        },
        metrics: { ...metrics, answers: completed ? 1 : 0 },
      };
      return summary;
    }
    if (path === "monitoring.answers.list") {
      return {
        items: [
          {
            ...listItem,
            ...(completed
              ? {
                  status: "completed",
                  result: {
                    answerPreview: "真实返回的回答",
                    sentiment: "neutral",
                    mentioned: false,
                    position: null,
                    citationProvenance: "explicit",
                    citationCount: 0,
                    referenceCount: 0,
                    screenshotCount: 1,
                    updatedAt: createdAt,
                  },
                }
              : {}),
          },
        ],
        nextCursor: null,
      };
    }
    if (path === "monitoring.answers.get") {
      if (!completed) throw new Error("No answer has been persisted yet");
      return {
        ...detail,
        archivedScreenshots: detail.archivedScreenshots.map((asset) => ({
          ...asset,
          ...(archived
            ? {
                archiveStatus: "archived",
                accessPath: `/api/monitoring/media/${asset.id}`,
                mimeType: "image/png",
                sizeBytes: 100,
              }
            : {}),
        })),
      };
    }
    if (path === "monitoring.analysis") {
      return {
        kind: "metrics",
        metrics: { ...metrics, answers: completed ? 1 : 0 },
        rows: [],
      };
    }
    throw new Error(`Unexpected read: ${path}`);
  });
  const client = trpc.createClient({
    links: [
      () =>
        ({ op }) =>
          observable((observer) => {
            const emit = () => {
              try {
                observer.next({ result: { data: read(op.path, op.input) } });
                observer.complete();
              } catch (error) {
                observer.error(TRPCClientError.from(error as Error));
              }
            };
            if (!options.delayLists || op.path !== "monitoring.answers.list") {
              emit();
              return;
            }
            let settled = false;
            const timer = setTimeout(() => {
              settled = true;
              emit();
            }, 1_000);
            const abort = () => {
              if (settled) return;
              settled = true;
              cancelledListScopes.push(op.input);
              clearTimeout(timer);
              observer.error(new TRPCClientError("Request aborted"));
            };
            op.signal?.addEventListener("abort", abort, { once: true });
            return () => {
              clearTimeout(timer);
              op.signal?.removeEventListener("abort", abort);
            };
          }),
    ],
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={client} queryClient={queryClient}>
        {children}
      </trpc.Provider>
    </QueryClientProvider>
  );
  return {
    wrapper,
    read,
    cancelledListScopes,
    complete: () => {
      completed = true;
    },
    archive: () => {
      archived = true;
    },
  };
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("live monitoring result reads", () => {
  it("does not poll or manually refetch a question rejected by the independent category catalog", async () => {
    const server = setup();
    const staleQuestionId = "10000000-0000-4000-8000-000000000099";
    const read = server.read.getMockImplementation()!;
    server.read.mockImplementation((path, input) => {
      const scope = input.scope || input;
      if (scope.questionId === staleQuestionId) {
        throw new TRPCClientError(
          "Question is not in the current configuration or scoped monitoring history",
        );
      }
      const response = read(path, input);
      if (path === "monitoring.summary" && scope.questionCategory) {
        const summary = response as MonitoringSummaryData;
        return { ...summary, filters: { ...summary.filters, questions: [] } };
      }
      if (path === "monitoring.answers.list")
        return { items: [], nextCursor: null };
      return response;
    });
    const { result, rerender } = renderHook(
      ({ question, answerId }) =>
        useMonitoringDataSource({
          enabled: true,
          query: {
            ...query,
            question,
            answerId,
            questionCategory: "industry",
            tab: "metrics",
          },
          timezone: "Asia/Shanghai",
        }),
      {
        initialProps: {
          question: staleQuestionId as string | undefined,
          answerId: query.answerId,
        },
        wrapper: server.wrapper,
      },
    );
    await advance(30_100);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.questionCatalogReady).toBe(true);
    expect(result.current.questionCatalogSummary?.filters.questions).toEqual(
      [],
    );
    expect(result.current.error).toBeUndefined();
    expect(
      server.read.mock.calls.every(([path]) => path === "monitoring.summary"),
    ).toBe(true);
    expect(
      server.read.mock.calls.some(
        ([, input]) => (input.scope || input).questionId,
      ),
    ).toBe(false);

    // The persisted answer can outlive the question parameter as well.
    rerender({ question: undefined, answerId: query.answerId });
    await advance(50);
    expect(result.current.summaryReady).toBe(true);
    expect(result.current.answersReady).toBe(true);
    expect(result.current.attempts).toEqual([]);
    await advance(20_100);
    expect(
      server.read.mock.calls.some(
        ([, input]) => (input.scope || input).questionId,
      ),
    ).toBe(false);
    expect(
      server.read.mock.calls.some(
        ([path]) => path === "monitoring.answers.get",
      ),
    ).toBe(false);
  });

  it("accepts a historical question whose category is ambiguous only in the global catalog", async () => {
    const server = setup();
    server.complete();
    const read = server.read.getMockImplementation()!;
    server.read.mockImplementation((path, input) => {
      const response = read(path, input);
      if (path !== "monitoring.summary" || input.questionCategory)
        return response;
      const summary = response as MonitoringSummaryData;
      return {
        ...summary,
        filters: {
          ...summary.filters,
          questions: summary.filters.questions.map((question) => ({
            ...question,
            category: null,
          })),
        },
      };
    });
    const { result } = renderHook(
      () =>
        useMonitoringDataSource({
          enabled: true,
          query: {
            ...query,
            question: questionId,
            questionCategory: "industry",
          },
          timezone: "Asia/Shanghai",
        }),
      { wrapper: server.wrapper },
    );
    await advance(50);
    expect(
      result.current.catalogSummary?.filters.questions[0]?.category,
    ).toBeNull();
    expect(
      result.current.questionCatalogSummary?.filters.questions[0]?.category,
    ).toBe("industry");
    expect(result.current.summaryReady).toBe(true);
    expect(result.current.detailAttempt?.id).toBe(answerId);
    expect(
      server.read.mock.calls.filter(
        ([path]) => path === "monitoring.answers.list",
      ),
    ).toEqual([
      [
        "monitoring.answers.list",
        expect.objectContaining({
          scope: expect.objectContaining({
            questionId,
            questionCategory: "industry",
          }),
        }),
      ],
    ]);
  });

  it("keeps a deep-linked answer outside cursor order until its own page is loaded", async () => {
    const server = setup();
    server.complete();
    const read = server.read.getMockImplementation()!;
    server.read.mockImplementation((path) => {
      const response = read(path);
      if (path !== "monitoring.answers.list") return response;
      const page = response as {
        items: MonitoringAnswerListItem[];
        nextCursor: null;
      };
      return {
        ...page,
        items: page.items.map((item) => ({
          ...item,
          answerId: "10000000-0000-4000-8000-000000000099",
        })),
      };
    });
    const { result } = renderHook(
      () =>
        useMonitoringDataSource({
          enabled: true,
          query,
          timezone: "Asia/Shanghai",
        }),
      { wrapper: server.wrapper },
    );
    await advance(50);
    expect(result.current.detailAttempt?.id).toBe(answerId);
    expect(result.current.attempts.map((item) => item.id)).toEqual([
      "10000000-0000-4000-8000-000000000099",
    ]);
  });
  it("cancels the pending page request when the category scope changes", async () => {
    const server = setup({ delayLists: true });
    const { rerender } = renderHook(
      ({ questionCategory }) =>
        useMonitoringDataSource({
          enabled: true,
          query: { ...query, questionCategory },
          timezone: "Asia/Shanghai",
        }),
      {
        initialProps: {
          questionCategory: "industry" as "industry" | "reputation",
        },
        wrapper: server.wrapper,
      },
    );
    await advance(50);
    rerender({ questionCategory: "reputation" });
    await advance(50);
    expect(server.cancelledListScopes).toEqual([
      expect.objectContaining({
        scope: expect.objectContaining({ questionCategory: "industry" }),
      }),
    ]);
  });
  it("maps original links and keyword evidence and fences details by historical category", () => {
    const mapped = attemptFromDetail(detail);
    expect(mapped.screenshotPolicy).toBeNull();
    expect(
      attemptFromDetail({
        ...detail,
        archivedScreenshots: [],
        screenshotPolicy: 2,
        screenshotBrandMentioned: false,
      }),
    ).toMatchObject({ screenshotPolicy: 2, screenshotBrandMentioned: false });
    expect(mapped.shareUrl).toBe("https://example.com/answer/original");
    expect(mapped.keywordEvaluations).toEqual(detail.keywordEvaluations);
    const bounds = { from: "2026-09-01T00:00:00Z", to: "2026-09-14T00:00:00Z" };
    expect(
      monitoringAnswerMatchesScope(detail, bounds, {
        questionId,
        questionCategory: "industry",
        subject: { kind: "self" },
      }),
    ).toBe(true);
    expect(
      monitoringAnswerMatchesScope(detail, bounds, {
        questionId,
        questionCategory: "reputation",
        subject: { kind: "self" },
      }),
    ).toBe(false);
  });
  it("replaces a running attempt with its full returned answer and later archived media without user refresh", async () => {
    const server = setup();
    const { result } = renderHook(
      () =>
        useMonitoringDataSource({
          enabled: true,
          query,
          timezone: "Asia/Shanghai",
        }),
      { wrapper: server.wrapper },
    );
    await advance(50);
    expect(result.current.attempts[0]?.status).toBe("processing");
    expect(
      server.read.mock.calls.some(
        ([path]) => path === "monitoring.answers.get",
      ),
    ).toBe(false);

    server.complete();
    await advance(10_100);
    await advance(50);
    expect(result.current.summary?.metrics.answers).toBe(1);
    expect(result.current.attempts[0]?.answer).toBe(detail.answerMarkdown);
    expect(result.current.attempts[0]?.status).toBe("completed");
    expect(result.current.attempts[0]?.assets?.[0].archiveStatus).toBe(
      "pending",
    );

    server.archive();
    await advance(10_100);
    expect(result.current.attempts[0]?.assets?.[0]).toMatchObject({
      archiveStatus: "archived",
      url: expect.stringContaining("/api/monitoring/media/"),
    });
    expect(result.current.error).toBeUndefined();
  });

  it("refreshes analysis in place and stops result polling when the workspace is disabled", async () => {
    const server = setup();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useMonitoringDataSource({
          enabled,
          query: { ...query, tab: "metrics" },
          timezone: "Asia/Shanghai",
        }),
      { initialProps: { enabled: true }, wrapper: server.wrapper },
    );
    await advance(50);
    expect(result.current.analysis).toMatchObject({
      kind: "metrics",
      metrics: { answers: 0 },
    });
    server.complete();
    await advance(10_100);
    expect(result.current.analysis).toMatchObject({
      kind: "metrics",
      metrics: { answers: 1 },
    });
    // Tabs are retired: the answer list loads alongside analysis data.
    expect(
      server.read.mock.calls.some(([path]) =>
        path.startsWith("monitoring.answers."),
      ),
    ).toBe(true);

    rerender({ enabled: false });
    const count = server.read.mock.calls.length;
    await advance(30_000);
    expect(server.read).toHaveBeenCalledTimes(count);
  });
});
