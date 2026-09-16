import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunAttempt } from "../../domain";
import {
  demoConfigurations,
  demoProject,
  makeDemoMonitor,
  makeDemoRun,
} from "../../../tests/monitoring-fixtures";
import MonitoringWorkspace from "./MonitoringWorkspace";

const liveState = vi.hoisted(() => ({
  attempts: [] as RunAttempt[],
  detailAttempt: undefined as RunAttempt | undefined,
  detailSettled: true,
  detailError: false,
  retryDetail: vi.fn(),
}));
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

beforeEach(() => {
  liveState.attempts = [];
  liveState.detailAttempt = undefined;
  liveState.detailSettled = true;
  liveState.detailError = false;
  liveState.retryDetail.mockClear();
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
    const { rerender } = render(<MonitoringWorkspace {...props} />);
    expect(screen.getByLabelText("选择日期范围")).toHaveValue("custom");
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();

    const request = { monitorId, runId: freshRun.id, nonce: 1 };
    rerender(<MonitoringWorkspace {...props} selectionRequest={request} />);
    expect(screen.getByLabelText("选择日期范围")).toHaveValue("7d");

    liveState.attempts = [freshAttempt, priorAttempt];
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
  const { rerender } = render(<MonitoringWorkspace {...props} />);
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
  const { rerender } = render(<MonitoringWorkspace {...props} />);
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
  fireEvent.click(screen.getByRole("button", { name: "重新读取回答" }));
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
