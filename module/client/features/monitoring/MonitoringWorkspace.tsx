import { MonitoringOutcomeControlsContext } from "../../host-runtime";
import { useBusinessWorkspace } from "../../host-runtime";
import {
  BarChart3,
  ChevronRight,
  Download,
  Edit3,
  Medal,
  Pause,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  formatDateTime,
  monitorStatusLabel,
  type MonitorRun,
  type MonitorSummary,
  type ProjectSummary,
  type RunAttempt,
} from "../../domain";
import { KEYWORD_CATEGORY_OPTIONS } from "@frontmind/module-ui/keyword-categories";
import { buildSentimentInsights } from "../../components/AnswerInsights";
import MonitoringFilterBar from "./MonitoringFilterBar";
import MonitoringReportDialog from "./MonitoringReportDialog";
import TrendPanel from "./panels/TrendPanel";
import AnswerDetailPanel from "./panels/AnswerDetailPanel";
import MonitoringScopeFilters from "./MonitoringScopeFilters";
import MonitoringRunStatus from "./MonitoringRunStatus";
import QuestionDetailWorkspace from "./QuestionDetailWorkspace";
import MonitoringMetricCards from "./panels/MonitoringMetricCards";
import OverviewWorkspace from "./overview/OverviewWorkspace";
import {
  monitoringDateWindow,
  monitoringExportHref,
  monitoringQueryString,
  readMonitoringQuery,
  shiftCalendarDate,
  writeMonitoringQuery,
} from "./queryState";
import {
  filterAttempts,
  filterRunsByRange,
  projectAttemptsForRunSubject,
} from "./selectors";
import type {
  DateRange,
  MonitoringQueryContext,
  MonitoringQueryState,
} from "./types";
import { attemptModelKey } from "./types";
import { useMonitoringDataSource } from "./useMonitoringDataSource";
import "./monitoring.css";
import "./reference-ui.css";
import "@frontmind/module-ui/dashboard/resource-reading-layout.css";

type MonitoringWorkspaceProps = {
  analysisOnly?: boolean;
  renderReport?: (runId?: string) => ReactNode;
  configurationTools?: ReactNode;
  initialTab?: "overview" | "trends";
  project: ProjectSummary;
  monitors: MonitorSummary[];
  deletedCount: number;
  latestRun?: MonitorRun;
  recentRuns: MonitorRun[];
  selectedRunId?: string;
  loading?: boolean;
  serverData?: boolean;
  canRefresh: boolean;
  onSelectedRunChange?: (runId: string) => void;
  onSelectedMonitorChange?: (monitor?: MonitorSummary) => void;
  onAdd: () => void;
  onOpenRecycle: () => void;
  onOpenDetails: (monitor: MonitorSummary) => void;
  onOpenRun: (monitor: MonitorSummary, runId: string) => void;
  onRun: (monitor: MonitorSummary) => void;
  onToggle: (monitor: MonitorSummary) => void;
  onDelete: (monitor: MonitorSummary) => void;
  onRefresh: () => Promise<void>;
  selectionRequest?: { monitorId: string; runId?: string; nonce: number };
};

type MonitoringDataSourceHook = typeof useMonitoringDataSource;

function readWorkspaceQuery(search: string, context: MonitoringQueryContext, analysisOnly: boolean) {
  const detail = !analysisOnly && new URLSearchParams(search).get("tab") === "answers";
  return readMonitoringQuery(search, detail ? { ...context, allowUnresolved: true } : context);
}

function usePreviewMonitoringDataSource(): ReturnType<MonitoringDataSourceHook> {
  return {
    summary: undefined,
    catalogSummary: undefined,
    questionCatalogSummary: undefined,
    questionCatalogReady: true,
    attempts: [],
    detailAttempt: undefined,
    analysis: undefined,
    summaryReady: true,
    answersReady: true,
    answerDetailLoading: false,
    answerDetailError: false,
    retryAnswerDetail: () => undefined,
    answerDetailSettled: true,
    hasMoreAnswers: false,
    loadingMoreAnswers: false,
    loadMoreAnswers: async () => ({ attempts: [], hasMore: false }),
    loading: false,
    error: undefined,
    refresh: async () => undefined,
  };
}

export function runCollection(
  runs: MonitorRun[],
  latestRun: MonitorRun | undefined,
) {
  const result = new Map(runs.map((run) => [run.id, run]));
  if (latestRun) result.set(latestRun.id, latestRun);
  return [...result.values()].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt) || 0;
    const rightTime = Date.parse(right.createdAt) || 0;
    return rightTime - leftTime;
  });
}

function previewExportHref(attempts: RunAttempt[]) {
  if (!attempts.length) return;
  const escape = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    [
      "问题",
      "模型",
      "客户端",
      "重复次数",
      "状态",
      "提及",
      "位置",
      "引用数",
      "回答",
    ],
    ...attempts.map((attempt) => [
      attempt.question,
      attempt.platformName,
      attempt.clientType,
      attempt.repetition,
      attempt.status,
      attempt.brandMentioned === undefined
        ? ""
        : attempt.brandMentioned
          ? "是"
          : "否",
      attempt.mentionPosition ?? "",
      attempt.sources.length,
      attempt.answer || attempt.answerPreview || "",
    ]),
  ];
  const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}`)}`;
}

function MonitoringWorkspaceController({
  project,
  monitors,
  deletedCount,
  latestRun,
  recentRuns,
  selectedRunId,
  loading,
  serverData = false,
  canRefresh,
  onSelectedRunChange,
  onSelectedMonitorChange,
  onAdd,
  onOpenRecycle,
  onOpenDetails,
  onOpenRun,
  onRun,
  onToggle,
  onDelete,
  onRefresh,
  selectionRequest,
  useDataSource,
  analysisOnly = false,
  initialTab,
  renderReport,
  configurationTools,
}: MonitoringWorkspaceProps & { useDataSource: MonitoringDataSourceHook }) {
  const { isWorkbench, task } = useBusinessWorkspace();
  const outcomeControls = useContext(MonitoringOutcomeControlsContext);
  const [monitorSearch, setMonitorSearch] = useState("");
  const [monitorPage, setMonitorPage] = useState(0);
  const allRuns = useMemo(
    () => runCollection(recentRuns, latestRun),
    [latestRun, recentRuns],
  );
  const baseContext = useMemo<MonitoringQueryContext>(
    () => ({
      project,
      monitors,
      runs: allRuns,
      currentRun: latestRun,
      allowUnresolved: serverData,
    }),
    [allRuns, latestRun, serverData, monitors, project],
  );
  const initialSearchRef = useRef(
    (() => {
      const search = isWorkbench
        ? typeof task?.state?.values.monitoringQuery === "string"
          ? task.state.values.monitoringQuery
          : ""
        : typeof window === "undefined"
          ? ""
          : window.location.search;
      const params = new URLSearchParams(search);
      if (initialTab) params.set("tab", initialTab);
      return params.toString();
    })(),
  );
  const hasHydratedDataRef = useRef(monitors.length > 0);
  const [query, setQuery] = useState<MonitoringQueryState>(() =>
    readWorkspaceQuery(initialSearchRef.current, baseContext, analysisOnly),
  );
  const detailActive = !analysisOnly && query.tab === "answers";
  const queryRef = useRef(query);
  const detailMonitorRef = useRef<string | undefined>(undefined);
  const pendingRunSelectionRef = useRef<string | undefined>(undefined);
  const initializedCategoryMonitorRef = useRef<string | undefined>(undefined);
  const live = useDataSource({
    enabled: serverData && !detailActive,
    query,
    timezone: project.timezone,
  });
  const context = useMemo<MonitoringQueryContext>(() => {
    const remoteSubjects = live.summary?.filters.subjects.map((item) =>
      item.kind === "self"
        ? ("self" as const)
        : (`competitor:${item.name}` as const),
    );
    return {
      ...baseContext,
      attempts: serverData
        ? live.detailAttempt
          ? [
              ...live.attempts.filter(
                (attempt) => attempt.id !== live.detailAttempt?.id,
              ),
              live.detailAttempt,
            ]
          : live.attempts
        : undefined,
      runIds: serverData
        ? live.attempts.flatMap((attempt) =>
            attempt.runId ? [attempt.runId] : [],
          )
        : undefined,
      questionIds: serverData
        ? [
            ...new Set(
              [
                ...(live.catalogSummary?.filters.questions || []),
                ...(live.questionCatalogSummary?.filters.questions || []),
                ...(live.summary?.filters.questions || []),
              ].map((item) => item.id),
            ),
          ]
        : undefined,
      questionCategories: serverData
        ? Object.fromEntries(
            live.catalogSummary?.filters.questions.map((item) => [
              item.id,
              item.category,
            ]) || [],
          )
        : undefined,
      modelIds: serverData
        ? live.summary?.filters.platforms.map((item) => item.id)
        : undefined,
      subjects: remoteSubjects,
      allowUnresolved:
        serverData &&
        (live.answerDetailError ||
          !(
            live.summaryReady &&
            live.answersReady &&
            live.answerDetailSettled
          )),
    };
  }, [
    baseContext,
    live.answerDetailSettled,
    live.answerDetailError,
    live.detailAttempt,
    live.answersReady,
    live.attempts,
    live.summary,
    live.catalogSummary,
    live.questionCatalogSummary,
    live.summaryReady,
    serverData,
  ]);
  const [visibleMonitorIds, setVisibleMonitorIds] = useState<string[]>(
    monitors.map((monitor) => monitor.id),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  useEffect(() => { setReportDialogOpen(false); }, [query.monitorId, project.id]);
  const detailRef = useRef<HTMLElement>(null);
  const reportView = Boolean(renderReport);
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [reportView, query.monitorId]);

  // The monitoring list is restored asynchronously on the production route.
  // Keep the visibility set in sync when that first payload arrives; otherwise
  // a valid selected monitor can be hidden behind the empty-state panel.
  useEffect(() => {
    const nextIds = monitors.map((monitor) => monitor.id);
    setVisibleMonitorIds((currentIds) =>
      currentIds.length === nextIds.length &&
      currentIds.every((id, index) => id === nextIds[index])
        ? currentIds
        : nextIds,
    );
  }, [monitors]);

  const normalize = useCallback(
    (candidate: MonitoringQueryState) =>
      readWorkspaceQuery(monitoringQueryString(candidate), context, analysisOnly),
    [context, analysisOnly],
  );

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const updateQuery = useCallback(
    (
      patch:
        | Partial<MonitoringQueryState>
        | ((current: MonitoringQueryState) => Partial<MonitoringQueryState>),
      mode: "push" | "replace" = "push",
    ) => {
      const current = queryRef.current;
      const nextPatch = typeof patch === "function" ? patch(current) : patch;
      const next = normalize({ ...current, ...nextPatch });
      queryRef.current = next;
      setQuery(next);
      if (isWorkbench && task)
        void task
          .saveState({
            values: { monitoringQuery: monitoringQueryString(next) },
          })
          .catch(() => undefined);
      else writeMonitoringQuery(next, mode);
    },
    [normalize, isWorkbench, task],
  );

  useEffect(() => {
    if (!monitors.length || hasHydratedDataRef.current) return;
    hasHydratedDataRef.current = true;
    const next = readWorkspaceQuery(initialSearchRef.current, context, analysisOnly);
    queryRef.current = next;
    setQuery(next);
    if (!isWorkbench) writeMonitoringQuery(next, "replace");
  }, [context, monitors.length]);

  // Deep links without a monitor parameter must still load data: adopt the
  // first visible monitor into the query so the live reads fire immediately.
  useEffect(() => {
    if (!monitors.length) return;
    if (
      query.monitorId &&
      monitors.some((monitor) => monitor.id === query.monitorId)
    )
      return;
    const fallback =
      monitors.find(
        (monitor) => isWorkbench || visibleMonitorIds.includes(monitor.id),
      ) || monitors[0]!;
    updateQuery({ monitorId: fallback.id }, "replace");
  }, [monitors, query.monitorId, visibleMonitorIds, isWorkbench, updateQuery]);

  useEffect(() => {
    if (!hasHydratedDataRef.current) return;
    const current = queryRef.current;
    const next = normalize(current);
    if (monitoringQueryString(next) === monitoringQueryString(current)) return;
    queryRef.current = next;
    setQuery(next);
    if (!isWorkbench) writeMonitoringQuery(next, "replace");
  }, [normalize]);

  useEffect(() => {
    if (!selectionRequest) return;
    pendingRunSelectionRef.current = selectionRequest.runId;
    updateQuery({
      monitorId: selectionRequest.monitorId,
      runId: selectionRequest.runId,
      ...(selectionRequest.runId
        ? {
            tab: "answers" as const,
            range: "7d" as const,
            ...monitoringDateWindow("7d", project.timezone),
            subject: "self" as const,
            sourceScope: "all" as const,
          }
        : {}),
      question: undefined,
      questionCategory: undefined,
      model: undefined,
      answerQuestion: undefined,
      answerId: undefined,
      fullscreen: false,
    });
  }, [selectionRequest?.nonce]);

  useEffect(() => {
    if (detailActive) { pendingRunSelectionRef.current = undefined; return; }
    const requestedRunId = pendingRunSelectionRef.current;
    if (!requestedRunId || query.runId !== requestedRunId) return;
    const attempts = serverData
      ? live.attempts
      : (allRuns.find((item) => item.id === requestedRunId)?.attempts ?? []);
    const firstAttempt = attempts.find(
      (attempt) => attempt.runId === requestedRunId,
    );
    if (!firstAttempt) return;
    // The previous answers may still be cached when a new run is submitted.
    // Select its first actual attempt once it reaches the read API, then let
    // ordinary pagination and answer selection remain under user control.
    pendingRunSelectionRef.current = undefined;
    updateQuery(
      {
        answerQuestion: firstAttempt.questionId,
        answerId: firstAttempt.id,
      },
      "replace",
    );
  }, [detailActive, allRuns, live.attempts, query.runId, serverData, updateQuery]);

  useEffect(() => {
    if (isWorkbench) return;
    const onPopState = () => {
      const next = readWorkspaceQuery(window.location.search, context, analysisOnly);
      queryRef.current = next;
      setQuery(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [context, isWorkbench, analysisOnly]);

  const selectedMonitor = monitors.find(
    (monitor) => monitor.id === query.monitorId,
  );
  const visibleSelectedMonitor =
    selectedMonitor &&
    (isWorkbench || visibleMonitorIds.includes(selectedMonitor.id))
      ? selectedMonitor
      : undefined;
  const monitorRuns = allRuns.filter(
    (run) => run.monitorId === selectedMonitor?.id,
  );
  const rangedRuns = filterRunsByRange(
    monitorRuns,
    query.range,
    query.from,
    query.to,
    project.timezone,
  );
  const run =
    rangedRuns.find((item) => item.id === query.runId) || rangedRuns[0];
  const previewSubject = query.subject.startsWith("competitor:")
    ? run?.config.competitors.find(
        (competitor) =>
          competitor.name === query.subject.slice("competitor:".length),
      ) || "self"
    : "self";
  const filteredAttempts = serverData
    ? live.attempts.filter(
        (attempt) =>
          (!query.question || attempt.questionId === query.question) &&
          (!query.questionCategory ||
            attempt.questionCategory === query.questionCategory) &&
          (!query.model || attemptModelKey(attempt) === query.model),
      )
    : rangedRuns.flatMap((item) =>
        filterAttempts(item, query.question, query.model).filter(
          (attempt) =>
            !query.questionCategory ||
            attempt.questionCategory === query.questionCategory,
        ),
      );
  const analyticsAttempts = serverData
    ? []
    : rangedRuns.flatMap((item) =>
        filterAttempts(item, query.question, query.model).filter(
          (attempt) =>
            !query.questionCategory ||
            attempt.questionCategory === query.questionCategory,
        ),
      );
  const scopedAnswerAttempts = serverData
    ? filteredAttempts
    : rangedRuns.flatMap((item) =>
        projectAttemptsForRunSubject(
          filterAttempts(item, query.question, query.model).filter(
            (attempt) =>
              !query.questionCategory ||
              attempt.questionCategory === query.questionCategory,
          ),
          previewSubject,
          item.config.competitors,
        ),
      );
  const visibleAnswerAttempts = scopedAnswerAttempts.filter(
    (attempt) =>
      attempt.status === "completed" &&
      Boolean((attempt.answer || attempt.answerPreview)?.trim()),
  );
  const visibleMetricAttempts = serverData
    ? analyticsAttempts
    : rangedRuns.flatMap((item) =>
        projectAttemptsForRunSubject(
          filterAttempts(item, query.question, query.model).filter(
            (attempt) =>
              !query.questionCategory ||
              attempt.questionCategory === query.questionCategory,
          ),
          previewSubject,
          item.config.competitors,
        ),
      );
  const requestedAnswerPending = Boolean(
    serverData &&
      query.answerId &&
      (!live.answerDetailSettled || live.answerDetailError) &&
      !live.detailAttempt &&
      !visibleAnswerAttempts.some((attempt) => attempt.id === query.answerId),
  );
  const selectedAttempt = requestedAnswerPending
    ? undefined
    : (serverData &&
        live.detailAttempt?.id === query.answerId &&
        live.detailAttempt?.status === "completed" &&
        Boolean(live.detailAttempt.answer?.trim()) &&
        live.detailAttempt) ||
      visibleAnswerAttempts.find((attempt) => attempt.id === query.answerId) ||
      visibleAnswerAttempts.find(
        (attempt) =>
          attempt.questionId === query.answerQuestion &&
          attempt.status === "completed" &&
          attempt.answer?.trim(),
      ) ||
      visibleAnswerAttempts.find(
        (attempt) => attempt.questionId === query.answerQuestion,
      ) ||
      visibleAnswerAttempts[0];
  useEffect(() => {
    if (detailActive) return;
    if (
      serverData &&
      (!live.answersReady ||
        (query.answerId &&
          (!live.answerDetailSettled || live.answerDetailError)))
    )
      return;
    if (selectedAttempt && selectedAttempt.id !== query.answerId)
      updateQuery(
        {
          answerId: selectedAttempt.id,
          answerQuestion: selectedAttempt.questionId,
        },
        "replace",
      );
  }, [
    detailActive,
    serverData,
    live.answersReady,
    live.answerDetailSettled,
    live.answerDetailError,
    selectedAttempt?.id,
    query.answerId,
    updateQuery,
  ]);
  const exportHref = serverData
    ? live.summary?.metrics.attempts
      ? monitoringExportHref(query, project.timezone)
      : undefined
    : previewExportHref(
        query.tab === "answers" ? visibleAnswerAttempts : visibleMetricAttempts,
      );

  useEffect(() => {
    // The host may recreate this callback while polling. In question detail,
    // re-notifying the same monitor would jump back to its latest run.
    if (!analysisOnly && detailMonitorRef.current === selectedMonitor?.id) return;
    detailMonitorRef.current = selectedMonitor?.id;
    onSelectedMonitorChange?.(selectedMonitor);
  }, [detailActive, onSelectedMonitorChange, selectedMonitor]);

  useEffect(() => {
    if (query.runId && query.runId !== selectedRunId) {
      onSelectedRunChange?.(query.runId);
    }
  }, [onSelectedRunChange, query.runId, selectedRunId]);

  const matchingMonitors = monitors.filter((monitor) =>
    monitor.name
      .toLocaleLowerCase()
      .includes(monitorSearch.trim().toLocaleLowerCase()),
  );
  const allQuestionOptions = serverData
    ? live.catalogSummary?.filters.questions || []
    : [
        ...new Map(
          monitorRuns.flatMap((item) =>
            item.attempts.map(
              (attempt) =>
                [
                  attempt.questionId,
                  {
                    id: attempt.questionId,
                    label: attempt.question,
                    category: attempt.questionCategory,
                  },
                ] as const,
            ),
          ),
        ).values(),
      ];
  const questionOptions = serverData
    ? live.questionCatalogSummary?.filters.questions || []
    : query.questionCategory
      ? allQuestionOptions.filter(
          (question) => question.category === query.questionCategory,
        )
      : allQuestionOptions;
  const showIndustryMetrics = query.questionCategory === "industry";
  useEffect(() => {
    if (serverData && !live.questionCatalogReady) return;
    if (!analysisOnly) {
      if (detailActive) return;
      // 普通监控默认“全部问题”，不强制选择首题；仍需清理目录中已不存在的过期引用。
      // “全部问题”下的正常回答选择（answerQuestion 有效）必须保留，否则会与
      // 概览回答自动选择互相覆写。
      const questionValid =
        !query.question ||
        questionOptions.some((question) => question.id === query.question);
      const answerQuestionValid =
        !query.answerQuestion ||
        questionOptions.some((question) => question.id === query.answerQuestion);
      if (questionValid && answerQuestionValid) return;
      if (
        query.question ||
        query.answerQuestion ||
        query.answerId ||
        query.fullscreen
      ) {
        updateQuery(
          {
            question: undefined,
            answerQuestion: undefined,
            answerId: undefined,
            fullscreen: false,
          },
          "replace",
        );
      }
      return;
    }
    const first =
      questionOptions.find((question) => question.id === query.question) ||
      questionOptions[0];
    if (!first) {
      if (
        query.question ||
        query.answerQuestion ||
        query.answerId ||
        query.fullscreen
      ) {
        updateQuery(
          {
            question: undefined,
            answerQuestion: undefined,
            answerId: undefined,
            fullscreen: false,
          },
          "replace",
        );
      }
      return;
    }
    if (initializedCategoryMonitorRef.current !== query.monitorId) {
      initializedCategoryMonitorRef.current = query.monitorId;
      if (!query.questionCategory && first.category) {
        updateQuery(
          {
            questionCategory: first.category,
            question: first.id,
            answerQuestion: first.id,
            answerId: undefined,
          },
          "replace",
        );
        return;
      }
    }
    if (
      query.question &&
      questionOptions.some((question) => question.id === query.question)
    )
      return;
    updateQuery(
      { question: first.id, answerQuestion: first.id, answerId: undefined },
      "replace",
    );
  }, [
    analysisOnly,
    detailActive,
    serverData,
    live.questionCatalogReady,
    query.monitorId,
    query.question,
    query.questionCategory,
    query.answerQuestion,
    query.answerId,
    query.fullscreen,
    questionOptions.map((question) => question.id).join(","),
    updateQuery,
  ]);

  const selectMonitor = (monitorId: string) => {
    updateQuery({
      monitorId,
      runId: undefined,
      question: undefined,
      questionCategory: undefined,
      model: undefined,
      answerQuestion: undefined,
      answerId: undefined,
      fullscreen: false,
    });
    if (!window.matchMedia?.("(max-width: 900px)").matches) return;
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      detailRef.current?.focus({ preventScroll: true });
    });
  };

  const changeRange = (range: DateRange) => {
    if (range === "custom") {
      updateQuery({ range });
      return;
    }
    updateQuery({ range, ...monitoringDateWindow(range, project.timezone) });
  };

  const refresh = async () => {
    if (refreshing || !canRefresh) return;
    setRefreshing(true);
    setRefreshMessage("");
    try {
      await onRefresh();
      if (serverData && !detailActive) await live.refresh();
      setRefreshMessage("已刷新");
    } finally {
      setRefreshing(false);
    }
  };

  const detailNavigation = !analysisOnly && (
    <nav className="fm-tabs fm-qa-navigation" aria-label="问题监控视图">
      <button id="monitor-tab-overview" type="button" aria-pressed={!detailActive} className={!detailActive ? "active" : ""} onClick={() => updateQuery({ tab: "overview", fullscreen: false })}>概览</button>
      <button id="monitor-tab-answers" type="button" aria-pressed={detailActive} className={detailActive ? "active" : ""} onClick={() => updateQuery({ tab: "answers", fullscreen: false })}>问答明细</button>
    </nav>
  );

  return (
    <div
      className={`fm-monitoring-workspace ${!analysisOnly ? "fm-progress-frame" : ""} ${renderReport ? "is-report-view" : ""} ${detailActive ? "is-question-detail" : ""} ${isWorkbench ? "is-conversation-flow" : ""} resource-reading-layout fm-resource-reading ${monitors.length ? "" : "is-empty"} ${refreshing || loading || live.loading ? "is-refreshing" : ""}`}
      aria-busy={Boolean(refreshing || loading || live.loading)}
      data-refreshing={
        refreshing || loading || live.loading ? "true" : undefined
      }
    >
      {reportDialogOpen && serverData && selectedMonitor && (
        <MonitoringReportDialog key={`${project.id}:${query.monitorId}`} query={query} timezone={project.timezone} monitorName={selectedMonitor.name} onClose={() => setReportDialogOpen(false)} />
      )}
      <section
        ref={detailRef}
        className="fm-monitor-detail resource-reading-main"
        data-resource-pane="main"
        aria-label="所选监控工作台"
        tabIndex={-1}
      >
        {renderReport ? renderReport(query.runId || selectedMonitor?.lastRun?.id) : visibleSelectedMonitor ? (
          <>
            <header className="fm-monitor-hero">
              <div>
                <div className="fm-monitor-title-row">
                  <h2>{visibleSelectedMonitor.name}</h2>
                  <span
                    className={`fm-status-chip ${visibleSelectedMonitor.status}`}
                  >
                    {visibleSelectedMonitor.lastRun?.status === "running" ? "运行中" : monitorStatusLabel(visibleSelectedMonitor.status)}
                  </span>
                </div>
                <p>
                  <span>{project.brandName}</span>
                  <i />
                  <span>{visibleSelectedMonitor.scheduleLabel}</span>
                  <i />
                  <span>每平台 {visibleSelectedMonitor.repetitions} 次</span>
                  <i />
                  <span>
                    最近完成{" "}
                    {formatDateTime(
                      monitorRuns.find(item => item.completedAt && ["completed", "partial_completed"].includes(item.status))?.completedAt || visibleSelectedMonitor.lastRun?.completedAt,
                    )}
                  </span>
                </p>
              </div>
              <div className="fm-monitor-actions" hidden={analysisOnly}>
                <button
                  type="button"
                  className="fm-primary-button fm-report-button"
                  disabled={!serverData || !query.monitorId}
                  title={!serverData ? "演示数据不提供报告下载" : undefined}
                  onClick={() => setReportDialogOpen(true)}
                >
                  <Download size={14} /> 下载报告
                </button>
                <details className="fm-monitor-more"><summary>更多</summary><div>                <span aria-live="polite">
                  {refreshing ? "正在刷新" : refreshMessage}
                </span>
                <button
                  type="button"
                  className="fm-icon-button"
                  disabled={!canRefresh || refreshing}
                  onClick={() => void refresh()}
                  aria-label={refreshing ? "正在刷新当前监控" : "刷新当前监控"}
                >
                  <RefreshCw
                    size={15}
                    className={refreshing ? "is-spinning" : ""}
                  />
                </button>
                {visibleSelectedMonitor.status !== "draft" &&
                  visibleSelectedMonitor.scheduleType !== "none" && (
                    <button
                      type="button"
                      className="fm-secondary-button"
                      onClick={() => onToggle(visibleSelectedMonitor)}
                    >
                      {visibleSelectedMonitor.status === "paused" ? (
                        <Play size={14} />
                      ) : (
                        <Pause size={14} />
                      )}
                      {visibleSelectedMonitor.status === "paused"
                        ? "恢复计划"
                        : "暂停计划"}
                    </button>
                  )}
                <button
                  type="button"
                  className="fm-icon-button"
                  onClick={() => onDelete(visibleSelectedMonitor)}
                  aria-label="删除当前监控"
                >
                  <Trash2 size={15} />
                </button>
</div></details>
                <button
                  type="button"
                  className="fm-secondary-button"
                  onClick={() => onOpenDetails(visibleSelectedMonitor)}
                >
                  <Edit3 size={14} /> 编辑配置
                </button>
                <button
                  type="button"
                  className="fm-primary-button"
                  disabled={visibleSelectedMonitor.lastRun?.status === "running"}
                  onClick={() => onRun(visibleSelectedMonitor)}
                >
                  <Play size={15} /> {visibleSelectedMonitor.lastRun?.status === "running" ? "正在运行" : "立即运行"}
                </button>
              </div>
            </header>
            {!analysisOnly && <MonitoringRunStatus monitor={visibleSelectedMonitor} runs={monitorRuns} onView={(runId) => updateQuery({ tab: "answers", runId, answerQuestion: undefined, answerId: undefined, fullscreen: false })} />}
            <div className="fm-monitor-body">
              {serverData && !detailActive && live.error && (
                <div className="fm-data-notice" role="alert">
                  实时监控数据读取失败：{live.error}
                </div>
              )}
              {detailActive ? (
                <QuestionDetailWorkspace
                  key={`${project.id}:${query.monitorId}`}
                  project={project}
                  query={query}
                  runs={allRuns}
                  serverData={serverData}
                  onChange={updateQuery}
                  navigation={detailNavigation}
                />
              ) : <>
              {!analysisOnly ? <MonitoringScopeFilters project={project} query={query} run={run} summary={serverData ? live.catalogSummary : undefined} questions={allQuestionOptions} onChange={updateQuery} navigation={detailNavigation} navigationFirst /> : <MonitoringFilterBar
                project={project}
                run={run}
                summary={serverData ? live.catalogSummary : undefined}
                hideQuestion
                question={query.question}
                model={query.model}
                range={query.range}
                from={query.from}
                to={query.to}
                subject={query.subject}
                onQuestionChange={(question) =>
                  updateQuery({
                    question,
                    answerQuestion: question,
                    answerId: undefined,
                  })
                }
                onModelChange={(model) =>
                  updateQuery({ model, answerId: undefined })
                }
                onRangeChange={changeRange}
                onDateWindowChange={(from, to) => {
                  if (from && to && from < to)
                    updateQuery({ range: "custom", from, to });
                }}
                onSubjectChange={(subject) => updateQuery({ subject })}
              />}
              {!analysisOnly && <OverviewWorkspace
                project={project}
                monitor={visibleSelectedMonitor}
                query={query}
                summary={serverData ? live.summary : undefined}
                catalog={serverData ? live.catalogSummary : undefined}
                runs={rangedRuns}
                serverData={serverData}
                onChange={updateQuery}
                onConfigure={() => onOpenDetails(visibleSelectedMonitor)}
                onReport={() => setReportDialogOpen(true)}
              />}
              {analysisOnly && <>
              {showIndustryMetrics && (
                <MonitoringMetricCards
                  monitor={visibleSelectedMonitor}
                  run={run}
                  attempts={visibleMetricAttempts}
                  subject={query.subject}
                  summary={serverData ? live.summary : undefined}
                />
              )}
              {analysisOnly && (
                <TrendPanel
                  runs={serverData ? [] : rangedRuns}
                  current={run}
                  subject={previewSubject}
                  timezone={project.timezone}
                  analysis={live.analysis}
                  exportHref={exportHref}
                  showSentiment={query.subject === "self"}
                  showIndustryMetrics={showIndustryMetrics}
                />
              )}
              <AnswerDetailPanel
                attempts={visibleAnswerAttempts}
                selected={selectedAttempt}
                fullscreen={query.fullscreen}
                onSelect={(attempt: RunAttempt) =>
                  updateQuery({
                    runId: attempt.runId || query.runId,
                    answerQuestion: attempt.questionId,
                    answerId: attempt.id,
                  })
                }
                onQuestionChange={(answerQuestion) =>
                  updateQuery({ answerQuestion, answerId: undefined })
                }
                onFullscreenChange={(fullscreen) => updateQuery({ fullscreen })}
                sourceScope={query.sourceScope}
                onSourceScopeChange={(sourceScope) =>
                  updateQuery({ sourceScope })
                }
                detailLoading={serverData && live.answerDetailLoading}
                detailError={serverData && live.answerDetailError}
                onRetryDetail={live.retryAnswerDetail}
                sentimentScopeLabel={[
                  questionOptions.find(
                    (question) => question.id === query.question,
                  )?.label || "全部问题",
                  query.from && query.to
                    ? `${query.from} 至 ${shiftCalendarDate(query.to, -1)}`
                    : "当前日期范围",
                  query.model
                    ? visibleAnswerAttempts.find(
                        (attempt) => attempt.platformId === query.model,
                      )?.platformName || "所选平台"
                    : "全部平台",
                ].join(" · ")}
                hasMoreAnswers={serverData && live.hasMoreAnswers}
                loadingMoreAnswers={live.loadingMoreAnswers}
                onLoadMoreAnswers={live.loadMoreAnswers}
                exportHref={exportHref}
                showSentiment={query.subject === "self"}
                totalAnswers={
                  serverData
                    ? live.summary?.metrics.answers
                    : visibleAnswerAttempts.length
                }
                scopeKey={`${query.monitorId}:${query.questionCategory}:${query.question}:${query.model}:${query.from}:${query.to}:${query.subject}`}
                sentiments={
                  serverData
                    ? live.summary?.metrics.sentiments
                    : buildSentimentInsights(visibleAnswerAttempts).counts
                }
              />
              </>}
              </>}

            </div>
          </>
        ) : monitors.length ? (
          <div className="fm-detail-empty">
            <RadioTower size={30} />
            <h2>没有匹配的监控</h2>
            <p>请调整搜索词或重新选择监控。</p>
          </div>
        ) : (
          <div className="fm-detail-empty">
            <RadioTower size={30} />
            <h2>添加第一个问题监控</h2>
            <p>配置问题、模型与执行计划后，这里将展示运行工作台。</p>
            {!analysisOnly && (
              <button
                type="button"
                className="fm-primary-button"
                onClick={onAdd}
              >
                <Plus size={16} /> 批量添加问题
              </button>
            )}
          </div>
        )}
      </section>
      <aside
        className="resource-outcomes monitoring-results-panel"
        data-resource-pane="outcomes"
        tabIndex={0}
        aria-label={analysisOnly ? "监控成果" : "监控配置"}
      >
        {outcomeControls}
        <header>
          <div>
            <span className="resource-outcomes-eyebrow">{analysisOnly ? "监控成果" : `${project.brandName} / 监控中心`}</span>
            <h3>{analysisOnly ? "选择查看范围" : "监控配置"}</h3>
          </div>
        </header>
        <label className="resource-outcomes-field">
          {analysisOnly && <span>监控配置</span>}
          <input
            type="search"
            aria-label="搜索监控配置"
            placeholder="搜索监控配置"
            value={monitorSearch}
            onChange={(event) => {
              setMonitorSearch(event.target.value);
              setMonitorPage(0);
            }}
          />
        </label>
        <div className="resource-result-list" aria-label="选择监控配置">
          {matchingMonitors
            .slice(monitorPage * 10, (monitorPage + 1) * 10)
            .map((monitor) => (
              <button
                type="button"
                key={monitor.id}
                aria-pressed={query.monitorId === monitor.id}
                onClick={() => selectMonitor(monitor.id)}
              >
                <strong>{monitor.name}</strong>
                <span>
                  {monitor.questionsCount} 个问题 · {monitor.platformsCount}{" "}
                  个平台 · {monitorStatusLabel(monitor.status)}
                </span>
              </button>
            ))}
          {!matchingMonitors.length && <p>没有匹配的监控配置。</p>}
        </div>
        {matchingMonitors.length > 10 && (
          <nav className="business-flow-pagination" aria-label="监控配置分页">
            <button
              disabled={monitorPage === 0}
              onClick={() => setMonitorPage((value) => value - 1)}
            >
              上一页
            </button>
            <span>
              {monitorPage + 1} / {Math.ceil(matchingMonitors.length / 10)}
            </span>
            <button
              disabled={(monitorPage + 1) * 10 >= matchingMonitors.length}
              onClick={() => setMonitorPage((value) => value + 1)}
            >
              下一页
            </button>
          </nav>
        )}
        {analysisOnly && <>
        <label className="resource-outcomes-field">
          <span>问题分类</span>
          <select
            aria-label="问题分类"
            value={query.questionCategory || ""}
            onChange={(event) =>
              updateQuery({
                questionCategory: KEYWORD_CATEGORY_OPTIONS.find(
                  (item) => item.key === event.target.value,
                )?.key,
                question: undefined,
                answerQuestion: undefined,
                answerId: undefined,
                fullscreen: false,
              })
            }
          >
            <option value="">全部分类</option>
            {KEYWORD_CATEGORY_OPTIONS.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label.replace(/词$/, "问题")}
              </option>
            ))}
          </select>
        </label>
        <label className="resource-outcomes-field">
          <span>监控问题</span>
          <select
            aria-label="按问题筛选回答"
            value={query.question || ""}
            onChange={(event) =>
              updateQuery({
                question: event.target.value || undefined,
                questionCategory:
                  query.questionCategory ||
                  questionOptions.find(
                    (question) => question.id === event.target.value,
                  )?.category ||
                  undefined,
                answerQuestion: event.target.value || undefined,
                answerId: undefined,
                fullscreen: false,
              })
            }
          >
            {!questionOptions.length && <option value="">暂无问题</option>}
            {questionOptions.map((question) => (
              <option key={question.id} value={question.id}>
                {question.label}
              </option>
            ))}
          </select>
        </label>
        </>}
        {!analysisOnly && (
          <footer>
            <button type="button" className="fm-secondary-button fm-config-add" onClick={onAdd}><Plus size={14} /> 新建监控配置</button>
            {configurationTools}
            <button
              type="button"
              className="fm-text-button"
              onClick={onOpenRecycle}
            >
              回收站{deletedCount ? `（${deletedCount}）` : ""}
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

export default function MonitoringWorkspace(props: MonitoringWorkspaceProps) {
  const serverData = Boolean(props.serverData);
  const useDataSource = serverData
    ? useMonitoringDataSource
    : usePreviewMonitoringDataSource;
  return (
    <MonitoringWorkspaceController
      key={serverData ? "server" : "preview"}
      {...props}
      useDataSource={useDataSource}
    />
  );
}
