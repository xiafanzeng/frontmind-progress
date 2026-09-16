import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { RunAttempt } from "../../domain";
import AnswerWorkspace, {
  AnswerReader,
  answerNavigation,
} from "./AnswerWorkspace";
import { sentimentDistribution } from "./CompactAnswerInsights";
import TrendPanel from "./panels/TrendPanel";
import {
  monitoringExportHref,
  monitoringQueryString,
  readMonitoringQuery,
} from "./queryState";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const attempt: RunAttempt = {
  id: "10000000-0000-4000-8000-000000000001",
  questionId: "10000000-0000-4000-8000-000000000002",
  question: "如何选择服务？",
  questionCategory: "industry",
  platformCode: "doubao",
  platformName: "豆包",
  clientType: "web",
  mode: "search",
  screenshotPolicy: 0,
  repetition: 1,
  status: "completed",
  answer: "已读取的完整正文",
  sources: [],
  allSources: [],
  assets: [],
  shareUrl: "https://example.com/original/answer",
};
const props = {
  attempts: [attempt],
  selected: attempt,
  fullscreen: false,
  onSelect: vi.fn(),
  onFullscreenChange: vi.fn(),
  sourceScope: "all" as const,
  onSourceScopeChange: vi.fn(),
};

describe("monitoring answer reading", () => {
  it.each([
    "reputation",
    "competitor_comparison",
    "product_scenario",
    undefined,
  ] as const)(
    "hides ranking facts for %s answers, including the shared fullscreen reader",
    (questionCategory) => {
      render(
        <AnswerReader
          attempt={{
            ...attempt,
            questionCategory,
            brandMentioned: true,
            mentionPosition: 1,
          }}
        />,
      );
      expect(
        screen.queryByText(/品牌提及：|提及位置：/),
      ).not.toBeInTheDocument();
      expect(screen.getByText("已读取的完整正文")).toBeVisible();
    },
  );
  it("limits non-industry trend reports to sentiment and replaces a previously selected ranking view", () => {
    const { rerender } = render(
      <TrendPanel runs={[]} timezone="Asia/Shanghai" showIndustryMetrics />,
    );
    fireEvent.click(screen.getByRole("button", { name: "平均排名" }));
    rerender(
      <TrendPanel
        runs={[]}
        timezone="Asia/Shanghai"
        showIndustryMetrics={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "平均排名" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "提及率" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "位置分布" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "情感倾向" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("does not show the main brand sentiment as a competitor evaluation", () => {
    render(
      <AnswerWorkspace
        {...props}
        selected={{
          ...attempt,
          sentiment: "positive",
          keywordEvaluations: [{ keyword: "可靠", nature: "positive" }],
        }}
        showSentiment={false}
      />,
    );
    expect(screen.queryByLabelText("品牌情感与评价词")).not.toBeInTheDocument();
    expect(screen.queryByText("可靠")).not.toBeInTheDocument();
    expect(screen.getByText("已读取的完整正文")).toBeVisible();
  });
  it("retains a loaded body during refresh and opens only a valid original answer URL", () => {
    const { rerender } = render(
      <AnswerWorkspace {...props} detailLoading totalAnswers={73} />,
    );
    expect(screen.getByText("已读取的完整正文")).toBeVisible();
    expect(screen.getByRole("link", { name: "原始链接" })).toHaveAttribute(
      "href",
      attempt.shareUrl,
    );
    expect(screen.getByText("回答 1 / 73")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /纠正|监控问题切换/ }),
    ).not.toBeInTheDocument();
    rerender(
      <AnswerWorkspace
        {...props}
        selected={{ ...attempt, shareUrl: "javascript:alert(1)" }}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "原始链接" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "原始链接" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "原始链接" })).toHaveAttribute(
      "title",
      "本条回答暂无原始链接",
    );
  });

  it("shows a loader only before a full answer has arrived", () => {
    const { rerender } = render(
      <AnswerReader attempt={{ ...attempt, answer: undefined }} loading />,
    );
    expect(screen.getByText("正在读取完整回答…")).toBeVisible();
    rerender(<AnswerReader attempt={attempt} loading />);
    expect(screen.queryByText("正在读取完整回答…")).not.toBeInTheDocument();
    expect(screen.getByText("已读取的完整正文")).toBeVisible();
  });

  it("keeps all four tools visible with truthful unavailable states and retains archived media during refresh", () => {
    const { rerender } = render(
      <AnswerWorkspace
        {...props}
        selected={{ ...attempt, answer: " ", shareUrl: null }}
      />,
    );
    expect(screen.getByRole("button", { name: "复制" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "复制" })).toHaveAttribute(
      "title",
      "暂无可复制内容",
    );
    expect(screen.getByRole("button", { name: "截图" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "截图" })).toHaveAttribute(
      "title",
      "本次任务未开启截图",
    );
    expect(screen.getByRole("button", { name: "原始链接" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "全屏查看" })).toBeDisabled();
    rerender(
      <AnswerWorkspace
        {...props}
        detailLoading
        selected={{
          ...attempt,
          screenshotPolicy: 1,
          assets: [
            { id: "pending", type: "screenshot", archiveStatus: "pending" },
            {
              id: "ready",
              type: "screenshot",
              archiveStatus: "archived",
              url: "/api/monitoring/media/10000000-0000-4000-8000-000000000001",
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "复制" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "全屏查看" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "截图" }));
    expect(screen.getByRole("dialog", { name: "回答截图" })).toBeVisible();
    expect(screen.getByRole("img", { name: "回答截图 1" })).toHaveAttribute(
      "src",
      "/api/monitoring/media/10000000-0000-4000-8000-000000000001",
    );
  });

  it("loads across a page boundary and never switches to another question or pending attempt", async () => {
    const other = { ...attempt, id: "other", questionId: "another-question" };
    const pending = {
      ...attempt,
      id: "pending",
      status: "processing" as const,
      answer: undefined,
    };
    const next = {
      ...attempt,
      id: "next",
      answerPreview: "下一条正文",
      answer: undefined,
    };
    const loadMore = vi
      .fn()
      .mockResolvedValueOnce({
        attempts: [attempt, other, pending],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        attempts: [attempt, other, pending, next],
        hasMore: false,
      });
    const onSelect = vi.fn();
    render(
      <AnswerWorkspace
        {...props}
        onSelect={onSelect}
        hasMoreAnswers
        onLoadMoreAnswers={loadMore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下一条回答内容" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(next));
    expect(loadMore).toHaveBeenCalledTimes(2);
    expect(
      answerNavigation([attempt, other, pending, next], attempt).siblings,
    ).toHaveLength(2);
  });

  it("discards a pagination completion after the user changes scope", async () => {
    let finish!: (value: { attempts: RunAttempt[]; hasMore: boolean }) => void;
    const loadMore = vi.fn(
      () =>
        new Promise<{ attempts: RunAttempt[]; hasMore: boolean }>((resolve) => {
          finish = resolve;
        }),
    );
    const onSelect = vi.fn();
    const { rerender } = render(
      <AnswerWorkspace
        {...props}
        onSelect={onSelect}
        scopeKey="industry"
        hasMoreAnswers
        onLoadMoreAnswers={loadMore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下一条回答内容" }));
    rerender(
      <AnswerWorkspace
        {...props}
        onSelect={onSelect}
        scopeKey="reputation"
        hasMoreAnswers
        onLoadMoreAnswers={loadMore}
      />,
    );
    finish({ attempts: [attempt, { ...attempt, id: "next" }], hasMore: false });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "下一条回答内容" }),
      ).toBeEnabled(),
    );
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("allows retrying a failed next page without duplicating the selection", async () => {
    const next = { ...attempt, id: "next" };
    const loadMore = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ attempts: [attempt, next], hasMore: false });
    const onSelect = vi.fn();
    render(
      <AnswerWorkspace
        {...props}
        onSelect={onSelect}
        hasMoreAnswers
        onLoadMoreAnswers={loadMore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下一条回答内容" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "回答加载失败，请重试。",
    );
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "下一条回答内容" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith(next);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("keeps the selected answer when entering, navigating and closing fullscreen during detail refresh", async () => {
    const next = {
      ...attempt,
      id: "next",
      answer: "下一条完整正文",
      sentiment: "positive" as const,
    };
    function Reader() {
      const [selected, setSelected] = useState(attempt);
      const [fullscreen, setFullscreen] = useState(false);
      return (
        <AnswerWorkspace
          {...props}
          attempts={[attempt, next]}
          selected={selected}
          onSelect={setSelected}
          fullscreen={fullscreen}
          onFullscreenChange={setFullscreen}
          detailLoading={selected.id === next.id}
          totalAnswers={2}
        />
      );
    }
    render(<Reader />);
    fireEvent.click(screen.getByRole("button", { name: "全屏查看" }));
    expect(screen.getByRole("dialog", { name: "全屏问答明细" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "下一条回答内容" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("下一条完整正文");
    expect(screen.getByRole("dialog")).toHaveTextContent("回答 2 / 2");
    fireEvent.click(screen.getByRole("button", { name: "退出全屏" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("下一条完整正文")).toBeVisible();
    expect(screen.getByRole("button", { name: "全屏查看" })).toHaveFocus();
  });
  it("crosses the 50-answer boundary exactly once when Next is clicked repeatedly", async () => {
    const all = Array.from({ length: 73 }, (_, index) => ({
      ...attempt,
      id: `answer-${index}`,
    }));
    let finish!: (value: { attempts: RunAttempt[]; hasMore: boolean }) => void;
    const loadMore = vi.fn(
      () =>
        new Promise<{ attempts: RunAttempt[]; hasMore: boolean }>((resolve) => {
          finish = resolve;
        }),
    );
    const onSelect = vi.fn();
    render(
      <AnswerWorkspace
        {...props}
        attempts={all.slice(0, 50)}
        selected={all[49]}
        onSelect={onSelect}
        hasMoreAnswers
        onLoadMoreAnswers={loadMore}
        totalAnswers={73}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下一条回答内容" }));
    fireEvent.click(screen.getByRole("button", { name: "下一条回答内容" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
    finish({ attempts: all, hasMore: false });
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith(all[50]);
  });
  it("locates a deep-linked historical answer before advancing instead of wrapping to the newest page", async () => {
    const all = Array.from({ length: 73 }, (_, index) => ({
      ...attempt,
      id: `answer-${index}`,
    }));
    const loadMore = vi
      .fn()
      .mockResolvedValue({ attempts: all, hasMore: false });
    const onSelect = vi.fn();
    render(
      <AnswerWorkspace
        {...props}
        attempts={all.slice(0, 50)}
        selected={all[60]}
        onSelect={onSelect}
        hasMoreAnswers
        onLoadMoreAnswers={loadMore}
        totalAnswers={73}
      />,
    );
    expect(screen.getByText("当前历史回答")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "下一条回答内容" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(all[61]));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("monitoring scope and sentiment", () => {
  it("uses one denominator for all four sentiment buckets, including undetermined answers", () => {
    expect(
      sentimentDistribution({
        positive: 1,
        neutral: 1,
        negative: 1,
        unknown: 1,
      }).buckets.map((bucket) => bucket.percent),
    ).toEqual([25, 25, 25, 25]);
    expect(
      sentimentDistribution({
        positive: 0,
        neutral: 0,
        negative: 0,
        unknown: 3,
      }).buckets.at(-1)?.percent,
    ).toBe(100);
  });
  it("preserves a historical question/category intersection in URL state and exports", () => {
    const monitorId = "10000000-0000-4000-8000-000000000003";
    const monitor = {
      id: monitorId,
      projectId: "project",
      name: "监控",
      questionsCount: 1,
      platformsCount: 1,
      repetitions: 1,
      scheduleLabel: "每日",
      status: "active" as const,
    };
    const context = {
      monitors: [monitor],
      runs: [],
      questionIds: [attempt.questionId],
      questionCategories: { [attempt.questionId]: "product_scenario" as const },
      allowUnresolved: true,
    };
    const state = readMonitoringQuery(
      `?monitor=${monitorId}&question=${attempt.questionId}&questionCategory=industry&range=custom&from=2026-09-01&to=2026-09-14`,
      context,
    );
    expect(state.question).toBe(attempt.questionId);
    expect(state.questionCategory).toBe("industry");
    expect(monitoringQueryString(state)).toContain("questionCategory=industry");
    expect(monitoringExportHref(state, "Asia/Shanghai")).toContain(
      "questionCategory=industry",
    );
    expect(monitoringExportHref(state, "Asia/Shanghai")).toContain(
      `questionId=${attempt.questionId}`,
    );
  });
});
