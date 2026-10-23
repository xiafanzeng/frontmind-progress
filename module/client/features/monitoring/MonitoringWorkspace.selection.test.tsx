import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitorRun, RunAttempt } from "../../domain";
import {
  demoConfigurations,
  demoProject,
  makeDemoMonitor,
  makeDemoRun,
} from "../../../tests/monitoring-fixtures";
import { trpc } from "../../trpc";
import MonitoringWorkspace from "./MonitoringWorkspace";

const liveState = vi.hoisted(() => ({
  attempts: [] as RunAttempt[],
  detailAttempt: undefined as RunAttempt | undefined,
  detailSettled: true,
  detailError: false,
  retryDetail: vi.fn(),
}));
const liveDetail = vi.hoisted(() => ({
  runs: [] as MonitorRun[],
  run: undefined as MonitorRun | undefined,
  runAttempts: [] as RunAttempt[],
  questions: [] as Array<{ id: string; label: string; category?: string | null }>,
}));
// Selection tests isolate the existing answer-navigation controller. Overview
// now has its own real tRPC reads, covered by the provider-backed scope tests.
vi.mock("./overview/OverviewWorkspace", () => ({ default: () => null }));
vi.mock("./useMonitoringDataSource", () => ({
  useMonitoringDataSource: () => ({
    summary: undefined,
    attempts: liveState.attempts,
    detailAttempt: liveState.detailAttempt,
    analysis: undefined,
    summaryReady: true,
    answersReady: true,
    answerDetailLoading: false,
    answerDetailSettled: liveState.detailSettled,
    answerDetailError: liveState.detailError,
    retryAnswerDetail: liveState.retryDetail,
    hasMoreAnswers: false,
    loadingMoreAnswers: false,
    loadMoreAnswers: vi.fn(),
    loading: false,
    error: undefined,
    refresh: vi.fn(),
  }),
}));
// 问题明细（tab=answers）经由 useQuestionDetailData 读取运行与回答；
// 这里沿用与 useMonitoringDataSource 相同的 liveState 驱动方式。
vi.mock("./useQuestionDetailData", () => ({
  useQuestionDetailData: () => ({
    runs: liveDetail.runs,
    run: liveDetail.run
      ? { ...liveDetail.run, attempts: liveDetail.runAttempts }
      : undefined,
    questions: liveDetail.questions,
    linkedAnswer: liveState.detailAttempt,
    loading: !liveState.detailSettled,
    error: liveState.detailError ? "指定回答读取失败" : undefined,
    retry: liveState.retryDetail,
    historyLimited: false,
  }),
  previewQuestionDetailData: () => ({
    runs: [],
    run: undefined,
    questions: [],
    loading: false,
  }),
}));

// 监控配置侧栏在 serverData 模式经真实 tRPC 读取分组；选择行为测试提供空分组，
// 与 scope 测试的 provider 包装保持同一模式。
function renderWorkspace(ui: ReactElement) {
  const client = trpc.createClient({
    links: [
      () => ({ op }) =>
        observable((observer) => {
          if (op.path === "projects.monitorOrganization.get") {
            observer.next({
              result: {
                data: { version: 1, revision: 0, groups: [], membership: {} },
              },
            });
            observer.complete();
            return;
          }
          observer.error(
            TRPCClientError.from(
              new Error(`Unexpected tRPC read in selection tests: ${op.path}`),
            ),
          );
        }),
    ],
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrap = (element: ReactElement) => (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={client} queryClient={queryClient}>
        {element}
      </trpc.Provider>
    </QueryClientProvider>
  );
  const view = render(wrap(ui));
  return {
    ...view,
    rerender: (element: ReactElement) => view.rerender(wrap(element)),
  };
}

function detailQuestions(runs: Array<{ attempts: RunAttempt[] }>) {
  return [
    ...new Map(
      runs
        .flatMap((item) => item.attempts)
        .map((attempt) => [
          attempt.questionId,
          {
            id: attempt.questionId,
            label: attempt.question,
            category: attempt.questionCategory,
          },
        ]),
    ).values(),
  ];
}

beforeEach(() => {
  liveState.attempts = [];
  liveState.detailAttempt = undefined;
  liveState.detailSettled = true;
  liveState.detailError = false;
  liveState.retryDetail.mockClear();
  liveDetail.runs = [];
  liveDetail.run = undefined;
  liveDetail.runAttempts = [];
  liveDetail.questions = [];
  window.history.replaceState(
    {},
    "",
    "/monitoring-system?tab=metrics&range=custom&from=2020-01-01&to=2020-02-01",
  );
});
afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("submitted monitoring run selection", () => {
  it("opens recent answers and selects the new run when its attempts arrive after stale cached answers", async () => {
    const [monitorId, config] = Object.entries(demoConfigurations)[0]!;
    const priorRun = makeDemoRun(monitorId, config, 1, 1);
    const freshRun = makeDemoRun(monitorId, config, 2);
    const priorAttempt = { ...priorRun.attempts[0]!, answer: "上一轮回答" };
    const freshAttempt = {
      ...freshRun.attempts[0]!,
      answer: "这次手动提交后返回的新回答",
    };
    liveState.attempts = [priorAttempt];
    liveDetail.runs = [freshRun, priorRun];
    liveDetail.run = freshRun;
    liveDetail.runAttempts = [];
    liveDetail.questions = detailQuestions([freshRun]);
    const props = {
      project: demoProject,
      monitors: [makeDemoMonitor(monitorId, config, freshRun)],
      recentRuns: [freshRun, priorRun],
      latestRun: freshRun,
      deletedCount: 0,
      serverData: true,
      canRefresh: true,
      onAdd: vi.fn(),
      onOpenRecycle: vi.fn(),
      onOpenDetails: vi.fn(),
      onOpenRun: vi.fn(),
      onRun: vi.fn(),
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onRefresh: vi.fn(async () => {}),
    };
    const { rerender } = renderWorkspace(<MonitoringWorkspace {...props} />);
    expect(screen.getByLabelText("选择日期范围")).toHaveValue("custom");
    // 概览标签由五个子模块承载；回答视图（含复制）位于「问答明细」标签。
    expect(screen.getByRole("button", { name: "问答明细" })).toBeInTheDocument();

    const request = { monitorId, runId: freshRun.id, nonce: 1 };
    rerender(<MonitoringWorkspace {...props} selectionRequest={request} />);
    expect(screen.getByLabelText("选择日期范围")).toHaveValue("7d");

    liveState.attempts = [freshAttempt, priorAttempt];
    liveDetail.runAttempts = [freshAttempt];
    rerender(<MonitoringWorkspace {...props} selectionRequest={request} />);
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("answer")).toBe(
        freshAttempt.id,
      ),
    );
    expect(screen.getByText("这次手动提交后返回的新回答")).toBeVisible();
    expect(screen.queryByText("上一轮回答")).not.toBeInTheDocument();
  });
});

it("labels enabled configuration independently of a finished run and only toggles real schedules", () => {
  const [monitorId, config] = Object.entries(demoConfigurations)[0]!;
  const run = makeDemoRun(monitorId, config);
  const monitor = {
    ...makeDemoMonitor(monitorId, config, run),
    scheduleType: "none" as const,
  };
  const props = {
    project: demoProject,
    monitors: [monitor],
    recentRuns: [run],
    latestRun: run,
    deletedCount: 0,
    serverData: true,
    canRefresh: true,
    onAdd: vi.fn(),
    onOpenRecycle: vi.fn(),
    onOpenDetails: vi.fn(),
    onOpenRun: vi.fn(),
    onRun: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onRefresh: vi.fn(async () => {}),
  };
  const { rerender } = renderWorkspace(<MonitoringWorkspace {...props} />);
  expect(screen.getAllByText("已启用").length).toBeGreaterThan(0);
  expect(screen.queryByText("运行中")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "暂停计划" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "恢复计划" }),
  ).not.toBeInTheDocument();
  const daily = { ...monitor, scheduleType: "daily" as const };
  rerender(<MonitoringWorkspace {...props} monitors={[daily]} />);
  fireEvent.click(screen.getByRole("button", { name: "暂停计划" }));
  expect(props.onToggle).toHaveBeenCalledWith(daily);
  const paused = { ...daily, status: "paused" as const };
  rerender(<MonitoringWorkspace {...props} monitors={[paused]} />);
  fireEvent.click(screen.getByRole("button", { name: "恢复计划" }));
  expect(props.onToggle).toHaveBeenLastCalledWith(paused);
});

it("preserves a deep-linked answer while its detail is pending and after it arrives outside the loaded page", async () => {
  const [monitorId, config] = Object.entries(demoConfigurations)[0]!;
  const run = makeDemoRun(monitorId, config);
  const first = { ...run.attempts[0]!, answer: "最新回答" };
  const historical = {
    ...first,
    id: "10000000-0000-4000-8000-000000000061",
    answer: "指定的历史回答",
  };
  liveState.attempts = [first];
  liveState.detailSettled = false;
  liveDetail.runs = [run];
  liveDetail.run = run;
  liveDetail.runAttempts = [historical];
  liveDetail.questions = detailQuestions([run]);
  window.history.replaceState(
    {},
    "",
    `/monitoring-system?monitor=${monitorId}&tab=answers&range=7d&answer=${historical.id}&answerQuestion=${historical.questionId}`,
  );
  const props = {
    project: demoProject,
    monitors: [makeDemoMonitor(monitorId, config, run)],
    recentRuns: [run],
    latestRun: run,
    deletedCount: 0,
    serverData: true,
    canRefresh: true,
    onAdd: vi.fn(),
    onOpenRecycle: vi.fn(),
    onOpenDetails: vi.fn(),
    onOpenRun: vi.fn(),
    onRun: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onRefresh: vi.fn(async () => {}),
  };
  const { rerender } = renderWorkspace(<MonitoringWorkspace {...props} />);
  expect(new URLSearchParams(window.location.search).get("answer")).toBe(
    historical.id,
  );
  liveState.detailError = true;
  liveState.detailSettled = true;
  rerender(<MonitoringWorkspace {...props} />);
  expect(new URLSearchParams(window.location.search).get("answer")).toBe(
    historical.id,
  );
  expect(screen.queryByText("最新回答")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  expect(liveState.retryDetail).toHaveBeenCalledTimes(1);
  liveState.detailError = false;
  liveState.detailAttempt = historical;
  liveState.detailSettled = true;
  rerender(<MonitoringWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText("指定的历史回答")).toBeVisible());
  expect(new URLSearchParams(window.location.search).get("answer")).toBe(
    historical.id,
  );
});
