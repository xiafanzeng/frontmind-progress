import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { progressRunRoute, progressViewForPath } from "../module/client/features/monitoring/reportNavigation";
import { ModuleShell } from "./LocalModuleShell";
import MonitoringDemo from "./MonitoringDemo";
import ModuleWorkspace, { ProgressClientProvider, type ModuleContext, type ProgressWorkspaceView, type ProgressProjectCreationAction } from "../module/client/ModuleWorkspace";
import { PROGRESS_MODULE_LABEL } from "../module/client/module-label";
import "./standalone.css";

const moduleDefinition = { id: "progress", label: PROGRESS_MODULE_LABEL, color: "#3d1560" };
const navigationModules = [
  { id: "brand", label: "品牌建设", color: "#16794f", views: [{ id: "knowledge", label: "智能知识库" }] },
  { id: "intent", label: "意图优化", color: "#7545a0", views: [{ id: "questions", label: "优化问题" }] },
  { id: "progress", label: "进度监控", color: "#2867a5", views: [{ id: "monitoring", label: "问题监控" }, { id: "reports", label: "进度报告" }] },
  { id: "content", label: "内容制作", color: "#8a6100", views: [{ id: "content", label: "内容工作台" }] },
  { id: "publishing", label: "媒体发布", color: "#b33467", views: [{ id: "publishing", label: "发布工作台" }] },
  { id: "extensions", label: "AI专用官网", color: "#5e6174", views: [{ id: "enterprise-qa", label: "企业问答" }] },
];
const views = [{ id: "monitoring", label: "问题监控" }, { id: "reports", label: "进度报告" }];

export default function App({ preview = false }: { preview?: boolean }) {
  const [context, setContext] = useState<ModuleContext>();
  const [error, setError] = useState("");
  const [projectCreation, setProjectCreation] = useState<ProgressProjectCreationAction>();
  const registerProjectCreation = useCallback((action: ProgressProjectCreationAction | undefined) => setProjectCreation(action), []);
  const [path, navigate] = useLocation();
  const view = progressViewForPath(path);
  const navigateView = (next: ProgressWorkspaceView) => {
    const params = new URLSearchParams(location.search);
    params.set("view", next);
    params.delete("optimizationAnswer");
    navigate(`${next === "reports" ? "/reports" : "/"}?${params}`);
  };
  useEffect(() => {
    if (!["/", "/reports", "/reports/", "/monitoring-system"].includes(path) && !progressRunRoute(path)) {
      navigate(`/${location.search}`, { replace: true });
    }
  }, [path, navigate]);
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
    // The shared ModuleShell patch (see HANDOFF 共享 UI 补丁) has not landed in this
  // child's vendor projection yet; spread the extra prop so the wiring compiles and
  // activates once the main repo projects the patched shell. Current vendor ignores it.
  const projectCreationProp = { projectCreation: projectCreation ? { label: projectCreation.label, onCreate: projectCreation.open, disabled: projectCreation.disabled } : undefined };
  return <ModuleShell module={moduleDefinition} navigationModules={navigationModules} views={views} activeView={view} onSelectView={id => {
    if (id === "monitoring" || id === "reports") navigateView(id);
    else {
      const routes: Record<string, string> = { content: "/content-production", publishing: "/publishing", "enterprise-qa": "/enterprise-qa" };
      const url = new URL(routes[id] || `/?view=${encodeURIComponent(id)}`, "https://dashboard.frontmind.cn");
      // Other modules remain owned by the Dashboard, never rendered as this module.
      window.open(url.href, "_blank", "noopener,noreferrer");
    }
  }} {...projectCreationProp}>
    <div className="dashboard-module-content">
      {error ? <><p role="alert">{error}</p><button className="operator-control-secondary" onClick={() => location.reload()}>重新加载</button></>
        : !preview && !context ? <p role="status">正在进入问题监控…</p>
          : preview ? <ProgressClientProvider><MonitoringDemo view={view} /></ProgressClientProvider>
            : <ModuleWorkspace context={context} view={view} onViewChange={navigateView} onProjectCreationChange={registerProjectCreation} />}
    </div>
  </ModuleShell>;
}
