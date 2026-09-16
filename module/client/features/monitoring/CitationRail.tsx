import { Link2, Check, Plus } from "lucide-react";
import { useState } from "react";
import SourceEvidenceList from "@frontmind/module-ui/components/SourceEvidenceList";
import type { RunAttempt } from "../../domain";
import type { SourceScope } from "./types";
import { useMonitoringDemo } from "../../MonitoringDemoContext";
import { sourceEvidenceRows } from "./sourceEvidenceRows";
import "./answer-insights.css";

export default function CitationRail({
  attempt,
  scope,
  onScopeChange,
}: {
  attempt: RunAttempt;
  scope: SourceScope;
  onScopeChange: (scope: SourceScope) => void;
}) {
  const demo = useMonitoringDemo();
  const [trackingScope, setTrackingScope] = useState<
    "all" | "tracked" | "untracked"
  >("all");
  const allRows = sourceEvidenceRows(attempt);
  const scopedRows = allRows.filter(
    (row) =>
      scope === "all" ||
      row.type === (scope === "cited" ? "cited" : "reference"),
  );
  const rows = demo
    ? scopedRows.filter(
        (row) =>
          trackingScope === "all" ||
          demo.trackedSources.has(row.id) === (trackingScope === "tracked"),
      )
    : scopedRows;
  const scopes = [
    { key: "all", label: "全部来源", count: allRows.length },
    {
      key: "cited",
      label: "文内引用",
      count: allRows.filter((row) => row.type === "cited").length,
    },
    {
      key: "discovered",
      label: "答案参考",
      count: allRows.filter((row) => row.type === "reference").length,
    },
  ] as const;
  return (
    <section className="fm-answer-sources" aria-label="引用信源">
      <header className="fm-answer-section-heading">
        <h3>
          <Link2 size={16} />
          引用信源
        </h3>
        <span>{allRows.length} 条来源</span>
      </header>
      <div
        className="fm-answer-source-filters"
        role="group"
        aria-label="引用信源筛选"
      >
        {scopes.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={`${item.label} ${item.count}`}
            aria-pressed={scope === item.key}
            onClick={() => onScopeChange(item.key)}
          >
            {item.label}
            <span>{item.count}</span>
          </button>
        ))}
      </div>
      {demo && (
        <div
          className="fm-answer-source-filters"
          role="group"
          aria-label="演示引用追踪筛选"
        >
          {(["all", "tracked", "untracked"] as const).map((value, index) => (
            <button
              key={value}
              type="button"
              aria-pressed={trackingScope === value}
              onClick={() => setTrackingScope(value)}
            >
              {["全部", "已追踪", "未追踪"][index]}{" "}
              <span>
                {
                  scopedRows.filter(
                    (row) =>
                      value === "all" ||
                      demo.trackedSources.has(row.id) === (value === "tracked"),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
      )}
      <SourceEvidenceList
        rows={rows}
        resetKey={`${attempt.id}:${scope}:${trackingScope}`}
        emptyText={
          scope === "cited"
            ? "本条回答暂无文内引用"
            : scope === "discovered"
              ? "本条回答暂无答案参考"
              : "本条回答暂无引用信源"
        }
        renderAction={
          demo
            ? (row) => (
                <button
                  type="button"
                  aria-pressed={demo.trackedSources.has(row.id)}
                  onClick={() => demo.toggleSource(row.id)}
                >
                  {demo.trackedSources.has(row.id) ? (
                    <Check size={12} />
                  ) : (
                    <Plus size={12} />
                  )}
                  {demo.trackedSources.has(row.id)
                    ? "已追踪 · 演示"
                    : "追踪引用 · 演示"}
                </button>
              )
            : undefined
        }
      />
    </section>
  );
}
