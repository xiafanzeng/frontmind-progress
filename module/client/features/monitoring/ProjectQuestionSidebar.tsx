import Modal from "../../components/Modal";
import { useEffect, useId, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Search, SlidersHorizontal, ListChecks, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@frontmind/module-ui/components/ui/popover";
import { KEYWORD_CATEGORY_OPTIONS } from "@frontmind/module-ui/keyword-categories";
import { questionKey, type ProjectQuestion } from "./useProjectQuestions";
import "./monitor-configuration.css";

export const questionCategoryLabel = (category?: string | null) => KEYWORD_CATEGORY_OPTIONS.find(item => item.key === category)?.label.replace(/词$/, "问题") || "待分类";
export default function ProjectQuestionSidebar({ questions, selectedKey, loading, error, onRetry, onSelect, onAdd, onOpenRecycle, deletedCount, onDeleteMonitor }: {
  questions: ProjectQuestion[]; selectedKey?: string; loading: boolean; error?: string;
  onOpenRecycle: () => void; deletedCount: number; onDeleteMonitor?: (id: string) => void | Promise<void>;
  onRetry: () => void; onSelect: (question: ProjectQuestion) => void; onAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [cadence, setCadence] = useState("all");
  const [category, setCategory] = useState("");
  const [enabled, setEnabled] = useState("all");
  const [batch, setBatch] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const chosen = questions.filter(question => selection.has(questionKey(question)));
  const needsMigration = chosen.some(question => question.monitor.questionsCount > 1);
  const toggle = (key: string) => setSelection(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const clearFilters = () => { setSearch(""); setCadence("all"); setCategory(""); setEnabled("all"); };
  useEffect(() => {
    const keys = new Set(questions.map(questionKey));
    setSelection(previous => new Set([...previous].filter(key => keys.has(key))));
  }, [questions]);
  const deleteSelected = async () => {
    if (!onDeleteMonitor || !chosen.length || needsMigration || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      // Only independently backed questions can be deleted. Never delete a shared old configuration.
      for (const question of chosen) {
        await onDeleteMonitor(question.monitorId);
        setSelection(previous => { const next = new Set(previous); next.delete(questionKey(question)); return next; });
      }
      setConfirming(false); setBatch(false);
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "删除未完成，请重试尚未删除的问题。"); }
    finally { setDeleting(false); }
  };
  const [collapsed, setCollapsed] = useState(false);
  const id = useId();
  const count = Number(cadence !== "all") + Number(Boolean(category)) + Number(enabled !== "all");
  const matching = questions.filter(question => question.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (!category || question.category === category) && (enabled === "all" || (question.monitor.status === "active") === (enabled === "enabled")) && (cadence === "all" || (cadence === "manual" ? question.monitor.scheduleType === "none" : cadence === "auto" ? ["daily", "weekly"].includes(question.monitor.scheduleType || "") : question.monitor.scheduleType === cadence)));
  return <aside className="resource-outcomes monitoring-results-panel fm-monitor-config-panel fm-question-sidebar" data-resource-pane="outcomes" data-collapsed={collapsed || undefined} aria-label="监控问题列表">
    <header className="fm-config-list-heading"><h3>监控问题列表</h3><button type="button" className="fm-config-create" onClick={onAdd} aria-label="添加监控问题"><Plus size={15} />添加</button><button type="button" className="fm-config-collapse" aria-label={collapsed ? "展开监控问题列表" : "折叠监控问题列表"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></header>
    <div className="fm-question-tools"><label className="fm-config-search"><Search size={15} /><input type="search" placeholder="搜索问题" aria-label="搜索监控问题" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <Popover><PopoverTrigger asChild><button type="button" className={`fm-icon-button ${count ? "is-active" : ""}`} aria-label="筛选监控问题"><SlidersHorizontal size={16} />{count > 0 && <sup>{count}</sup>}</button></PopoverTrigger><PopoverContent className="fm-monitor-config-popover fm-question-filter-popover" align="start" sideOffset={8} collisionPadding={12}>
        <fieldset><legend>开启状态</legend><div className="fm-config-radio-options">{[["all", "全部"], ["enabled", "开启"], ["disabled", "未开启"]].map(([value, label]) => <label key={value}><input type="radio" name={`${id}-enabled`} checked={enabled === value} onChange={() => setEnabled(value)} />{label}</label>)}</div></fieldset>
        <fieldset><legend>执行方式</legend><div className="fm-config-radio-options">{[["all", "全部"], ["manual", "手动"], ["auto", "自动"], ["daily", "每日自动"], ["weekly", "每周自动"]].map(([value, label]) => <label key={value}><input type="radio" name={`${id}-cadence`} checked={cadence === value} onChange={() => setCadence(value)} />{label}</label>)}</div></fieldset>
        <fieldset><legend>问题类别</legend><div className="fm-config-radio-options is-vertical">{[{ key: "", label: "全部类别" }, ...KEYWORD_CATEGORY_OPTIONS].map(item => <label key={item.key}><input type="radio" name={`${id}-category`} checked={category === item.key} onChange={() => setCategory(item.key)} />{item.label.replace(/词$/, "问题")}</label>)}</div></fieldset>
        <footer><button type="button" onClick={() => { setCategory(""); setCadence("all"); setEnabled("all"); }}>清除筛选</button></footer>
      </PopoverContent></Popover>
      <button type="button" className="fm-icon-button" aria-label={batch ? "退出批量选择" : "批量选择"} aria-pressed={batch} onClick={() => { setBatch(!batch); setSelection(new Set()); }}>{batch ? <X size={16} /> : <ListChecks size={16} />}</button>
    </div>
    {batch && <div className="fm-question-batch-bar"><label><input type="checkbox" aria-label="全选筛选结果" checked={matching.length > 0 && matching.every(q => selection.has(questionKey(q)))} disabled={!matching.length || deleting} onChange={event => setSelection(previous => { const next = new Set(previous); matching.forEach(q => event.target.checked ? next.add(questionKey(q)) : next.delete(questionKey(q))); return next; })} />全选</label><span>已选 {chosen.length}</span><button type="button" disabled={!chosen.length || !onDeleteMonitor} onClick={() => { setDeleteError(""); setConfirming(true); }}><Trash2 size={13} />删除</button></div>}
    <div className="fm-question-list-count"><span>{matching.length} 个问题</span>{(count > 0 || search) && <button type="button" className="fm-text-button" onClick={clearFilters}>清除条件</button>}</div>
    {loading && <p className="fm-qa-notice" role="status">正在读取问题…</p>}
    {error && <p className="fm-qa-notice" role="alert">{error}<button type="button" onClick={onRetry}>重试</button></p>}
    <div className="resource-result-list fm-project-question-list" role="region" tabIndex={0} aria-label="选择监控问题">{matching.map(question => <div key={questionKey(question)} className={`fm-question-row${batch ? " is-batch" : ""}`}>
      {batch && <input type="checkbox" aria-label={`选择问题：${question.label}`} checked={selection.has(questionKey(question))} disabled={deleting} onChange={() => toggle(questionKey(question))} />}
      <button type="button" className="fm-project-question" aria-pressed={selectedKey === questionKey(question)} onClick={() => onSelect(question)}>
        <strong title={question.label}>{question.label}</strong><span className="fm-project-question-meta"><span>{questionCategoryLabel(question.category)}</span><span>{question.monitor.scheduleType === "none" ? "手动" : question.monitor.scheduleType === "weekly" ? "每周自动" : question.monitor.scheduleType === "daily" ? "每日自动" : "待设置"}</span></span><span className={`fm-question-enabled ${question.monitor.status === "active" ? "is-enabled" : ""}`}>{question.monitor.status === "active" ? "开启" : "未开启"}</span>
      </button>
    </div>)}{!matching.length && !loading && <div className="fm-config-no-results"><p>{questions.length ? "没有符合条件的问题" : "还没有监控问题"}</p><button type="button" onClick={questions.length ? clearFilters : onAdd}>{questions.length ? "清除搜索和筛选" : "添加第一个问题"}</button></div>}</div>
    <footer className="fm-question-sidebar-footer"><button type="button" onClick={onOpenRecycle}><Trash2 size={14} />回收站{deletedCount ? `（${deletedCount}）` : ""}</button></footer>
    <Modal open={confirming} onClose={() => { if (!deleting) setConfirming(false); }} title="批量删除问题" description="移入回收站后保留 30 天，可恢复。">
      <p>将删除所选的 {chosen.length} 个问题。</p><ul className="fm-question-delete-list">{chosen.map(q => <li key={questionKey(q)}>{q.label}</li>)}</ul>
      {needsMigration && <p className="form-error" role="alert">所选问题中有旧配置共用的问题，需要先完成逐题迁移才能独立删除，避免同时删除其他问题。</p>}
      {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
      <footer className="run-confirmation-footer"><button type="button" className="ghost-button" disabled={deleting} onClick={() => setConfirming(false)}>取消</button><button type="button" className="danger-button" disabled={deleting || needsMigration || !chosen.length || !onDeleteMonitor} onClick={() => void deleteSelected()}>{deleting ? "正在删除…" : "移入回收站"}</button></footer>
    </Modal>
  </aside>;
}
