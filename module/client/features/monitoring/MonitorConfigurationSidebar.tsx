import { taskGroup, visibleTaskGroups } from "./monitorGroups";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FolderCog, ListChecks, Plus, SlidersHorizontal, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@frontmind/module-ui/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@frontmind/module-ui/components/ui/tooltip";
import MonitorGroupManager from "./MonitorGroupManager";
import Modal from "../../components/Modal";
import { monitorStatusLabel, type MonitorSummary } from "../../domain";
import type { MonitorOrganization as Organization } from "../../../contracts/monitor-organization";
import { trpc } from "../../trpc";
import "./monitor-configuration.css";

type Cadence = "manual" | "daily" | "weekly" | "unknown";
type Filters = { status: "all" | MonitorSummary["status"]; cadence: "all" | Cadence; group: string };
type Action = { kind: "move" | "delete"; monitors: MonitorSummary[] };
const UNGROUPED = "ungrouped";
const ALL_FILTERS: Filters = { status: "all", cadence: "all", group: "all" };
const cadenceLabels: Record<Cadence, string> = { manual: "手动", daily: "每日", weekly: "每周", unknown: "周期未提供" };
const emptyOrganization = (): Organization => ({ version: 1, revision: 0, groups: [], membership: {} });

function cadenceOf(monitor: MonitorSummary): Cadence {
  if (monitor.scheduleType === "none") return "manual";
  if (monitor.scheduleType === "daily" || monitor.scheduleType === "weekly") return monitor.scheduleType;
  if (/手动|本次/u.test(monitor.scheduleLabel)) return "manual";
  if (/每日/u.test(monitor.scheduleLabel)) return "daily";
  if (/每周/u.test(monitor.scheduleLabel)) return "weekly";
  return "unknown";
}

type SidebarProps = {
  projectId: string;
  brandName: string;
  monitors: MonitorSummary[];
  selectedId?: string;
  deletedCount: number;
  serverData?: boolean;
  outcomeControls?: ReactNode;
  configurationTools?: ReactNode;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onOpenRecycle: () => void;
  onDeleteMonitor?: (id: string) => void | Promise<void>;
};

export default function MonitorConfigurationSidebar(props: SidebarProps) {
  return props.serverData ? <LiveSidebar {...props} /> : <PreviewSidebar {...props} />;
}

function LiveSidebar(props: SidebarProps) {
  const input = { projectId: props.projectId };
  const utils = trpc.useUtils();
  const query = trpc.projects.monitorOrganization.get.useQuery(input, { refetchOnWindowFocus: true });
  const mutation = trpc.projects.monitorOrganization.save.useMutation();
  const save = async (organization: Organization) => {
    await utils.projects.monitorOrganization.get.cancel(input);
    try {
      const saved = await mutation.mutateAsync({ ...input, organization });
      await utils.projects.monitorOrganization.get.cancel(input);
      utils.projects.monitorOrganization.get.setData(input, saved);
    } catch (error) {
      // A revision conflict or ambiguous network response must be reconciled before retry.
      await query.refetch();
      throw error;
    }
  };
  return <SidebarView {...props} organization={query.data ?? emptyOrganization()}
    organizationReady={Boolean(query.data) && !query.isError}
    organizationMessage={query.isError ? "分组读取失败，请重试；当前无法管理分组或移动配置。" : query.isPending ? "正在读取分组…" : ""}
    retryOrganization={() => { void query.refetch(); }} onSaveOrganization={save} />;
}

// Only the explicit non-server/demo entry uses transient state; never a live fallback.
function PreviewSidebar(props: SidebarProps) {
  const [organization, setOrganization] = useState<Organization>(emptyOrganization);
  return <SidebarView {...props} organization={organization} organizationReady
    organizationMessage="" onSaveOrganization={async (next) => setOrganization({ ...next, revision: next.revision + 1 })} />;
}

function SidebarView({
  monitors, selectedId, deletedCount, outcomeControls, configurationTools,
  onSelect, onAdd, onOpenRecycle, onDeleteMonitor, serverData, organization,
  organizationReady, organizationMessage, retryOrganization, onSaveOrganization,
}: SidebarProps & {
  organization: Organization;
  organizationReady: boolean;
  organizationMessage: string;
  retryOrganization?: () => void;
  onSaveOrganization: (next: Organization) => Promise<void>;
}) {
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const organizationBusyRef = useRef(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);
  const [paneCollapsed, setPaneCollapsed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<Action>();
  const [targetGroup, setTargetGroup] = useState(UNGROUPED);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState("");
  const batchButtonRef = useRef<HTMLButtonElement>(null);
  const exitBatchMode = () => {
    setBatchMode(false); setSelection(new Set());
    batchButtonRef.current?.focus();
  };
  useEffect(() => {
    if (!batchMode) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || managerOpen || action || filterOpen || busyRef.current || organizationBusyRef.current) return;
      // Let the topmost dialog/menu or native select handle its own Escape first.
      if (batchButtonRef.current?.closest('[inert]') || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') || event.target instanceof HTMLSelectElement) return;
      event.preventDefault(); event.stopPropagation();
      setBatchMode(false); setSelection(new Set()); batchButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [batchMode, managerOpen, action, filterOpen]);
  const controlId = useId();
  const groups = visibleTaskGroups(monitors, organization);
  const moveGroups = [{ id: UNGROUPED, name: "未分组" }, ...organization.groups];
  const groupOf = (id: string) => taskGroup(monitors.find(monitor => monitor.id === id), organization);
  const effectiveGroup = groups.some((group) => group.id === filters.group) ? filters.group : "all";
  const matching = monitors.filter((monitor) =>
    monitor.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (filters.status === "all" || monitor.status === filters.status) &&
    (filters.cadence === "all" || cadenceOf(monitor) === filters.cadence) &&
    (effectiveGroup === "all" || groupOf(monitor.id) === effectiveGroup),
  );
  // All selected rows are in the current matching result, even across collapsed groups.
  const selected = matching.filter((monitor) => selection.has(monitor.id));
  const activeFilterCount = Number(filters.status !== "all") + Number(filters.cadence !== "all") + Number(effectiveGroup !== "all");
  const hasConditions = Boolean(search.trim()) || activeFilterCount > 0;
  const groupCount = (id: string) => monitors.filter((monitor) => groupOf(monitor.id) === id).length;

  const saveOrganization = async (next: Organization) => {
    if (!organizationReady || organizationBusyRef.current) return false;
    organizationBusyRef.current = true; setOrganizationBusy(true); setGroupError("");
    try {
      await onSaveOrganization(next);
      setSelection(new Set());
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存分组失败，请重试。";
      setGroupError(message); setNotice(message);
      return false;
    } finally {
      organizationBusyRef.current = false; setOrganizationBusy(false);
    }
  };
  const resetConditions = () => {
    setSearch(""); setFilters(ALL_FILTERS); setSelection(new Set());
  };
  const toggleSelection = (id: string) => setSelection((previous) => {
    const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const openAction = (kind: Action["kind"]) => {
    if (!selected.length) return;
    setAction({ kind, monitors: selected }); setActionErrors({}); setTargetGroup(UNGROUPED); setNotice("");
  };
  const moveSelected = async () => {
    if (!action || action.kind !== "move" || !moveGroups.some((group) => group.id === targetGroup)) return;
    const membership = { ...organization.membership };
    for (const monitor of action.monitors) {
      if (targetGroup === UNGROUPED) delete membership[monitor.id];
      else membership[monitor.id] = targetGroup;
    }
    if (!await saveOrganization({ ...organization, membership })) return;
    setCollapsed((previous) => { const next = new Set(previous); next.delete(targetGroup); return next; });
    setNotice(`已将 ${action.monitors.length} 项配置移到“${moveGroups.find((group) => group.id === targetGroup)?.name}”。`);
    setAction(undefined); setSelection(new Set());
  };
  const deleteSelected = async () => {
    if (!action || action.kind !== "delete" || !onDeleteMonitor || busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionErrors({});
    const failures: MonitorSummary[] = [];
    const errors: Record<string, string> = {};
    let deleted = 0;
    try {
      for (const monitor of action.monitors) {
        try {
          await onDeleteMonitor(monitor.id);
          deleted += 1;
        } catch (error) {
          failures.push(monitor);
          errors[monitor.id] = error instanceof Error ? error.message : "删除失败，请稍后重试。";
        }
      }
      setSelection(new Set(failures.map((monitor) => monitor.id)));
      setAction(failures.length ? { kind: "delete", monitors: failures } : undefined);
      setActionErrors(errors);
      setNotice(failures.length ? `本次已删除 ${deleted} 项，${failures.length} 项失败；重试仅处理失败项。` : `已将 ${deleted} 项配置移入回收站。`);
    } finally {
      busyRef.current = false; setBusy(false);
    }
  };

  return <aside data-collapsed={paneCollapsed || undefined} className="resource-outcomes monitoring-results-panel fm-monitor-config-panel" data-resource-pane="outcomes" tabIndex={0} aria-label="监控任务列表">
    <div className="fm-config-context-row">
      {configurationTools && <div className="fm-config-project-context">{configurationTools}</div>}
      <button type="button" className="fm-config-collapse" aria-label={paneCollapsed ? "展开监控任务列表" : "折叠监控任务列表"} title={paneCollapsed ? "展开监控任务列表" : "折叠监控任务列表"} aria-expanded={!paneCollapsed} onClick={() => { setFilterOpen(false); setBatchMode(false); setSelection(new Set()); setPaneCollapsed(value => !value); }}>{paneCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
    </div>
    {outcomeControls}
    <header><h3>监控任务列表</h3></header>
    <label className="resource-outcomes-field"><input type="search" aria-label="搜索监控配置" placeholder="搜索监控名称" value={search} onChange={(event) => { setSearch(event.target.value); setSelection(new Set()); }} /></label>
    <div className="fm-monitor-config-tools" aria-label="监控配置工具">
      <div className="fm-config-tool-buttons">
        <Tooltip><TooltipTrigger asChild><button type="button" className="fm-config-create" aria-label="新建监控任务" onClick={onAdd}><Plus size={16} aria-hidden="true" />新建监控任务</button></TooltipTrigger><TooltipContent className="fm-config-tooltip" sideOffset={6}>新建监控任务</TooltipContent></Tooltip>
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><button type="button" aria-label={`筛选监控${activeFilterCount ? `，${activeFilterCount} 个条件` : ""}`} className={activeFilterCount ? "is-active" : ""}><SlidersHorizontal size={16} aria-hidden="true" />{activeFilterCount > 0 && <small>{activeFilterCount}</small>}</button></PopoverTrigger></TooltipTrigger><TooltipContent className="fm-config-tooltip" sideOffset={6}>筛选监控</TooltipContent></Tooltip>
          <PopoverContent className="fm-monitor-config-popover" align="start" sideOffset={8} collisionPadding={12} aria-label="筛选监控配置">
            <fieldset><legend>监控状态</legend><div className="fm-config-radio-options">{([["all", "全部"], ["active", "已启用"], ["paused", "已暂停"], ["draft", "待启动"]] as const).map(([value, label]) => <label key={value}><input type="radio" name={`${controlId}-status`} checked={filters.status === value} onChange={() => { setFilters({ ...filters, status: value }); setSelection(new Set()); }} />{label}</label>)}</div></fieldset>
            <fieldset><legend>执行方式</legend><div className="fm-config-radio-options">{([["all", "全部"], ["manual", "手动"], ["daily", "每日"], ["weekly", "每周"], ["unknown", "未提供"]] as const).map(([value, label]) => <label key={value}><input type="radio" name={`${controlId}-cadence`} checked={filters.cadence === value} onChange={() => { setFilters({ ...filters, cadence: value }); setSelection(new Set()); }} />{label}</label>)}</div></fieldset>
            <fieldset disabled={!organizationReady}><legend>所属分组</legend><div className="fm-config-radio-options is-vertical">{[{ id: "all", name: "全部分组" }, ...groups].map((group) => <label key={group.id}><input type="radio" name={`${controlId}-group-filter`} checked={filters.group === group.id} onChange={() => { setFilters({ ...filters, group: group.id }); setSelection(new Set()); }} />{group.name}</label>)}</div></fieldset>
            <footer><button type="button" onClick={() => { setFilters(ALL_FILTERS); setSelection(new Set()); }}>清除筛选</button><span>选择后立即生效</span></footer>
          </PopoverContent>
        </Popover>
        <Tooltip><TooltipTrigger asChild><button type="button" aria-label="管理分组" disabled={organizationBusy} onClick={() => { setManagerOpen(true); setGroupError(""); }}><FolderCog size={17} aria-hidden="true" /></button></TooltipTrigger><TooltipContent className="fm-config-tooltip" sideOffset={6}>管理分组</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button ref={batchButtonRef} type="button" aria-label={batchMode ? "退出批量管理" : "批量管理"} aria-pressed={batchMode} onClick={() => { setBatchMode(!batchMode); setSelection(new Set()); }}>{batchMode ? <X size={17} aria-hidden="true" /> : <ListChecks size={17} aria-hidden="true" />}</button></TooltipTrigger><TooltipContent className="fm-config-tooltip" sideOffset={6}>{batchMode ? "退出批量管理（Esc）" : "批量管理"}</TooltipContent></Tooltip>
      </div>
      {batchMode && <div className="fm-config-batch-bar" aria-label="批量操作">
        <strong role="status">已选 {selected.length} 项</strong>
        <button type="button" className="fm-config-batch-exit" onClick={exitBatchMode}>退出批量管理 <kbd>Esc</kbd></button>
        <button type="button" disabled={!matching.length} onClick={() => setSelection(new Set(matching.map((monitor) => monitor.id)))}>全选当前结果</button>
        <button type="button" disabled={!selected.length} onClick={() => setSelection(new Set())}>清空</button>
        <button type="button" disabled={!selected.length || !organizationReady || organizationBusy} onClick={() => openAction("move")}>移动到分组</button>
        <button type="button" className="fm-config-danger" disabled={!selected.length || !onDeleteMonitor} onClick={() => openAction("delete")}>删除</button>
        
      </div>}
      <div className="fm-monitor-config-summary"><span>{matching.length} / {monitors.length} 项监控</span>{hasConditions && <button type="button" className="fm-text-button" onClick={resetConditions}>清除条件</button>}</div>
      {hasConditions && <p className="fm-monitor-config-conditions">{[search.trim() && `搜索：${search.trim()}`, filters.status !== "all" && monitorStatusLabel(filters.status), filters.cadence !== "all" && cadenceLabels[filters.cadence], effectiveGroup !== "all" && groups.find((group) => group.id === effectiveGroup)?.name].filter(Boolean).join(" · ")}</p>}
      {selectedId && monitors.some((monitor) => monitor.id === selectedId) && !matching.some((monitor) => monitor.id === selectedId) && <p className="fm-monitor-config-conditions">当前查看的配置不在筛选结果中，右侧内容保留。</p>}
      {notice && <p className="fm-monitor-config-conditions" role="status">{notice}</p>}
      {organizationMessage && <p className="fm-config-warning" role="status">{organizationMessage}{retryOrganization && <button type="button" className="fm-text-button" onClick={retryOrganization}>重试读取</button>}</p>}
    </div>
    <div className="resource-result-list" aria-label="选择监控配置">
      {groups.map((group) => {
        const rows = matching.filter((monitor) => groupOf(monitor.id) === group.id);
        if (hasConditions && !rows.length) return null;
        return <section key={group.id} className="fm-monitor-config-group" aria-label={`${group.name}，${rows.length} 个配置`}>
          <h4><span>{!organizationReady ? "配置列表（分组待确认）" : group.name}（{hasConditions ? `${rows.length}/${groupCount(group.id)}` : rows.length}）</span><button type="button" aria-expanded={!collapsed.has(group.id)} onClick={() => setCollapsed((previous) => { const next = new Set(previous); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; })}>{collapsed.has(group.id) ? "展开" : "收起"}</button></h4>
          {!collapsed.has(group.id) && (rows.length ? rows.map((monitor) => <div key={monitor.id} className={`fm-config-item${selectedId === monitor.id ? " is-current" : ""}${selection.has(monitor.id) ? " is-selected" : ""}`}>
            {batchMode && <input type="checkbox" aria-label={`选择配置：${monitor.name}`} checked={selection.has(monitor.id)} onChange={() => toggleSelection(monitor.id)} />}
            <button type="button" aria-pressed={selectedId === monitor.id} onClick={() => onSelect(monitor.id)}>
              <strong>{monitor.name}<i className={`fm-config-status-dot ${monitor.status}`} aria-hidden="true" /></strong>
              <span>{monitor.mainBrand || "品牌待读取"}</span><span>{monitor.questionsCount} 个问题 · {monitor.platformsCount} 个模型</span>
              <span>{monitorStatusLabel(monitor.status)} · {monitor.scheduleLabel || cadenceLabels[cadenceOf(monitor)]}</span>
            </button>
          </div>) : <p className="fm-config-empty-group">{group.id === UNGROUPED ? "暂无未分组任务" : "暂无任务，可在管理分组中添加未分组任务"}</p>)}
        </section>;
      })}
      {!matching.length && hasConditions && <div className="fm-config-no-results"><p>没有匹配的监控配置</p><button type="button" onClick={resetConditions}>清除搜索和筛选</button></div>}
    </div>
    <footer>
      <button type="button" className="fm-text-button" onClick={onOpenRecycle}>回收站{deletedCount ? `（${deletedCount}）` : ""}</button>
    </footer>

    {managerOpen && <MonitorGroupManager organization={organization} monitors={monitors} ready={organizationReady} busy={organizationBusy} error={groupError} message={organizationMessage} serverData={serverData} onRetry={retryOrganization} onSave={saveOrganization} onClose={() => { if (!organizationBusyRef.current) setManagerOpen(false); }} />}
    <Modal open={Boolean(action)} onClose={() => { if (!busyRef.current && !organizationBusyRef.current) setAction(undefined); }} title={action?.kind === "move" ? `移动 ${action.monitors.length} 项配置` : `删除 ${action?.monitors.length || 0} 项配置`} description={action?.kind === "move" ? "仅改变分组归属，监控内容、执行计划和历史记录保持不变。" : "确认后移入回收站。删除后保留 30 天，历史运行与结果不会立即清除；恢复后自动计划保持暂停。"}>
      <fieldset className="fm-config-batch-dialog" disabled={busy || organizationBusy} aria-busy={busy || organizationBusy}>
        <ul>{action?.monitors.map((monitor) => <li key={monitor.id}><strong>{monitor.name}</strong>{actionErrors[monitor.id] && <p className="fm-config-warning">{actionErrors[monitor.id]}</p>}</li>)}</ul>
        {action?.kind === "move" && <fieldset><legend>移动到</legend>{moveGroups.map((group) => <label key={group.id}><input type="radio" name={`${controlId}-move`} checked={targetGroup === group.id} onChange={() => setTargetGroup(group.id)} />{group.name}<small>{groupCount(group.id)} 个配置</small></label>)}</fieldset>}
        {notice && <p role="status">{notice}</p>}
        {action?.kind === "move" && organizationMessage && <p className="fm-config-warning" role="status">{organizationMessage}{retryOrganization && <button type="button" className="fm-text-button" onClick={retryOrganization}>重试读取</button>}</p>}
        <footer><button type="button" className="fm-secondary-button" disabled={busy} onClick={() => setAction(undefined)}>取消</button><button type="button" className={action?.kind === "move" ? "fm-primary-button" : "danger-button"} disabled={busy || (action?.kind === "move" && !organizationReady)} onClick={() => action?.kind === "move" ? moveSelected() : void deleteSelected()}>{busy || organizationBusy ? "正在处理…" : action?.kind === "move" ? "确认移动" : Object.keys(actionErrors).length ? "重试失败项" : "移入回收站"}</button></footer>
      </fieldset>
    </Modal>
  </aside>;
}
