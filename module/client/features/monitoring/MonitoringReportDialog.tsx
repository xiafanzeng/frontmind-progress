import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "../../trpc";
import { Download, FileSpreadsheet, Image, Link2, MessageSquareText, ChartNoAxesCombined, Loader2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@frontmind/module-ui/components/ui/dialog";
import { Button } from "@frontmind/module-ui/components/ui/button";
import { enterpriseProjectHeaders, projectResourceUrl } from "../../host-runtime";
import { calendarDateRangeToUtc, shiftCalendarDate } from "./queryState";
import type { MonitoringQueryState } from "./types";
import { EXPORT_OPTIONS, type ExportKind } from "./exportOptions";
import "./monitoring-report-dialog.css";

type ReadyFile = { kind: ExportKind; name: string; href: string; warning?: string };
const icons = { answers: MessageSquareText, screenshots: Image, sources: Link2, sentiment: ChartNoAxesCombined };
const saveFile = (file: ReadyFile) => {
  const anchor = document.createElement("a");
  anchor.href = file.href; anchor.download = file.name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
};

export default function MonitoringReportDialog({ query: currentQuery, timezone, monitorName, modelLabel, onClose }: {
  query: MonitoringQueryState; timezone: string; monitorName: string; modelLabel?: string; onClose: () => void;
}) {
  // A dialog owns one frozen scope and project transport, including its downloads.
  const [query] = useState(() => ({ ...currentQuery }));
  const [transport] = useState(() => {
    const headers = enterpriseProjectHeaders();
    const base = projectResourceUrl("/api/monitoring/trpc");
    return {
      headers, mediaBase: projectResourceUrl("/api/monitoring/media/"),
      client: trpc.createClient({ links: [httpBatchLink({ url: base, headers, fetch: (url, options) => fetch(url, { ...options, credentials: "same-origin" }) })] }),
    };
  });
  const from = query.from;
  const to = shiftCalendarDate(query.to, -1);
  const [selected, setSelected] = useState<ExportKind[]>(["answers"]);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState("");
  const [files, setFiles] = useState<ReadyFile[]>([]);
  const downloadRef = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const lockedRef = useRef(false);
  const bounds = useMemo(() => {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return undefined;
      const result = calendarDateRangeToUtc(from, shiftCalendarDate(to, 1), timezone);
      if (Date.parse(result.to) - Date.parse(result.from) > 366 * 86_400_000) return undefined;
      return result;
    } catch { return undefined; }
  }, [from, to, timezone]);
  const subject = query.subject === "self" ? { kind: "self" as const } : { kind: "competitor" as const, name: query.subject.slice("competitor:".length) };
  useEffect(() => () => {
    downloadRef.current?.abort();
    urls.current.forEach(href => URL.revokeObjectURL(href));
  }, []);
  const availability = trpc.monitoring.summary.useQuery({
    monitorId: query.monitorId || "00000000-0000-0000-0000-000000000000",
    from: new Date(bounds?.from || 0), to: new Date(bounds?.to || 0), subject,
    questionId: query.question, platformId: query.model, questionCategory: query.questionCategory,
  }, { enabled: Boolean(bounds && query.monitorId && query.question), refetchOnWindowFocus: false });
  const catalog = availability.data?.filters;
  const invalidSelection = Boolean(catalog && (
    !catalog.questions.some(item => item.id === query.question) ||
    (query.model && !catalog.platforms.some(item => item.id === query.model))
  ));
  // Historical-brand answers are still valid evidence; summary metrics exclude them.
  const answerCount = availability.data ? availability.data.metrics.answers + (availability.data.brandScope?.excludedAnswers || 0) : 0;
  const canDownload = Boolean(query.question && query.monitorId && bounds && catalog && !availability.isFetching && !availability.error && !invalidSelection && answerCount > 0 && selected.length && !downloading);
  const close = () => { downloadRef.current?.abort(); onClose(); };
  async function download() {
    if (!canDownload || lockedRef.current || !bounds || !query.monitorId) return;
    lockedRef.current = true;
    setDownloading(true); setError(""); setProgress("正在准备导出…");
    urls.current.forEach(href => URL.revokeObjectURL(href)); urls.current = []; setFiles([]);
    const abort = new AbortController(); downloadRef.current = abort;
    try {
      // Spreadsheet/ZIP code is loaded only when the user requests an export.
      const { collectExportData, prepareExportFile } = await import("./monitoringExport");
      const context = {
        scope: { monitorId: query.monitorId, from: new Date(bounds.from), to: new Date(bounds.to), subject, questionId: query.question, platformId: query.model, questionCategory: query.questionCategory },
        timezone, question: monitorName, from, to, mediaBase: transport.mediaBase, headers: transport.headers,
      };
      const data = await collectExportData(transport.client, context, abort.signal, setProgress);
      const prepared: ReadyFile[] = [];
      const failures: string[] = [];
      for (const option of EXPORT_OPTIONS.filter(item => selected.includes(item.id))) {
        if (abort.signal.aborted) return;
        try {
          const output = await prepareExportFile(option.id, data, context, abort.signal, setProgress);
          if (abort.signal.aborted) return;
          const href = URL.createObjectURL(output.blob); urls.current.push(href);
          prepared.push({ kind: output.kind, name: output.name, href, warning: output.warning });
          setFiles([...prepared]);
        } catch (reason) {
          if (abort.signal.aborted) return;
          failures.push(`${option.label}：${reason instanceof Error ? reason.message : "生成失败，请重试"}`);
        }
      }
      if (abort.signal.aborted) return;
      // Keep explicit links available because browsers may block multiple automatic saves.
      prepared.forEach(saveFile);
      setError(failures.join("\n"));
      setProgress(prepared.length ? `已生成 ${prepared.length} 个文件` : "未生成文件");
    } catch (reason) {
      if (!abort.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "导出失败，请重试");
        setProgress("");
      }
    } finally {
      lockedRef.current = false;
      if (!abort.signal.aborted) setDownloading(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="fm-report-download-dialog" style={{ "--module-accent": "#3d1560" } as CSSProperties}>
      <DialogHeader>
        <DialogTitle><Download size={20} />导出</DialogTitle>
        <DialogDescription>选择需要的内容，每一项单独生成一个文件。</DialogDescription>
      </DialogHeader>
      <div className="fm-report-download-body">
        <dl className="fm-report-current-scope">
          <div><dt>监控问题</dt><dd>{monitorName}</dd></div>
          <div><dt>模型</dt><dd>{query.model ? modelLabel || catalog?.platforms.find(item => item.id === query.model)?.displayName || "当前所选模型" : "全部模型"}</dd></div>
          <div><dt>日期</dt><dd>{from} 至 {to}</dd></div>
        </dl>
        <p className="fm-report-note">范围与页面筛选一致。如需调整，请返回页面修改模型或日期。</p>
        <fieldset className="fm-export-options" disabled={downloading}>
          <legend>导出内容 <span>可单选或多选</span></legend>
          <div className="fm-export-selection-tools"><span>已选 {selected.length} 项</span><button type="button" onClick={() => setSelected(selected.length === EXPORT_OPTIONS.length ? [] : EXPORT_OPTIONS.map(item => item.id))}>{selected.length === EXPORT_OPTIONS.length ? "取消全选" : "全选"}</button></div>
          <div className="fm-export-grid">
            {EXPORT_OPTIONS.map(option => {
              const checked = selected.includes(option.id), Icon = icons[option.id];
              return <label key={option.id} className={`fm-export-card${checked ? " is-selected" : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => setSelected(values => checked ? values.filter(value => value !== option.id) : [...values, option.id])} />
                <Icon size={20} aria-hidden="true" />
                <span className="fm-export-card-text"><strong>{option.label}<small>{option.format}</small></strong><span>{option.description}</span><span className="fm-export-sheet-list">{option.sheets}</span></span>
              </label>;
            })}
          </div>
        </fieldset>
        <p className="fm-report-note fm-export-summary">{selected.length ? `将生成 ${selected.length} 个文件，分别下载。` : "请至少选择一项导出内容。"} 仅整理已有结果。</p>
        {!bounds && <p role="alert" className="fm-report-error">请选择有效日期范围，最长 366 天。</p>}
        {availability.isLoading && <p className="fm-report-note" role="status">正在读取当前范围…</p>}
        {catalog && !answerCount && <p className="fm-report-note">当前筛选范围没有回答数据。</p>}
        {invalidSelection && <p role="alert" className="fm-report-error">当前筛选范围没有匹配数据，请返回页面调整筛选。</p>}
        {(error || availability.error) && <div role="alert" className="fm-report-error">{error || "暂时无法读取当前范围，请重试。"}{availability.error && <button type="button" onClick={() => void availability.refetch()}>重试</button>}</div>}
        {progress && <p role="status" className="fm-export-progress">{downloading ? <Loader2 size={15} className="animate-spin" /> : files.length ? <Check size={15} /> : null}{progress}</p>}
        {!!files.length && <div className="fm-export-results"><p>若浏览器未保存全部文件，可点击下方文件分别下载；关闭窗口后需重新生成。</p>{files.map(file => <div key={file.kind}><a href={file.href} download={file.name}><FileSpreadsheet size={16} />{file.name}<Download size={14} /></a>{file.warning && <p className="fm-export-warning">{file.warning}</p>}</div>)}</div>}
      </div>
      <DialogFooter>
        <span className="fm-export-footer-count">已选 {selected.length} / 4 项</span>
        <Button variant="operatorOutline" onClick={close}>{downloading ? "取消导出" : files.length ? "完成" : "取消"}</Button>
        <Button variant="operator" disabled={!canDownload} onClick={() => void download()}>{downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{downloading ? "正在导出…" : `导出${selected.length ? ` ${selected.length} 项` : ""}`}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
