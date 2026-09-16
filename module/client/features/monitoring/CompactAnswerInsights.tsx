import { useLayoutEffect, useRef, useState } from "react";
import { MessageCircle, RotateCw } from "lucide-react";
import type { KeywordEvaluation, RunAttempt } from "../../domain";
import {
  groupKeywordEvaluations,
  sentimentDistribution,
  SENTIMENT_BUCKETS,
  type SentimentCounts,
} from "./sentimentInsights";
import "./answer-insights.css";
export {
  sentimentDistribution,
  SENTIMENT_BUCKETS,
  type SentimentCounts,
} from "./sentimentInsights";

export type AnswerInsightsProps = {
  attempt: RunAttempt;
  sentiments?: SentimentCounts | null;
  scopeLabel?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  showSentiment?: boolean;
};

export default function CompactAnswerInsights(props: AnswerInsightsProps) {
  return <AnswerInsights key={props.attempt.id} {...props} />;
}

function EvaluationWord({ evaluation }: { evaluation: KeywordEvaluation }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const contextRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const context = contextRef.current;
    if (!context || expanded) return;
    const measure = () =>
      setOverflows(context.scrollHeight > context.clientHeight + 1);
    measure();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    observer?.observe(context);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [evaluation.context, expanded]);
  return (
    <li>
      <strong>{evaluation.keyword}</strong>
      {evaluation.context?.trim() && (
        <>
          <p ref={contextRef} className={expanded ? "is-expanded" : ""}>
            {evaluation.context}
          </p>
          {(overflows || expanded) && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "收起上下文" : "展开上下文"}
            </button>
          )}
        </>
      )}
    </li>
  );
}

function AnswerInsights({
  attempt,
  sentiments,
  scopeLabel,
  loading = false,
  error = false,
  onRetry,
  showSentiment = true,
}: AnswerInsightsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const distribution = sentiments ? sentimentDistribution(sentiments) : null;
  const groups = groupKeywordEvaluations(attempt.keywordEvaluations || []);
  const hasWords = Object.values(groups).some((rows) => rows.length > 0);
  const sentiment =
    SENTIMENT_BUCKETS.find((bucket) => bucket.key === attempt.sentiment) ||
    SENTIMENT_BUCKETS[3];
  let gradientEnd = 0;
  const ring = distribution?.total
    ? `conic-gradient(${distribution.buckets
        .map((bucket) => {
          const start = gradientEnd;
          gradientEnd += bucket.percent;
          return `${bucket.color} ${start}% ${gradientEnd}%`;
        })
        .join(", ")})`
    : "#eaecf0";
  return (
    <section className="fm-answer-insights" aria-label="情感分析">
      <header className="fm-answer-section-heading">
        <h3>
          <MessageCircle size={16} />
          情感分析
        </h3>
      </header>
      {!showSentiment ? (
        <p className="fm-answer-analysis-empty">暂无该品牌的情感数据</p>
      ) : (
        <div
          className={`fm-answer-insights-grid ${distribution ? "has-summary" : ""} ${!hasWords ? "is-empty" : ""}`}
        >
          <div className="fm-answer-evaluations" aria-busy={loading}>
            <header>
              <h4>本条回答</h4>
              {!loading && !error && (
                <span
                  className={`fm-answer-sentiment-label is-${sentiment.key}`}
                >
                  {sentiment.label}
                </span>
              )}
            </header>
            {loading ? (
              <p className="fm-answer-analysis-empty" role="status">
                正在读取本条回答的情感分析…
              </p>
            ) : error ? (
              <div className="fm-answer-analysis-error" role="alert">
                <p>情感分析读取失败</p>
                {onRetry && (
                  <button type="button" onClick={onRetry}>
                    <RotateCw size={14} />
                    重试
                  </button>
                )}
              </div>
            ) : hasWords ? (
              <div className="fm-answer-evaluation-groups">
                {SENTIMENT_BUCKETS.filter(
                  (bucket) => bucket.key !== "unknown",
                ).map((bucket) => {
                  const rows =
                    groups[bucket.key as KeywordEvaluation["nature"]];
                  if (!rows.length) return null;
                  const expanded = expandedGroups.has(bucket.key);
                  return (
                    <section
                      key={bucket.key}
                      className={`fm-answer-evaluation-group is-${bucket.key}`}
                      aria-label={`${bucket.label}评价词`}
                    >
                      <h5>
                        <i />
                        {bucket.label}
                        <span>{rows.length} 个评价词</span>
                      </h5>
                      <ul>
                        {(expanded ? rows : rows.slice(0, 5)).map(
                          (evaluation) => (
                            <EvaluationWord
                              key={`${evaluation.nature}:${evaluation.keyword}`}
                              evaluation={evaluation}
                            />
                          ),
                        )}
                      </ul>
                      {rows.length > 5 && (
                        <button
                          type="button"
                          className="fm-answer-expand-words"
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedGroups((previous) => {
                              const next = new Set(previous);
                              if (next.has(bucket.key)) next.delete(bucket.key);
                              else next.add(bucket.key);
                              return next;
                            })
                          }
                        >
                          {expanded
                            ? "收起更多评价词"
                            : `展开其余 ${rows.length - 5} 个评价词`}
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="fm-answer-analysis-empty">本条回答暂无评价词</p>
            )}
          </div>
          {distribution && (
            <aside
              className="fm-answer-sentiment-summary"
              aria-label="当前筛选范围情感分布"
            >
              <header>
                <h4>当前筛选范围</h4>
                <p>{scopeLabel || "全部问题 · 当前日期范围 · 全部平台"}</p>
              </header>
              <div className="fm-answer-sentiment-chart">
                <div
                  className="fm-answer-sentiment-ring"
                  style={{ background: ring }}
                  role="img"
                  aria-label={`${distribution.total} 条有效回答`}
                >
                  <div>
                    <strong>{distribution.total}</strong>
                    <span>有效回答</span>
                  </div>
                </div>
                <ul>
                  {distribution.buckets.map((bucket) => (
                    <li key={bucket.key}>
                      <i style={{ background: bucket.color }} />
                      <span>{bucket.label}</span>
                      <strong>{bucket.count}</strong>
                      <span>
                        {distribution.total
                          ? `${bucket.percent.toFixed(1)}%`
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="fm-answer-sentiment-note">
                占比基于当前筛选范围内的全部有效回答。
              </p>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
