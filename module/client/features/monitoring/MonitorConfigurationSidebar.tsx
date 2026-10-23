import { useId, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@frontmind/module-ui/components/ui/popover";
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
const normalizeName = (value: string) => value.trim().replace(/\s+/gu, " ");

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
  brandName, monitors, selectedId, deletedCount, outcomeControls, configurationTools,
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
  const [draftFilters, setDraftFilters] = useState<Filters>(ALL_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [groupToDelete, setGroupToDelete] = useState<string>();
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
  const controlId = useId();
  const groups = [...organization.groups, { id: UNGROUPED, name: "未分组" }];
  const groupOf = (id: string) => organization.groups.some((group) => group.id === organization.membership[id]) ? organization.membership[id] : UNGROUPED;
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
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存分组失败，请重试。";
      setGroupError(message); setNotice(message);
      return false;
    } finally {
      organizationBusyRef.current = false; setOrganizationBusy(false);
    }
  };
  const validateName = (input: string, exceptId?: string) => {
    const name = normalizeName(input);
    if (!name) return "请输入分组名称。";
    if (name.length > 40) return "分组名称最多 40 个字符。";
    if (name === "未分组") return "“未分组”是系统默认分组，请使用其他名称。";
    if (organization.groups.some((group) => group.id !== exceptId && group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return "该分组名称已存在。";
    return "";
  };
  const addGroup = async () => {
    if (organization.groups.length >= 200) { setGroupError("每个项目最多支持 200 个分组。"); return; }
    const error = validateName(newName);
    if (error) { setGroupError(error); return; }
    if (!await saveOrganization({ ...organization, groups: [...organization.groups, { id: crypto.randomUUID(), name: normalizeName(newName) }] })) return;
    setNewName(""); setGroupError("");
    setNotice("分组已添加。可勾选配置后，使用“移动到分组”整理配置。");
  };
  const renameGroup = async () => {
    const error = validateName(editingName, editingId);
    if (error) { setGroupError(error); return; }
    if (!organization.groups.some((group) => group.id === editingId)) { setGroupError("分组已变化，请重新选择。"); return; }
    if (!await saveOrganization({ ...organization, groups: organization.groups.map((group) => group.id === editingId ? { ...group, name: normalizeName(editingName) } : group) })) return;
    setEditingId(undefined); setGroupError(""); setNotice("分组名称已更新。");
  };
  const deleteGroup = async (id: string) => {
    // Includes memberships of recycled monitors, so restoring cannot revive a deleted group.
    if (!await saveOrganization({ ...organization, groups: organization.groups.filter((group) => group.id !== id), membership: Object.fromEntries(Object.entries(organization.membership).filter(([, groupId]) => groupId !== id)) })) return;
    if (filters.group === id) setFilters({ ...filters, group: "all" });
    setSelection(new Set()); setGroupToDelete(undefined); setEditingId(undefined); setGroupError("");
    setNotice("分组已删除，组内配置已移到“未分组”；配置和历史记录未删除。");
  };
  const resetConditions = () => {
    setSearch(""); setFilters(ALL_FILTERS); setDraftFilters(ALL_FILTERS); setSelection(new Set());
  };
  const toggleSelection = (id: string) => setSelection((previous) => {
    const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const openAction = (kind: Action["kind"]) => {
    if (!selected.length) return;
    setAction({ kind, monitors: selected }); setActionErrors({}); setTargetGroup(UNGROUPED); setNotice("");
  };
  const moveSelected = async () => {
    if (!action || action.kind !== "move" || !groups.some((group) => group.id === targetGroup)) return;
    const membership = { ...organization.membership };
    for (const monitor of action.monitors) {
      if (targetGroup === UNGROUPED) delete membership[monitor.id];
      else membership[monitor.id] = targetGroup;
    }
    if (!await saveOrganization({ ...organization, membership })) return;
    setCollapsed((previous) => { const next = new Set(previous); next.delete(targetGroup); return next; });
    setNotice(`已将 ${action.monitors.length} 项配置移到“${groups.find((group) => group.id === targetGroup)?.name}”。`);
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

  return <aside className="resource-outcomes monitoring-results-panel fm-monitor-config-panel" data-resource-pane="outcomes" tabIndex={0} aria-label="监控配置">
    {outcomeControls}
    <header><div><span className="resource-outcomes-eyebrow">{brandName} / 监控中心</span><h3>监控配置</h3></div></header>
    <label className="resource-outcomes-field"><input type="search" aria-label="搜索监控配置" placeholder="搜索监控名称" value={search} onChange={(event) => { setSearch(event.target.value); setSelection(new Set()); }} /></label>
    <div className="fm-monitor-config-tools" aria-label="监控配置工具">
      <div className="fm-config-tool-buttons">
        <Popover open={filterOpen} onOpenChange={(open) => { if (open) setDraftFilters({ ...filters, group: effectiveGroup }); setFilterOpen(open); }}>
          <PopoverTrigger asChild><button type="button" className={activeFilterCount ? "is-active" : ""}>筛选{activeFilterCount > 0 && <small>{activeFilterCount}</small>}</button></PopoverTrigger>
          <PopoverContent className="fm-monitor-config-popover" align="start" sideOffset={8} collisionPadding={12} aria-label="筛选监控配置">
            <fieldset><legend>监控状态</legend><div className="fm-config-radio-options">{([["all", "全部"], ["active", "已启用"], ["paused", "已暂停"], ["draft", "待启动"]] as const).map(([value, label]) => <label key={value}><input type="radio" name={`${controlId}-status`} checked={draftFilters.status === value} onChange={() => setDraftFilters({ ...draftFilters, status: value })} />{label}</label>)}</div></fieldset>
            <fieldset><legend>监控周期</legend><div className="fm-config-radio-options">{([["all", "全部"], ["manual", "手动"], ["daily", "每日"], ["weekly", "每周"], ["unknown", "未提供"]] as const).map(([value, label]) => <label key={value}><input type="radio" name={`${controlId}-cadence`} checked={draftFilters.cadence === value} onChange={() => setDraftFilters({ ...draftFilters, cadence: value })} />{label}</label>)}</div></fieldset>
            <fieldset disabled={!organizationReady}><legend>所属分组</legend><div className="fm-config-radio-options is-vertical">{[{ id: "all", name: "全部分组" }, ...groups].map((group) => <label key={group.id}><input type="radio" name={`${controlId}-group-filter`} checked={draftFilters.group === group.id} onChange={() => setDraftFilters({ ...draftFilters, group: group.id })} />{group.name}</label>)}</div></fieldset>
            <footer><button type="button" onClick={() => setDraftFilters(ALL_FILTERS)}>重置为全部</button><button type="button" onClick={() => { setFilters(draftFilters); setSelection(new Set()); setFilterOpen(false); }}>完成</button></footer>
          </PopoverContent>
        </Popover>
        <button type="button" disabled={!organizationReady || organizationBusy} onClick={() => { setManagerOpen(true); setGroupError(""); setGroupToDelete(undefined); setEditingId(undefined); }}>分组</button>
        <button type="button" aria-pressed={batchMode} onClick={() => { setBatchMode(!batchMode); setSelection(new Set()); }}>{batchMode ? "退出批量" : "批量"}</button>
      </div>
      {batchMode && <div className="fm-config-batch-bar" aria-label="批量操作">
        <strong role="status">已选 {selected.length} 项</strong>
        <button type="button" disabled={!matching.length} onClick={() => setSelection(new Set(matching.map((monitor) => monitor.id)))}>全选当前结果</button>
        <button type="button" disabled={!selected.length} onClick={() => setSelection(new Set())}>清空</button>
        <button type="button" disabled={!selected.length || !organizationReady || organizationBusy} onClick={() => openAction("move")}>移动到分组</button>
        <button type="button" className="fm-config-danger" disabled={!selected.length || !onDeleteMonitor} onClick={() => openAction("delete")}>删除</button>
        <small>更改搜索或筛选条件后会清空选择。</small>
      </div>}
      <div className="fm-monitor-config-summary"><span>{matching.length} / {monitors.length} 个配置</span>{hasConditions && <button type="button" className="fm-text-button" onClick={resetConditions}>清除条件</button>}</div>
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
          <h4><span>{!organizationReady && group.id === UNGROUPED ? "配置列表（分组待确认）" : group.name}（{hasConditions ? `${rows.length}/${groupCount(group.id)}` : rows.length}）</span><button type="button" aria-expanded={!collapsed.has(group.id)} onClick={() => setCollapsed((previous) => { const next = new Set(previous); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; })}>{collapsed.has(group.id) ? "展开" : "收起"}</button></h4>
          {!collapsed.has(group.id) && (rows.length ? rows.map((monitor) => <div key={monitor.id} className={`fm-config-item${selectedId === monitor.id ? " is-current" : ""}${selection.has(monitor.id) ? " is-selected" : ""}`}>
            {batchMode && <input type="checkbox" aria-label={`选择配置：${monitor.name}`} checked={selection.has(monitor.id)} onChange={() => toggleSelection(monitor.id)} />}
            <button type="button" aria-pressed={selectedId === monitor.id} onClick={() => onSelect(monitor.id)}>
              <strong>{monitor.name}<i className={`fm-config-status-dot ${monitor.status}`} aria-hidden="true" /></strong>
              <span>{monitor.questionsCount} 个问题 · {monitor.platformsCount} 个模型</span>
              <span>{monitorStatusLabel(monitor.status)} · {monitor.scheduleLabel || cadenceLabels[cadenceOf(monitor)]}</span>
            </button>
          </div>) : <p className="fm-config-empty-group">暂无配置，可通过“批量 → 移动到分组”添加。</p>)}
        </section>;
      })}
      {!matching.length && hasConditions && <div className="fm-config-no-results"><p>没有匹配的监控配置</p><button type="button" onClick={resetConditions}>清除搜索和筛选</button></div>}
    </div>
    <footer>
      <button type="button" className="fm-secondary-button fm-config-add" onClick={onAdd}><Plus size={14} /> 新建监控配置</button>
      {configurationTools}
      <button type="button" className="fm-text-button" onClick={onOpenRecycle}>回收站{deletedCount ? `（${deletedCount}）` : ""}</button>
    </footer>

    <Modal open={managerOpen} onClose={() => { if (!organizationBusyRef.current) setManagerOpen(false); }} title="管理分组" description="新建、重命名、删除分组；删除分组后配置移到“未分组”。" size="large">
      <fieldset className="fm-config-group-manager" disabled={organizationBusy} aria-busy={organizationBusy}>
        <p className="fm-config-storage-note">{serverData ? "分组按当前项目保存，组内显示未删除的配置数量。" : "当前为预览，分组仅在本页面临时保存。"}</p>
        {groups.map((group) => <div className="fm-config-manager-row" key={group.id}>
          <div className="fm-config-manager-main">
            {editingId === group.id ? <input aria-label={`重命名分组：${group.name}`} value={editingName} maxLength={40} onChange={(event) => { setEditingName(event.target.value); setGroupError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); renameGroup(); } }} /> : <strong>{group.name}</strong>}
            <span>{groupCount(group.id)} 个配置</span>
            {group.id !== UNGROUPED && (editingId === group.id ? <><button type="button" disabled={!organizationReady} onClick={renameGroup}>保存</button><button type="button" onClick={() => { setEditingId(undefined); setGroupError(""); }}>取消</button></> : <><button type="button" onClick={() => { setEditingId(group.id); setEditingName(group.name); setGroupToDelete(undefined); setGroupError(""); }}>重命名</button><button type="button" className="fm-config-danger" onClick={() => { setGroupToDelete(group.id); setEditingId(undefined); setGroupError(""); }}>删除</button></>)}
          </div>
          {groupToDelete === group.id && <div className="fm-config-group-removal"><p>删除“{group.name}”？{groupCount(group.id)} 个配置将移到“未分组”，配置本身不会删除。</p><button type="button" onClick={() => setGroupToDelete(undefined)}>取消</button><button type="button" className="fm-config-danger" disabled={!organizationReady} onClick={() => deleteGroup(group.id)}>确认删除分组</button></div>}
        </div>)}
        <label className="fm-config-new-group">新分组名称<input value={newName} maxLength={40} placeholder="例如：验收项目、日常跟踪" onChange={(event) => { setNewName(event.target.value); setGroupError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addGroup(); } }} /></label>
        {groupError && <p className="fm-config-warning" role="alert">{groupError}</p>}
        {organizationMessage && <p className="fm-config-warning" role="status">{organizationMessage}{retryOrganization && <button type="button" className="fm-text-button" onClick={retryOrganization}>重试读取</button>}</p>}
        <footer><button type="button" className="fm-secondary-button" onClick={() => setManagerOpen(false)}>关闭</button><button type="button" className="fm-primary-button" disabled={!organizationReady} onClick={addGroup}>{organizationBusy ? "正在保存…" : "添加分组"}</button></footer>
      </fieldset>
    </Modal>
    <Modal open={Boolean(action)} onClose={() => { if (!busyRef.current && !organizationBusyRef.current) setAction(undefined); }} title={action?.kind === "move" ? `移动 ${action.monitors.length} 项配置` : `删除 ${action?.monitors.length || 0} 项配置`} description={action?.kind === "move" ? "仅改变分组归属，监控内容、执行计划和历史记录保持不变。" : "确认后移入回收站。删除后保留 30 天，历史运行与结果不会立即清除；恢复后自动计划保持暂停。"}>
      <fieldset className="fm-config-batch-dialog" disabled={busy || organizationBusy} aria-busy={busy || organizationBusy}>
        <ul>{action?.monitors.map((monitor) => <li key={monitor.id}><strong>{monitor.name}</strong>{actionErrors[monitor.id] && <p className="fm-config-warning">{actionErrors[monitor.id]}</p>}</li>)}</ul>
        {action?.kind === "move" && <fieldset><legend>移动到</legend>{groups.map((group) => <label key={group.id}><input type="radio" name={`${controlId}-move`} checked={targetGroup === group.id} onChange={() => setTargetGroup(group.id)} />{group.name}<small>{groupCount(group.id)} 个配置</small></label>)}</fieldset>}
        {notice && <p role="status">{notice}</p>}
        {action?.kind === "move" && organizationMessage && <p className="fm-config-warning" role="status">{organizationMessage}{retryOrganization && <button type="button" className="fm-text-button" onClick={retryOrganization}>重试读取</button>}</p>}
        <footer><button type="button" className="fm-secondary-button" disabled={busy} onClick={() => setAction(undefined)}>取消</button><button type="button" className={action?.kind === "move" ? "fm-primary-button" : "danger-button"} disabled={busy || (action?.kind === "move" && !organizationReady)} onClick={() => action?.kind === "move" ? moveSelected() : void deleteSelected()}>{busy || organizationBusy ? "正在处理…" : action?.kind === "move" ? "确认移动" : Object.keys(actionErrors).length ? "重试失败项" : "移入回收站"}</button></footer>
      </fieldset>
    </Modal>
  </aside>;
}
