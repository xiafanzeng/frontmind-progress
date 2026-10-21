import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { formatDateTime, runStatusLabel, type MonitorRun, type MonitorSummary } from "../../domain";

/** Status is always for the active execution, even while reading an older answer. */
export default function MonitoringRunStatus({ monitor, runs, onView }: {
  monitor: MonitorSummary;
  runs: MonitorRun[];
  onView: (runId: string) => void;
}) {
  const active = runs.find(run => ["running", "queued", "waiting_quota"].includes(run.status));
  const last = monitor.lastRun;
  const summary = last && ["running", "queued", "waiting_quota"].includes(last.status) ? last : undefined;
  // Prefer the periodically refreshed monitor summary when both refer to the same run.
  const current = summary || (active ? { id: active.id, status: active.status, completed: active.metrics.completed, expected: active.metrics.expected } : undefined);
  const detail = current && runs.find(run => run.id === current.id);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(false), [monitor.id, current?.id]);
  if (!current) return null;
  const progress = current.expected ? Math.min(100, Math.round(current.completed / current.expected * 100)) : 0;
  return <section className="fm-qa-running" aria-label="当前运行状态" role="status">
    <LoaderCircle size={22} />
    <div className="fm-qa-running-copy"><strong>{current.status === "running" ? "正在运行监控任务" : runStatusLabel(current.status)}</strong>
      {!collapsed && <small>{detail ? `${detail.trigger === "manual" ? "手动触发" : "计划触发"} · ${formatDateTime(detail.createdAt)}` : "执行进度"} · 结果持续更新</small>}
    </div>
    {!collapsed && <div className="fm-qa-running-progress"><span>已完成 {current.completed} / {current.expected}<b>{progress}%</b></span><progress max={100} value={progress} aria-label="当前运行完成比例" /></div>}
    <button type="button" className="fm-secondary-button" onClick={() => onView(current.id)}><ChevronRight size={14} />查看进度</button>
    <button type="button" className="fm-text-button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><ChevronDown size={14} />{collapsed ? "展开" : "收起"}</button>
  </section>;
}
