import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunAttempt } from "../../domain";
import CitationRail from "./CitationRail";
import CompactAnswerInsights from "./CompactAnswerInsights";
import {
  groupKeywordEvaluations,
  sentimentDistribution,
} from "./sentimentInsights";
import { sourceEvidenceRows } from "./sourceEvidenceRows";
import type { SourceScope } from "./types";
import SourceEvidenceList, {
  sourceEvidenceUrl,
} from "@frontmind/module-ui/components/SourceEvidenceList";

afterEach(() => vi.restoreAllMocks());

const attempt = {
  id: "answer-1",
  question: "品牌怎么样？",
  sentiment: "positive",
  sources: [],
  allSources: [],
} as unknown as RunAttempt;

function citationAttempt(count = 23): RunAttempt {
  const allSources = Array.from({ length: count }, (_, index) => ({
    id: `source-${index}`,
    title: `来源标题 ${index + 1}`,
    order: index,
    providerPosition: index === 0 ? 7 : index === 1 ? 19 : null,
    isCited: index < 2,
    citationProvenance: "explicit" as const,
    url: `https://example.com/${index}`,
    citedText: `来源片段 ${index + 1}`,
  }));
  return {
    ...attempt,
    citationProvenance: "explicit",
    allSources,
    sources: allSources.filter((source) => source.isCited),
  };
}

function Sources({ selected = citationAttempt() }: { selected?: RunAttempt }) {
  const [scope, setScope] = useState<SourceScope>("all");
  return (
    <CitationRail attempt={selected} scope={scope} onScopeChange={setScope} />
  );
}

describe("source evidence reading", () => {
  it("keeps provider citation numbers stable while filtering, and resets pages and expanded source details", () => {
    render(<Sources />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      21,
    );
    fireEvent.click(screen.getByRole("button", { name: "下一页来源" }));
    expect(screen.getByRole("button", { name: "来源标题 21" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "文内引用 2" }));
    const citationRow = screen
      .getByRole("button", { name: "来源标题 1" })
      .closest("tr")!;
    expect(within(citationRow).getByRole("cell", { name: "7" })).toBeVisible();
    const title = within(citationRow).getByRole("button", {
      name: "来源标题 1",
    });
    fireEvent.click(title);
    expect(title).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.queryByRole("button", { name: /展开片段|收起片段/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("来源片段 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "答案参考 21" }));
    expect(
      screen.queryByRole("button", { name: "来源标题 1" }),
    ).not.toBeInTheDocument();
    const referenceRow = screen
      .getByRole("button", { name: "来源标题 3" })
      .closest("tr")!;
    expect(within(referenceRow).getByRole("cell", { name: "1" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "全部来源 23" }));
    expect(screen.queryByText("来源片段 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "来源标题 1" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
  it("does not upgrade unverified sources, even when an older row claims it was cited", () => {
    const selected = {
      ...citationAttempt(2),
      citationProvenance: "legacy_assumed" as const,
    };
    expect(sourceEvidenceRows(selected).map((row) => row.type)).toEqual([
      "reference",
      "reference",
    ]);
    render(<Sources selected={selected} />);
    fireEvent.click(screen.getByRole("button", { name: "文内引用 0" }));
    expect(screen.getByText("本条回答暂无文内引用")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "答案参考 2" }));
    expect(screen.getByRole("button", { name: "来源标题 1" })).toBeVisible();
  });
  it("rejects executable and credential-bearing links, and supports neutral report evidence", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,foo",
      "/local-file",
      "https://user:secret@example.com",
    ])
      expect(sourceEvidenceUrl(url)).toBeUndefined();
    expect(sourceEvidenceUrl("https://example.com/path")).toBe(
      "https://example.com/path",
    );
    const rows = [
      {
        id: "evidence",
        title: "正式报告依据",
        url: "javascript:alert(1)",
        excerpt: "正式报告的来源片段",
      },
    ];
    const { rerender } = render(
      <SourceEvidenceList rows={rows} showType={false} resetKey="report-a" />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("文内引用")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /展开片段|收起片段/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("正式报告的来源片段")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "正式报告依据" }));
    expect(
      screen.getByRole("button", { name: "正式报告依据" }),
    ).toHaveAttribute("aria-expanded", "true");
    rerender(
      <SourceEvidenceList rows={rows} showType={false} resetKey="report-b" />,
    );
    expect(screen.queryByText("正式报告的来源片段")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "正式报告依据" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

describe("current answer sentiment evidence", () => {
  it("normalizes words within each sentiment and preserves separate sentiment evidence and available context", () => {
    const groups = groupKeywordEvaluations([
      { keyword: " Ａ 方案 ", nature: "positive" },
      { keyword: "a   方案", nature: "positive", context: "原文正面依据" },
      { keyword: "Ａ 方案", nature: "negative", context: "原文负面依据" },
      { keyword: "  ", nature: "neutral" },
    ]);
    expect(groups.positive).toEqual([
      { keyword: "Ａ 方案", nature: "positive", context: "原文正面依据" },
    ]);
    expect(groups.negative).toHaveLength(1);
    expect(groups.neutral).toHaveLength(0);
  });
  it("shows five words per group, expands remaining words and contexts, and resets for another answer", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(44);
    const selected = {
      ...attempt,
      keywordEvaluations: Array.from({ length: 8 }, (_, index) => ({
        keyword: `评价词${index + 1}`,
        nature: "positive" as const,
        context: `原文依据${index + 1}`.repeat(20),
      })),
    };
    const { rerender } = render(
      <CompactAnswerInsights
        attempt={selected}
        sentiments={{ positive: 75, neutral: 10, negative: 5, unknown: 10 }}
        scopeLabel="当前问题 · 9月1日至9月14日 · 豆包"
      />,
    );
    expect(screen.queryByText("评价词6")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "展开其余 3 个评价词" }),
    );
    expect(screen.getByText("评价词8")).toBeVisible();
    const contextButton = screen.getAllByRole("button", {
      name: "展开上下文",
    })[0]!;
    fireEvent.click(contextButton);
    expect(contextButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("75.0%")).toBeVisible();
    expect(screen.getByText("100")).toBeVisible();
    expect(screen.getByText("当前问题 · 9月1日至9月14日 · 豆包")).toBeVisible();
    rerender(
      <CompactAnswerInsights attempt={{ ...selected, id: "answer-2" }} />,
    );
    expect(screen.queryByText("评价词6")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "收起上下文" }),
    ).not.toBeInTheDocument();
  });
  it("offers expansion for a short context that wraps beyond two lines in a narrow column", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(88);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(44);
    render(
      <CompactAnswerInsights
        attempt={{
          ...attempt,
          keywordEvaluations: [
            {
              keyword: "可靠",
              nature: "positive",
              context:
                "这是一段不足六十个字，但在窄屏阅读区域里会超过两行的原文依据。",
            },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "展开上下文" }));
    expect(screen.getByRole("button", { name: "收起上下文" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
  it("distinguishes unknown, detail loading, read failure and unavailable competitor evidence", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <CompactAnswerInsights attempt={{ ...attempt, sentiment: "unknown" }} />,
    );
    expect(screen.getByText("未判定")).toBeVisible();
    expect(screen.getByText("本条回答暂无评价词")).toBeVisible();
    rerender(<CompactAnswerInsights attempt={attempt} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取");
    expect(screen.queryByText("本条回答暂无评价词")).not.toBeInTheDocument();
    rerender(<CompactAnswerInsights attempt={attempt} error onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("情感分析读取失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(
      <CompactAnswerInsights
        attempt={{
          ...attempt,
          keywordEvaluations: [{ keyword: "可靠", nature: "positive" }],
        }}
        showSentiment={false}
        sentiments={{ positive: 10, neutral: 0, negative: 0, unknown: 0 }}
      />,
    );
    expect(screen.getByText("暂无该品牌的情感数据")).toBeVisible();
    expect(screen.queryByText("可靠")).not.toBeInTheDocument();
    expect(screen.queryByText("100.0%")).not.toBeInTheDocument();
  });
  it("uses one full-scope denominator, including unknown, without treating missing values as neutral", () => {
    const result = sentimentDistribution({
      positive: 2,
      neutral: 1,
      negative: 1,
      unknown: 6,
    });
    expect(result.total).toBe(10);
    expect(result.buckets.map((bucket) => bucket.percent)).toEqual([
      20, 10, 10, 60,
    ]);
    expect(
      sentimentDistribution({
        positive: 0,
        neutral: 0,
        negative: 0,
        unknown: 0,
      }).total,
    ).toBe(0);
  });
});
