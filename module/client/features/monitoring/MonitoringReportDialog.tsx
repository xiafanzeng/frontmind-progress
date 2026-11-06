import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { trpc } from "../../trpc";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@frontmind/module-ui/components/ui/dialog";
import { Button } from "@frontmind/module-ui/components/ui/button";
import {
  enterpriseProjectHeaders,
  projectResourceUrl,
} from "../../host-runtime";
import { calendarDateRangeToUtc, shiftCalendarDate } from "./queryState";
import type { MonitoringQueryState } from "./types";
import "./monitoring-report-dialog.css";

type Option = {
  id: string;
  label: string;
  category?: string | null;
  clientType?: "web" | "mobile";
};
type Catalog = { questions: Option[]; platforms: Option[] };


export default function MonitoringReportDialog({
  query,
  timezone,
  monitorName,
  modelLabel,
  onClose,
}: {
  query: MonitoringQueryState;
  timezone: string;
  monitorName: string;
  modelLabel?: string;
  onClose: () => void;
}) {
  // Mounted once per dialog: freeze identity and headers so late requests cannot cross projects.
  const [transport] = useState(() => ({
    base: projectResourceUrl(
      `/api/monitoring/downloads/monitoring/${query.monitorId}`,
    ),
    headers: enterpriseProjectHeaders({ "Content-Type": "application/json" }),
  }));
  const endpoint = (suffix: string) => {
    const url = new URL(transport.base, window.location.origin);
    url.pathname += suffix;
    return `${url.pathname}${url.search}`;
  };
  const [from] = useState(query.from);
  const [to] = useState(() => shiftCalendarDate(query.to, -1));
  const [questionIds] = useState<string[] | undefined>(
    query.question ? [query.question] : undefined,
  );
  const [platformIds] = useState<string[] | undefined>(
    query.model ? [query.model] : undefined,
  );
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const downloadRef = useRef<AbortController | null>(null);
  const lockedRef = useRef(false);
  const bounds = useMemo(() => {
    try {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
        from > to
      )
        return undefined;
      const result = calendarDateRangeToUtc(
        from,
        shiftCalendarDate(to, 1),
        timezone,
      );
      if (Date.parse(result.to) - Date.parse(result.from) > 366 * 86_400_000)
        return undefined;
      return result;
    } catch {
      return undefined;
    }
  }, [from, to, timezone]);
  const subject =
    query.subject === "self"
      ? { kind: "self" as const }
      : { kind: "competitor" as const, name: query.subject.slice("competitor:".length) };
  useEffect(() => () => downloadRef.current?.abort(), []);
  // Export is now fixed to the current question/model/date, so the existing
  // scoped GET summary supplies availability without a second editable catalog.
  const availability = trpc.monitoring.summary.useQuery({
    monitorId: query.monitorId || "00000000-0000-0000-0000-000000000000",
    from: new Date(bounds?.from || 0), to: new Date(bounds?.to || 0), subject,
    questionId: query.question, platformId: query.model,
  }, { enabled: Boolean(bounds && query.monitorId && query.question), refetchOnWindowFocus: false });
  const catalog: Catalog | undefined = availability.data ? {
    questions: availability.data.filters.questions,
    platforms: availability.data.filters.platforms.map(item => ({ ...item, label: item.displayName })),
  } : undefined;
  const catalogLoading = availability.isLoading;
  const readError = availability.error ? "暂时无法读取当前范围，请重试。" : "";
  const visibleQuestions =
    catalog?.questions.filter(
      (option) =>
        (!query.question || option.id === query.question) && (!query.questionCategory || option.category === query.questionCategory),
    ) ?? [];
  const invalidSelection = Boolean(catalog) && (
    questionIds?.some((id) => !visibleQuestions.some((q) => q.id === id)) ||
    platformIds?.some((id) => !catalog?.platforms.some((p) => p.id === id)));
  const canDownload = Boolean(
    query.question &&
      bounds &&
      catalog &&
      !catalogLoading &&
      !downloading &&
      questionIds?.length !== 0 &&
      platformIds?.length !== 0 &&
      !invalidSelection &&
      (availability.data?.metrics.answers || 0) > 0 &&
      visibleQuestions.length &&
      catalog.platforms.length,
  );
  const close = () => {
    downloadRef.current?.abort();
    onClose();
  };
  async function download() {
    if (!canDownload || lockedRef.current || !bounds) return;
    lockedRef.current = true;
    setDownloading(true);
    setError("");
    const abort = new AbortController();
    downloadRef.current = abort;
    try {
      const response = await fetch(endpoint("/report.xlsx"), {
        method: "POST",
        credentials: "same-origin",
        headers: transport.headers,
        signal: abort.signal,
        body: JSON.stringify({
          ...bounds,
          subject,
          questionCategory: query.questionCategory,
          questionIds,
          platformIds,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string" &&
          /[\u4e00-\u9fff]/u.test(payload.error)
            ? payload.error
            : "报告下载失败，请稍后重试",
        );
      }
      if (!response.headers.get("content-type")?.includes("spreadsheetml"))
        throw new Error("报告读取失败，请重试");
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${monitorName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")}-监控报告-${from}-${to}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
      onClose();
    } catch (reason) {
      if (!abort.signal.aborted)
        setError(reason instanceof Error ? reason.message : "下载失败，请重试");
    } finally {
      lockedRef.current = false;
      if (!abort.signal.aborted) setDownloading(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="fm-report-download-dialog"
        style={{ "--module-accent": "#2867a5" } as CSSProperties}
      >
        <DialogHeader>
          <DialogTitle>
            <FileSpreadsheet size={21} />
            下载监控报告
          </DialogTitle>
          <DialogDescription>
            导出当前问题在所选模型和日期范围内的已有结果
          </DialogDescription>
        </DialogHeader>
        <div className="fm-report-download-body">
          <dl className="fm-report-current-scope">
            <div><dt>监控问题</dt><dd>{monitorName}</dd></div>
            <div><dt>模型</dt><dd>{query.model ? (modelLabel || catalog?.platforms.find(item => item.id === query.model)?.label || "当前所选模型") : "全部模型"}</dd></div>
            <div><dt>日期</dt><dd>{from} 至 {to}</dd></div>
          </dl>
          <p className="fm-report-note">范围与页面筛选一致。如需调整，请返回页面修改模型或日期。</p>
          {!bounds && (
            <p role="alert" className="fm-report-error">
              请选择有效日期范围，最长 366 天。
            </p>
          )}
          {catalogLoading && (
            <p className="fm-report-note" role="status">
              正在读取问题和模型…
            </p>
          )}
          {catalog && !availability.data?.metrics.answers && <p className="fm-report-note">当前筛选范围没有回答数据。</p>}
          {invalidSelection && (
            <p role="alert" className="fm-report-error">
              当前筛选范围没有可导出的匹配数据，请返回页面调整筛选。
            </p>
          )}
          {(error || readError) && (
            <div role="alert" className="fm-report-error">
              {error || readError}
              {!catalog && (
                <button
                  type="button"
                  onClick={() => void availability.refetch()}
                >
                  重试
                </button>
              )}
            </div>
          )}
          <div className="fm-report-includes">
            <FileSpreadsheet size={18} />
            <div>
              <strong>合并为一个 Excel 文件</strong>
              <p>
                问答明细、媒体统计、内容统计、信源明细及两份字段说明。仅整理已有结果。
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="operatorOutline" onClick={close}>
            {downloading ? "取消下载" : "取消"}
          </Button>
          <Button
            variant="operator"
            disabled={!canDownload}
            onClick={() => void download()}
          >
            {downloading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {downloading ? "正在整理报告…" : "下载 Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
