import { ChevronDown } from "lucide-react";
import type { RunAttempt } from "../../../domain";
import { reportGaps, type GapKind } from "./reportInsights";
export default function ReportGaps({ attempts, onOpen }: { attempts: RunAttempt[]; onOpen: (kind: GapKind) => void }) {
  const gaps = reportGaps(attempts);
  if (!gaps.length) return null;
  return <details className="fm-pr-integrity" aria-label="数据完整性" key={attempts.map(item => item.id).join(":")}>
    <summary><strong>数据完整性</strong><span>{gaps.length} 类缺失或异常 · 查看对应回答</span><ChevronDown size={18} aria-hidden="true" /></summary>
    <div className="fm-pr-integrity-content"><div className="fm-pr-gap-list">{gaps.map(gap => <article key={gap.key}><div><h4>{gap.label} <span>{gap.attempts.length} 条</span></h4><p>{gap.reason}</p></div><button type="button" onClick={() => onOpen(gap.key)}>查看回答 →</button></article>)}</div>
    <small>同一回答可能存在多项缺口，数量不直接相加。</small></div>
  </details>;
}
