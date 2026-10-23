import { useEffect, useRef, useState } from "react";
import type { RunAttempt } from "../../../domain";
import { formatDateTime } from "../../../domain";
import { safeExternalUrl } from "../selectors";
import type { MonitoringQueryState } from "../types";
import { downloadHandoff, optimizationReportHref, type Suggestion } from "./overviewModel";
import OverviewEvidence from "./OverviewEvidence";
import { useOverviewDraft } from "./useOverviewDraft";
import { overviewDraftBasis, useBoundOverviewDraft, DraftVersionNotice } from "./useBoundOverviewDraft";

type ActionRequest = { id: string; target: "basis" | "evidence"; sequence: number };
type ActionDraft = { answerId: string; runId?: string; content: string };
function SuggestionDetail({ suggestion, monitorId, query, onAnswer, draftNamespace, request }: { suggestion: Suggestion; monitorId: string; query: MonitoringQueryState; onAnswer: (attempt: RunAttempt) => void; draftNamespace: string; request?: ActionRequest }) {
  const [answerId, setAnswerId] = useOverviewDraft<string | null>(`${draftNamespace}:${suggestion.id}:selection`, null);
  const attempt = suggestion.evidence.find((item) => item.id === answerId) || suggestion.evidence[0];
  const versioned = useBoundOverviewDraft<ActionDraft | null>(`${draftNamespace}:${suggestion.id}:draft:${attempt?.id || "none"}`, null, overviewDraftBasis(attempt, suggestion.check));
  const { value: draft, setValue: setDraft, persisted } = versioned;
  const basisRef = useRef<HTMLElement>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!request) return;
    const target = request.target === "evidence" ? evidenceRef.current : basisRef.current;
    target?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  }, [request]);
  const materials = attempt?.allSources || [];
  const questions = new Set(suggestion.evidence.map((item) => item.question));
  const batches = new Set(suggestion.evidence.map((item) => item.runId).filter(Boolean));
  const href = attempt ? optimizationReportHref(monitorId, attempt, query) : undefined;
  const context = suggestion.id === "faq" ? attempt?.keywordEvaluations?.find((item) => item.nature === "negative")?.context : undefined;
  return <div className="fm-ov-suggestion-detail">
    <div className="fm-ov-two-columns"><section ref={basisRef} tabIndex={-1} className="fm-ov-card fm-ov-action-target" aria-label="建议依据与草稿准备"><h3>建议依据 · 五步摘要</h3><p className="fm-ov-note">先核对以下依据，再到下方行动草稿区编辑。</p>
      <ol className="fm-ov-timeline">
        <li><h4>发现问题</h4><p>{attempt?.question || "尚无关联问题证据"}</p><p>{suggestion.evidence.length} 条待核查回答 · {questions.size} 个问题 · {batches.size} 个采集批次</p><p className="fm-ov-note">{attempt ? `${formatDateTime(attempt.capturedAt)} · ${attempt.platformName} · 已读取样本` : "暂无运行日期和模型信息"}。未达标数量：缺少业务阈值，暂不统计。</p></li>
        <li><h4>查过哪些资料</h4>{materials.length ? <details className="fm-ov-materials"><summary>查看本回答关联资料（{materials.length}）</summary><ul>{materials.map((material) => {
          const url = safeExternalUrl(material.url);
          return <li key={material.id}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{material.title || material.domain}</a> : material.title}<small>日期：{material.publishedAt || "未返回"} · 版本：未返回 · 核查范围：本回答关联来源 · 状态：待人工核验</small></li>;
        })}</ul></details> : <p>无已核查资料记录返回。回答未附资料不等于知识库缺失。</p>}</li>
        <li><h4>哪些缺口仍需确认</h4><p className="fm-ov-fact">观测事实：{suggestion.evidence.length ? `有 ${suggestion.evidence.length} 条回答符合“${suggestion.check}”的待核查条件。` : "尚无相关证据。"}</p><p className="fm-ov-checked">已核查记录：资料人工核查记录未返回。</p><p className="fm-ov-judgment">系统判断：建议先核查资料与回答是否一致，暂不能确定缺失原因。</p><p className="fm-ov-pending">待核实事项：资料版本、业务达标阈值、判断规则版本和实际表达缺口。</p></li>
        <li><h4>下一步怎么做</h4><p>{suggestion.action}</p><p>先确认资料 → 补充知识条目 → 审核 → 交接内容制作或官网发布。</p><p className="fm-ov-note">可在证据面板的复核草稿中补充依据。</p></li>
        <li><h4>怎样知道是否改善</h4><p>待验证指标：{suggestion.metric}。当前未返回整改完成记录与可比复测结果，改善情况待验证。</p>{href ? <a href={href}>查看进度报告 · 单题优化部分</a> : <p className="fm-ov-note">暂无可定位运行，采集后可进入进度报告中的单题优化部分。</p>}</li>
      </ol>
    </section><div ref={evidenceRef} tabIndex={-1} className="fm-ov-action-target" aria-label="核对原回答并准备复核">
      {suggestion.evidence.length > 1 && <label className="fm-ov-select-evidence">选择关联回答<select value={attempt?.id || ""} onChange={(event) => setAnswerId(event.target.value)}>{suggestion.evidence.map((item) => <option key={item.id} value={item.id}>{item.question} · {item.platformName} · {item.runId?.slice(0, 8)}</option>)}</select></label>}
      <OverviewEvidence key={`${suggestion.id}:${attempt?.id}`} draftNamespace={draftNamespace} attempt={attempt} context={context || undefined} check={suggestion.check} onAnswer={onAnswer} />
    </div></div>
    <section className="fm-ov-card"><header className="fm-ov-heading"><h3>行动草稿</h3><span className="fm-ov-tag">未提交</span></header><p className="fm-ov-note">每条回答单独保留草稿，可编辑和下载。跨模块交接尚未接通。</p>
      <DraftVersionNotice stale={versioned.stale} stored={versioned.stored} onRebind={versioned.rebind} currentRevision={attempt?.revision} />
      <fieldset disabled={versioned.stale} className="fm-ov-versioned-fields">{draft === null ? <button type="button" className="fm-primary-button" disabled={!attempt} onClick={() => {
        if (!attempt) return;
        setDraft({ answerId: attempt.id, runId: attempt.runId, content: `${suggestion.title}\n关联问题：${attempt.question}\n待核查回答：${attempt.id}\n观测条件：${suggestion.check}\n建议动作：${suggestion.action}\n待补充资料与版本：\n审核意见：\n承接模块：${suggestion.destination}\n待验证指标：${suggestion.metric}` });
        requestAnimationFrame(() => draftRef.current?.focus());
      }}>已阅读依据，生成可编辑草稿</button> : <><label>可编辑草稿<textarea ref={draftRef} className="fm-ov-draft" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label><p className="fm-ov-note">草稿关联回答：{draft.answerId} · 依据版本：{versioned.basis?.answerRevision ? `V${versioned.basis.answerRevision}` : "版本未返回，按证据快照核对"}。切换回答后可分别编辑。</p><p className="fm-ov-note">{persisted ? "已暂存于当前浏览器标签页，刷新后可继续；关闭标签页前请下载。" : "当前页面会话内保留，请下载后再关闭或刷新。"}</p><button type="button" className="fm-primary-button" onClick={() => downloadHandoff("frontmind-optimization-draft.json", { kind: "optimization-draft", status: "integration_pending", submitted: false, suggestion: suggestion.id, answerId: draft.answerId, runId: draft.runId, content: draft.content, evidenceBasis: versioned.basis, previousDraftVersions: versioned.history, destination: suggestion.destination, preparedAt: new Date().toISOString() })}>下载草稿与待确认清单</button></>}</fieldset>
    </section>
  </div>;
}

export default function OverviewSuggestions({ suggestions, monitorId, query, onAnswer, draftNamespace }: { suggestions: Suggestion[]; monitorId: string; query: MonitoringQueryState; onAnswer: (attempt: RunAttempt) => void; draftNamespace: string }) {
  const [expanded, setExpanded] = useOverviewDraft<string | null>(`${draftNamespace}:expanded`, null);
  const [request, setRequest] = useState<ActionRequest>();
  const [filter, setFilter] = useState("all");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selected = suggestions.find(item => item.id === expanded);
  const available = suggestions.filter(item => item.evidence.length > 0);
  const visible = filter === "evidence" ? available : suggestions;
  const open = (id: string, target: ActionRequest["target"]) => { setExpanded(id); setRequest(value => ({ id, target, sequence: (value?.sequence || 0) + 1 })); };
  return <section className="fm-ov-section" aria-labelledby="overview-suggestions-title"><header className="fm-ov-heading"><h2 id="overview-suggestions-title" ref={headingRef} tabIndex={-1}>AI 优化建议</h2><span>先看依据，再决定行动</span></header>
    {selected ? <>
      <button type="button" className="fm-text-button fm-ov-back" onClick={() => { setExpanded(null); setRequest(undefined); requestAnimationFrame(() => { headingRef.current?.focus(); headingRef.current?.scrollIntoView({ block: "start" }); }); }}>← 返回建议列表</button>
      <header className="fm-ov-detail-heading"><span className={`fm-ov-priority ${selected.priority}`}>{selected.priority}</span><h3>{selected.title}</h3><span className="fm-ov-tag">待核查</span><p>{selected.evidence.length} 条回答证据 · {selected.destination} · 草稿按回答分别保留</p></header>
      <SuggestionDetail key={selected.id} draftNamespace={draftNamespace} request={request?.id === selected.id ? request : undefined} suggestion={selected} monitorId={monitorId} query={query} onAnswer={onAnswer} />
    </> : <>
      <div className="fm-ov-heading"><div className="fm-segmented" role="group" aria-label="建议范围"><button type="button" aria-pressed={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部核查方向</button><button type="button" aria-pressed={filter === "evidence"} className={filter === "evidence" ? "active" : ""} onClick={() => setFilter("evidence")}>有回答证据 · {available.length}</button></div><span>优先级表示核查顺序</span></div>
      <p className="fm-ov-note">当前为规则辅助建议：依据真实回答整理核查方向，尚未接入大模型生成或知识库检索。资料是否缺失，需核对后确认。</p>
      <details className="fm-ov-method"><summary>查看建议生成方式</summary><p>仅处理已完成且有正文的回答：未提及品牌 → 知识库核查；平台判定负面 → FAQ 核查；非明确引用或无文内引用 → 公开信源核验。优先级来自固定核查顺序，五步摘要由字段与模板组成；行动与复核草稿仅本地暂存，未提交到业务系统。</p></details><div className="fm-ov-suggestions">{visible.map((suggestion) => <article key={suggestion.id} className={`fm-ov-suggestion${suggestion.evidence.length ? " has-evidence" : ""}`}>
        <div className="fm-ov-suggestion-copy"><header><span className={`fm-ov-priority ${suggestion.priority}`}>{suggestion.priority}</span><h3>{suggestion.title}</h3><span className="fm-ov-tag">{suggestion.evidence.length ? "待核查" : "暂无关联证据"}</span></header><p>{suggestion.action}</p>
          <p className="fm-ov-question-line">关联问题：{[...new Set(suggestion.evidence.map(item => item.question))].slice(0, 2).join("；") || "暂无"}</p>
          <dl className="fm-ov-suggestion-meta"><div><dt>回答证据</dt><dd>{suggestion.evidence.length} 条（已读取）</dd></div><div><dt>承接模块</dt><dd>{suggestion.destination}</dd></div><div><dt>待验证指标</dt><dd>{suggestion.metric}</dd></div></dl>
        </div><footer><button type="button" className="fm-primary-button" disabled={!suggestion.evidence.length} onClick={() => open(suggestion.id, "basis")}>查看依据与草稿 →</button><button type="button" className="fm-text-button" disabled={!suggestion.evidence.length} onClick={() => open(suggestion.id, "evidence")}>查看证据并复核</button></footer>
      </article>)}</div>
      {!visible.length && <div className="fm-empty"><strong>当前没有相关回答证据</strong><span>可切换到全部核查方向，或继续读取现有批次。</span></div>}
    </>}
  </section>;
}



