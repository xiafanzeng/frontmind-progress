import { useEffect, useState } from "react";
import { Folder, Plus, Search } from "lucide-react";
import Modal from "../../components/Modal";
import { monitorStatusLabel, type MonitorSummary } from "../../domain";
import type { MonitorOrganization } from "../../../contracts/monitor-organization";

const UNGROUPED = "ungrouped";
const normalizeName = (value: string) => value.trim().replace(/\s+/gu, " ");

type Props = {
  organization: MonitorOrganization;
  monitors: MonitorSummary[];
  ready: boolean;
  busy: boolean;
  error: string;
  message: string;
  serverData?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onSave: (next: MonitorOrganization) => Promise<boolean>;
};

export default function MonitorGroupManager({ organization, monitors, ready, busy, error, message, serverData, onRetry, onClose, onSave }: Props) {
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(organization.groups[0]?.id ?? UNGROUPED);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberStatus, setMemberStatus] = useState<"all" | MonitorSummary["status"]>("all");
  const [memberScope, setMemberScope] = useState<"members" | "available">("members");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const groups = [...organization.groups, { id: UNGROUPED, name: "未分组" }];
  // Refetches can remove the selected group. Never write to a stale group ID.
  const current = groups.find((group) => group.id === selectedGroup) ?? groups[groups.length - 1]!;
  const currentUnavailable = current.id !== selectedGroup;
  useEffect(() => {
    setSelection(new Set()); setRenaming(false); setConfirmDelete(false);
  }, [current.id]);
  const groupIds = new Set(organization.groups.map((group) => group.id));
  const groupOf = (id: string) => groupIds.has(organization.membership[id]) ? organization.membership[id] : UNGROUPED;
  const counts = new Map<string, number>();
  for (const monitor of monitors) {
    const id = groupOf(monitor.id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const groupCount = (id: string) => counts.get(id) ?? 0;
  const visibleGroups = groups.filter((group) => group.name.toLocaleLowerCase().includes(groupSearch.trim().toLocaleLowerCase()));
  const candidates = monitors.filter((monitor) => (memberScope === "members") === (groupOf(monitor.id) === current.id));
  const visibleMembers = candidates.filter((monitor) => monitor.name.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase()) && (memberStatus === "all" || monitor.status === memberStatus));
  const selected = visibleMembers.filter((monitor) => selection.has(monitor.id));

  const selectGroup = (id: string, scope: "members" | "available" = "members") => {
    setSelectedGroup(id); setMemberScope(scope); setSelection(new Set()); setMemberSearch(""); setMemberStatus("all");
    setRenaming(false); setConfirmDelete(false); setValidation(""); setNotice("");
  };
  const validateName = (input: string, exceptId?: string) => {
    const name = normalizeName(input);
    if (!name) return "请输入分组名称。";
    if (name.length > 40) return "分组名称最多 40 个字符。";
    if (name === "未分组") return "“未分组”是系统分组，请使用其他名称。";
    if (organization.groups.some((group) => group.id !== exceptId && group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return "该分组名称已存在。";
    return "";
  };
  const addGroup = async () => {
    if (!ready || busy) return;
    if (organization.groups.length >= 200) { setValidation("每个项目最多支持 200 个分组。"); return; }
    const problem = validateName(newName);
    if (problem) { setValidation(problem); return; }
    const group = { id: crypto.randomUUID(), name: normalizeName(newName) };
    if (!await onSave({ ...organization, groups: [...organization.groups, group] })) return;
    setNewName(""); setGroupSearch(""); selectGroup(group.id, "available");
    setNotice(`已创建“${group.name}”。请勾选已有监控，再点击“添加到本组”。`);
  };
  const rename = async () => {
    if (!ready || busy || current.id !== selectedGroup || current.id === UNGROUPED) return;
    const problem = validateName(editingName, current.id);
    if (problem) { setValidation(problem); return; }
    if (!await onSave({ ...organization, groups: organization.groups.map((group) => group.id === current.id ? { ...group, name: normalizeName(editingName) } : group) })) return;
    setRenaming(false); setValidation(""); setGroupSearch(""); setNotice("分组名称已更新。");
  };
  const removeGroup = async () => {
    if (!ready || busy || current.id !== selectedGroup || current.id === UNGROUPED) return;
    // Preserve configurations and runs, including recycled configuration memberships.
    if (!await onSave({ ...organization, groups: organization.groups.filter((group) => group.id !== current.id), membership: Object.fromEntries(Object.entries(organization.membership).filter(([, groupId]) => groupId !== current.id)) })) return;
    selectGroup(UNGROUPED); setGroupSearch(""); setNotice("分组已删除，组内监控已移到“未分组”，监控及运行记录均保留。");
  };
  const updateMembers = async () => {
    if (!ready || busy || current.id !== selectedGroup || !selected.length || (memberScope === "members" && current.id === UNGROUPED)) return;
    const destination = memberScope === "members" ? UNGROUPED : current.id;
    const membership = { ...organization.membership };
    for (const monitor of selected) {
      if (destination === UNGROUPED) delete membership[monitor.id];
      else membership[monitor.id] = destination;
    }
    if (!await onSave({ ...organization, membership })) return;
    setSelection(new Set()); setValidation("");
    setNotice(`已将 ${selected.length} 项监控移到“${groups.find((group) => group.id === destination)?.name}”。执行计划和运行记录保持不变。`);
  };

  return <Modal open onClose={onClose} title="管理分组" description="分组用于整理当前项目的监控任务，每项监控只能属于一个分组。" size="large">
    <fieldset className="fm-config-group-manager" disabled={busy} aria-busy={busy}>
      <p className="fm-config-storage-note">{serverData ? "分组按当前项目保存。这里只整理已有监控，不会创建或执行监控任务。" : "当前为示例，分组仅在本页面临时保存。"}</p>
      {(validation || error) && <p className="fm-config-warning" role="alert">{validation || error}</p>}
      {message && <p className="fm-config-warning" role="status">{message}{onRetry && <button type="button" className="fm-text-button" onClick={onRetry}>重试读取</button>}</p>}
      {notice && <p className="fm-group-notice" role="status">{notice}</p>}
      {currentUnavailable && <p className="fm-config-warning" role="status">所选分组正在同步或已被移除，请从左侧重新选择可用分组。</p>}
      <div className="fm-group-manager-layout">
        <section className="fm-group-directory" aria-label="分组列表">
          <label className="fm-group-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="搜索分组" placeholder="搜索分组" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} /></label>
          <div className="fm-group-list">
            {visibleGroups.map((group) => <button type="button" key={group.id} aria-pressed={current.id === group.id} onClick={() => selectGroup(group.id)}><Folder size={16} aria-hidden="true" /><span>{group.name}</span><small>{groupCount(group.id)}</small></button>)}
            {!visibleGroups.length && <p className="fm-group-empty">没有匹配的分组。</p>}
          </div>
          <div className="fm-group-create">
            <label>新分组名称<input maxLength={40} value={newName} placeholder="例如：日常跟踪" onChange={(event) => { setNewName(event.target.value); setValidation(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void addGroup(); } }} /></label>
            <button type="button" className="fm-primary-button" disabled={!ready || !newName.trim()} onClick={addGroup}><Plus size={14} aria-hidden="true" />创建分组并选成员</button>
          </div>
        </section>
        <section className="fm-group-members" aria-label="分组成员管理">
          <header><div><h3>{current.name}</h3><span>{groupCount(current.id)} 项监控</span></div>{current.id !== UNGROUPED && <div className="fm-group-name-actions"><button type="button" onClick={() => { setRenaming(true); setEditingName(current.name); setConfirmDelete(false); setValidation(""); }}>重命名</button><button type="button" className="fm-config-danger" onClick={() => { setConfirmDelete(true); setRenaming(false); }}>删除分组</button></div>}</header>
          {renaming && <div className="fm-group-rename"><input aria-label="新的分组名称" maxLength={40} value={editingName} onChange={(event) => { setEditingName(event.target.value); setValidation(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void rename(); } }} /><button type="button" disabled={!ready} onClick={rename}>保存</button><button type="button" onClick={() => { setRenaming(false); setValidation(""); }}>取消</button></div>}
          {confirmDelete && <div className="fm-group-delete-confirm"><p>删除“{current.name}”？组内监控将移到“未分组”，监控任务不会删除。</p><button type="button" onClick={() => setConfirmDelete(false)}>取消</button><button type="button" className="fm-config-danger" disabled={!ready} onClick={removeGroup}>确认删除分组</button></div>}
          <div className="fm-group-member-tabs" aria-label="成员范围">{([['members', '组内监控'], ['available', '添加已有监控']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={memberScope === value} onClick={() => { setMemberScope(value); setSelection(new Set()); }}>{label}</button>)}</div>
          <div className="fm-group-member-filters">
            <label className="fm-group-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="搜索监控任务" placeholder="搜索监控名称" value={memberSearch} onChange={(event) => { setMemberSearch(event.target.value); setSelection(new Set()); }} /></label>
            <select aria-label="筛选监控状态" value={memberStatus} onChange={(event) => { setMemberStatus(event.target.value as typeof memberStatus); setSelection(new Set()); }}>{([["all", "全部状态"], ["active", "已启用"], ["paused", "已暂停"], ["draft", "待启动"]] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <p className="fm-group-member-hint">{memberScope === "available" ? "添加后，所选监控会从原分组移动到本组。" : current.id === UNGROUPED ? "选择左侧目标分组，再通过“添加已有监控”整理这些任务。" : "移出本组后，监控会回到“未分组”。"}</p>
          <div className="fm-group-member-list">
            {visibleMembers.map((monitor) => <label key={monitor.id}><input type="checkbox" disabled={!ready || currentUnavailable || (memberScope === "members" && current.id === UNGROUPED)} checked={selection.has(monitor.id)} onChange={() => setSelection((previous) => { const next = new Set(previous); next.has(monitor.id) ? next.delete(monitor.id) : next.add(monitor.id); return next; })} /><span><strong>{monitor.name}</strong><small>{monitorStatusLabel(monitor.status)} · {monitor.questionsCount} 个问题 · {monitor.platformsCount} 个模型</small><small>所属分组：{groups.find((group) => group.id === groupOf(monitor.id))?.name}</small></span></label>)}
            {!visibleMembers.length && <p className="fm-group-empty">{memberSearch.trim() || memberStatus !== "all" ? "没有匹配的监控，请调整搜索或状态。" : memberScope === "members" ? "本组暂无监控，可切换到“添加已有监控”。" : "没有可添加的监控。"}</p>}
          </div>
          {(memberScope === "available" || current.id !== UNGROUPED) && <div className="fm-group-member-actions"><span aria-live="polite">已选 {selected.length} / {visibleMembers.length} 项</span><button type="button" disabled={!ready || currentUnavailable || !visibleMembers.length} onClick={() => setSelection(new Set(visibleMembers.map((monitor) => monitor.id)))}>全选结果</button><button type="button" disabled={!selected.length} onClick={() => setSelection(new Set())}>清空</button><button type="button" className="fm-primary-button" disabled={!ready || currentUnavailable || !selected.length} onClick={updateMembers}>{memberScope === "available" ? current.id === UNGROUPED ? "移入未分组" : "添加到本组" : "移回未分组"}</button></div>}
        </section>
      </div>
      <footer><span>{busy ? "正在保存…" : "搜索监控、筛选状态或切换分组后会清空勾选。"}</span><button type="button" className="fm-secondary-button" onClick={onClose}>完成</button></footer>
    </fieldset>
  </Modal>;
}
