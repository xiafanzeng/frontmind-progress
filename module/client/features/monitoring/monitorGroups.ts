import type { MonitorSummary } from "../../domain";
import type { MonitorOrganization } from "../../../contracts/monitor-organization";

export const UNGROUPED_GROUP_ID = "ungrouped";
export type ExecutionMode = "all" | "manual" | "daily" | "weekly" | "unknown";
export const executionModes = [["all", "全部执行方式"], ["manual", "手动执行"], ["daily", "每日执行"], ["weekly", "每周执行"], ["unknown", "执行方式待确认"]] as const;
export function monitorExecutionMode(monitor: MonitorSummary): Exclude<ExecutionMode, "all"> {
  if (monitor.scheduleType === "none") return "manual";
  if (monitor.scheduleType === "daily" || monitor.scheduleType === "weekly") return monitor.scheduleType;
  if (/手动|本次/u.test(monitor.scheduleLabel)) return "manual";
  if (/每日/u.test(monitor.scheduleLabel)) return "daily";
  if (/每周/u.test(monitor.scheduleLabel)) return "weekly";
  return "unknown";
}
export function taskGroup(monitor: MonitorSummary | undefined, organization: MonitorOrganization) {
  const id = monitor && organization.membership[monitor.id];
  return id && organization.groups.some(group => group.id === id) ? id : UNGROUPED_GROUP_ID;
}
export function visibleTaskGroups(_monitors: MonitorSummary[], organization: MonitorOrganization) {
  // Existing custom memberships stay intact. No schedule-derived folders or
  // data migration: absent membership always means genuinely ungrouped.
  return [{ id: UNGROUPED_GROUP_ID, name: "未分组" }, ...organization.groups];
}
