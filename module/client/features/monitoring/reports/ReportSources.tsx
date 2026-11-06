import { useState } from "react";
import type { RunAttempt } from "../../../domain";
import OverviewPagination from "../overview/OverviewPagination";
import { citationChanges } from "./reportInsights";

const stateLabels: Record<string, string> = { added: "新增观察到", retained: "持续出现", absent: "本次未再观察到", observed: "本次观察" };
export default function ReportSources({ before, after, comparable, onEvidence }: {
  before: RunAttempt[]; after: RunAttempt[]; comparable: boolean; onEvidence: (attempt: RunAttempt, side: "before" | "after") => void;
}) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [domain, setDomain] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { rows, canCompare, current } = citationChanges(before, after, comparable);
  const domains = [...new Set(rows.map(row => row.domain))].sort();
  const filtered = rows.filter(row => (!canCompare || filter === "all" || row.state === filter) && (!domain || row.domain === domain));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)));
  const entry = filtered.find(row => row.key === selected);
  return <section className="fm-pr-card" aria-label="引用资料变化">
    <header className="fm-pr-header"><h3>引用资料{canCompare ? "变化" : ""}</h3><span>{new Set([...current.values()].map(row => row.domain)).size} 个域名 · {current.size} 项内容</span></header>
    <div className="fm-pr-compare"><label>域名<select value={domain} onChange={event => { setDomain(event.target.value); setPage(1); setSelected(null); }}><option value="">全部域名</option>{domains.map(value => <option key={value}>{value}</option>)}</select></label>
      {canCompare && <label>出现情况<select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); setSelected(null); }}><option value="all">全部</option>{Object.entries(stateLabels).filter(([key]) => key !== "observed").map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
    </div>
    {!canCompare && <p className="fm-pr-note">仅展示本次已返回的明确引用。两个批次可比且引用记录均完整时，才判断新增、持续或未再出现。</p>}
    {filtered.length ? <><div className="fm-pr-table"><table><thead><tr><th>内容 / 域名</th><th>引用回答数{canCompare ? "（起点 → 本次）" : ""}</th><th>出现情况</th><th>回答证据</th></tr></thead><tbody>{filtered.slice((currentPage - 1) * 10, currentPage * 10).map(row => <tr key={row.key} className={selected === row.key ? "selected" : ""}>
      <th>{row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer">{row.title} ↗</a> : row.title}<small>{row.domain}</small></th>
      <td>{canCompare ? `${row.before.length} → ` : ""}{row.after.length}</td><td>{stateLabels[row.state]}</td><td><button type="button" aria-expanded={selected === row.key} onClick={() => setSelected(selected === row.key ? null : row.key)}>关联回答</button></td>
    </tr>)}</tbody></table></div><div className="fm-overview-workspace fm-pr-pager"><OverviewPagination label="报告引用资料分页" page={currentPage} total={filtered.length} size={10} onChange={value => { setPage(value); setSelected(null); }} /></div></> : <p className="fm-pr-empty">当前筛选没有已返回的明确引用资料。</p>}
    {entry && <div className="fm-pr-source-answers"><h4>{entry.title} · 关联回答</h4>{(["after", "before"] as const).filter(side => side === "after" || canCompare).map(side => entry[side].map(answer => <button type="button" key={`${side}:${answer.id}`} onClick={() => onEvidence(answer, side)}>{side === "after" ? "本次" : "起点"} · {answer.platformName} · {answer.question} · 第 {answer.repetition} 次 →</button>))}</div>}
    <p className="fm-pr-note">每项资料按回答去重。一条回答可引用多篇资料；未再观察到不等于资料下线，引用也不等于事实核验通过或由本方发布。</p>
  </section>;
}
