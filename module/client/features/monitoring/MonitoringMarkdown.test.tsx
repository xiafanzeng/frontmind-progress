import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonitoringMarkdown } from "./MonitoringMarkdown";
import type { RunAttempt } from "../../domain";

const attempt = {
  sources: [
    {
      id: "s",
      title: "官方来源",
      url: "https://docs.example.com/a",
      domain: "docs.example.com",
      order: 1,
      providerPosition: 1,
      isCited: true,
      citationProvenance: "explicit",
      citedText: null,
    },
  ],
  citationProvenance: "explicit",
} as unknown as RunAttempt;

describe("MonitoringMarkdown", () => {
  it("renders GFM tables and verified citation markers", () => {
    render(
      <MonitoringMarkdown
        attempt={attempt}
        markdown={
          "| 指标 | 值 |\n| --- | --- |\n| 提及 | 是 |\n\n答案见 [citation:1]。"
        }
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("答案见", { exact: false })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "引用 1：官方来源" }),
    ).toHaveAttribute("href", "https://docs.example.com/a");
  });

  it("skips raw HTML and blocks unsafe links and images", () => {
    render(
      <MonitoringMarkdown
        markdown={
          "<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n\n![头像](https://localhost/a.png)"
        }
      />,
    );
    expect(screen.queryByText("alert(1)")).not.toBeInTheDocument();
    expect(screen.getByText("危险")).toBeInTheDocument();
    expect(screen.getByText("外部图片已拦截：头像")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "危险" }),
    ).not.toBeInTheDocument();
  });

  it("does not label discovered sources or code examples as verified citations", () => {
    render(
      <MonitoringMarkdown
        attempt={{
          ...attempt,
          sources: [{ ...attempt.sources[0]!, isCited: false }],
        }}
        markdown={"答案见 [citation:1]。\n\n`[citation:1]`"}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("答案见 ［来源 1］。")).toBeInTheDocument();
    expect(screen.getByText("[citation:1]").tagName).toBe("CODE");
  });
});
