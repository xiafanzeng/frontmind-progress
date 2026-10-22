import { useState } from "react";
import type { RunAttempt } from "../../../domain";
import { formatDateTime } from "../../../domain";
import { MonitoringMarkdown } from "../MonitoringMarkdown";
import { safeExternalUrl } from "../selectors";
import { downloadHandoff } from "./overviewModel";

export default function OverviewEvidence({ attempt, check, context, onAnswer }: {
  attempt?: RunAttempt; check: string; context?: string; onAnswer: (attempt: RunAttempt) => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [materials, setMaterials] = useState<Array<{ name: string; url: string; linkedAt: string }>>([]);
  const [notice, setNotice] = useState("");
  const safeUrl = safeExternalUrl(materialUrl);
  const originalSources = attempt?.allSources || [];
  return <aside className="fm-ov-evidence" aria-label="回答证据与复核">
    <header className="fm-ov-heading"><h3>证据面板</h3><span className="fm-ov-tag pending">待核实</span></header>
    {!attempt ? <p className="fm-ov-note">尚无可定位的回答证据，不能确定资料缺失原因。补充采集结果后再核查。</p> : <>
      <p><strong>{attempt.question}</strong></p><p className="fm-ov-note">{attempt.platformName} · 采集批次 {attempt.runId || "未返回"} · {formatDateTime(attempt.capturedAt)}</p>
      <dl className="fm-ov-facts"><div><dt>检查项</dt><dd>{check}</dd></div><div><dt>规则版本</dt><dd>未返回 · 待核实</dd></div><div><dt>回答版本</dt><dd>{attempt.revision ? `V${attempt.revision}` : "未返回"}</dd></div><div><dt>自动初判</dt><dd>提及：{attempt.brandMentioned === undefined ? "未判定" : attempt.brandMentioned ? "是" : "否"}；情感：{({ positive: "正面", neutral: "中性", negative: "负面", unknown: "未判定" })[attempt.sentiment || "unknown"]}；排名：{attempt.mentionPosition ?? "未返回"}</dd></div></dl>
      <h4>命中片段 / 原句</h4>{context ? <><blockquote>{context}</blockquote>{!attempt.answer?.includes(context.trim()) && <p className="fm-ov-note">平台上下文未在原回答中精确定位，判定依据待人工核实。</p>}</> : <p className="fm-ov-note">未提供可定位片段，不能据此指定原因。</p>}
      <h4>原回答</h4><div className="fm-ov-answer">{attempt.answer ? <MonitoringMarkdown markdown={attempt.answer} attempt={attempt} className="fm-monitoring-markdown" /> : <p>未读取完整原回答，请进入问答明细。</p>}</div>
      <h4>关联资料</h4>{originalSources.length ? <ul>{originalSources.map((source) => {
        const url = safeExternalUrl(source.url);
        return <li key={source.id}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{source.title || source.domain || url}</a> : source.title || "未命名资料"}<small>日期 {source.publishedAt || "未返回"} · 版本未返回 · 核查状态待核实</small></li>;
      })}</ul> : <p className="fm-ov-note">无关联资料返回；这不能证明知识库没有相关内容。</p>}
      <button type="button" className="fm-text-button" onClick={() => onAnswer(attempt)}>进入问答明细</button>
      <button type="button" className="fm-secondary-button" onClick={() => setReviewOpen((value) => !value)}>判断有误？申请复核</button>
      {reviewOpen && <form className="fm-ov-review" onSubmit={(event) => {
        event.preventDefault();
        downloadHandoff("frontmind-review-request.json", {
          kind: "review-request-draft", status: "integration_pending", submitted: false,
          answerId: attempt.id, runId: attempt.runId, questionId: attempt.questionId, check,
          ruleVersion: null, answerRevision: attempt.revision ?? null, originalAnswer: attempt.answer,
          originalJudgment: { mentioned: attempt.brandMentioned, position: attempt.mentionPosition, sentiment: attempt.sentiment, keywordEvaluations: attempt.keywordEvaluations },
          context: context || null, reviewReason: reason, originalSources, supplementalMaterials: materials,
          preparedAt: new Date().toISOString(), revisedBasis: null, reviewedAt: null,
        });
        setNotice("已下载复核申请草稿，尚未提交。审批通过后的原判断、修订依据和时间需由复核服务保存。");
      }}>
        <p className="fm-ov-notice pending">复核服务集成待确认。此处准备携带回答和规则定位的申请清单，下载不会改变原判断。</p>
        <label>复核原因<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <fieldset><legend>补充依据 · 关联新资料（当前草稿）</legend><label>资料名称<input value={materialName} onChange={(event) => setMaterialName(event.target.value)} /></label><label>公开资料链接<input type="url" value={materialUrl} onChange={(event) => setMaterialUrl(event.target.value)} /></label>
          <button type="button" className="fm-secondary-button" disabled={!materialName.trim() || !safeUrl} onClick={() => { if (!safeUrl) return; setMaterials((items) => [...items, { name: materialName.trim(), url: safeUrl, linkedAt: new Date().toISOString() }]); setMaterialName(""); setMaterialUrl(""); }}>关联到本回答的草稿</button>
          {materials.map((material, index) => <p key={`${material.url}:${index}`}><a href={material.url} target="_blank" rel="noopener noreferrer">{material.name}</a><button type="button" className="fm-text-button" onClick={() => setMaterials((items) => items.filter((_, itemIndex) => itemIndex !== index))}>移除</button></p>)}
        </fieldset><button type="submit" className="fm-primary-button">下载复核申请草稿</button>
      </form>}
      {notice && <p role="status" className="fm-ov-note">{notice}</p>}
    </>}
  </aside>;
}
