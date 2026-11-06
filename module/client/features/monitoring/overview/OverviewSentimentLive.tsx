import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { MonitoringScope } from "@frontmind/monitoring-contracts";
import type { OverviewSentimentInput, OverviewSentimentData } from "../../../../contracts/overview";
import type { RunAttempt } from "../../../domain";
import { trpc } from "../../../trpc";
import { attemptFromDetail } from "../useMonitoringDataSource";
import OverviewPagination from "./OverviewPagination";
import OverviewKeywordRanking, { sentimentTones as tones, initialWordPages } from "./OverviewKeywordRanking";
import OverviewEvidence from "./OverviewEvidence";
import { scrollOverviewTarget } from "./scrollOverviewTarget";

const keywordStates = { available: "已返回关键词", empty: "未提取到评价词", not_returned: "关键词明细未返回", unavailable: "未提供可用的评价词字段" };
const readOptions = { staleTime: 60_000, refetchOnWindowFocus: false, retry: false, trpc: { abortOnUnmount: true } };
type Row = OverviewSentimentData["rows"][number];
type Selection = { row: Row; context?: string; word?: Row["evaluations"][number] };
const rowKey = (row: Row) => `${row.answerId}:${row.revisionId}`;

function LoadingResults({ height, failed = false }: { height: number; failed?: boolean }) {
  return <div className="fm-ov-results-placeholder" style={{ height }}>
    <p>{failed ? "当前筛选结果未能读取，请重试或调整筛选。" : "正在读取当前筛选结果…"}</p>
    {!failed && <div className="fm-ov-skeleton-lines" aria-hidden="true"><span /><span /><span /></div>}
  </div>;
}

function Evidence({ scope, row, context, word, onAnswer, draftNamespace }: { scope: MonitoringScope; row: Row; context?: string; word?: Row["evaluations"][number]; onAnswer: (attempt: RunAttempt) => void; draftNamespace: string }) {
  const evidence = trpc.monitoring.overview.evidence.useQuery({ monitorId: scope.monitorId, answerId: row.answerId, revisionId: row.revisionId, subject: scope.subject }, readOptions);
  if (evidence.error) return <p role="alert" className="fm-ov-notice pending">{evidence.error.message}<button type="button" className="fm-text-button" onClick={() => void evidence.refetch()}>重试读取</button></p>;
  if (!evidence.data) return <p role="status">正在读取所选版本的完整回答…</p>;
  const data = evidence.data;
  const attempt: RunAttempt = { ...attemptFromDetail(data), revision: data.revision, resultUpdatedAt: data.resultUpdatedAt,
    sentimentEvidence: { provider: data.provider, revisionId: data.revisionId, targetBrand: data.targetBrand, brandVersionId: data.brandVersionId,
      brandAliases: data.brandAliases, rawSentiment: data.rawSentiment, keywordState: data.keywordState } };
  return <OverviewEvidence attempt={attempt} context={context} draftCheck={word ? `关键词“${word.keyword}”在原句中的情感判定（平台初判）` : undefined} check={word ? `Moli 评价词“${word.keyword}” · ${tones.find(tone => tone.id === word.nature)?.label}` : "Moli 回答对目标品牌的评价倾向"} draftNamespace={scope.subject.kind === "self" ? draftNamespace : `${draftNamespace}:subject:${JSON.stringify(scope.subject)}`} onAnswer={onAnswer} />;
}

export default function OverviewSentimentLive({ scope, onAnswer, draftNamespace }: { scope: MonitoringScope; onAnswer: (attempt: RunAttempt) => void; draftNamespace: string }) {
  const evidenceRef = useRef<HTMLElement>(null);
  const cloudResultsRef = useRef<HTMLDivElement>(null);
  const traceResultsRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [resultHeights, setResultHeights] = useState({ cloud: 260, trace: 360 });
  // The parent remounts this component for each monitoring scope. Only the
  // scope-wide summary is retained; previous filtered rows are never displayed.
  const [lastSummary, setLastSummary] = useState<OverviewSentimentData | null>(null);
  const [answerTone, setAnswerTone] = useState<Exclude<OverviewSentimentInput["answerTone"], "missing">>("all");
  const [keywordTone, setKeywordTone] = useState<OverviewSentimentInput["keywordTone"]>("all");
  const [keywordKey, setKeywordKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [wordPages, setWordPages] = useState(initialWordPages);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const query = trpc.monitoring.overview.sentiment.useQuery({ scope, answerTone, keywordTone, keywordKey, page }, readOptions);
  useEffect(() => {
    if (query.data && !query.isFetching && !query.error) setLastSummary(query.data);
  }, [query.data, query.isFetching, query.error]);
  useEffect(() => {
    if (!selected) return;
    if (evidenceOpen) scrollOverviewTarget(evidenceRef.current);
    else {
      scrollOverviewTarget(rowRefs.current.get(rowKey(selected.row)) || null);
      const trigger = sourceTriggerRef.current;
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
    }
  }, [selected, evidenceOpen]);
  const rememberHeights = () => {
    const cloud = cloudResultsRef.current?.getBoundingClientRect().height;
    const trace = traceResultsRef.current?.getBoundingClientRect().height;
    setResultHeights(previous => ({
      cloud: cloud || previous.cloud,
      trace: trace || previous.trace,
    }));
  };
  const clearSelection = () => { setSelected(null); setEvidenceOpen(false); sourceTriggerRef.current = null; };
  const reset = () => { rememberHeights(); setPage(1); setWordPages(initialWordPages()); setKeywordKey(null); clearSelection(); };
  const selectEvidence = (selection: Selection, trigger: HTMLButtonElement) => {
    sourceTriggerRef.current = trigger;
    setSelected(selection);
    setEvidenceOpen(true);
  };
  const refresh = () => { rememberHeights(); clearSelection(); void query.refetch(); };
  const status = <div className="fm-ov-query-status">
    {query.error ? <p role="alert" className="fm-ov-notice pending">情感读取失败：{query.error.message}。{lastSummary && "范围总览为最近一次读取结果。"}<button type="button" className="fm-text-button" disabled={query.isFetching} onClick={refresh}>重试读取</button></p>
      : <p role="status" aria-live="polite">{query.isFetching ? lastSummary ? "正在更新评价词与回答列表，范围总览暂保留最近一次读取结果…" : "正在读取当前范围的情感数据…" : ""}</p>}
  </div>;
  const data = query.data || lastSummary;
  if (!data) return <section className="fm-ov-section" aria-labelledby="overview-sentiment-title">
    <header className="fm-ov-heading"><h2 id="overview-sentiment-title">情感分析</h2></header>
    {status}
    <section className="fm-ov-card" aria-busy={query.isFetching}><h3>回答对品牌的评价倾向与评价词</h3><LoadingResults height={440} failed={Boolean(query.error)} /></section>
    <section className="fm-ov-card" aria-busy={query.isFetching}><h3>词汇判断与回答溯源</h3><LoadingResults height={resultHeights.trace} failed={Boolean(query.error)} /></section>
  </section>;
  const resultsReady = Boolean(query.data) && !query.isFetching && !query.error;
  let angle = 0;
  const ring = tones.map(tone => { const start = angle; angle += data.classified ? data.counts[tone.id] / data.classified * 360 : 0; return `${tone.color} ${start}deg ${angle}deg`; });
  const activeWord = data.keywords.find(word => word.key === keywordKey);
  const answerLabel = answerTone === "all" ? "全部回答" : `${tones.find(tone => tone.id === answerTone)?.label}回答`;
  return <section className="fm-ov-section" aria-labelledby="overview-sentiment-title">
    <header className="fm-ov-heading"><div><h2 id="overview-sentiment-title">情感分析</h2></div><button type="button" className="fm-text-button" disabled={query.isFetching} onClick={refresh}>刷新情感数据</button></header>
    {status}
    <section className="fm-ov-card">
      <div className="fm-ov-sentiment-summary"><strong>全部有效回答 {data.total}</strong><span>已判定 {data.classified}</span></div>
      <p className="fm-ov-note">占比以 {data.classified} 条已判定回答为分母，未判定回答不计入。</p>
      {data.brandMismatch > 0 && <p className="fm-ov-notice pending">{data.brandMismatch} 条历史回答的目标品牌不同，或当时未配置所选竞品，其标签未计入当前品牌判定。</p>}
      <div className="fm-ov-sentiment-linked">
        <section className="fm-ov-sentiment-distribution"><h3>回答对品牌的评价倾向</h3>
          <div className="fm-ov-donut" role="img" aria-label={`已判定 ${data.classified} 条；正面 ${data.counts.positive}、中性 ${data.counts.neutral}、负面 ${data.counts.negative}`} style={{ "--ov-ring": data.classified ? `conic-gradient(${ring.join(",")})` : "#e9e7ef" } as CSSProperties}><div><strong>{data.classified}</strong><small>已判定回答</small></div></div>
          <div className="fm-ov-answer-tone" role="group" aria-label="按回答整体情感筛选">
            <button type="button" aria-pressed={answerTone === "all"} onClick={() => { setAnswerTone("all"); reset(); }}><span>全部回答</span><strong>{data.total}</strong></button>
            {tones.map(tone => <button type="button" key={tone.id} aria-pressed={answerTone === tone.id} onClick={() => { setAnswerTone(answerTone === tone.id ? "all" : tone.id); reset(); }}><i style={{ background: tone.color }} /><span>{tone.label}</span><strong>{data.counts[tone.id]}</strong><small>{data.classified ? `${(data.counts[tone.id] / data.classified * 100).toFixed(1)}%` : "—"}</small></button>)}
          </div>
        </section>
        <section className="fm-ov-cloud-panel"><h3>{answerLabel}中的评价词</h3><p className="fm-ov-note">当前 {resultsReady ? data.filteredAnswers : "—"} 条回答。词语倾向与回答整体倾向分别保留，整体标签不按词数投票。</p>
          <div className="fm-segmented" role="group" aria-label="评价词自身情感筛选">{[{ id: "all" as const, label: "全部评价词" }, ...tones].map(tone => <button type="button" key={tone.id} aria-pressed={keywordTone === tone.id} className={keywordTone === tone.id ? "active" : ""} onClick={() => { setKeywordTone(tone.id); reset(); }}>{tone.label}</button>)}</div>
          <div className="fm-ov-cloud-results" ref={cloudResultsRef} aria-busy={query.isFetching}>
            {!resultsReady ? <LoadingResults height={resultHeights.cloud} failed={Boolean(query.error)} /> : <OverviewKeywordRanking
              keywords={data.keywords} tone={keywordTone} answerCount={data.filteredAnswers} selectedKey={keywordKey} pages={wordPages}
              onPage={(tone, value) => setWordPages(previous => ({ ...previous, [tone]: value }))}
              onSelect={key => { rememberHeights(); setKeywordKey(keywordKey === key ? null : key); setPage(1); clearSelection(); }} />}
          </div>
        </section>
      </div>
      <details className="fm-ov-run-details"><summary>统计口径、字段覆盖与判定说明</summary><p>失败和空回答不计入有效回答；未判定回答不视为中性。评价词条形占比和数量按关联回答去重，同一词的不同倾向分开展示；负面回答中也可能出现正面评价词。</p><p>{Object.entries(data.keywordStates).map(([key, value]) => `${keywordStates[key as keyof typeof keywordStates]} ${value} 条`).join("；")}。字段明确返回 null 与空列表分别保留；历史原字段不可恢复时显示不可确认，不推断缺失原因。</p><p>Moli 本品使用 sentiment / keywordEvaluations，竞品使用 competitorEvaluations；FrontMind 保留供应商标签，不按词数重新判定整体情感。供应商未提供整体判断规则、置信度或模型版本。</p><p>{data.coverage}</p></details>
    </section>
    <section className="fm-ov-card fm-ov-word-trace fm-ov-answer-trace"><header className="fm-ov-heading"><div><h3>词汇判断与回答溯源</h3><p className="fm-ov-note">{answerLabel}{activeWord ? ` · “${activeWord.keyword}”` : ""} · {resultsReady ? data.rowCount : "—"} 条回答 · 每页最多 10 条</p></div>{keywordKey && <button type="button" className="fm-text-button" onClick={() => { rememberHeights(); setKeywordKey(null); setPage(1); clearSelection(); }}>清除词语筛选</button>}</header>
      <div className="fm-ov-trace-results" ref={traceResultsRef} aria-busy={query.isFetching}>
        {!resultsReady ? <LoadingResults height={resultHeights.trace} failed={Boolean(query.error)} /> : data.rows.length ? <>
          <div className="fm-table-scroll"><table className="fm-data-table"><thead><tr><th>回答 / 目标品牌</th><th>回答整体标签</th><th>评价词 / 供应商原句</th><th>溯源</th></tr></thead><tbody>{data.rows.map(row => {
            const key = rowKey(row);
            const isSelected = selected !== null && rowKey(selected.row) === key;
            return <tr key={key} className={isSelected ? "selected" : undefined} tabIndex={-1} ref={element => { if (element) rowRefs.current.set(key, element); else rowRefs.current.delete(key); }}>
              <td><strong>{row.question}</strong><small>{row.platformName} · {row.targetBrand || "当时未配置所选竞品"} · {row.capturedAt.slice(0, 10)}</small>{isSelected && <span className="fm-ov-selection-label">已选证据来源</span>}</td>
              <td><span className={`fm-ov-tone-label ${row.sentiment || "unknown"}`}>{tones.find(tone => tone.id === row.sentiment)?.label || "未判定"}</span><small>回答 V{row.revision ?? "—"}</small></td>
              <td>{row.evaluations.length ? <>
                <div className="fm-ov-inline-words">{row.evaluations.map((word, index) => <span key={`${word.key}:${index}`} className={`fm-ov-tone-label ${word.nature}`}>{word.keyword}</span>)}</div>
                <details open={Boolean(keywordKey)}><summary>查看 {row.evaluations.length} 条评价语境</summary>{row.evaluations.map((word, index) => <div className="fm-ov-word-evidence" key={`${word.key}:${index}`}>
                  <span className={`fm-ov-tone-label ${word.nature}`}>{word.keyword} · {tones.find(tone => tone.id === word.nature)?.label}</span><p>{word.context || "供应商未提供对应语境"}</p>
                  <button type="button" className="fm-text-button" aria-controls={isSelected ? "overview-sentiment-evidence" : undefined} aria-expanded={isSelected && evidenceOpen && selected?.word?.key === word.key && selected?.context === (word.context || undefined)} onClick={event => selectEvidence({ row, context: word.context || undefined, word }, event.currentTarget)}>定位原句与依据</button>
                </div>)}</details>
              </> : <span>{keywordStates[row.keywordState]}</span>}</td>
              <td>{row.targetBrand ? <button type="button" className="fm-secondary-button" aria-controls={isSelected ? "overview-sentiment-evidence" : undefined} aria-expanded={isSelected && evidenceOpen && !selected?.word} onClick={event => selectEvidence({ row }, event.currentTarget)}>查看完整证据</button> : <small>此批次没有该竞品的判定；切回本品可查看历史原回答。</small>}</td>
            </tr>;
          })}</tbody></table></div>
          <OverviewPagination label="情感回答分页" page={data.page} total={data.rowCount} onChange={value => { rememberHeights(); setPage(value); clearSelection(); }} />
        </> : <p className="fm-ov-note">没有符合当前筛选的回答。</p>}
      </div>
    </section>
    {selected && <section id="overview-sentiment-evidence" className="fm-ov-card fm-ov-selected-evidence" hidden={!evidenceOpen} tabIndex={-1} ref={evidenceRef} aria-labelledby="overview-evidence-title">
      <div className="fm-ov-heading"><div><h3 id="overview-evidence-title">原回答与判定来源</h3><p className="fm-ov-note">{selected.row.platformName} · 回答 V{selected.row.revision ?? "—"} · 来源行已高亮</p></div><button type="button" className="fm-secondary-button" onClick={() => setEvidenceOpen(false)}>↑ 返回所选回答</button></div>
      <Evidence key={`${selected.row.answerId}:${selected.row.revisionId}:${selected.word?.key || "overall"}:${selected.context || ""}`} scope={scope} {...selected} onAnswer={onAnswer} draftNamespace={draftNamespace} />
      <button type="button" className="fm-text-button" onClick={() => setEvidenceOpen(false)}>↑ 收起证据并返回所选回答</button>
    </section>}
  </section>;
}
