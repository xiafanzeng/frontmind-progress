import { useEffect, useRef, useState } from "react";
import type { MonitorRun } from "../../../domain";
import { calculateEvidenceMetrics } from "../selectors";
import { metricText } from "./overviewModel";
import "./overview.css";

/** A real report anchor for the overview's single-question follow-up link. */
export default function QuestionOptimizationReport({ run }: { run: MonitorRun }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [answerId] = useState(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("optimizationAnswer"));
  const linked = run.attempts.find((attempt) => attempt.id === answerId);
  const [question, setQuestion] = useState(linked?.questionId || run.attempts[0]?.questionId || "");
  const questions = [...new Map(run.attempts.map((attempt) => [attempt.questionId, attempt.question])).entries()];
  const attempts = run.attempts.filter((attempt) => attempt.questionId === question);
  const metrics = calculateEvidenceMetrics(attempts);
  useEffect(() => {
    if (window.location.hash !== "#question-optimization") return;
    sectionRef.current?.scrollIntoView({ block: "start" });
    sectionRef.current?.focus({ preventScroll: true });
  }, [run.id]);
  return <section id="question-optimization" ref={sectionRef} tabIndex={-1} className="run-section content-card fm-overview-workspace" aria-labelledby="question-optimization-title">
    <header className="fm-ov-heading"><h2 id="question-optimization-title">单题优化部分</h2><span>当前运行的可核查基线</span></header>
    <label>监控问题<select value={question} onChange={(event) => setQuestion(event.target.value)}>{questions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {answerId && !linked && <p className="fm-ov-notice pending">链接中的回答不在当前运行结果内，请核对运行及问题；下方仅显示当前手动选择的问题。</p>}
    {attempts.length ? <><div className="fm-ov-metrics">{([
      ["effective", "有效回答"], ["mentionRate", "品牌提及率"], ["averagePosition", "平均排名"], ["top3Rate", "Top3 推荐率"],
    ] as const).map(([key, label]) => <article className="fm-ov-card" key={key}><span>{label}</span><strong className="fm-ov-metric-value">{metricText(key, metrics[key])}</strong></article>)}</div><p>该题 {attempts.length} 次采集尝试，{metrics.effective} 条有效回答。整改完成记录与可比复测结果尚未返回，改善情况待验证。</p><p className="fm-ov-note">确认资料、完成审核并记录优化时间后，需以相同问题、模型、时窗和采集次数复测，再比较有效回答聚合指标。当前结果不表示建议已执行或已改善。</p></> : <p className="fm-ov-note">尚无可定位的单题回答，等待采集结果。</p>}
  </section>;
}
