import { useEffect, useState } from "react";
import { ModuleShell } from "@frontmind/module-ui/dashboard/ModuleShell";
import MonitoringDemo from "./MonitoringDemo";
import ModuleWorkspace, { ProgressClientProvider, type ModuleContext, type ProgressWorkspaceView } from "../module/client/ModuleWorkspace";
import { PROGRESS_MODULE_LABEL } from "../module/client/module-label";
import "./standalone.css";

const moduleDefinition = { id: "progress", label: PROGRESS_MODULE_LABEL, color: "#2867a5" };
const views = [{ id: "monitoring", label: "问题监控" }, { id: "reports", label: "进度报告" }];

export default function App({ preview = false }: { preview?: boolean }) {
  const [context, setContext] = useState<ModuleContext>();
  const [error, setError] = useState("");
  const routeView = (): ProgressWorkspaceView => location.pathname === "/reports" || /\/runs\//.test(location.pathname) ? "reports" : "monitoring";
  const [view, setView] = useState<ProgressWorkspaceView>(routeView);
  const navigateView = (next: ProgressWorkspaceView) => {
    setView(next);
    history.pushState(null, "", next === "reports" ? "/reports" : "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  useEffect(() => {
    const restore = () => setView(routeView());
    window.addEventListener("popstate", restore);
    if (!["/", "/reports", "/monitoring-system"].includes(location.pathname) && !/\/runs\/[0-9a-f-]{36}$/.test(location.pathname)) history.replaceState(null, "", "/");
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (preview) return;
    const abort = new AbortController();
    void fetch("/api/module/context", { credentials: "same-origin", signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error("开发门禁验证失败，请重新打开页面");
        return response.json();
      })
      .then(value => {
        if (value.module !== "progress" || !value.workspace?.id) throw new Error("模块运行上下文无效");
        setContext(value);
      })
      .catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [preview]);
  return <ModuleShell module={moduleDefinition} views={views} activeView={view} onSelectView={id => navigateView(id as ProgressWorkspaceView)}>
    <div className="dashboard-module-content">
      {error ? <><p role="alert">{error}</p><button className="operator-control-secondary" onClick={() => location.reload()}>重新加载</button></>
        : !preview && !context ? <p role="status">正在进入问题监控…</p>
          : preview ? <ProgressClientProvider><MonitoringDemo view={view} /></ProgressClientProvider>
            : <ModuleWorkspace context={context} view={view} onViewChange={navigateView} />}
    </div>
  </ModuleShell>;
}
