import { useRef, useState, type CSSProperties } from "react";
import { buildSentimentInsights } from "../../../components/AnswerInsights";
import type { RunAttempt } from "../../../domain";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";
import OverviewEvidence from "./OverviewEvidence";
import { scrollOverviewTarget } from "./scrollOverviewTarget";
import { useOverviewDraft } from "./useOverviewDraft";

const tones = [
  { id: "positive", label: "正面", color: "#218366" },
  { id: "neutral", label: "中性", color: "#587da8" },
  { id: "negative", label: "负面", color: "#c45068" },
  { id: "unknown", label: "未判定", color: "#a3aab6" },
] as const;

export default function OverviewSentiment({ attempts, summary, self, onAnswer, draftNamespace }: {
  attempts: RunAttempt[]; summary?: MonitoringSummaryData; self: boolean; onAnswer: (attempt: RunAttempt) => void; draftNamespace: string;
}) {
  const insights = buildSentimentInsights(attempts);
  const [tone, setTone] = useState("all");
  const [detail, setDetail] = useState(false);
  const [page, setPage] = useState(0);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const [wordKey, setWordKey] = useOverviewDraft<string | null>(`${draftNamespace}:sentiment:word`, null);
  const [answerId, setAnswerId] = useOverviewDraft<string | null>(`${draftNamespace}:sentiment:answer`, null);
  const words = Object.values(insights.keywords).flat().filter(item => tone === "all" || item.nature === tone).sort((a, b) => b.answerCount - a.answerCount || a.keyword.localeCompare(b.keyword));
  const word = words.find((item) => item.key === wordKey) || words[0];
  const selectedContext = word?.contexts.find((item) => item.attemptId === answerId) || word?.contexts[0];
  const selected = attempts.find((attempt) => attempt.id === selectedContext?.attemptId);
  const traceRows = words.flatMap(item => item.contexts.flatMap(context => {
    const attempt = attempts.find(answer => answer.id === context.attemptId);
    return attempt ? [{ word: item, context, attempt }] : [];
  }));
  const pageCount = Math.ceil(traceRows.length / 8);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const openEvidence = (key: string, id: string) => {
    setWordKey(key); setAnswerId(id); setDetail(true);
    requestAnimationFrame(() => scrollOverviewTarget(evidenceRef.current));
  };
  const counts = summary ? summary.metrics.sentiments : insights.counts;
  const total = counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0;
  let angle = 0;
  const segments = tones.map(item => {
    const start = angle;
    angle += total && counts ? counts[item.id] / total * 360 : 0;
    return `${item.color} ${start}deg ${angle}deg`;
  });
  return <section className="fm-ov-section" aria-labelledby="overview-sentiment-title">
    <header className="fm-ov-heading"><h2 id="overview-sentiment-title">情感分析</h2><span>从分布到关键词，再核对原句</span></header>
    {!self ? <div className="fm-empty"><strong>竞品主体的情感待核实</strong><span>回答整体倾向不能直接视为某个竞品的情感，请切换到当前品牌查看。</span></div> : <>
      <section className="fm-ov-card"><header className="fm-ov-heading"><h3>情感概览</h3><span className="fm-ov-note">点击关键词，查看右侧原句</span></header>
        <div className="fm-ov-sentiment-grid">
          <section className="fm-ov-sentiment-distribution"><h4>当前筛选 · 全部有效回答</h4><div className="fm-ov-donut" role="img" aria-label={counts ? `全部有效回答 ${total} 条，包含未判定；四类数量见下方` : "情感分布未返回，待核实"} style={{ "--ov-ring": total ? `conic-gradient(${segments.join(",")})` : "#e9e7ef" } as CSSProperties}><div><strong>{counts ? total : "—"}</strong><small>{counts ? "含未判定" : "分布待核实"}</small></div></div><ul className="fm-ov-tone-legend">{tones.map(item => <li key={item.id}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{counts?.[item.id] ?? "—"}</strong><small>{total && counts ? `${(counts[item.id] / total * 100).toFixed(1)}%` : "—"}</small></li>)}</ul></section>
          <section className="fm-ov-cloud-panel"><h4>情感词云</h4><div className="fm-segmented" role="group" aria-label="关键词情感筛选">{[{ id: "all", label: "全部" }, ...tones.filter(item => item.id !== "unknown")].map(item => <button type="button" key={item.id} aria-pressed={tone === item.id} className={tone === item.id ? "active" : ""} onClick={() => { setTone(item.id); setPage(0); setDetail(false); }}>{item.label}</button>)}</div>
            {words.length ? <div className="fm-ov-wordcloud" aria-label="选择关键词查看关联回答">{words.map((item) => <button type="button" key={item.key} className={`${item.nature} ${word?.key === item.key ? "selected" : ""}`} style={{ fontSize: `${14 + Math.min(16, Math.log2(item.answerCount + 1) * 5)}px` }} aria-pressed={word?.key === item.key} onClick={() => { setWordKey(item.key); setAnswerId(null); setDetail(false); }} title={`${item.answerCount} 条关联回答；平台初判，仍需核查原句`}>{item.keyword}<small>{item.answerCount}</small></button>)}</div> : <div className="fm-empty"><strong>暂无该类关键词</strong><span>仅展示已读取回答中的平台关键词，不补充推测词汇。</span></div>}
            <p className="fm-ov-note">字号表示关联回答数量。筛选只影响关键词与语境，左侧汇总保持当前完整范围。</p>
          </section>
          <section className="fm-ov-context-panel" aria-label="所选关键词关联语境"><h4>{word ? `“${word.keyword}”的原句语境` : "关联语境"}</h4>{word && selected ? <>
            <p className="fm-ov-note">{word.conflicted ? "不同语境的初判存在差异，需逐条核对" : "平台初判 · 尚未人工复核"}</p>
            <label className="fm-ov-select-evidence">关联回答（{word.contexts.length}）<select value={selected.id} onChange={event => { setAnswerId(event.target.value); setDetail(false); }}>{word.contexts.map(context => <option key={context.attemptId} value={context.attemptId}>{context.platformName} · {context.question} · {context.attemptId.slice(0, 6)}</option>)}</select></label>
            <strong>{selected.question}</strong><blockquote>{selectedContext?.context || "未提供原句语境，待核实"}</blockquote>
            <button type="button" className="fm-secondary-button" aria-expanded={detail} aria-controls="sentiment-evidence-detail" onClick={() => setDetail(value => !value)}>{detail ? "收起证据面板" : "查看依据与复核"}</button><button type="button" className="fm-text-button" onClick={() => onAnswer(selected)}>打开完整回答 →</button>
          </> : <p className="fm-ov-note">有关键词与关联回答时，在此查看原句和判定依据。</p>}</section>
        </div>
      </section>
      <section className="fm-ov-card fm-ov-word-trace"><header className="fm-ov-heading"><div><h3>词汇判断与回答溯源</h3><p className="fm-ov-note">按上方情感筛选 · {traceRows.length} 条关键词与回答关联 · 平台初判，待核查</p></div><span className="fm-ov-tag">已读取样本</span></header>
        {traceRows.length ? <><div className="fm-table-scroll"><table className="fm-data-table"><thead><tr><th>词汇 / 平台初判</th><th>关联问题 / 回答来源</th><th>原句语境</th><th>核查操作</th></tr></thead><tbody>{traceRows.slice(currentPage * 8, (currentPage + 1) * 8).map(row => <tr key={`${row.word.key}:${row.attempt.id}`} className={word?.key === row.word.key && selected?.id === row.attempt.id ? "selected" : ""}>
          <td><strong>{row.word.keyword}</strong><span className={`fm-ov-tone-label ${row.word.nature}`}>{tones.find(item => item.id === row.word.nature)?.label}</span>{row.word.conflicted && <small>跨语境初判有差异</small>}</td>
          <td><strong>{row.attempt.question}</strong><small>{row.attempt.platformName} · 批次 {row.attempt.runId?.slice(0, 8) || "未返回"}</small></td>
          <td><p className="fm-ov-trace-context">{row.context.context || "平台未提供原句语境，待核实"}</p></td>
          <td><div className="fm-ov-trace-actions"><button type="button" className="fm-text-button" onClick={() => onAnswer(row.attempt)}>查看回答</button><button type="button" className="fm-secondary-button" onClick={() => openEvidence(row.word.key, row.attempt.id)}>依据与复核</button></div></td>
        </tr>)}</tbody></table></div>{pageCount > 1 && <div className="fm-ov-pagination"><span>第 {currentPage + 1} / {pageCount} 页</span><button type="button" className="fm-secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><button type="button" className="fm-secondary-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}</> : <div className="fm-empty"><strong>暂无该类词汇判断记录</strong><span>有平台返回的关键词和回答后，将在此展示原句与溯源入口。</span></div>}
      </section>
      {detail && selected && <div id="sentiment-evidence-detail" ref={evidenceRef} tabIndex={-1} className="fm-ov-action-target"><OverviewEvidence key={`${word?.key}:${selected.id}`} draftNamespace={draftNamespace} attempt={selected} context={selectedContext?.context} check={`关键词“${word?.keyword}”在原句中的情感判定（平台初判）`} onAnswer={onAnswer} /></div>}
    </>}
  </section>;
}


