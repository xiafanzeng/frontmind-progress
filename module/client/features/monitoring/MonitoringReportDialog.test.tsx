import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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
  sourceScope: "all",
  fullscreen: false,
};
const catalog = {
  questions: [
    { id: q1, label: "问题甲", category: "industry" },
    { id: q2, label: "问题乙", category: "reputation" },
  ],
  platforms: [
    { id: p1, label: "豆包", clientType: "web" },
    { id: p2, label: "元宝", clientType: "web" },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([
  ["2024-02-28", "2024-03-01", "2024-02-29", "2024-02-27", "2024-02-29"],
  ["2026-12-31", "2027-01-01", "2026-12-31", "2026-12-30", "2026-12-31"],
])(
  "shows inclusive end dates and preserves exclusive request bounds across %s to %s",
  async (from, to, inclusiveTo, utcFrom, utcTo) => {
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) =>
      new Response(JSON.stringify(catalog)),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <MonitoringReportDialog
        query={{ ...query, from, to }}
        timezone="Asia/Shanghai"
        monitorName="品牌监控"
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole("checkbox", { name: /问题乙/ });
    expect(screen.getByLabelText("结束日期")).toHaveValue(inclusiveTo);
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toMatchObject({
      from: `${utcFrom}T16:00:00.000Z`,
      to: `${utcTo}T16:00:00.000Z`,
    });
  },
);
it("downloads selected questions/models in the project timezone and locks duplicate submission", async () => {
  let resolveDownload!: (value: Response) => void;
  const fetcher = vi.fn(async (url: string, _options: RequestInit) =>
    url.includes("report-options")
      ? new Response(JSON.stringify(catalog), {
          headers: { "content-type": "application/json" },
        })
      : new Promise<Response>((resolve) => {
          resolveDownload = resolve;
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  const close = vi.fn();
  render(
    <MonitoringReportDialog
      query={query}
      timezone="Asia/Shanghai"
      monitorName="品牌监控"
      onClose={close}
    />,
  );
  await screen.findByRole("checkbox", { name: /问题乙/ });
  fireEvent.click(screen.getByRole("checkbox", { name: /问题乙/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /元宝/ }));
  const download = screen.getByRole("button", { name: "下载 Excel" });
  fireEvent.click(download);
  fireEvent.click(download);
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes("report.xlsx")),
    ).toHaveLength(1),
  );
  const call = fetcher.mock.calls.find(([url]) => url.includes("report.xlsx"))!;
  expect(JSON.parse(String(call[1].body))).toMatchObject({
    from: "2026-09-13T16:00:00.000Z",
    to: "2026-09-14T16:00:00.000Z",
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
  expect(
    screen.getByRole("checkbox", { name: /问题甲/ }).getAttribute("checked"),
  ).not.toBeNull();
  expect(screen.getByRole("button", { name: "下载 Excel" })).toBeEnabled();
});
it("cancels an in-flight report when the dialog closes", async () => {
  let downloadSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes("report-options"))
        return new Response(JSON.stringify(catalog));
      downloadSignal = options.signal as AbortSignal;
      return new Promise<Response>(() => {});
    }),
  );
  const close = vi.fn();
  render(
    <MonitoringReportDialog
      query={query}
      timezone="Asia/Shanghai"
      monitorName="品牌监控"
      onClose={close}
    />,
  );
  await screen.findByRole("checkbox", { name: /问题乙/ });
  fireEvent.click(screen.getByRole("button", { name: "下载 Excel" }));
  await screen.findByRole("button", { name: "取消下载" });
  fireEvent.click(screen.getByRole("button", { name: "取消下载" }));
  expect(downloadSignal?.aborted).toBe(true);
  expect(close).toHaveBeenCalledOnce();
});
