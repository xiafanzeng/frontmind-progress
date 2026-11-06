import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function OverviewPagination({ page, total, size = 10, onChange, label, unit = "项", source = false }: {
  page: number; total: number; size?: number; onChange: (page: number) => void; label: string; unit?: string; source?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  const [jump, setJump] = useState(String(current));
  useEffect(() => { setJump(String(current)); }, [current]);
  const go = () => {
    const requested = Number(jump.trim());
    if (!/^\d+$/.test(jump.trim()) || !Number.isSafeInteger(requested)) { setJump(String(current)); return; }
    const next = Math.min(pages, Math.max(1, requested));
    setJump(String(next));
    if (next !== current) onChange(next);
  };
  const from = total ? (current - 1) * size + 1 : 0;
  return <nav className={`fm-ov-pagination fm-ov-pagination-inline${source ? " fm-ov-source-pagination" : ""}`} aria-label={label}>
    <span className="fm-ov-page-range">{from}–{Math.min(current * size, total)} / {total} {unit}</span>
    <div className="fm-ov-page-controls">
      <button type="button" aria-label="上一页" title="上一页" disabled={current <= 1} onClick={() => onChange(current - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
      <span className="fm-ov-page-current" aria-live="polite" aria-label={`第 ${current} 页，共 ${pages} 页`}><b>{current}</b> / {pages}</span>
      <button type="button" aria-label="下一页" title="下一页" disabled={current >= pages} onClick={() => onChange(current + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
      {pages > 1 && <div className="fm-ov-page-jump">
        <input aria-label={`${label}跳转页码`} title={`输入 1–${pages} 页，回车跳转`} inputMode="numeric" value={jump} onChange={event => setJump(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); go(); }
        }} />
        <button type="button" onClick={go} aria-label={`${label}确认跳转`}>跳转</button>
      </div>}
    </div>
  </nav>;
}
