import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { TRPCClientError } from "@trpc/client";
import { afterEach, expect, it, vi } from "vitest";
import type { MonitoringScope } from "@frontmind/monitoring-contracts";
import { trpc } from "../../trpc";
import { demoProject } from "../../../tests/monitoring-fixtures";
import MonitoringWorkspace from "./MonitoringWorkspace";
import {
  answerDetailLoadDecision,
  type MonitoringAnswerDetail,
  type MonitoringAnswerListItem,
  type MonitoringSummaryData,
} from "./useMonitoringDataSource";
import { monitoringExportHref } from "./queryState";

const monitorId = "7bfa1671-fa5b-47c6-bcac-51df5754a523";
const doctorId = "ca263c8e-aeb4-8519-a966-62a474d89300";
const reputationId = "dee591b3-24a3-88f3-a526-424161a88f8a";
const platforms = [
  {
    id: "10000000-0000-8000-8000-000000000010",
    providerCode: "doubao",
    displayName: "豆包",
    clientType: "web" as const,
    mode: "search" as const,
    ordinal: 0,
  },
  {
    id: "10000000-0000-8000-8000-000000000011",
    providerCode: "deepseek",
    displayName: "DeepSeek",
    clientType: "web" as const,
    mode: "search" as const,
    ordinal: 1,
  },
];
const questions = [
  { id: doctorId, label: "台心医美有哪些医生", category: null, ordinal: 0 },
  { id: reputationId, label: "台心医美口碑怎么样", category: null, ordinal: 1 },
];
const items: MonitoringAnswerListItem[] = questions.flatMap(
  (question, questionIndex) =>
    Array.from({ length: questionIndex ? 12 : 13 }, (_, index) => ({
      answerId: `10000000-0000-8000-8000-${String(questionIndex * 100 + index + 1).padStart(12, "0")}`,
      runId: "20000000-0000-8000-8000-000000000001",
      runCreatedAt: `2026-09-${index < 6 ? "12" : "13"}T04:00:00Z`,
      questionId: question.id,
      question: question.label,
      questionCategory: null,
      platform: platforms[index % 2],
      repetition: index + 1,
      status: "completed" as const,
      result: {
        answerPreview: `${question.label}的回答${index + 1}`,
        sentiment: questionIndex
          ? ("negative" as const)
          : ("positive" as const),
        mentioned: false,
        position: null,
        citationProvenance: "explicit" as const,
        citationCount: 0,
        referenceCount: 0,
        screenshotCount: 0,
        updatedAt: "2026-09-13T04:00:00Z",
      },
    })),
);

function scopedItems(scope: MonitoringScope) {
  return items.filter(
    (item) =>
      (!scope.questionId || item.questionId === scope.questionId) &&
      (!scope.platformId || item.platform.id === scope.platformId) &&
      new Date(item.runCreatedAt) >= new Date(scope.from) &&
      new Date(item.runCreatedAt) < new Date(scope.to),
  );
}

function mountWorkspace(options: {
  report?: boolean;
  search?: string;
  questionsForScope?: (
    scope: MonitoringScope,
  ) => MonitoringSummaryData["filters"]["questions"];
} = {}) {
  const read = vi.fn((path: string, input: any) => {
    if (path === "monitors.get") return { version: { competitors: [] } };
    if (path === "runs.list") return [];
    const scope: MonitoringScope = input.scope || input;
    const availableQuestions = options.questionsForScope?.(scope) || questions;
    if (
      options.questionsForScope &&
      scope.questionId &&
      !availableQuestions.some((question) => question.id === scope.questionId)
    ) {
      throw TRPCClientError.from({
        error: {
          code: -32600,
          message: "Question is not in the current configuration or scoped monitoring history",
          data: { code: "BAD_REQUEST", httpStatus: 400 },
        },
      });
    }
    const selected = scopedItems(scope)
      .filter((item) => availableQuestions.some((question) => question.id === item.questionId))
      .map((item) => ({
        ...item,
        questionCategory: scope.questionCategory || item.questionCategory,
      }));
    if (path === "monitoring.summary") {
      return {
        monitor: {
          id: monitorId,
          name: "台心医美监控",
          status: "active",
          activeVersionId: null,
          activeVersion: 1,
        },
        filters: {
          questions: availableQuestions,
          platforms,
          subjects: [{ kind: "self", label: "台心医美" }],
        },
        metrics: {
          runs: 1,
          attempts: selected.length,
          answers: selected.length,
          mentionedAnswers: 0,
          mentionRate: 0,
          averagePosition: null,
          top1Rate: null,
          top3Rate: null,
          top10Rate: null,
          citationCount: 0,
          discoveredSourceCount: 0,
          uniqueDomainCount: 0,
          sentiments: {
            positive: selected.filter((item) => item.questionId === doctorId)
              .length,
            negative: selected.filter(
              (item) => item.questionId === reputationId,
            ).length,
            neutral: 0,
            unknown: 0,
          },
        },
      } satisfies MonitoringSummaryData;
    }
    if (path === "monitoring.answers.list")
      return { items: selected, nextCursor: null };
    if (path === "monitoring.analysis") {
      if (input.kind === "citations") return { kind: "citations", total: 0, items: [], contents: [] };
      if (input.kind === "sources") return { kind: "sources", total: 0, cited: 0, items: [], publicationTimeBuckets: [] };
      return { kind: "trends", granularity: "day", points: [] };
    }
    if (path === "monitoring.answers.get") {
      const item = items.find((item) => item.answerId === input.answerId)!;
      return {
        ...item,
        answerMarkdown: item.result!.answerPreview,
        reasoningMarkdown: null,
        shareUrl: null,
        keywordEvaluations: [],
        searchKeywords: [],
        sentiment: item.result!.sentiment,
        mentioned: false,
        position: null,
        rankings: [],
        citationProvenance: "explicit",
        citationList: [],
        referenceList: [],
        archivedScreenshots: [],
      } satisfies MonitoringAnswerDetail;
    }
    throw new Error(`Unexpected monitoring read: ${path}`);
  });
  const client = trpc.createClient({
    links: [
      () =>
        ({ op }) =>
          observable((observer) => {
            try {
              observer.next({ result: { data: read(op.path, op.input) } });
              observer.complete();
            } catch (error) {
              observer.error(TRPCClientError.from(error as Error));
            }
          }),
    ],
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  window.history.replaceState(
    {},
    "",
    options.search || (options.report
      ? "/?view=reports&enterpriseProjectId=46470000-0000-8000-8000-000000000001&operatorOwnerId=7&returnTo=report-history&tab=overview&range=custom&from=2026-09-01&to=2026-09-15"
      : "/monitoring-system?range=custom&from=2026-09-01&to=2026-09-15"),
  );
  render(
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={client} queryClient={queryClient}>
        <MonitoringWorkspace
          initialTab={options.report ? "trends" : undefined}
          analysisOnly={options.report}
          project={demoProject}
          monitors={[
            {
              id: monitorId,
              projectId: demoProject.id,
              name: "台心医美监控",
              questionsCount: 2,
              platformsCount: 2,
              repetitions: 1,
              scheduleLabel: "手动执行",
              status: "active",
            },
          ]}
          recentRuns={[]}
          deletedCount={0}
          serverData
          canRefresh
          onAdd={vi.fn()}
          onOpenRecycle={vi.fn()}
          onOpenDetails={vi.fn()}
          onOpenRun={vi.fn()}
          onRun={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
          onRefresh={vi.fn(async () => {})}
        />
      </trpc.Provider>
    </QueryClientProvider>,
  );
  return read;
}

afterEach(() => { window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });
async function openReportDialog() {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ questions, platforms: platforms.map((item) => ({ ...item, label: item.displayName })) }))));
  fireEvent.click(screen.getByRole("button", { name: "下载报告" }));
  await screen.findByRole("checkbox", { name: /台心医美有哪些医生/ });
}

async function expectOverviewEffective(value: number) {
  await waitFor(() => expect(
    within(screen.getByText("累计有效回答").closest("article")!).getByText(String(value), { selector: "strong" }),
  ).toBeVisible());
}


it("uses the selected UUID v8 question for the answer list, denominator, sentiment and export", async () => {
  const read = mountWorkspace();
  // 普通概览默认“全部问题”，显式选择医生问题后进入问题范围。
  await screen.findByRole("option", { name: "台心医美有哪些医生" });
  await waitFor(() =>
    expect(screen.getByLabelText("按问题筛选回答")).toHaveValue(""),
  );
  fireEvent.change(screen.getByLabelText("按问题筛选回答"), {
    target: { value: doctorId },
  });

  await waitFor(() =>
    expect(screen.getByLabelText("按问题筛选回答")).toHaveValue(doctorId),
  );
  await expectOverviewEffective(13);
  const navigation = screen.getByRole("tablist", { name: "概览分析子模块" });
  expect(within(navigation).getAllByRole("tab")).toHaveLength(5);
  for (const label of ["趋势分析", "情感分析", "信源分析", "AI 优化建议", "指标看板"]) {
    fireEvent.click(within(navigation).getByRole("tab", { name: label }));
    expect(screen.getByLabelText("按问题筛选回答")).toHaveValue(doctorId);
    expect(screen.getByLabelText("开始日期")).toHaveValue("2026-09-01");
  }
  await expectOverviewEffective(13);
  expect(
    read.mock.calls.some(
      ([path, input]) =>
        path === "monitoring.summary" && input.questionId === doctorId,
    ),
  ).toBe(true);
  expect(
    read.mock.calls.some(
      ([path, input]) =>
        path === "monitoring.answers.list" &&
        input.scope.questionId === doctorId,
    ),
  ).toBe(true);
  await openReportDialog();
  expect(screen.getByRole("checkbox", { name: /台心医美有哪些医生/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /台心医美口碑怎么样/ })).not.toBeChecked();
});

it("starts an embedded report in trends and preserves the host report route while selecting a question", async () => {
  const read = mountWorkspace({ report: true });
  await screen.findByText("回答 1 / 13");
  expect(screen.getByRole("heading", { name: "趋势分析" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("按问题筛选回答"), {
    target: { value: reputationId },
  });
  await screen.findByText("回答 1 / 12");
  const params = new URLSearchParams(window.location.search);
  expect(window.location.pathname).toBe("/");
  expect(params.get("view")).toBe("reports");
  expect(params.get("enterpriseProjectId")).toBe(
    "46470000-0000-8000-8000-000000000001",
  );
  expect(params.get("operatorOwnerId")).toBe("7");
  expect(params.get("returnTo")).toBe("report-history");
  expect(params.get("tab")).toBe("trends");
  expect(
    read.mock.calls
      .filter(([path]) => path === "monitoring.analysis")
      .at(-1)?.[1],
  ).toMatchObject({ kind: "trends", scope: { questionId: reputationId } });
});

it("keeps UUID v8 question, platform and date filters together when switching the visible question", async () => {
  const read = mountWorkspace();
  await screen.findByRole("option", { name: "台心医美有哪些医生" });
  fireEvent.change(screen.getByLabelText("按问题筛选回答"), {
    target: { value: doctorId },
  });
  await expectOverviewEffective(13);
  fireEvent.change(screen.getByLabelText("按模型筛选回答"), {
    target: { value: platforms[0].id },
  });
  await expectOverviewEffective(7);
  fireEvent.change(screen.getByLabelText("开始日期"), {
    target: { value: "2026-09-13" },
  });
  await expectOverviewEffective(4);
  fireEvent.change(screen.getByLabelText("按问题筛选回答"), {
    target: { value: reputationId },
  });
  await expectOverviewEffective(3);
  fireEvent.click(screen.getByRole("tab", { name: "情感分析" }));
  // v2 概览情感分析为自绘四类环形图与图例（fm-ov-tone-legend），
  // 不再经由 CompactAnswerInsights 的「当前筛选范围情感分布」标签。
  const scopeSentiment = document.querySelector(
    ".fm-ov-tone-legend",
  ) as HTMLElement;
  expect(scopeSentiment).not.toBeNull();
  expect(
    screen.getByText(/2026-09-13 — 2026-09-14/),
  ).toBeVisible();
  expect(
    within(scopeSentiment).getByText("负面").closest("li"),
  ).toHaveTextContent(/负面\s*3\s*100\.0%/);
  expect(
    within(scopeSentiment).getByText("未判定").closest("li"),
  ).toHaveTextContent(/未判定\s*0\s*0\.0%/);
  // v2 会额外读取紧邻的等长前周期做环比（comparablePeriods），
  // 最后一条 answers.list 记录可能是前周期读取；断言当前筛选的读取确实发生。
  expect(
    read.mock.calls
      .filter(([path]) => path === "monitoring.answers.list")
      .map((call) => call[1].scope),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        questionId: reputationId,
        platformId: platforms[0].id,
        from: new Date("2026-09-12T16:00:00Z"),
        to: new Date("2026-09-14T16:00:00Z"),
      }),
    ]),
  );
  await openReportDialog();
  expect(screen.getByRole("checkbox", { name: /台心医美口碑怎么样/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /豆包/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /DeepSeek/ })).not.toBeChecked();
  expect(within(screen.getByRole("dialog")).getByLabelText("开始日期")).toHaveValue("2026-09-13");
  expect(within(screen.getByRole("dialog")).getByLabelText("结束日期")).toHaveValue("2026-09-14");
});

it("accepts valid UUID v8 deep links and retains strict identifier validation", () => {
  expect(answerDetailLoadDecision(doctorId, true, []).shouldFetch).toBe(true);
  for (const invalid of [
    "doctor",
    `${doctorId}\n`,
    doctorId.replace("-8519-", "-0519-"),
    doctorId.replace("-a966-", "-0966-"),
  ]) {
    expect(answerDetailLoadDecision(invalid, true, []).shouldFetch).toBe(false);
    expect(
      monitoringExportHref(
        {
          monitorId: invalid,
          from: "2026-09-01",
          to: "2026-09-15",
          tab: "answers",
          subject: "self",
          range: "custom",
          sourceScope: "all",
          fullscreen: false,
        },
        "Asia/Shanghai",
      ),
    ).toBeUndefined();
  }
});

it.each([true, false])("clears retired answer references when the category has no candidates (question reference: %s)", async (includeQuestion) => {
  const retiredQuestionId = "30000000-0000-4000-8000-000000000099";
  const retiredAnswerId = "40000000-0000-4000-8000-000000000099";
  const read = mountWorkspace({
    search: `/monitoring-system?range=custom&from=2026-09-01&to=2026-09-15&questionCategory=industry&question=${includeQuestion ? retiredQuestionId : ""}&answerQuestion=${retiredQuestionId}&answer=${retiredAnswerId}&fullscreen=1`,
    questionsForScope: (scope) => scope.questionCategory ? [] : questions,
  });

  await waitFor(() => {
    const params = new URLSearchParams(window.location.search);
    expect(params.get("question")).toBe("");
    expect(params.get("answerQuestion")).toBe("");
    expect(params.get("answer")).toBe("");
    expect(params.has("fullscreen")).toBe(false);
    expect(params.get("questionCategory")).toBe("industry");
  });
  expect(screen.getByLabelText("按问题筛选回答")).toHaveValue("");
  expect(screen.getByRole("option", { name: "全部问题（0）" })).toBeInTheDocument();
  await waitFor(() => expect(read.mock.calls.some(([path]) => path === "monitoring.answers.list")).toBe(true));
  expect(read.mock.calls.some(([, input]) =>
    (input.scope || input).questionId === retiredQuestionId,
  )).toBe(false);
  expect(read.mock.calls.some(([, input]) => input.answerId === retiredAnswerId)).toBe(false);
  expect(screen.queryByText(/实时监控数据读取失败/)).not.toBeInTheDocument();
});

it("clears a retired category question from an independent catalog despite rejected filtered reads", async () => {
  const retiredQuestionId = "30000000-0000-4000-8000-000000000099";
  const read = mountWorkspace({
    search: `/monitoring-system?range=custom&from=2026-09-01&to=2026-09-15&questionCategory=industry&question=${retiredQuestionId}`,
    questionsForScope: (scope) => scope.questionCategory
      ? [{ ...questions[0]!, category: "industry" }]
      : questions,
  });

  await waitFor(() =>
    expect(new URLSearchParams(window.location.search).get("question")).toBe(""),
  );
  await expectOverviewEffective(13);
  expect(read.mock.calls.some(([, input]) =>
    (input.scope || input).questionId === retiredQuestionId,
  )).toBe(false);
  expect(screen.queryByText(/实时监控数据读取失败/)).not.toBeInTheDocument();
});

it("clears a historical question after its date window no longer contains any category candidates", async () => {
  const read = mountWorkspace({
    search: `/monitoring-system?range=custom&from=2026-09-01&to=2026-09-15&questionCategory=industry&question=${doctorId}`,
    questionsForScope: (scope) => !scope.questionCategory
      ? questions
      : new Date(scope.from) < new Date("2026-09-13T16:00:00Z")
        ? [{ ...questions[0]!, category: "industry" }]
        : [],
  });
  await expectOverviewEffective(13);
  const previousReadCount = read.mock.calls.length;
  fireEvent.change(screen.getByLabelText("开始日期"), {
    target: { value: "2026-09-14" },
  });

  await waitFor(() => {
    const params = new URLSearchParams(window.location.search);
    expect(params.get("question")).toBe("");
    expect(params.get("answerQuestion")).toBe("");
    expect(params.get("answer")).toBe("");
  });
  expect(screen.getByRole("option", { name: "全部问题（0）" })).toBeInTheDocument();
  expect(read.mock.calls.slice(previousReadCount).some(([, input]) =>
    (input.scope || input).questionId === doctorId,
  )).toBe(false);
  expect(screen.queryByText(/实时监控数据读取失败/)).not.toBeInTheDocument();
});
