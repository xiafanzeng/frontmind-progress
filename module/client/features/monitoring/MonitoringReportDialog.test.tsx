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
import { afterEach, expect, it, vi } from "vitest";
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
    averagePosition: null, top1Rate: null, top3Rate: null, top10Rate: null,
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
])(
  "shows inclusive end dates and preserves exclusive request bounds across %s to %s",
  async (from, to, inclusiveTo, utcFrom, utcTo) => {
    // jsdom 缺少 URL.createObjectURL，成功收尾无法走完；下载保持挂起，只验证请求边界。
    const fetcher = vi.fn(async (_url: string, _options?: RequestInit) =>
      new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", fetcher);
    renderDialog({ query: { from, to } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "下载 Excel" })).toBeEnabled(),
    );
    // 弹窗直接展示当前范围：界面日期含结束当天，下载请求体保持不含当天的 UTC 边界。
    expect(screen.getByText(`${from} 至 ${inclusiveTo}`)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "下载 Excel" }));
    const call = await waitFor(() => fetcher.mock.calls.find(([url]) => url.includes("report.xlsx"))!);
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({
      from: `${utcFrom}T16:00:00.000Z`,
      to: `${utcTo}T16:00:00.000Z`,
    });
  },
);
it("locks the download to the current question/model scope and duplicate submission", async () => {
  let resolveDownload!: (value: Response) => void;
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) =>
    new Promise<Response>((resolve) => {
      resolveDownload = resolve;
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const { close } = renderDialog({});
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "下载 Excel" })).toBeEnabled(),
  );
  expect(screen.getByText("豆包（网页版）")).toBeVisible();
  const download = screen.getByRole("button", { name: "下载 Excel" });
  fireEvent.click(download);
  fireEvent.click(download);
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes("report.xlsx")),
    ).toHaveLength(1),
  );
  const call = fetcher.mock.calls.find(([url]) => url.includes("report.xlsx"))!;
  expect(JSON.parse(String(call[1]!.body))).toMatchObject({
    from: "2026-09-13T16:00:00.000Z",
    to: "2026-09-14T16:00:00.000Z",
    subject: { kind: "self" },
    questionIds: [q1],
    platformIds: [p1],
  });
  resolveDownload(
    new Response(JSON.stringify({ error: "请缩小日期范围" }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }),
  );
  await screen.findByText("请缩小日期范围");
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "下载 Excel" })).toBeEnabled();
});
it("cancels an in-flight report when the dialog closes", async () => {
  let downloadSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes("report.xlsx")) {
        downloadSignal = options.signal as AbortSignal;
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
  const { close } = renderDialog({});
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "下载 Excel" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "下载 Excel" }));
  await screen.findByRole("button", { name: "取消下载" });
  fireEvent.click(screen.getByRole("button", { name: "取消下载" }));
  expect(downloadSignal?.aborted).toBe(true);
  expect(close).toHaveBeenCalledOnce();
});
