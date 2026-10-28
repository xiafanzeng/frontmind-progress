import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function OverviewPagination({ page, total, size = 10, onChange, label, unit = "项", compact = false }: {
  page: number; total: number; size?: number; onChange: (page: number) => void; label: string; unit?: string; compact?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  const [jump, setJump] = useState(String(current));
  useEffect(() => { setJump(String(current)); }, [current]);
  const go = () => {
    if (!/^\d+$/.test(jump.trim())) { setJump(String(current)); return; }
    const next = Math.min(pages, Math.max(1, Number(jump)));
    setJump(String(next));
    if (next !== current) onChange(next);
  };
  const visible = [...new Set([1, current - 1, current, current + 1, pages])].filter(value => value >= 1 && value <= pages).sort((a, b) => a - b);
  const from = total ? (current - 1) * size + 1 : 0;
  return <nav className={`fm-ov-pagination${compact ? " compact" : ""}`} aria-label={label}>
    <span className="fm-ov-page-range">显示 {total ? `${from}–${Math.min(current * size, total)}` : "0"} / 共 {total} {unit}</span>
    <div className="fm-ov-page-controls">
      <button type="button" aria-label="上一页" title="上一页" disabled={current <= 1} onClick={() => onChange(current - 1)}><ChevronLeft size={16} /></button>
      {compact ? <span aria-live="polite">{current} / {pages}</span> : visible.map((value, index) => <span className="fm-ov-page-number" key={value}>
        {index > 0 && value - visible[index - 1]! > 1 && <span aria-hidden="true">…</span>}
        <button type="button" aria-label={`第 ${value} 页`} aria-current={value === current ? "page" : undefined} onClick={() => value !== current && onChange(value)}>{value}</button>
      </span>)}
      <button type="button" aria-label="下一页" title="下一页" disabled={current >= pages} onClick={() => onChange(current + 1)}><ChevronRight size={16} /></button>
      {pages > 1 && <label className="fm-ov-page-jump">跳至<input aria-label={`${label}跳转页码`} inputMode="numeric" value={jump} onChange={event => setJump(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); go(); }
      }} /><button type="button" onClick={go} aria-label={`${label}确认跳转`}>跳转</button></label>}
    </div>
  </nav>;
}
