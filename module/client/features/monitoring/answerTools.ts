import type { RunAttempt } from "../../domain";
import { safeArchivedMediaUrl, safeExternalUrl } from "./selectors";

/** Availability comes from the answer and its immutable attempt, never today's monitor settings. */
export function answerToolAvailability(attempt: RunAttempt) {
  const readable = Boolean(attempt.answer?.trim());
  const originalUrl = safeExternalUrl(attempt.shareUrl || undefined);
  const screenshots = attempt.assets.filter(
    (asset) => asset.type === "screenshot",
  );
  const screenshotAvailable = screenshots.some((asset) =>
    Boolean(safeArchivedMediaUrl(asset.url)),
  );
  const screenshotExplanation = screenshotAvailable
    ? "查看采集时保存的截图"
    : screenshots.some((asset) => asset.archiveStatus === "pending")
      ? "截图正在归档，请稍后查看"
      : screenshots.some((asset) => asset.archiveStatus === "failed")
        ? "截图归档失败，暂时无法查看"
        : attempt.screenshotPolicy === 0
          ? "本次任务未开启截图"
          : attempt.screenshotPolicy === 2 &&
              attempt.status === "completed" &&
              attempt.screenshotBrandMentioned === false
            ? "本条回答未提及监控品牌，未触发截图"
            : "暂无截图";
  return {
    readable,
    copyExplanation: readable ? "复制回答正文" : "暂无可复制内容",
    fullscreenExplanation: readable ? "全屏阅读回答" : "暂无可阅读内容",
    originalUrl,
    originalExplanation: originalUrl
      ? "打开 AI 平台原始链接"
      : "本条回答暂无原始链接",
    screenshotAvailable,
    screenshotExplanation,
  };
}

/** Navigate within the reader's scroll owner without displacing the outcomes pane. */
export function scrollAnswerIntoView(element: HTMLElement | null) {
  if (!element) return;
  const pane = element.closest<HTMLElement>('[data-resource-pane="main"]');
  if (pane && /^(auto|scroll)$/.test(window.getComputedStyle(pane).overflowY)) {
    pane.scrollTop +=
      element.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    return;
  }
  element.scrollIntoView?.({ block: "start", behavior: "instant" });
}
