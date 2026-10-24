import { projectWorkspaceUrl } from "../../host-runtime";

export function progressRunRoute(path: string) {
  const match = /^\/monitoring-system\/([0-9a-f-]{36})\/runs\/([0-9a-f-]{36})\/?$/i.exec(path);
  return match ? { monitorId: match[1]!, runId: match[2]! } : undefined;
}

export function progressViewForPath(path: string): "monitoring" | "reports" {
  return path === "/reports" || path === "/reports/" || progressRunRoute(path) ? "reports" : "monitoring";
}

export function monitoringRunHref(projectId: string | undefined, monitorId: string, runId: string) {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  if (params.get("monitor") !== monitorId || projectId && params.get("project") !== projectId) {
    for (const key of ["question", "questionCategory", "model", "subject"]) params.delete(key);
  }
  if (projectId) params.set("project", projectId);
  params.set("monitor", monitorId);
  params.set("run", runId);
  params.set("view", "reports");
  params.set("tab", "overview");
  for (const key of ["answer", "answerQuestion", "optimizationAnswer", "fullscreen"]) params.delete(key);
  return projectWorkspaceUrl(`/monitoring-system/${encodeURIComponent(monitorId)}/runs/${encodeURIComponent(runId)}?${params}`);
}
