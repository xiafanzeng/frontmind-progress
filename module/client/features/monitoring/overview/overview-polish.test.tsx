import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { MonitorRun } from "../../../domain";
import type { MonitoringQueryState } from "../types";
import type { OverviewSentimentData } from "../../../../contracts/overview";
import { demoConfigurations, makeDemoRun } from "../../../../tests/monitoring-fixtures";
import { calendarTrendDays } from "./trendCalendar";
import OverviewTrend from "./OverviewTrend";
import OverviewKeywordRanking, { initialWordPages } from "./OverviewKeywordRanking";
import OverviewPagination from "./OverviewPagination";

afterEach(cleanup);
const query: MonitoringQueryState = {
  tab: "overview", subject: "self", range: "custom", from: "2026-11-01", to: "2026-11-05", sourceScope: "all", fullscreen: false,
};
function run(id: string, createdAt: string, completedAt = createdAt): MonitorRun {
  const base = makeDemoRun("monitor", demoConfigurations["demo-living"]!);
  return { ...base, id, createdAt, completedAt, status: "completed",
    config: { ...base.config, brandName: "目标品牌", competitors: [] },
    attempts: [{ ...base.attempts[0]!, status: "completed", questionId: "question", platformId: "platform", answer: "有效回答", brandMentioned: true, mentionPosition: 1 }],
  };
}

it("keeps every project-calendar day and chooses the last completion, not the last start or an average", () => {
  const firstStarted = run("first-start", "2026-11-01T01:00:00Z", "2026-11-01T12:00:00Z");
  const lastStarted = run("last-start", "2026-11-01T03:00:00Z", "2026-11-01T05:00:00Z");
  const laterFailure = { ...run("failed", "2026-11-01T13:00:00Z"), status: "failed" as const };
  const thirdDay = run("third-day", "2026-11-02T16:30:00Z"); // Nov 3 in Shanghai.
  const endExcluded = run("end", "2026-11-04T16:00:00Z");
  const days = calendarTrendDays([laterFailure, thirdDay, lastStarted, endExcluded, firstStarted], query, "Asia/Shanghai");
  expect(days.map(day => day.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
  expect(days.map(day => day.run?.id)).toEqual(["first-start", undefined, "third-day", undefined]);
  expect(days[0]!.run).toBe(firstStarted);
  expect(calendarTrendDays([firstStarted], { ...query, model: "different-platform" }, "Asia/Shanghai").every(day => !day.run)).toBe(true);
});

it("preserves the createdAt date contract across midnight and handles DST/leap calendar days", () => {
  const crossing = run("overnight", "2026-11-01T15:50:00Z", "2026-11-01T17:00:00Z");
  const days = calendarTrendDays([crossing], query, "Asia/Shanghai");
  expect(days[0]!.run?.id).toBe("overnight");
  expect(days[1]!.run).toBeUndefined();
  const repeatedHour = calendarTrendDays([
    run("before-fallback", "2026-11-01T05:30:00Z"), run("after-fallback", "2026-11-01T06:30:00Z"),
  ], { ...query, to: "2026-11-03" }, "America/New_York");
  expect(repeatedHour.map(day => day.date)).toEqual(["2026-11-01", "2026-11-02"]);
  expect(repeatedHour[0]!.run?.id).toBe("after-fallback");
  expect(calendarTrendDays([], { ...query, from: "2024-02-28", to: "2024-03-02" }, "Asia/Shanghai").map(day => day.date))
    .toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
});

it("plots no-record dates as labelled zero points and keeps metric switching and legend hiding", () => {
  const first = run("first", "2026-11-01T01:00:00Z");
  const third = run("third", "2026-11-03T01:00:00Z");
  const { container } = render(<OverviewTrend runs={[first, third]} query={query} timezone="Asia/Shanghai" currentBrand="目标品牌" competitors={[]} loading={false} complete onConfigure={vi.fn()} />);
  expect(screen.queryByText("✗")).not.toBeInTheDocument();
  expect(container.querySelectorAll(".fm-ov-chart circle")).toHaveLength(4);
  expect(screen.getByRole("button", { name: "目标品牌 · 2026-11-02 · 无采集记录，按 0 展示" })).toHaveAttribute("cy", "210");
  expect(container.querySelectorAll(".fm-ov-chart path")).toHaveLength(1);
  expect(screen.getByText("2026-11-01")).toBeInTheDocument();
  expect(screen.getByText("2026-11-04")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "有效回答数" }));
  expect(container.querySelector("circle")).toHaveAttribute("aria-label", expect.stringContaining("1 条有效回答"));
  fireEvent.click(screen.getByRole("button", { name: /^目标品牌$/ }));
  expect(screen.getByText("曲线已全部隐藏，点击上方品牌名称重新显示。")).toBeVisible();
  expect(container.querySelectorAll(".fm-ov-chart circle")).toHaveLength(0);
});

it("does not declare unloaded days as failed collection and renders a completely empty calendar", () => {
  const props = { runs: [] as MonitorRun[], query, timezone: "Asia/Shanghai", currentBrand: "目标品牌", competitors: [], loading: false, onConfigure: vi.fn() };
  const { container, rerender } = render(<OverviewTrend {...props} complete={false} />);
  expect(container.querySelectorAll(".fm-ov-chart circle")).toHaveLength(0);
  expect(screen.queryByLabelText(/该天并没有完成采集工作/)).not.toBeInTheDocument();
  expect(screen.queryByText("✗")).not.toBeInTheDocument();
  rerender(<OverviewTrend {...props} complete />);
  expect(container.querySelectorAll(".fm-ov-chart circle")).toHaveLength(4);
  expect(container.querySelector(".fm-ov-chart path")).not.toBeNull();
  expect(screen.queryByText("✗")).not.toBeInTheDocument();
  expect(screen.getByText("2026-11-01")).toBeInTheDocument();
  expect(screen.getByText("2026-11-04")).toBeInTheDocument();
});

it("pages each sentiment group independently and keeps the selected word callback and answer proportion", () => {
  const words: OverviewSentimentData["keywords"] = ["positive", "neutral", "negative"].flatMap(nature =>
    Array.from({ length: 11 }, (_, index) => ({ key: `${nature}:${index}`, keyword: `${nature}-${index}`, nature: nature as "positive" | "neutral" | "negative", answerCount: 20 - index, conflicted: false })));
  const onSelect = vi.fn();
  function Ranking() {
    const [pages, setPages] = useState(initialWordPages);
    const [selected, setSelected] = useState<string | null>(null);
    return <OverviewKeywordRanking keywords={words} tone="all" answerCount={40} selectedKey={selected} pages={pages}
      onPage={(tone, page) => setPages(previous => ({ ...previous, [tone]: page }))}
      onSelect={key => { setSelected(key); onSelect(key); }} />;
  }
  render(<Ranking />);
  const positive = screen.getByRole("region", { name: "正面评价词榜单" });
  const neutral = screen.getByRole("region", { name: "中性评价词榜单" });
  expect(within(positive).getAllByRole("listitem")).toHaveLength(10);
  expect(within(neutral).getAllByRole("listitem")).toHaveLength(10);
  expect(positive.querySelector("progress")).toHaveAttribute("value", "20");
  expect(positive.querySelector("progress")).toHaveAttribute("max", "40");
  fireEvent.click(within(positive).getByRole("button", { name: "下一页" }));
  expect(within(positive).getAllByRole("listitem")).toHaveLength(1);
  expect(within(neutral).getAllByRole("listitem")).toHaveLength(10);
  const word = within(positive).getByRole("button", { name: /positive-10，正面/ });
  fireEvent.click(word);
  expect(onSelect).toHaveBeenCalledWith("positive:10");
  expect(word).toHaveAttribute("aria-pressed", "true");
});

it("shows only the selected sentiment group and its explicit empty state", () => {
  render(<OverviewKeywordRanking keywords={[]} tone="negative" answerCount={0} selectedKey={null} pages={initialWordPages()} onPage={vi.fn()} onSelect={vi.fn()} />);
  expect(screen.getByRole("region", { name: "负面评价词榜单" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "正面评价词榜单" })).not.toBeInTheDocument();
  expect(screen.getByText("暂无数据")).toBeVisible();
});

it("uses the same bounded page jump for ten-item source pages", () => {
  const onChange = vi.fn();
  const { rerender } = render(<OverviewPagination source size={10} label="引用域名分页" page={1} total={21} onChange={onChange} />);
  expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
  const jump = screen.getByLabelText("引用域名分页跳转页码");
  fireEvent.change(jump, { target: { value: "999" } });
  fireEvent.keyDown(jump, { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith(3);
  rerender(<OverviewPagination source size={10} label="引用域名分页" page={3} total={21} onChange={onChange} />);
  expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  expect(screen.getByText("21–21 / 21 项")).toBeVisible();
  onChange.mockClear();
  fireEvent.change(jump, { target: { value: "2.5" } });
  fireEvent.click(screen.getByRole("button", { name: "引用域名分页确认跳转" }));
  expect(onChange).not.toHaveBeenCalled();
});

it("uses a smooth path across empty dates but splits when actual collection conditions change", () => {
  const first = run("first", "2026-11-01T01:00:00Z");
  const third = run("third", "2026-11-03T01:00:00Z");
  const fourth = run("fourth", "2026-11-04T01:00:00Z");
  third.attempts[0]!.brandMentioned = false;
  const props = { query, timezone: "Asia/Shanghai", currentBrand: "目标品牌", competitors: [], loading: false, complete: true, onConfigure: vi.fn() };
  const { container, rerender } = render(<OverviewTrend {...props} runs={[first, third, fourth]} />);
  expect(container.querySelector(".fm-ov-chart path")?.getAttribute("d")).toContain(" C ");
  expect(container.querySelectorAll(".fm-ov-chart circle")).toHaveLength(4);
  const different = { ...third, config: { ...third.config, repetitions: third.config.repetitions + 1 } };
  rerender(<OverviewTrend {...props} runs={[first, different, fourth]} />);
  expect(container.querySelectorAll(".fm-ov-chart path")).toHaveLength(1); // First real point and zero day only; changed configurations stay separate.
});

it("does not turn an actual failed collection into a no-record zero", () => {
  const failed = { ...run("failed", "2026-11-02T01:00:00Z"), status: "failed" as const };
  render(<OverviewTrend runs={[failed]} query={query} timezone="Asia/Shanghai" currentBrand="目标品牌" competitors={[]} loading={false} complete onConfigure={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "目标品牌 · 2026-11-02 · 无采集记录，按 0 展示" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "目标品牌 · 2026-11-01 · 无采集记录，按 0 展示" })).toHaveAttribute("cy", "210");
});
