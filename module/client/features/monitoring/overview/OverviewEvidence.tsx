import { useEffect, useRef, useState } from "react";
import type { RunAttempt } from "../../../domain";
import { formatDateTime } from "../../../domain";
import { MonitoringMarkdown } from "../MonitoringMarkdown";
import { safeExternalUrl } from "../selectors";
import { downloadHandoff } from "./overviewModel";
import { overviewDraftBasis, useBoundOverviewDraft, DraftVersionNotice } from "./useBoundOverviewDraft";

type ReviewDraft = { reason: string; materialName: string; materialUrl: string; materials: Array<{ name: string; url: string; linkedAt: string }> };
const emptyReview: ReviewDraft = { reason: "", materialName: "", materialUrl: "", materials: [] };

export default function OverviewEvidence({ attempt, check, draftCheck, context, onAnswer, draftNamespace }: {
  attempt?: RunAttempt; check: string; draftCheck?: string; context?: string; onAnswer: (attempt: RunAttempt) => void; draftNamespace: string;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  // The displayed check can become more precise without orphaning legacy drafts.
  const versioned = useBoundOverviewDraft<ReviewDraft>(`${draftNamespace}:review:${attempt?.id || "none"}:${draftCheck || check}`, emptyReview, overviewDraftBasis(attempt, check, context));
  const { value: draft, setValue: setDraft, persisted } = versioned;
  const { reason, materialName, materialUrl, materials } = draft;
  const [notice, setNotice] = useState("");
  const [fullAnswer, setFullAnswer] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (reviewOpen) reasonRef.current?.focus(); }, [reviewOpen]);
  const safeUrl = safeExternalUrl(materialUrl);
  const originalSources = attempt?.allSources || [];
  const provenance = attempt?.sentimentEvidence;
  const historicalBrand = attempt?.brandContext && !attempt.brandContext.matchesCurrent ? attempt.brandContext : undefined;
  const exactContext = context?.trim() || "";
  const offset = exactContext && attempt?.answer ? attempt.answer.indexOf(exactContext) : -1;
  return <aside className="fm-ov-evidence" aria-label="回答证据与复核">
    <header className="fm-ov-heading"><h3>证据面板</h3><span className="fm-ov-tag">{provenance ? "Moli 返回结果" : "待核实"}</span></header>
    {!attempt ? <p className="fm-ov-note">尚无可定位的回答证据，不能确定资料缺失原因。补充采集结果后再核查。</p> : <>
      <p><strong>{attempt.question}</strong></p><p className="fm-ov-note">{attempt.platformName} · {formatDateTime(attempt.capturedAt)}</p>
      {historicalBrand && <p className="fm-ov-notice pending">以下为历史品牌“{historicalBrand.targetBrand || "未配置"}”的原始判定，与当前品牌“{historicalBrand.currentBrand}”不同，不参与当前品牌指标。</p>}
      <dl className="fm-ov-facts"><div><dt>检查项</dt><dd>{check}</dd></div><div><dt>回答版本</dt><dd>{attempt.revision ? `V${attempt.revision}` : "未返回"}</dd></div>{provenance && <div><dt>目标品牌快照</dt><dd>{provenance.targetBrand} · 别名：{provenance.brandAliases.join("、") || "无"}</dd></div>}<div><dt>自动初判</dt><dd>提及：{attempt.brandMentioned === undefined ? "未判定" : attempt.brandMentioned ? "是" : "否"}；情感：<span className={`fm-ov-tone-label fm-ov-inline-tone ${attempt.sentiment || "unknown"}`}>{({ positive: "正面", neutral: "中性", negative: "负面", unknown: "标签缺失" })[attempt.sentiment || "unknown"]}</span>；排名：{attempt.mentionPosition ?? "未返回"}</dd></div></dl>
      <details className="fm-ov-run-details"><summary>版本标识与供应商判定说明</summary><dl className="fm-ov-facts"><div><dt>采集批次</dt><dd>{attempt.runId || "未返回"}</dd></div><div><dt>规则版本</dt><dd>未返回 · 待核实</dd></div>{provenance && <><div><dt>品牌版本 ID</dt><dd>{provenance.brandVersionId}</dd></div><div><dt>回答修订 ID</dt><dd>{provenance.revisionId}</dd></div><div><dt>供应商原始情感字段</dt><dd>{provenance.rawSentiment || "供应商未返回有效的原始情感标签"}</dd></div></>}</dl><p className="fm-ov-note">供应商未提供整体标签的推理过程、置信度或模型版本；返回语境用于溯源，不等同于完整判定理由。复核仅保存草稿。</p></details>
      <h4>命中片段 / 原句</h4>{context ? <><blockquote>{context}</blockquote>{!attempt.answer?.includes(context.trim()) && <p className="fm-ov-note">平台上下文未在原回答中精确定位，判定依据待人工核实。</p>}</> : <p className="fm-ov-note">未提供可定位片段，不能据此指定原因。</p>}
      {offset >= 0 && <details className="fm-ov-run-details" open><summary>原文精确定位</summary><pre className="fm-ov-exact-context">{attempt.answer!.slice(Math.max(0, offset - 160), offset)}<mark>{attempt.answer!.slice(offset, offset + exactContext.length)}</mark>{attempt.answer!.slice(offset + exactContext.length, offset + exactContext.length + 160)}</pre></details>}
      <div className="fm-ov-heading"><h4>原回答</h4><button type="button" className="fm-text-button" aria-expanded={fullAnswer} onClick={() => setFullAnswer(value => !value)}>{fullAnswer ? "收起全文" : "展开全文"}</button></div><div className={`fm-ov-answer${fullAnswer ? " expanded" : ""}`} tabIndex={fullAnswer ? undefined : 0} role="region" aria-label="原回答正文">{attempt.answer ? <MonitoringMarkdown markdown={attempt.answer} attempt={attempt} className="fm-monitoring-markdown" /> : <p>未读取完整原回答，请进入问答明细。</p>}</div>
      <details className="fm-ov-materials"><summary>关联资料（{originalSources.length}）</summary>{originalSources.length ? <ul>{originalSources.map((source) => {
        const url = safeExternalUrl(source.url);
        return <li key={source.id}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{source.title || source.domain || url}</a> : source.title || "未命名资料"}<small>日期 {source.publishedAt || "未返回"} · 版本未返回 · 核查状态待核实</small></li>;
      })}</ul> : <p className="fm-ov-note">无关联资料返回；这不能证明知识库没有相关内容。</p>}</details>
      <div className="fm-ov-evidence-actions"><button type="button" className="fm-secondary-button" aria-expanded={reviewOpen} onClick={() => setReviewOpen((value) => !value)}>{reviewOpen ? "收起复核草稿" : "判断有误？编辑复核草稿"}</button><button type="button" className="fm-text-button" onClick={() => onAnswer(attempt)}>进入问答明细 →</button></div>
      {!reviewOpen && (reason || materials.length || materialName || materialUrl) && <p className="fm-ov-note">此回答有未提交的复核草稿，展开可继续编辑。</p>}
      {reviewOpen && <form className="fm-ov-review" onSubmit={(event) => {
        event.preventDefault();
        if (versioned.stale || !versioned.basis) return;
        downloadHandoff("frontmind-review-request.json", {
          kind: "review-request-draft", status: "integration_pending", submitted: false,
          answerId: attempt.id, runId: attempt.runId, questionId: attempt.questionId, check,
          ruleVersion: null, answerRevision: versioned.basis.answerRevision, originalAnswer: versioned.basis.originalAnswer,
          originalJudgment: versioned.basis.originalJudgment, evidenceBasis: versioned.basis, previousDraftVersions: versioned.history,
          context: versioned.basis.context, reviewReason: reason, originalSources: versioned.basis.originalSources, supplementalMaterials: materials,
          preparedAt: new Date().toISOString(), revisedBasis: null, reviewedAt: null,
        });
        setNotice("已下载复核申请草稿，尚未提交。当前未接入审批或标签回写。");
      }}>
        <DraftVersionNotice stale={versioned.stale} stored={versioned.stored} onRebind={versioned.rebind} currentRevision={attempt.revision} />
        <fieldset disabled={versioned.stale} className="fm-ov-versioned-fields">
        <p className="fm-ov-note">尚未提交复核。下载仅保存申请草稿，不改变原判断。</p>
        <p className="fm-ov-note">{persisted ? "已暂存于当前浏览器标签页，刷新后可继续；关闭标签页前请下载。" : "编辑内容在当前页面会话保留；请下载后再关闭或刷新。"}</p>
        <label>复核原因<textarea ref={reasonRef} required value={reason} onChange={(event) => setDraft(value => ({ ...value, reason: event.target.value }))} /></label>
        <fieldset><legend>补充依据 · 关联新资料（当前草稿）</legend><label>资料名称<input value={materialName} onChange={(event) => setDraft(value => ({ ...value, materialName: event.target.value }))} /></label><label>公开资料链接<input type="url" value={materialUrl} onChange={(event) => setDraft(value => ({ ...value, materialUrl: event.target.value }))} /></label>
          <button type="button" className="fm-secondary-button" disabled={!materialName.trim() || !safeUrl} onClick={() => { if (!safeUrl) return; setDraft(value => ({ ...value, materials: [...value.materials, { name: materialName.trim(), url: safeUrl, linkedAt: new Date().toISOString() }], materialName: "", materialUrl: "" })); }}>关联到本回答的草稿</button>
          {materials.map((material, index) => <p key={`${material.url}:${index}`}><a href={material.url} target="_blank" rel="noopener noreferrer">{material.name}</a><button type="button" className="fm-text-button" onClick={() => setDraft(value => ({ ...value, materials: value.materials.filter((_, itemIndex) => itemIndex !== index) }))}>移除</button></p>)}
        </fieldset><button type="submit" className="fm-primary-button">下载复核申请草稿</button></fieldset>
      </form>}
      {notice && <p role="status" className="fm-ov-note">{notice}</p>}
    </>}
  </aside>;
}
