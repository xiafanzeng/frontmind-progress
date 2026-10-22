import { useState } from "react";
import type { RunAttempt } from "../../../domain";
import { formatDateTime } from "../../../domain";
import { safeExternalUrl } from "../selectors";
import type { MonitoringQueryState } from "../types";
import { downloadHandoff, optimizationReportHref, type Suggestion } from "./overviewModel";
import OverviewEvidence from "./OverviewEvidence";

function SuggestionDetail({ suggestion, monitorId, query, onAnswer }: { suggestion: Suggestion; monitorId: string; query: MonitoringQueryState; onAnswer: (attempt: RunAttempt) => void }) {
  const [answerId, setAnswerId] = useState(suggestion.evidence[0]?.id);
  const [draft, setDraft] = useState<{ answerId: string; runId?: string; content: string }>();
  const attempt = suggestion.evidence.find((item) => item.id === answerId) || suggestion.evidence[0];
  const materials = attempt?.allSources || [];
  const questions = new Set(suggestion.evidence.map((item) => item.question));
  const batches = new Set(suggestion.evidence.map((item) => item.runId).filter(Boolean));
  const href = attempt ? optimizationReportHref(monitorId, attempt, query) : undefined;
  const context = suggestion.id === "faq" ? attempt?.keywordEvaluations?.find((item) => item.nature === "negative")?.context : undefined;
  return <div className="fm-ov-suggestion-detail">
    <div className="fm-ov-two-columns"><section className="fm-ov-card"><h3>建议依据 · 五步摘要</h3><p className="fm-ov-note">以下为可核查的分析摘要，依据采集事实整理。</p>
      <ol className="fm-ov-timeline">
        <li><h4>发现问题</h4><p>{attempt?.question || "尚无关联问题证据"}</p><p>{suggestion.evidence.length} 条待核查回答 · {questions.size} 个问题 · {batches.size} 个采集批次</p><p className="fm-ov-note">{attempt ? `${formatDateTime(attempt.capturedAt)} · ${attempt.platformName} · 当前已读取样本` : "运行日期、模型及样本范围待采集"}。未达标回答数量：待核实（业务阈值未提供），不将待核查数量标为未达标数量。</p></li>
        <li><h4>查过哪些资料</h4>{materials.length ? <ul>{materials.map((material) => {
          const url = safeExternalUrl(material.url);
          return <li key={material.id}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{material.title || material.domain}</a> : material.title}<small>日期：{material.publishedAt || "未返回"} · 版本：未返回 · 核查范围：本回答关联来源 · 状态：待人工核验</small></li>;
        })}</ul> : <p>无已核查资料记录返回。回答未附资料不等于知识库缺失。</p>}</li>
        <li><h4>哪些缺口仍需确认</h4><p className="fm-ov-fact">观测事实：{suggestion.evidence.length ? `有 ${suggestion.evidence.length} 条回答符合“${suggestion.check}”的待核查条件。` : "尚无相关证据。"}</p><p className="fm-ov-checked">已核查记录：资料人工核查记录未返回。</p><p className="fm-ov-judgment">系统判断：建议先核查资料与回答是否一致，暂不能确定缺失原因。</p><p className="fm-ov-pending">待核实事项：资料版本、业务达标阈值、判断规则版本和实际表达缺口。</p></li>
        <li><h4>下一步怎么做</h4><p>{suggestion.action}</p><p>先确认资料 → 补充知识条目 → 审核 → 交接内容制作或官网发布。</p><p className="fm-ov-note">未确认的事项保持待处理。可在右侧申请复核中补充依据；跨模块交接集成待确认。</p></li>
        <li><h4>怎样知道是否改善</h4><p>待验证指标：{suggestion.metric}。当前未返回整改完成记录与可比复测结果，改善情况待验证。</p>{href ? <a href={href}>查看进度报告 · 单题优化部分</a> : <p className="fm-ov-note">暂无可定位运行，采集后可进入进度报告中的单题优化部分。</p>}</li>
      </ol>
    </section><div>
      {suggestion.evidence.length > 1 && <label className="fm-ov-select-evidence">选择关联回答<select value={attempt?.id || ""} onChange={(event) => setAnswerId(event.target.value)}>{suggestion.evidence.map((item) => <option key={item.id} value={item.id}>{item.question} · {item.platformName} · {item.runId?.slice(0, 8)}</option>)}</select></label>}
      <OverviewEvidence key={`${suggestion.id}:${attempt?.id}`} attempt={attempt} context={context || undefined} check={suggestion.check} onAnswer={onAnswer} />
    </div></div>
    <section className="fm-ov-card"><header className="fm-ov-heading"><h3>行动草稿</h3><span className="fm-ov-tag pending">跨模块集成待确认</span></header><p className="fm-ov-note">先阅读上方依据，再决定是否准备草稿。草稿可在本页编辑和下载，尚未提交其他模块。</p>
      {draft === undefined ? <button type="button" className="fm-primary-button" disabled={!attempt} onClick={() => {
        if (!attempt) return;
        setDraft({ answerId: attempt.id, runId: attempt.runId, content: `${suggestion.title}\n关联问题：${attempt.question}\n待核查回答：${attempt.id}\n观测条件：${suggestion.check}\n建议动作：${suggestion.action}\n待补充资料与版本：\n审核意见：\n承接模块：${suggestion.destination}\n待验证指标：${suggestion.metric}` });
      }}>生成可编辑草稿</button> : <><label>可编辑草稿<textarea className="fm-ov-draft" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label><p className="fm-ov-note">草稿关联回答：{draft.answerId}。切换证据不会改变已生成草稿的回答定位。</p><button type="button" className="fm-primary-button" onClick={() => downloadHandoff("frontmind-optimization-draft.json", { kind: "optimization-draft", status: "integration_pending", submitted: false, suggestion: suggestion.id, answerId: draft.answerId, runId: draft.runId, content: draft.content, destination: suggestion.destination, preparedAt: new Date().toISOString() })}>下载草稿与待确认清单</button></>}
    </section>
  </div>;
}

export default function OverviewSuggestions({ suggestions, monitorId, query, onAnswer }: { suggestions: Suggestion[]; monitorId: string; query: MonitoringQueryState; onAnswer: (attempt: RunAttempt) => void }) {
  const [expanded, setExpanded] = useState<string>();
  const [requestedAction, setRequestedAction] = useState("");
  return <section className="fm-ov-section" aria-labelledby="overview-suggestions-title"><header className="fm-ov-heading"><h2 id="overview-suggestions-title">AI 优化建议</h2><span>先看依据，再决定行动</span></header><p className="fm-ov-note">建议由当前监控事实整理，资料缺口原因需进一步核查。优先级为核查顺序；服务未返回处理状态，以下均为待处理。</p>
    <div className="fm-ov-suggestions">{suggestions.map((suggestion) => <article key={suggestion.id} className="fm-ov-suggestion">
      <header><span className={`fm-ov-priority ${suggestion.priority}`}>{suggestion.priority}</span><h3>{suggestion.title}</h3><span className="fm-ov-tag">待处理</span></header><p>{suggestion.action}</p>
      <dl className="fm-ov-facts"><div><dt>关联问题</dt><dd>{[...new Set(suggestion.evidence.map((item) => item.question))].slice(0, 2).join("；") || "待采集证据"}{new Set(suggestion.evidence.map((item) => item.question)).size > 2 ? "等" : ""}</dd></div><div><dt>证据数量</dt><dd>{suggestion.evidence.length} 条待核查回答（已读取样本）</dd></div><div><dt>承接模块</dt><dd>{suggestion.destination}</dd></div><div><dt>待验证指标</dt><dd>{suggestion.metric}</dd></div></dl>
      <footer><button type="button" className="fm-text-button" aria-expanded={expanded === suggestion.id} onClick={() => { setExpanded(expanded === suggestion.id ? undefined : suggestion.id); setRequestedAction(""); }}>{expanded === suggestion.id ? "收起依据" : "查看依据"}</button><button type="button" className="fm-secondary-button" onClick={() => { setExpanded(suggestion.id); setRequestedAction(`${suggestion.id}:draft`); }}>生成可编辑草稿</button><button type="button" className="fm-secondary-button" onClick={() => { setExpanded(suggestion.id); setRequestedAction(`${suggestion.id}:review`); }}>申请复核</button></footer>
      {expanded === suggestion.id && <><p className="fm-ov-notice" role="status">{requestedAction.endsWith(":review") ? "请先核对证据，使用证据面板内“判断有误？申请复核”准备申请清单。" : requestedAction.endsWith(":draft") ? "请先阅读五步摘要，再使用下方“行动草稿”生成可编辑内容。" : "展开依据与原回答后，再决定下一步动作。"}</p><SuggestionDetail key={suggestion.id} suggestion={suggestion} monitorId={monitorId} query={query} onAnswer={onAnswer} /></>}
    </article>)}</div>
  </section>;
}
