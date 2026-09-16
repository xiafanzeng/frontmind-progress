import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Download, FileSpreadsheet, Loader2, Search } from "lucide-react";
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
const categories: Record<string, string> = {
  industry: "行业排名词",
  competitor_comparison: "竞品对比词",
  reputation: "美誉舆情词",
  product_scenario: "产品场景词",
};

function Selection({
  title,
  options,
  selected,
  onChange,
  disabled,
}: {
  title: string;
  options: Option[];
  selected: string[] | undefined;
  onChange: (ids: string[] | undefined) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const matches = options.filter((option) =>
    option.label
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const selectedIds = selected ?? options.map((option) => option.id);
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  return (
    <section className="fm-report-selection">
      <div className="fm-report-selection-heading">
        <h3>{title}</h3>
        <span>
          已选 {selectedIds.length} / {options.length}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(undefined)}
        >
          全选
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange([])}>
          清空
        </button>
      </div>
      <label className="fm-report-search">
        <Search size={16} />
        <input
          aria-label={`搜索${title}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`搜索${title}`}
        />
      </label>
      <div className="fm-report-options">
        {matches.map((option) => (
          <label
            key={option.id}
            className={`fm-report-option${selectedIds.includes(option.id) ? " is-selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(option.id)}
              disabled={disabled}
              onChange={() => toggle(option.id)}
            />
            <span>
              {option.label}
              <small>
                {option.clientType
                  ? option.clientType === "web"
                    ? "网页版"
                    : "手机版"
                  : (categories[option.category ?? ""] ?? "未分类")}
              </small>
            </span>
          </label>
        ))}
        {!matches.length && <p className="fm-report-empty">暂无匹配{title}</p>}
      </div>
    </section>
  );
}

export default function MonitoringReportDialog({
  query,
  timezone,
  monitorName,
  onClose,
}: {
  query: MonitoringQueryState;
  timezone: string;
  monitorName: string;
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
  const [from, setFrom] = useState(query.from);
  const [to, setTo] = useState(() => shiftCalendarDate(query.to, -1));
  const [questionIds, setQuestionIds] = useState<string[] | undefined>(
    query.question ? [query.question] : undefined,
  );
  const [platformIds, setPlatformIds] = useState<string[] | undefined>(
    query.model ? [query.model] : undefined,
  );
  const [catalog, setCatalog] = useState<Catalog>();
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
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
      ? { kind: "self" }
      : { kind: "competitor", name: query.subject.slice("competitor:".length) };
  useEffect(() => () => downloadRef.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController();
    if (!bounds) {
      setCatalog(undefined);
      return;
    }
    setCatalogLoading(true);
    setError("");
    fetch(endpoint("/report-options"), {
      method: "POST",
      credentials: "same-origin",
      headers: transport.headers,
      signal: abort.signal,
      body: JSON.stringify({ ...bounds, subject }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("暂时无法读取筛选项，请重试");
        return response.json() as Promise<Catalog>;
      })
      .then((value) => {
        if (!abort.signal.aborted) setCatalog(value);
      })
      .catch((reason) => {
        if (!abort.signal.aborted) {
          setCatalog(undefined);
          setError(
            reason instanceof Error ? reason.message : "读取失败，请重试",
          );
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setCatalogLoading(false);
      });
    return () => abort.abort();
  }, [bounds, retry]);
  const visibleQuestions =
    catalog?.questions.filter(
      (option) =>
        !query.questionCategory || option.category === query.questionCategory,
    ) ?? [];
  const invalidSelection =
    questionIds?.some((id) => !visibleQuestions.some((q) => q.id === id)) ||
    platformIds?.some((id) => !catalog?.platforms.some((p) => p.id === id));
  const canDownload = Boolean(
    bounds &&
      catalog &&
      !catalogLoading &&
      !downloading &&
      questionIds?.length !== 0 &&
      platformIds?.length !== 0 &&
      !invalidSelection &&
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
            {monitorName} · 选择需要整理的问题、模型和日期范围
          </DialogDescription>
        </DialogHeader>
        <div className="fm-report-download-body">
          <div className="fm-report-date-fields">
            <label>
              开始日期
              <input
                type="date"
                value={from}
                disabled={downloading}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              结束日期
              <input
                type="date"
                value={to}
                disabled={downloading}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <p className="fm-report-note">
            包含起止日期，最多 366 天。按 {timezone} 统计。
            {query.questionCategory &&
              ` 当前类型：${categories[query.questionCategory]}。`}
          </p>
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
          {catalog && (
            <div className="fm-report-selections">
              <Selection
                title="监控问题"
                options={visibleQuestions}
                selected={questionIds}
                onChange={setQuestionIds}
                disabled={downloading || catalogLoading}
              />
              <Selection
                title="AI模型"
                options={catalog.platforms}
                selected={platformIds}
                onChange={setPlatformIds}
                disabled={downloading || catalogLoading}
              />
            </div>
          )}
          {invalidSelection && (
            <p role="alert" className="fm-report-error">
              部分选择不在当前日期范围内，请重新选择或点击全选。
            </p>
          )}
          {error && (
            <div role="alert" className="fm-report-error">
              {error}
              {!catalog && (
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
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
