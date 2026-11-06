import type { MonitorRun } from "../../../domain";
import { monitoringLocalCalendarDate, shiftCalendarDate } from "../queryState";
import type { MonitoringQueryState } from "../types";
import { scopedAttempts } from "./overviewModel";

export type TrendDay = { date: string; run?: MonitorRun };

/** Keep the existing createdAt-based date scope; order completed runs by completion time. */
export function calendarTrendDays(runs: MonitorRun[], query: MonitoringQueryState, timezone: string): TrendDay[] {
  const from = Date.parse(`${query.from}T00:00:00Z`);
  const to = Date.parse(`${query.to}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return [];
  const latest = new Map<string, { run: MonitorRun; completed: number }>();
  for (const run of runs) {
    const created = Date.parse(run.createdAt);
    if (run.status !== "completed" || !Number.isFinite(created) || !scopedAttempts(run, query).length) continue;
    const date = monitoringLocalCalendarDate(new Date(created), timezone);
    if (date < query.from || date >= query.to) continue;
    // Older snapshots can omit completedAt. Retain their known collection time.
    const completedAt = Date.parse(run.completedAt || "");
    const completed = Number.isFinite(completedAt) ? completedAt : created;
    const previous = latest.get(date);
    if (!previous || completed > previous.completed || (completed === previous.completed &&
      (created > Date.parse(previous.run.createdAt) || (created === Date.parse(previous.run.createdAt) && run.id > previous.run.id)))) {
      latest.set(date, { run, completed });
    }
  }
  return Array.from({ length: Math.round((to - from) / 86_400_000) }, (_, index) => {
    const date = shiftCalendarDate(query.from, index);
    return { date, run: latest.get(date)?.run };
  });
}
