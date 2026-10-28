import { taskGroup, visibleTaskGroups, UNGROUPED_GROUP_ID, executionModes, monitorExecutionMode, type ExecutionMode } from "./monitorGroups";
import { useEffect, useId, useRef, useState } from "react";
import { Folder, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@frontmind/module-ui/components/ui/popover";
import Modal from "../../components/Modal";
import MonitorGroupTaskPicker from "./MonitorGroupTaskPicker";
import { monitorStatusLabel, type MonitorSummary } from "../../domain";
import type { MonitorOrganization } from "../../../contracts/monitor-organization";

type Props = {
  organization: MonitorOrganization; monitors: MonitorSummary[]; ready: boolean; busy: boolean;
  error: string; message: string; serverData?: boolean; onRetry?: () => void; onClose: () => void;
  onSave: (next: MonitorOrganization) => Promise<boolean>;
};
const normalizeName = (value: string) => value.trim().replace(/\s+/gu, " ");

export default function MonitorGroupManager({ organization, monitors, ready, busy, error, message, serverData, onRetry, onClose, onSave }: Props) {
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(UNGROUPED_GROUP_ID);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberStatus, setMemberStatus] = useState<"all" | MonitorSummary["status"]>("all");
  const [execution, setExecution] = useState<ExecutionMode>("all");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [assignment, setAssignment] = useState("");
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const [pickerGroupId, setPickerGroupId] = useState<string>();
  const pickerSaving = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const createNameId = useId();
  const groups = visibleTaskGroups(monitors, organization);
  const current = groups.find(group => group.id === selectedGroup) ?? groups[0]!;
  const currentUnavailable = current.id !== selectedGroup;
  const ungrouped = current.id === UNGROUPED_GROUP_ID;
  const groupOf = (monitor: MonitorSummary) => taskGroup(monitor, organization);
  const members = monitors.filter(monitor => groupOf(monitor) === current.id);
  const visibleMembers = members.filter(monitor => monitor.name.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase()) && (memberStatus === "all" || monitor.status === memberStatus) && (execution === "all" || monitorExecutionMode(monitor) === execution));
  const selected = visibleMembers.filter(monitor => selection.has(monitor.id));
  const visibleGroups = groups.filter(group => group.name.toLocaleLowerCase().includes(groupSearch.trim().toLocaleLowerCase()));
  useEffect(() => {
    setSelection(new Set()); setRenaming(false); setConfirmDelete(false); setPickerGroupId(undefined); setAssignment("");
  }, [current.id]);
  const selectGroup = (id: string) => {
    setSelectedGroup(id); setSelection(new Set()); setMemberSearch(""); setMemberStatus("all"); setExecution("all");
    setRenaming(false); setConfirmDelete(false); setValidation(""); setNotice(""); setPickerGroupId(undefined);
  };
  const validateName = (input: string, exceptId?: string) => {
    const name = normalizeName(input);
    if (!name) return "请输入分组名称。";
    if (name.length > 40) return "分组名称最多 40 个字符。";
    if (name === "未分组") return "“未分组”是保留名称，请使用其他名称。";
    if (organization.groups.some(group => group.id !== exceptId && group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return "该分组名称已存在。";
    return "";
  };
  const addGroup = async () => {
    if (!ready || busy) return;
    if (organization.groups.length >= 200) { setCreateError("每个项目最多支持 200 个分组。"); return; }
    const problem = validateName(newName); if (problem) { setCreateError(problem); return; }
    const group = { id: crypto.randomUUID(), name: normalizeName(newName) };
    if (!await onSave({ ...organization, groups: [...organization.groups, group] })) return;
    setCreateOpen(false); setNewName(""); setGroupSearch(""); selectGroup(group.id);
    setNotice(`已创建“${group.name}”，可点击右上方“添加监控”选择未分组任务。`);
  };
  const rename = async () => {
    if (!ready || busy || currentUnavailable || ungrouped) return;
    const problem = validateName(editingName, current.id); if (problem) { setValidation(problem); return; }
    if (!await onSave({ ...organization, groups: organization.groups.map(group => group.id === current.id ? { ...group, name: normalizeName(editingName) } : group) })) return;
    setRenaming(false); setValidation(""); setGroupSearch(""); setNotice("分组名称已更新。");
  };
  const removeGroup = async () => {
    if (!ready || busy || currentUnavailable || ungrouped) return;
    if (!await onSave({ ...organization, groups: organization.groups.filter(group => group.id !== current.id), membership: Object.fromEntries(Object.entries(organization.membership).filter(([, id]) => id !== current.id)) })) return;
    selectGroup(UNGROUPED_GROUP_ID); setGroupSearch(""); setNotice("分组已删除，原成员已回到未分组，监控任务及历史记录保留。");
  };
  const changeMembership = async (ids: string[], destination: string | null) => {
    if (!ready || busy || currentUnavailable || confirmDelete || renaming) return false;
    if (ungrouped ? !destination || !organization.groups.some(group => group.id === destination) : destination !== null) return false;
    const rows = members.filter(monitor => ids.includes(monitor.id)); if (!rows.length) return false;
    const membership = { ...organization.membership };
    for (const monitor of rows) { if (destination) membership[monitor.id] = destination; else delete membership[monitor.id]; }
    if (!await onSave({ ...organization, membership })) return false;
    setSelection(new Set()); setNotice(destination ? `已将 ${rows.length} 项监控分配至“${organization.groups.find(group => group.id === destination)?.name}”。` : `已将 ${rows.length} 项监控移出本组，现位于未分组。`);
    return true;
  };
  const closePicker = () => { if (!busy && !pickerSaving.current) setPickerGroupId(undefined); };
  const addMembers = async (ids: string[]) => {
    if (!ready || busy || pickerSaving.current || !pickerGroupId || pickerGroupId !== current.id || !organization.groups.some(group => group.id === pickerGroupId)) return false;
    const rows = monitors.filter(monitor => ids.includes(monitor.id) && groupOf(monitor) === UNGROUPED_GROUP_ID);
    if (!rows.length) return false;
    const membership = { ...organization.membership }; for (const monitor of rows) membership[monitor.id] = pickerGroupId;
    pickerSaving.current = true;
    try {
      if (!await onSave({ ...organization, membership })) return false;
      setMemberSearch(""); setMemberStatus("all"); setExecution("all"); setSelection(new Set()); setPickerGroupId(undefined);
      setNotice(`已将 ${rows.length} 项未分组监控添加到“${current.name}”。`); return true;
    } finally { pickerSaving.current = false; }
  };
  const locked = !ready || busy || currentUnavailable || confirmDelete || renaming;
  const pickerGroup = organization.groups.find(group => group.id === pickerGroupId);

  return <Modal open onClose={() => { if (!busy && !pickerGroupId && !createOpen) onClose(); }} title="管理分组" description="将已有监控整理到自定义分组；执行方式单独筛选。" size="large">
    <fieldset className="fm-config-group-manager" disabled={busy} aria-busy={busy}>
      {!serverData && <p className="fm-config-storage-note">示例分组仅在本页面暂存。</p>}
      {(validation || error) && <p className="fm-config-warning" role="alert">{validation || error}</p>}
      {message && <p className="fm-config-warning" role="status">{message}{onRetry && <button type="button" className="fm-text-button" onClick={onRetry}>重试读取</button>}</p>}
      {notice && <p className="fm-group-notice" role="status">{notice}</p>}
      {currentUnavailable && <p className="fm-config-warning" role="status">原分组已被移除，请从左侧重新选择分组。</p>}
      <div className="fm-group-manager-layout">
        <section className="fm-group-directory" aria-label="分组列表">
          <div className="fm-group-directory-tools">
            <label className="fm-group-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="搜索分组" placeholder="搜索分组" value={groupSearch} onChange={event => setGroupSearch(event.target.value)} /></label>
            <Popover open={createOpen} modal onOpenChange={next => { if (!busy) { setCreateOpen(next); setNewName(""); setCreateError(""); } }}>
              <PopoverTrigger asChild><button type="button" className="fm-group-create-trigger" aria-label="创建分组" title="创建分组" disabled={!ready}><Plus size={18} aria-hidden="true" /></button></PopoverTrigger>
              <PopoverContent className="fm-group-create-popover" align="start" sideOffset={8} onOpenAutoFocus={event => { event.preventDefault(); createInputRef.current?.focus(); }}>
                <form onSubmit={event => { event.preventDefault(); void addGroup(); }}><fieldset disabled={busy}>
                  <label htmlFor={createNameId}>新建分组</label><input ref={createInputRef} id={createNameId} maxLength={40} placeholder="输入分组名称" value={newName} onChange={event => { setNewName(event.target.value); setCreateError(""); }} />
                  {(createError || error) && <p role="alert">{createError || error}</p>}
                  <footer><button type="button" onClick={() => setCreateOpen(false)}>取消</button><button type="submit" disabled={!newName.trim() || !ready}>{busy ? "正在创建…" : "创建分组"}</button></footer>
                </fieldset></form>
              </PopoverContent>
            </Popover>
          </div>
          <div className="fm-group-list">{visibleGroups.map(group => <button type="button" key={group.id} aria-pressed={current.id === group.id} onClick={() => selectGroup(group.id)}><Folder size={16} aria-hidden="true" /><span>{group.name}</span><small>{monitors.filter(monitor => groupOf(monitor) === group.id).length}</small></button>)}{!visibleGroups.length && <p className="fm-group-empty">没有匹配的分组。</p>}</div>
        </section>
        <section className="fm-group-members" aria-label="分组成员管理">
          <header><div><h3>{current.name}</h3><span>{members.length} 项监控</span></div>{!ungrouped && <div className="fm-group-name-actions">
            <button ref={addButtonRef} type="button" className="fm-primary-button" disabled={locked} onClick={() => setPickerGroupId(current.id)}><Plus size={15} aria-hidden="true" />添加监控</button>
            <button type="button" onClick={() => { setRenaming(true); setEditingName(current.name); setConfirmDelete(false); setValidation(""); }}>重命名</button>
            <button type="button" className="fm-config-danger" onClick={() => { setConfirmDelete(true); setRenaming(false); }}>删除分组</button>
          </div>}</header>
          {renaming && <div className="fm-group-rename"><input aria-label="新的分组名称" maxLength={40} value={editingName} onChange={event => { setEditingName(event.target.value); setValidation(""); }} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void rename(); } }} /><button type="button" disabled={!ready} onClick={rename}>保存</button><button type="button" onClick={() => { setRenaming(false); setValidation(""); }}>取消</button></div>}
          {confirmDelete && <div className="fm-group-delete-confirm"><p>删除“{current.name}”？组内任务将回到未分组，监控任务及历史记录保留。</p><button type="button" onClick={() => setConfirmDelete(false)}>取消</button><button type="button" className="fm-config-danger" disabled={!ready} onClick={removeGroup}>确认删除分组</button></div>}
          {members.length > 0 && <div className="fm-group-member-filters">
            <label className="fm-group-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="搜索组内监控" placeholder="搜索监控名称" value={memberSearch} onChange={event => { setMemberSearch(event.target.value); setSelection(new Set()); }} /></label>
            <select aria-label="筛选监控状态" value={memberStatus} onChange={event => { setMemberStatus(event.target.value as typeof memberStatus); setSelection(new Set()); }}>{([["all", "全部状态"], ["active", "已启用"], ["paused", "已暂停"], ["draft", "待启动"]] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="筛选执行方式" value={execution} onChange={event => { setExecution(event.target.value as ExecutionMode); setSelection(new Set()); }}>{executionModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>}
          {ungrouped && <p className="fm-group-member-hint">{organization.groups.length ? "可将这些未分组任务分配至自定义分组。" : "点击左侧搜索框旁的加号，先创建一个分组。"}</p>}
          <div className="fm-group-member-list">
            {visibleMembers.map(monitor => <div key={monitor.id} className="fm-group-member-row"><label><input type="checkbox" disabled={locked} checked={selection.has(monitor.id)} onChange={() => setSelection(previous => { const next = new Set(previous); next.has(monitor.id) ? next.delete(monitor.id) : next.add(monitor.id); return next; })} /><span><strong>{monitor.name}</strong><small>{monitorStatusLabel(monitor.status)} · {monitor.questionsCount} 个问题 · {monitor.platformsCount} 个模型</small></span></label>
              {ungrouped ? <select aria-label={`为${monitor.name}分配分组`} value="" disabled={locked || !organization.groups.length} onChange={event => { if (event.target.value) void changeMembership([monitor.id], event.target.value); }}><option value="">分配到分组</option>{organization.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select> : <button type="button" className="fm-text-button" disabled={locked} aria-label={`将${monitor.name}移出本组`} onClick={() => void changeMembership([monitor.id], null)}>移出本组</button>}
            </div>)}
            {!visibleMembers.length && <div className="fm-group-empty fm-group-empty-members"><Folder size={26} aria-hidden="true" /><strong>{members.length ? "没有匹配的监控" : ungrouped ? "暂无未分组任务" : "本组暂无监控"}</strong><p>{members.length ? "请调整搜索、状态或执行方式筛选。" : ungrouped ? "已有任务均已归入自定义分组。" : "点击右上方“添加监控”，从未分组任务中选择。"}</p></div>}
          </div>
          {visibleMembers.length > 0 && <div className="fm-group-member-actions"><span aria-live="polite">已选 {selected.length} / {visibleMembers.length} 项</span><button type="button" disabled={locked} onClick={() => setSelection(new Set(visibleMembers.map(monitor => monitor.id)))}>全选结果</button><button type="button" disabled={!selected.length} onClick={() => setSelection(new Set())}>清空</button>
            {ungrouped ? <><select aria-label="批量分配目标分组" value={assignment} disabled={locked || !organization.groups.length} onChange={event => setAssignment(event.target.value)}><option value="">选择分组</option>{organization.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="button" className="fm-secondary-button" disabled={locked || !selected.length || !assignment} onClick={() => void changeMembership(selected.map(monitor => monitor.id), assignment)}>分配至分组</button></> : <><button type="button" className="fm-secondary-button" disabled={locked || !selected.length} onClick={() => void changeMembership(selected.map(monitor => monitor.id), null)}>移出本组</button><small>移出后回到未分组</small></>}
          </div>}
        </section>
      </div>
      <footer><span>{busy ? "正在保存…" : ""}</span><button type="button" className="fm-secondary-button" onClick={onClose}>关闭</button></footer>
    </fieldset>
    {pickerGroupId && <Modal open layer="nested" className="fm-group-picker-dialog" size="medium" title="添加监控" description={`从未分组任务中选择，添加到“${pickerGroup?.name || "原分组"}”。`} onClose={closePicker} onCloseAutoFocus={event => { event.preventDefault(); addButtonRef.current?.focus({ preventScroll: true }); }}>
      <MonitorGroupTaskPicker groupId={pickerGroupId} organization={organization} monitors={monitors} ready={ready && !currentUnavailable} busy={busy} error={error} message={message} onRetry={onRetry} onBack={closePicker} onAdd={addMembers} />
    </Modal>}
  </Modal>;
}
