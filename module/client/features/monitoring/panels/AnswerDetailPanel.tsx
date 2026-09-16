import { MessagesSquare } from "lucide-react";

import type { RunAttempt } from "../../../domain";
import AnswerWorkspace, { type AnswerPageResult } from "../AnswerWorkspace";
import type { SentimentCounts } from "../CompactAnswerInsights";
import type { SourceScope } from "../types";
import PanelFrame from "./PanelFrame";

export default function AnswerDetailPanel({
  attempts,
  selected,
  fullscreen,
  onSelect,
  onQuestionChange,
  onFullscreenChange,
  sourceScope,
  onSourceScopeChange,
  detailLoading,
  detailError,
  onRetryDetail,
  sentimentScopeLabel,
  hasMoreAnswers,
  loadingMoreAnswers,
  onLoadMoreAnswers,
  exportHref,
  scopeKey,
  sentiments,
  totalAnswers,
  showSentiment,
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
  exportHref?: string;
  scopeKey?: string;
  sentiments?: SentimentCounts | null;
  totalAnswers?: number;
  showSentiment?: boolean;
}) {
  return (
    <PanelFrame
      id="monitor-answers"
      labelledBy="monitor-tab-answers"
      icon={<MessagesSquare size={17} />}
      title="问答明细"
      meta={`${attempts.length} 条已加载回答`}
      exportHref={exportHref}
      exportFileName="frontmind-monitoring-answers.xlsx"
      className="fm-answer-panel"
      fullscreenEnabled={false}
    >
      <AnswerWorkspace
        scopeKey={scopeKey}
        sentiments={sentiments}
        totalAnswers={totalAnswers}
        showSentiment={showSentiment}
        attempts={attempts}
        selected={selected}
        fullscreen={fullscreen}
        onSelect={onSelect}
        onQuestionChange={onQuestionChange}
        onFullscreenChange={onFullscreenChange}
        sourceScope={sourceScope}
        onSourceScopeChange={onSourceScopeChange}
        detailLoading={detailLoading}
        detailError={detailError}
        onRetryDetail={onRetryDetail}
        sentimentScopeLabel={sentimentScopeLabel}
        hasMoreAnswers={hasMoreAnswers}
        loadingMoreAnswers={loadingMoreAnswers}
        onLoadMoreAnswers={onLoadMoreAnswers}
      />
    </PanelFrame>
  );
}
