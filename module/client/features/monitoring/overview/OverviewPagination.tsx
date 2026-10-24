export default function OverviewPagination({ page, total, size = 10, onChange, label, unit = "项", compact = false }: {
  page: number; total: number; size?: number; onChange: (page: number) => void; label: string; unit?: string; compact?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (page - 1) * size + 1 : 0;
  const to = Math.min(page * size, total);
  return <nav className={`fm-ov-pagination${compact ? " compact" : ""}`} aria-label={label}>
    <span className="fm-ov-page-range">显示 {total ? `${from}–${to}` : "0"} / 共 {total} {unit}{pages === 1 ? " · 1/1 页" : ""}</span>
    {pages > 1 && <div className="fm-ov-page-controls">
    <button type="button" className="fm-secondary-button" aria-label="上一页" title="上一页" disabled={page <= 1} onClick={() => onChange(page - 1)}>{compact ? "‹" : "上一页"}</button>
    <label>页码<select value={page} onChange={event => onChange(Number(event.target.value))}>
      {Array.from({ length: pages }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
    </select><span>/ {pages}</span></label>
    <button type="button" className="fm-secondary-button" aria-label="下一页" title="下一页" disabled={page >= pages} onClick={() => onChange(page + 1)}>{compact ? "›" : "下一页"}</button>
    </div>}
  </nav>;
}
