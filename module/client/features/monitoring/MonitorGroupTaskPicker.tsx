import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { MonitorOrganization } from "../../../contracts/monitor-organization";
import { monitorStatusLabel, type MonitorSummary } from "../../domain";
import { taskGroup, UNGROUPED_GROUP_ID, executionModes, monitorExecutionMode, type ExecutionMode } from "./monitorGroups";

type Props = {
  groupId: string;
  organization: MonitorOrganization;
  monitors: MonitorSummary[];
  ready: boolean;
  busy: boolean;
  error: string;
  message: string;
  onRetry?: () => void;
  onBack: () => void;
  onAdd: (ids: string[]) => Promise<boolean>;
};

export default function MonitorGroupTaskPicker({ groupId, organization, monitors, ready, busy, error, message, onRetry, onBack, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | MonitorSummary["status"]>("all");
  const [execution, setExecution] = useState<ExecutionMode>("all");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  useEffect(() => { searchRef.current?.focus({ preventScroll: true }); }, []);
  const group = organization.groups.find(item => item.id === groupId);
  const available = monitors.filter(monitor => taskGroup(monitor, organization) === UNGROUPED_GROUP_ID);
  const visible = available.filter(monitor => monitor.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (status === "all" || monitor.status === status) && (execution === "all" || monitorExecutionMode(monitor) === execution));
  // Search filters the display, not the pending selection. Newly added or
  // removed members are reconciled against the latest directory before saving.
  const selected = available.filter(monitor => selection.has(monitor.id));
  const add = async () => {
    if (!ready || busy || submitting.current || !group || !selected.length) return;
    submitting.current = true;
    try { await onAdd(selected.map(monitor => monitor.id)); }
    finally { submitting.current = false; }
  };
  return <fieldset className="fm-config-group-manager fm-group-task-picker" disabled={busy} aria-busy={busy}>
    {error && <p className="fm-config-warning" role="alert">{error}</p>}
    {message && <p className="fm-config-warning" role="status">{message}{onRetry && <button type="button" className="fm-text-button" onClick={onRetry}>重试读取</button>}</p>}
    {!group && <p className="fm-config-warning" role="alert">原分组已被移除，请返回后重新选择分组。</p>}
    <div className="fm-group-member-filters">
      <label className="fm-group-search"><Search size={16} aria-hidden="true" /><input ref={searchRef} type="search" aria-label="搜索可添加的监控" placeholder="搜索监控名称" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select aria-label="筛选可添加监控的状态" value={status} onChange={event => setStatus(event.target.value as typeof status)}>{([["all", "全部状态"], ["active", "已启用"], ["paused", "已暂停"], ["draft", "待启动"]] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="筛选可添加监控的执行方式" value={execution} onChange={event => setExecution(event.target.value as ExecutionMode)}>{executionModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    <div className="fm-group-picker-summary"><span aria-live="polite">已选 {selected.length} 项 · 当前显示 {visible.length} 项</span>
      <button type="button" className="fm-text-button" disabled={!ready || !group || !visible.length} onClick={() => setSelection(previous => new Set([...previous, ...visible.map(monitor => monitor.id)]))}>全选当前结果</button>
      <button type="button" className="fm-text-button" disabled={!selected.length} onClick={() => setSelection(new Set())}>清空选择</button>
    </div>
    <div className="fm-group-member-list fm-group-picker-list" aria-label="可添加的监控任务">
      {visible.map(monitor => <label key={monitor.id}><input type="checkbox" disabled={!ready || !group} checked={selection.has(monitor.id)} onChange={() => setSelection(previous => { const next = new Set(previous); next.has(monitor.id) ? next.delete(monitor.id) : next.add(monitor.id); return next; })} /><span><strong>{monitor.name}</strong><small>{monitorStatusLabel(monitor.status)} · {monitor.questionsCount} 个问题 · {monitor.platformsCount} 个模型</small><small className="fm-group-current-membership">当前分组：未分组 · {executionModes.find(([value]) => value === monitorExecutionMode(monitor))?.[1]}</small></span></label>)}
      {!visible.length && <p className="fm-group-empty">{search.trim() || status !== "all" || execution !== "all" ? "没有匹配的监控，请调整筛选条件。" : "本项目暂无可添加的未分组任务。"}</p>}
    </div>
    <p className="fm-group-member-hint">仅显示未分组的已有任务，添加后不改变监控配置和执行计划。</p>
    <footer><button type="button" className="fm-secondary-button" onClick={onBack}>取消</button><button type="button" className="fm-primary-button" disabled={!ready || !group || !selected.length} onClick={add}>{busy ? "正在添加…" : `添加 ${selected.length} 项监控`}</button></footer>
  </fieldset>;
}
