import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Expand,
  Minimize2,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@frontmind/module-ui/components/ui/tooltip";
import {
  attemptStatusLabel,
  formatDateTime,
  type RunAttempt,
} from "../../domain";
import CitationRail from "./CitationRail";
import AnswerFullscreenDialog from "./AnswerFullscreenDialog";
import ScreenshotViewerDialog from "./ScreenshotViewerDialog";
import { clientTypeLabel, type SourceScope } from "./types";
import { MonitoringMarkdown, MonitoringReasoning } from "./MonitoringMarkdown";
import ModelBrandIcon from "../../components/ModelBrandIcon";
import { useMonitoringDemo } from "../../MonitoringDemoContext";
import { answerToolAvailability, scrollAnswerIntoView } from "./answerTools";
import CompactAnswerInsights, {
  type SentimentCounts,
} from "./CompactAnswerInsights";
import "./answer-reading.css";

export type AnswerPageResult = { attempts: RunAttempt[]; hasMore: boolean };

function AnswerToolHint({
  children,
  explanation,
  disabled,
}: {
  children: ReactNode;
  explanation: string;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="fm-answer-tool-hint"
          tabIndex={disabled ? 0 : undefined}
          title={explanation}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="fm-answer-tool-tooltip" sideOffset={6}>
        {explanation}
      </TooltipContent>
    </Tooltip>
  );
}

export function answerNavigation(
  attempts: readonly RunAttempt[],
  selected: RunAttempt,
) {
  const siblings = [
    ...new Map(
      attempts
        .filter(
          (attempt) =>
            attempt.questionId === selected.questionId &&
            attempt.status === "completed" &&
            Boolean((attempt.answer || attempt.answerPreview)?.trim()),
        )
        .map((attempt) => [attempt.id, attempt]),
    ).values(),
  ];
  const index = siblings.findIndex((attempt) => attempt.id === selected.id);
  return {
    siblings,
    index,
    previous: index > 0 ? siblings[index - 1] : undefined,
    next: index >= 0 ? siblings[index + 1] : undefined,
  };
}

export function AnswerReader({
  attempt,
  loading = false,
}: {
  attempt: RunAttempt;
  loading?: boolean;
}) {
  return (
    <article className="fm-answer-reader">
      <header>
        <div>
          <span className="fm-model-tile" aria-hidden="true">
            <ModelBrandIcon
              code={attempt.platformCode}
              name={attempt.platformName}
            />
          </span>
          <strong>{attempt.platformName}</strong>
          <span className="fm-meta-pill">
            {clientTypeLabel(attempt.clientType)}
          </span>
          {attempt.mode === "reasoning_search" && (
            <span className="fm-meta-pill reasoning">深度思考</span>
          )}
        </div>
        <div>
          <span className={`fm-attempt-state ${attempt.status}`}>
            {attemptStatusLabel(attempt.status)}
          </span>
          <small>{formatDateTime(attempt.capturedAt)}</small>
        </div>
      </header>
      <div className="fm-answer-scroll" aria-busy={loading || undefined}>
        {loading && !attempt.answer?.trim() ? (
          <div className="fm-reader-loading" role="status">
            <span />
            <span />
            <span />
            <strong>正在读取完整回答…</strong>
          </div>
        ) : attempt.answer?.trim() ? (
          <MonitoringMarkdown markdown={attempt.answer} attempt={attempt} />
        ) : (
          <div className="fm-reader-empty">
            <strong>该回答尚无有效正文</strong>
            <span>{attempt.error || "成功且非空的回答才会消耗额度。"}</span>
          </div>
        )}
        {attempt.reasoning && (
          <details className="fm-reasoning">
            <summary>查看思考过程</summary>
            <MonitoringReasoning
              markdown={attempt.reasoning}
              attempt={attempt}
            />
          </details>
        )}
        {Boolean(attempt.searchKeywords?.length) && (
          <details className="fm-keywords-disclosure">
            <summary>
              搜索 {attempt.searchKeywords!.length} 个关键词
              <span className="fm-keywords-toggle">展开</span>
            </summary>
            <ul>
              {attempt.searchKeywords!.map((keyword) => (
                <li key={keyword}>{keyword}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {attempt.questionCategory === "industry" && (
        <footer>
          <span>
            品牌提及：
            {attempt.brandMentioned === true
              ? "是"
              : attempt.brandMentioned === false
                ? "否"
                : "未返回"}
          </span>
          <span>
            提及位置：
            {attempt.mentionPosition
              ? `第 ${attempt.mentionPosition} 位`
              : "未返回"}
          </span>
        </footer>
      )}
    </article>
  );
}

export default function AnswerWorkspace({
  attempts,
  selected,
  fullscreen,
  onSelect,
  onFullscreenChange,
  sourceScope,
  onSourceScopeChange,
  detailLoading = false,
  detailError = false,
  onRetryDetail,
  sentimentScopeLabel,
  hasMoreAnswers = false,
  loadingMoreAnswers = false,
  onLoadMoreAnswers,
  scopeKey = "",
  sentiments,
  totalAnswers,
  showSentiment = true,
}: {
  attempts: RunAttempt[];
  selected?: RunAttempt;
  fullscreen: boolean;
  onSelect: (attempt: RunAttempt) => void;
  onQuestionChange?: (question: string) => void;
  onFullscreenChange: (open: boolean) => void;
  sourceScope: SourceScope;
  onSourceScopeChange: (scope: SourceScope) => void;
  detailLoading?: boolean;
  detailError?: boolean;
  onRetryDetail?: () => void;
  sentimentScopeLabel?: string;
  hasMoreAnswers?: boolean;
  loadingMoreAnswers?: boolean;
  onLoadMoreAnswers?: () => void | Promise<void | AnswerPageResult>;
  scopeKey?: string;
  sentiments?: SentimentCounts | null;
  totalAnswers?: number;
  showSentiment?: boolean;
}) {
  const demo = useMonitoringDemo();
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [navigating, setNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  const screenshotTriggerRef = useRef<HTMLButtonElement | null>(null);
  const readingRef = useRef<HTMLElement>(null);
  const navigationVersion = useRef(0);
  const requestRef = useRef(false);
  const selectionFence = `${scopeKey}:${selected?.questionId}:${selected?.id}`;
  const fenceRef = useRef(selectionFence);
  fenceRef.current = selectionFence;
  useEffect(() => {
    navigationVersion.current += 1;
    requestRef.current = false;
    setNavigating(false);
    setNavigationError("");
    setCopyState("idle");
    setScreenshotOpen(false);
  }, [selectionFence]);
  useEffect(
    () => () => {
      navigationVersion.current += 1;
    },
    [],
  );

  if (!selected)
    return (
      <div className="fm-answer-empty">
        <strong>
          {detailError
            ? "回答读取失败"
            : detailLoading
              ? "正在读取回答…"
              : "尚无可预览回答"}
        </strong>
        {detailError && onRetryDetail ? (
          <button
            type="button"
            className="fm-secondary-button"
            onClick={onRetryDetail}
          >
            重新读取回答
          </button>
        ) : !detailLoading ? (
          <span>运行完成后，可在这里查看正文和引用来源。</span>
        ) : null}
      </div>
    );
  const navigation = answerNavigation(attempts, selected);
  const tools = answerToolAvailability(selected);
  const screenshotAvailable = Boolean(demo) || tools.screenshotAvailable;
  const copyAnswer = async () => {
    if (!selected.answer?.trim()) return;
    try {
      await navigator.clipboard.writeText(selected.answer);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const selectAnswer = (attempt: RunAttempt) => {
    onSelect(attempt);
    if (!fullscreen) scrollAnswerIntoView(readingRef.current);
  };
  const nextAnswer = async () => {
    if (navigation.next) {
      selectAnswer(navigation.next);
      return;
    }
    if (
      !hasMoreAnswers ||
      !onLoadMoreAnswers ||
      requestRef.current ||
      loadingMoreAnswers
    )
      return;
    requestRef.current = true;
    setNavigating(true);
    setNavigationError("");
    const version = navigationVersion.current;
    const fence = selectionFence;
    try {
      let hasMore = true;
      let previousLength = attempts.length;
      while (
        hasMore &&
        navigationVersion.current === version &&
        fenceRef.current === fence
      ) {
        const page = await onLoadMoreAnswers();
        if (navigationVersion.current !== version || fenceRef.current !== fence)
          return;
        if (!page) break;
        const next = answerNavigation(page.attempts, selected).next;
        if (next) {
          selectAnswer(next);
          return;
        }
        hasMore = page.hasMore && page.attempts.length > previousLength;
        previousLength = page.attempts.length;
      }
    } catch {
      if (navigationVersion.current === version)
        setNavigationError("回答加载失败，请重试。");
    } finally {
      if (navigationVersion.current === version) {
        requestRef.current = false;
        setNavigating(false);
      }
    }
  };
  const toolbar = (insideFullscreen = false) => (
    <header className="fm-answer-toolbar">
      <nav className="fm-answer-navigation" aria-label="回答内容切换">
        <button
          type="button"
          className="fm-secondary-button"
          disabled={!navigation.previous || navigating}
          onClick={() =>
            navigation.previous && selectAnswer(navigation.previous)
          }
          aria-label="上一条回答内容"
        >
          <ChevronLeft size={16} /> 上一条回答
        </button>
        <span aria-live="polite">
          {navigating || loadingMoreAnswers
            ? "正在加载下一条回答…"
            : navigation.index < 0
              ? selected.status === "completed" &&
                Boolean((selected.answer || selected.answerPreview)?.trim())
                ? "当前历史回答"
                : "该次采集尚无有效回答"
              : `回答 ${navigation.index + 1} / ${totalAnswers ?? navigation.siblings.length}`}
        </span>
        <button
          type="button"
          className="fm-secondary-button"
          disabled={
            navigating ||
            loadingMoreAnswers ||
            (!navigation.next && (!hasMoreAnswers || !onLoadMoreAnswers))
          }
          onClick={() => void nextAnswer()}
          aria-label="下一条回答内容"
        >
          下一条回答 <ChevronRight size={16} />
        </button>
      </nav>

      <div className="fm-answer-tools">
        <span className="fm-copy-feedback" aria-live="polite">
          {copyState === "copied"
            ? "回答内容已复制"
            : copyState === "failed"
              ? "复制失败，请手动选择回答正文"
              : ""}
        </span>
        <AnswerToolHint
          explanation={tools.copyExplanation}
          disabled={!tools.readable}
        >
          <button
            type="button"
            className="fm-tool-button"
            disabled={!tools.readable}
            title={tools.copyExplanation}
            onClick={() => void copyAnswer()}
          >
            {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}{" "}
            {copyState === "copied" ? "已复制" : "复制"}
          </button>
        </AnswerToolHint>
        <AnswerToolHint
          explanation={demo ? "查看本地演示截图" : tools.screenshotExplanation}
          disabled={!screenshotAvailable}
        >
          <button
            type="button"
            className="fm-tool-button"
            disabled={!screenshotAvailable}
            title={demo ? "查看本地演示截图" : tools.screenshotExplanation}
            onClick={(event) => {
              screenshotTriggerRef.current = event.currentTarget;
              setScreenshotOpen(true);
            }}
          >
            <ImageIcon size={14} /> 截图
          </button>
        </AnswerToolHint>
        <AnswerToolHint
          explanation={tools.originalExplanation}
          disabled={!tools.originalUrl}
        >
          {tools.originalUrl ? (
            <a
              className="fm-tool-button"
              href={tools.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} /> 原始链接
            </a>
          ) : (
            <button
              type="button"
              className="fm-tool-button"
              disabled
              title={tools.originalExplanation}
            >
              <ExternalLink size={14} /> 原始链接
            </button>
          )}
        </AnswerToolHint>
        <AnswerToolHint
          explanation={
            insideFullscreen ? "退出全屏阅读" : tools.fullscreenExplanation
          }
          disabled={!insideFullscreen && !tools.readable}
        >
          <button
            ref={insideFullscreen ? undefined : fullscreenTriggerRef}
            type="button"
            className="fm-tool-button"
            disabled={!insideFullscreen && !tools.readable}
            title={
              insideFullscreen ? "退出全屏阅读" : tools.fullscreenExplanation
            }
            aria-label={insideFullscreen ? "退出全屏" : "全屏查看"}
            onClick={() => onFullscreenChange(!insideFullscreen)}
          >
            {insideFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
            {insideFullscreen ? "退出全屏" : "全屏"}
          </button>
        </AnswerToolHint>
      </div>
    </header>
  );
  const insights = (
    <CompactAnswerInsights
      attempt={selected}
      sentiments={sentiments}
      loading={detailLoading}
      error={detailError}
      onRetry={onRetryDetail}
      scopeLabel={sentimentScopeLabel}
      showSentiment={showSentiment}
    />
  );
  return (
    <section
      ref={readingRef}
      className="fm-answer-workspace fm-reading-workspace"
    >
      {toolbar()}
      {navigationError && (
        <p className="fm-navigation-error" role="alert">
          {navigationError}
        </p>
      )}
      <section className="fm-current-question" aria-label="当前回答问题">
        <strong>{selected.question}</strong>
      </section>
      <div className="fm-answer-layout">
        <AnswerReader attempt={selected} loading={detailLoading} />
      </div>
      {insights}
      <CitationRail
        attempt={selected}
        scope={sourceScope}
        onScopeChange={onSourceScopeChange}
      />
      <ScreenshotViewerDialog
        open={screenshotOpen}
        attempt={selected}
        onOpenChange={setScreenshotOpen}
        returnFocusRef={screenshotTriggerRef}
      />
      <AnswerFullscreenDialog
        open={fullscreen}
        attempt={selected}
        returnFocusRef={fullscreenTriggerRef}
        onOpenChange={onFullscreenChange}
        sourceScope={sourceScope}
        onSourceScopeChange={onSourceScopeChange}
        toolbar={toolbar(true)}
        insights={insights}
        loading={detailLoading}
        navigationError={navigationError}
      />
    </section>
  );
}
