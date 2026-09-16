import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import type { RunAttempt } from "../../domain";
import { answerToolAvailability, scrollAnswerIntoView } from "./answerTools";

const answer = {
  status: "completed",
  answer: "回答",
  assets: [],
} as unknown as RunAttempt;
describe("answer tools use the frozen attempt", () => {
  it.each([
    [0, false, "本次任务未开启截图"],
    [2, false, "本条回答未提及监控品牌，未触发截图"],
    [2, true, "暂无截图"],
    [2, null, "暂无截图"],
    [1, false, "暂无截图"],
    [null, false, "暂无截图"],
  ] as const)(
    "policy %s and main-brand mention %s have an accurate explanation",
    (screenshotPolicy, screenshotBrandMentioned, expected) => {
      const tools = answerToolAvailability({
        ...answer,
        screenshotPolicy,
        screenshotBrandMentioned,
        brandMentioned: !screenshotBrandMentioned,
      });
      expect(tools.screenshotAvailable).toBe(false);
      expect(tools.screenshotExplanation).toBe(expected);
    },
  );
  it("prefers actual archived screenshots and distinguishes pending, failed and missing", () => {
    const asset = {
      id: "image",
      type: "screenshot" as const,
      archiveStatus: "pending" as const,
    };
    expect(
      answerToolAvailability({ ...answer, assets: [asset] })
        .screenshotExplanation,
    ).toContain("正在归档");
    expect(
      answerToolAvailability({
        ...answer,
        assets: [{ ...asset, archiveStatus: "failed" }],
      }).screenshotExplanation,
    ).toContain("归档失败");
    expect(
      answerToolAvailability({
        ...answer,
        screenshotPolicy: 0,
        assets: [
          {
            ...asset,
            archiveStatus: "archived",
            url: "/api/monitoring/media/10000000-0000-4000-8000-000000000001",
          },
        ],
      }).screenshotAvailable,
    ).toBe(true);
    expect(
      answerToolAvailability({
        ...answer,
        assets: [
          {
            ...asset,
            archiveStatus: "archived",
            url: "https://provider.invalid/screenshot.png",
          },
        ],
      }).screenshotAvailable,
    ).toBe(false);
  });
  it("does not infer no trigger while an attempt is still running, or use a preview as complete content", () => {
    const tools = answerToolAvailability({
      ...answer,
      status: "processing",
      screenshotPolicy: 2,
      screenshotBrandMentioned: false,
      answer: "  ",
      answerPreview: "partial",
      shareUrl: "javascript:alert(1)",
    });
    expect(tools.screenshotExplanation).toBe("暂无截图");
    expect(tools.readable).toBe(false);
    expect(tools.originalUrl).toBeUndefined();
  });
});

it("answer navigation moves only the independent main pane, with a single-scroll fallback", () => {
  const pane = document.createElement("main");
  pane.dataset.resourcePane = "main";
  pane.style.overflowY = "auto";
  const reader = document.createElement("section");
  pane.append(reader);
  document.body.append(pane);
  pane.scrollTop = 50;
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({
    top: 100,
  } as DOMRect);
  vi.spyOn(reader, "getBoundingClientRect").mockReturnValue({
    top: 350,
  } as DOMRect);
  reader.scrollIntoView = vi.fn();
  scrollAnswerIntoView(reader);
  expect(pane.scrollTop).toBe(300);
  expect(reader.scrollIntoView).not.toHaveBeenCalled();
  pane.style.overflowY = "visible";
  scrollAnswerIntoView(reader);
  expect(reader.scrollIntoView).toHaveBeenCalledWith({
    block: "start",
    behavior: "instant",
  });
  pane.remove();
});
