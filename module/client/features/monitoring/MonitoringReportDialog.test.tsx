import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { TRPCClientError } from "@trpc/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { collectExportData, prepareExportFile } from "./monitoringExport";
vi.mock("./monitoringExport", () => ({ collectExportData: vi.fn(), prepareExportFile: vi.fn() }));
beforeEach(() => {
  vi.mocked(collectExportData).mockReset();
  vi.mocked(prepareExportFile).mockReset();
});
import { trpc } from "../../trpc";
import MonitoringReportDialog from "./MonitoringReportDialog";
import type { MonitoringQueryState } from "./types";
const q1 = "11111111-1111-5111-8111-111111111111",
  q2 = "22222222-2222-5222-8222-222222222222",
  p1 = "33333333-3333-5333-8333-333333333333",
  p2 = "44444444-4444-5444-8444-444444444444";
const query: MonitoringQueryState = {
  monitorId: q1,
  tab: "answers",
  subject: "self",
  range: "custom",
  from: "2026-09-14",
  to: "2026-09-15",
  question: q1,
  model: p1,
  sourceScope: "all",
  fullscreen: false,
};
// 逐题改版后弹窗锁定当前问题/模型/日期；目录与范围可用性由 tRPC monitoring.summary 提供。
const summary = {
  monitor: { id: q1, name: "品牌监控", status: "active", activeVersionId: null, activeVersion: 1 },
  filters: {
    questions: [
      { id: q1, label: "问题甲", category: "industry" },
      { id: q2, label: "问题乙", category: "reputation" },
    ],
    platforms: [
      { id: p1, displayName: "豆包", clientType: "web" },
      { id: p2, displayName: "元宝", clientType: "web" },
    ],
    subjects: [{ kind: "self", label: "品牌监控" }],
  },
  metrics: {
    runs: 1, attempts: 5, answers: 5, mentionedAnswers: 0, mentionRate: 0,
    triggeredRuns: 1, mentionedRuns: 0, top3Runs: 0,
    averagePosition: null, top1Rate: null, top3Rate: 0, top10Rate: null,
    citationCount: 0, discoveredSourceCount: 0, uniqueDomainCount: 0,
    sentiments: { positive: 0, negative: 0, neutral: 0, unknown: 0 },
  },
  brandScope: { targetBrand: "品牌监控", eligibleAnswers: 5, excludedAnswers: 0 },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function renderDialog(props: { query?: Partial<MonitoringQueryState>; onClose?: () => void }) {
  const close = props.onClose ?? vi.fn();
  const read = vi.fn((path: string, input: unknown) => {
    if (path === "monitoring.summary") {
      expect(input).toMatchObject({ monitorId: q1, questionId: q1, platformId: p1 });
      return summary;
    }
    throw new Error(`Unexpected RPC: ${path}`);
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={client} queryClient={queryClient}>
        <MonitoringReportDialog
          query={{ ...query, ...props.query }}
          timezone="Asia/Shanghai"
          monitorName="品牌监控"
          modelLabel="豆包（网页版）"
          onClose={close}
        />
      </trpc.Provider>
    </QueryClientProvider>,
  );
  return { close, read };
}
it.each([
  ["2024-02-28", "2024-03-01", "2024-02-29", "2024-02-27", "2024-02-29"],
  ["2026-12-31", "2027-01-01", "2026-12-31", "2026-12-30", "2026-12-31"],
])("preserves inclusive displayed dates and exclusive export bounds across %s to %s", async (from, to, inclusiveTo, utcFrom, utcTo) => {
  vi.mocked(collectExportData).mockImplementation(() => new Promise(() => {}));
  renderDialog({ query: { from, to } });
  const button = screen.getByRole("button", { name: "导出 1 项" });
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByText(`${from} 至 ${inclusiveTo}`)).toBeVisible();
  fireEvent.click(button);
  await waitFor(() => expect(collectExportData).toHaveBeenCalledOnce());
  expect(vi.mocked(collectExportData).mock.calls[0][1].scope).toMatchObject({
    from: new Date(`${utcFrom}T16:00:00.000Z`), to: new Date(`${utcTo}T16:00:00.000Z`),
    questionId: q1, platformId: p1, subject: { kind: "self" },
  });
});
it("prevents empty selection and supports independent single or multiple categories", async () => {
  renderDialog({});
  await waitFor(() => expect(screen.getByRole("button", { name: "导出 1 项" })).toBeEnabled());
  expect(screen.getByText("豆包（网页版）")).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: /^问答明细/ }));
  expect(screen.getByRole("button", { name: "导出", exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /^截图/ }));
  expect(screen.getByRole("button", { name: "导出 1 项" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "全选", exact: true }));
  expect(screen.getByRole("button", { name: "导出 4 项" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "取消全选", exact: true }));
  expect(screen.getByRole("button", { name: "导出", exact: true })).toBeDisabled();
});
it("locks duplicate submissions and keeps a failed export open for retry", async () => {
  let rejectRead!: (reason: Error) => void;
  vi.mocked(collectExportData).mockImplementation(() => new Promise((_resolve, reject) => { rejectRead = reject; }));
  const { close } = renderDialog({});
  const button = screen.getByRole("button", { name: "导出 1 项" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(collectExportData).toHaveBeenCalledOnce());
  rejectRead(new Error("请缩小日期范围"));
  await screen.findByText("请缩小日期范围");
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "导出 1 项" })).toBeEnabled();
});
it("aborts pending reads when the dialog closes", async () => {
  vi.mocked(collectExportData).mockImplementation(() => new Promise(() => {}));
  const { close } = renderDialog({});
  const button = screen.getByRole("button", { name: "导出 1 项" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(collectExportData).toHaveBeenCalledOnce());
  const signal = vi.mocked(collectExportData).mock.calls[0][2];
  fireEvent.click(screen.getByRole("button", { name: "取消导出" }));
  expect(signal.aborted).toBe(true);
  expect(close).toHaveBeenCalledOnce();
});
