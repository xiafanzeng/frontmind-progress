import { Link2, Check, Plus, ExternalLink, CornerUpLeft } from "lucide-react";
import { useState } from "react";
import SourceEvidenceList from "@frontmind/module-ui/components/SourceEvidenceList";
import type { RunAttempt } from "../../domain";
import type { SourceScope } from "./types";
import { useMonitoringDemo } from "../../MonitoringDemoContext";
import { sourceEvidenceRows } from "./sourceEvidenceRows";
import { safeExternalUrl } from "./selectors";
import "./answer-insights.css";

export default function CitationRail({
  attempt,
  scope,
  onScopeChange,
  cards = false,
  activeCitation,
  onLocateCitation,
}: {
  attempt: RunAttempt;
  scope: SourceScope;
  onScopeChange: (scope: SourceScope) => void;
  cards?: boolean;
  activeCitation?: number;
  onLocateCitation?: (number: number) => void;
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
    <section className={`fm-answer-sources${cards ? " fm-qa-source-rail" : ""}`} aria-label="引用信源">
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
      {cards ? <div className="fm-qa-source-cards">
        {rows.map((row) => {
          const url = safeExternalUrl(row.url || undefined);
          const number = typeof row.number === "number" ? row.number : undefined;
          return <article key={row.id} tabIndex={-1} data-citation-source={number} className={number === activeCitation ? "is-active" : ""}>
            <header><strong>{row.number}. {row.title}</strong><span>{row.type === "cited" ? "文内引用" : "答案参考"}</span></header>
            <p>{row.site || "来源未提供"}{row.publishedAt ? ` · ${row.publishedAt}` : ""}</p>
            {row.excerpt && <blockquote>{row.excerpt}</blockquote>}
            <footer>{url ? <a href={url} target="_blank" rel="noopener noreferrer">查看来源 <ExternalLink size={12} /></a> : <span>未提供可访问链接</span>}
              {row.type === "cited" && number !== undefined && <button type="button" onClick={() => onLocateCitation?.(number)}>定位原文 <CornerUpLeft size={12} /></button>}
              {demo && <button type="button" aria-pressed={demo.trackedSources.has(row.id)} onClick={() => demo.toggleSource(row.id)}>{demo.trackedSources.has(row.id) ? "已追踪 · 演示" : "追踪引用 · 演示"}</button>}
            </footer>
          </article>;
        })}
        {!rows.length && <p className="fm-qa-notice">{scope === "cited" ? "本条回答暂无文内引用" : scope === "discovered" ? "本条回答暂无答案参考" : "本条回答暂无引用信源"}</p>}
      </div> : <SourceEvidenceList
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
      />}
    </section>
  );
}
