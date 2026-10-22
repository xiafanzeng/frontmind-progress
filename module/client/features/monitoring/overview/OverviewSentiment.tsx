import { useState } from "react";
import { buildSentimentInsights } from "../../../components/AnswerInsights";
import type { RunAttempt } from "../../../domain";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import OverviewEvidence from "./OverviewEvidence";

export default function OverviewSentiment({ attempts, summary, self, onAnswer }: {
  attempts: RunAttempt[]; summary?: MonitoringSummaryData; self: boolean; onAnswer: (attempt: RunAttempt) => void;
}) {
  const insights = buildSentimentInsights(attempts);
  const [wordKey, setWordKey] = useState<string>();
  const [answerId, setAnswerId] = useState<string>();
  const words = Object.values(insights.keywords).flat().sort((a, b) => b.answerCount - a.answerCount || a.keyword.localeCompare(b.keyword));
  const word = words.find((item) => item.key === wordKey);
  const selectedContext = word?.contexts.find((item) => item.attemptId === answerId) || word?.contexts[0];
  const selected = attempts.find((attempt) => attempt.id === selectedContext?.attemptId);
  const counts = summary ? summary.metrics.sentiments : insights.counts;
  const total = counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0;
  return <section className="fm-ov-section" aria-labelledby="overview-sentiment-title">
    <header className="fm-ov-heading"><h2 id="overview-sentiment-title">情感分析</h2><span>原句语境与判定依据联动</span></header>
    {!self ? <div className="fm-empty"><strong>竞品主体的情感待核实</strong><span>回答整体倾向不能直接视为某个竞品的情感，请切换到当前品牌查看。</span></div> : <>
      <div className="fm-ov-sentiments" aria-label="当前筛选范围情感分布">{([
        ["positive", "正面"], ["neutral", "中性"], ["negative", "负面"], ["unknown", "未判定"],
      ] as const).map(([tone, label]) => <article key={tone} className={tone}><span><i />{label}</span><strong>{counts ? counts[tone] : "—"}</strong><small>{total && counts ? `${(counts[tone] / total * 100).toFixed(1)}%` : "暂无可统计样本"}</small><progress value={counts?.[tone] || 0} max={total || 1} aria-label={`${label}分布`} /></article>)}</div>
      <p className="fm-ov-note">未判定单独统计。四类数量来自当前筛选汇总；词云仅展示已读取完整回答中的平台关键词评价，不使用固定情感词典。</p>
      <div className="fm-ov-two-columns"><section className="fm-ov-card"><h3>情感词云</h3>{words.length ? <div className="fm-ov-wordcloud" aria-label="选择关键词查看关联回答">{words.map((item) => <button type="button" key={item.key} className={`${item.nature} ${word?.key === item.key ? "selected" : ""}`} style={{ fontSize: `${14 + Math.min(18, Math.log2(item.answerCount + 1) * 5)}px` }} aria-pressed={word?.key === item.key} onClick={() => { setWordKey(item.key); setAnswerId(undefined); }} title={`${item.answerCount} 条关联回答；${item.conflicted ? "不同语境判定存在差异" : "平台初判，仍需核查原句"}`}>{item.keyword}<small>{item.answerCount}</small></button>)}</div> : <div className="fm-empty"><strong>暂无可核查关键词</strong><span>等待平台返回关键词及原句语境；继续加载批次可补充证据。</span></div>}
        {word && <div className="fm-ov-word-related"><h4>“{word.keyword}”的关联回答</h4><p className="fm-ov-note">{word.conflicted ? "同一词在不同语境存在不同初判，需逐条核查。" : "情感取决于本条原句；平台初判不等于人工复核结论。"}</p>{word.contexts.map((context) => <button type="button" key={context.attemptId} aria-pressed={selected?.id === context.attemptId} className="fm-ov-related-answer" onClick={() => setAnswerId(context.attemptId)}><strong>{context.question}</strong><span>{context.platformName}</span><q>{context.context || "未提供上下文，待核实"}</q></button>)}</div>}
      </section><OverviewEvidence key={`${word?.key}:${selected?.id}`} attempt={selected} context={selectedContext?.context} check={word ? `关键词“${word.keyword}”在原句中的情感判定（平台初判）` : "选择词汇以查看判定依据"} onAnswer={onAnswer} /></div>
    </>}
  </section>;
}
