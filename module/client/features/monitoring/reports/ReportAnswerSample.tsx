import type { MonitorRun, RunAttempt } from "../../../domain";
import ModelBrandIcon from "../../../components/ModelBrandIcon";
import { MonitoringMarkdown } from "../MonitoringMarkdown";
import { reportPlatformLabel } from "./questionReportModel";
import { actualRank, answerHighlights, sentimentLabel } from "./reportPresentation";

export default function ReportAnswerSample({ side, attempts, selectedId, onSelect, onEvidence, run, date, highlight }: {
  side: "before" | "after"; attempts: RunAttempt[]; selectedId?: string; onSelect: (id: string) => void;
  onEvidence: (attempt: RunAttempt, side: "before" | "after") => void; run?: MonitorRun; date: (run?: MonitorRun) => string; highlight: boolean;
}) {
  const answer = attempts.find(item => item.id === selectedId) || attempts[0];
  const rank = answer ? actualRank(answer) : undefined;
  return <article className={`fm-qpr-answer-card is-${side}`}>
    <header><div><small>{side === "before" ? "优化前" : "优化后"}</small><h4>{side === "before" ? "基准回答" : "复测回答"}</h4></div>{answer && <button type="button" onClick={() => onEvidence(answer, side)}>查看完整证据</button>}</header>
    {answer ? <>
      <div className="fm-qpr-answer-model"><ModelBrandIcon code={answer.platformCode} name={answer.platformName} /><div><b>{reportPlatformLabel(answer)}</b><small>{date(run)}</small></div></div>
      <label className="fm-qpr-repetition">回答记录<select aria-label={`${side === "before" ? "优化前" : "优化后"}回答记录`} value={answer.id} onChange={event => onSelect(event.target.value)}>{attempts.map(item => <option key={item.id} value={item.id}>第 {item.repetition} 次 · {item.id.slice(0, 8)}</option>)}</select></label>
      <p className="fm-qpr-snapshot-question">{answer.question}</p>
      <div className="fm-pr-answer"><MonitoringMarkdown attempt={answer} markdown={answer.answer} highlights={highlight ? answerHighlights(answer, run) : undefined} /></div>
      <div className="fm-qpr-answer-tags"><span>品牌提及：{answer.brandMentioned === undefined ? "未判定" : answer.brandMentioned ? "是" : "否"}</span><span>品牌排名：{rank === undefined ? "未知" : `第 ${rank} 名`}</span><span>整体情感：{sentimentLabel[answer.sentiment || "unknown"]}</span></div>
      <small className="fm-qpr-answer-id">回答 ID：{answer.id} · 版本 {answer.revision ?? "未知"}</small>
    </> : <p className="fm-pr-empty">该批次、问题与平台下暂无有效回答。</p>}
  </article>;
}
