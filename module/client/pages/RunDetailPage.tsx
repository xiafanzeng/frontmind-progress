import { ProgressExecutionActivity } from "../host-runtime";
import { projectResourceUrl } from "../host-runtime";
import { safeArchivedMediaUrl } from "../mediaUrls";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  PauseCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";

import ModelBrandIcon from "../components/ModelBrandIcon";
import {
  IndustrySourceInsights,
  buildSentimentInsights,
} from "../components/AnswerInsights";
import AnswerWorkspace from "../features/monitoring/AnswerWorkspace";
import type { SourceScope } from "../features/monitoring/types";
import "../features/monitoring/monitoring.css";
import "../features/monitoring/reference-ui.css";
import "@frontmind/module-ui/dashboard/resource-reading-layout.css";
import "./run-report.css";
import RunTrendAnalysis from "../components/RunTrendAnalysis";
import {
  MonitoringMarkdown,
  MonitoringReasoning,
} from "../features/monitoring/MonitoringMarkdown";
import {
  attemptStatusLabel,
  formatDateTime,
  runStatusLabel,
  type MonitorRun,
  type RunAttempt,
} from "../domain";

type RunDetailPageProps = {
  run?: MonitorRun;
  embedded?: boolean;
  comparisonRuns?: MonitorRun[];
  onCancel: () => void | Promise<void>;
  backHref?: string;
  backLabel?: string;
  allowCancel?: boolean;
};

const RUN_DETAIL_ANCHORS = [
  ["overview", "指标看板"],
  ["progress", "采集进度"],
  ["answers", "问答明细"],
  ["snapshot", "配置快照"],
  ["citations", "引用来源"],
  ["signals", "模型与引用"],
  ["trend", "趋势分析"],
] as const;

const ANCHOR_LOOKAHEAD_PX = 72;

type RunDetailAnchorId = (typeof RUN_DETAIL_ANCHORS)[number][0];

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: string;
}) {
  return (
    <article className={`run-metric-card ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function AttemptMatrix({
  attempts,
  selectedId,
  onSelect,
}: {
  attempts: RunAttempt[];
  selectedId?: string;
  onSelect: (attempt: RunAttempt) => void;
}) {
  const questionGroups = Array.from(
    new Set(attempts.map((attempt) => attempt.question)),
  );
  if (!questionGroups.length)
    return (
      <div className="panel-state">
        <strong>没有符合筛选条件的回答</strong>
        <span>请调整问题、平台或状态筛选。</span>
      </div>
    );
  return (
    <div className="attempt-question-groups">
      {questionGroups.map((question, questionIndex) => {
        const questionAttempts = attempts.filter(
          (attempt) => attempt.question === question,
        );
        const platforms = Array.from(
          new Map(
            questionAttempts.map((attempt) => [
              attemptPlatformKey(attempt),
              {
                code: attempt.platformCode,
                name: attempt.platformName,
                clientType: attempt.clientType,
              },
            ]),
          ).entries(),
        );
        return (
          <section
            key={question}
            aria-label={`问题 ${questionIndex + 1}：${question}`}
          >
            <header>
              <span>Q{questionIndex + 1}</span>
              <strong>{question}</strong>
              <small>
                {
                  questionAttempts.filter((item) => item.status === "completed")
                    .length
                }
                /{questionAttempts.length} 完成
              </small>
            </header>
            <div className="attempt-matrix">
              {platforms.map(([key, platform]) => {
                const platformAttempts = questionAttempts
                  .filter((attempt) => attemptPlatformKey(attempt) === key)
                  .sort((a, b) => a.repetition - b.repetition);
                return (
                  <article key={key}>
                    <div>
                      <ModelBrandIcon
                        code={platform.code}
                        name={platform.name}
                      />
                      <strong>{platform.name}</strong>
                      <small>
                        {platform.clientType === "web" ? "网页版" : "手机版"} ·{" "}
                        {
                          platformAttempts.filter(
                            (item) => item.status === "completed",
                          ).length
                        }
                        /{platformAttempts.length} 完成
                      </small>
                    </div>
                    <div className="attempt-dots">
                      {platformAttempts.map((attempt) => (
                        <button
                          type="button"
                          key={attempt.id}
                          className={`${attempt.status} ${attempt.id === selectedId ? "selected" : ""}`}
                          title={`第 ${attempt.repetition} 次 · ${attemptStatusLabel(attempt.status)}`}
                          aria-label={`${platform.name}${platform.clientType === "web" ? "网页版" : "手机版"}第 ${attempt.repetition} 次回答，${attemptStatusLabel(attempt.status)}`}
                          aria-pressed={attempt.id === selectedId}
                          onClick={() => onSelect(attempt)}
                        >
                          {attempt.repetition}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function attemptPlatformKey(attempt: RunAttempt) {
  return `${attempt.platformCode}:${attempt.clientType}`;
}

function clientTypeLabel(clientType: RunAttempt["clientType"]) {
  return clientType === "web" ? "网页版" : "手机版";
}

function attemptModelLabel(attempt: RunAttempt) {
  return `${attempt.platformName}（${clientTypeLabel(attempt.clientType)}）`;
}

function screenshotPolicyLabel(value: 0 | 1 | 2) {
  return value === 1 ? "全部截图" : value === 2 ? "提及品牌时截图" : "不截图";
}

function AnswerViewer({
  attempt,
  siblings,
  onSelect,
}: {
  attempt?: RunAttempt;
  siblings: RunAttempt[];
  onSelect: (attempt: RunAttempt) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [sourceScope, setSourceScope] = useState<SourceScope>("all");
  const questionAnswers = siblings.filter(
    (item) => item.questionId === attempt?.questionId,
  );
  const insights = buildSentimentInsights(questionAnswers);
  return (
    <div className="fm-resource-reading">
      <AnswerWorkspace
        attempts={questionAnswers}
        selected={attempt}
        fullscreen={fullscreen}
        onFullscreenChange={setFullscreen}
        onSelect={onSelect}
        sourceScope={sourceScope}
        onSourceScopeChange={setSourceScope}
        sentiments={insights.counts}
        sentimentScopeLabel={`${attempt?.question || "当前问题"} · 当前运行 · 全部平台`}
        totalAnswers={insights.effectiveAnswers}
        scopeKey={questionAnswers.map((item) => item.id).join(",")}
      />
    </div>
  );
}

function safeExternalUrl(value?: string) {
  if (!value) return;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.toString()
      : undefined;
  } catch {
    return;
  }
}

function isScrollAtEnd(element: HTMLElement) {
  return (
    element.scrollHeight > element.clientHeight &&
    element.scrollHeight - element.scrollTop - element.clientHeight <= 2
  );
}

function pageIsScrolledToEnd() {
  const root = document.scrollingElement;
  if (!root || root.scrollHeight <= root.clientHeight) return false;
  return root.scrollHeight - root.scrollTop - root.clientHeight <= 2;
}

function scrollContainerAtEnd(element: HTMLElement) {
  for (let ancestor = element.parentElement; ancestor; ) {
    const overflowY = window.getComputedStyle(ancestor).overflowY;
    if (
      /^(?:auto|overlay|scroll)$/u.test(overflowY) &&
      ancestor.scrollHeight > ancestor.clientHeight
    ) {
      return isScrollAtEnd(ancestor);
    }
    ancestor = ancestor.parentElement;
  }
  return pageIsScrolledToEnd();
}

function modelPerformance(attempts: RunAttempt[]) {
  const grouped = new Map<
    string,
    {
      code: string;
      name: string;
      total: number;
      successful: number;
      effective: number;
      positions: number[];
      citations: number;
    }
  >();
  for (const attempt of attempts) {
    const key = attemptPlatformKey(attempt);
    const current = grouped.get(key) || {
      code: key,
      name: attemptModelLabel(attempt),
      total: 0,
      successful: 0,
      effective: 0,
      positions: [],
      citations: 0,
    };
    current.total += 1;
    if (attempt.status === "completed") current.successful += 1;
    if (attempt.status === "completed" && attempt.answer?.trim()) {
      current.effective += 1;
      if (attempt.mentionPosition)
        current.positions.push(attempt.mentionPosition);
      current.citations += attempt.sources.length;
    }
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function archiveSummary(assets: RunAttempt["assets"]) {
  if (!assets.length) return "无附件";
  const archived = assets.filter((asset) =>
    Boolean(safeArchivedMediaUrl(asset.url)),
  ).length;
  const failed = assets.filter(
    (asset) =>
      asset.archiveStatus === "failed" ||
      (asset.archiveStatus === "archived" &&
        Boolean(asset.url) &&
        !safeArchivedMediaUrl(asset.url)),
  ).length;
  const notApplicable = assets.filter(
    (asset) => !asset.url && asset.archiveStatus === "not_applicable",
  ).length;
  const pending = Math.max(
    0,
    assets.length - archived - failed - notApplicable,
  );
  return [
    archived ? `已归档 ${archived}` : "",
    pending ? `归档中 ${pending}` : "",
    failed ? `失败 ${failed}` : "",
    notApplicable ? `无可用归档 ${notApplicable}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function RunDetailPage({
  run,
  embedded = false,
  comparisonRuns = [],
  onCancel,
  backHref,
  backLabel,
  allowCancel = true,
}: RunDetailPageProps) {
  const [activeAnchor, setActiveAnchor] =
    useState<RunDetailAnchorId>("overview");
  const runPageRef = useRef<HTMLDivElement>(null);
  const anchorNavRef = useRef<HTMLElement>(null);
  const answersSectionRef = useRef<HTMLElement>(null);
  const manualAnchorRef = useRef<
    { id: RunDetailAnchorId; startedAt: number } | undefined
  >(undefined);
  const [question, setQuestion] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const filteredAttempts = useMemo(
    () =>
      run?.attempts.filter(
        (attempt) =>
          (!question || attempt.question === question) &&
          (!platform || attemptPlatformKey(attempt) === platform) &&
          (!status || attempt.status === status),
      ) || [],
    [platform, question, run?.attempts, status],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [actionError, setActionError] = useState("");
  const selected =
    filteredAttempts.find((attempt) => attempt.id === selectedId) ||
    filteredAttempts.find((attempt) => attempt.status === "completed") ||
    filteredAttempts[0];

  useEffect(() => {
    setActiveAnchor("overview");
    const page = runPageRef.current;
    if (!run || !page) return;
    const sections = RUN_DETAIL_ANCHORS.map(([id]) =>
      page.querySelector<HTMLElement>(`#${id}`),
    ).filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    let animationFrame = 0;
    const syncActiveAnchor = () => {
      animationFrame = 0;
      const readingViewport = embedded
        ? page.closest<HTMLElement>(".agent-workbench-shell__main-content")
        : null;
      const activationLine =
        (embedded
          ? (readingViewport?.getBoundingClientRect().top ?? 0)
          : (anchorNavRef.current?.getBoundingClientRect().bottom ?? 127)) + 48;
      const manualAnchor = manualAnchorRef.current;
      if (manualAnchor) {
        const target = sections.find(
          (section) => section.id === manualAnchor.id,
        );
        const targetDistance = target
          ? Math.abs(target.getBoundingClientRect().top - activationLine)
          : 0;
        if (
          Date.now() - manualAnchor.startedAt < 4_000 &&
          targetDistance > 48
        ) {
          setActiveAnchor(manualAnchor.id);
          return;
        }
        manualAnchorRef.current = undefined;
      }
      const passed = [...sections]
        .reverse()
        .find(
          (section) => section.getBoundingClientRect().top <= activationLine,
        );
      const passedIndex = passed ? sections.indexOf(passed) : -1;
      const upcoming = sections[passedIndex + 1];
      const active =
        (scrollContainerAtEnd(page) && sections.at(-1)) ||
        (upcoming &&
        upcoming.getBoundingClientRect().top <=
          activationLine + ANCHOR_LOOKAHEAD_PX
          ? upcoming
          : passed) ||
        sections[0];
      if (active) setActiveAnchor(active.id as RunDetailAnchorId);
    };
    const queueAnchorSync = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(syncActiveAnchor);
    };

    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(queueAnchorSync, {
            root: null,
            rootMargin: "-72px 0px -55% 0px",
            threshold: [0, 1],
          });
    sections.forEach((section) => observer?.observe(section));
    document.addEventListener("scroll", queueAnchorSync, {
      capture: true,
      passive: true,
    });
    window.addEventListener("scroll", queueAnchorSync, { passive: true });
    window.addEventListener("resize", queueAnchorSync);
    queueAnchorSync();
    return () => {
      observer?.disconnect();
      document.removeEventListener("scroll", queueAnchorSync, true);
      window.removeEventListener("scroll", queueAnchorSync);
      window.removeEventListener("resize", queueAnchorSync);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [embedded, run?.id]);

  if (!run)
    return (
      <div className="page-content">
        <div className="panel-state">
          <strong>未找到该运行</strong>
          <Link href="/monitoring-system">返回问题监控</Link>
        </div>
      </div>
    );
  const completion = run.metrics.expected
    ? Math.round(
        ((run.metrics.completed + run.metrics.failed + run.metrics.stopped) /
          run.metrics.expected) *
          100,
      )
    : 0;
  const platforms = Array.from(
    new Map(
      run.attempts.map((attempt) => [
        attemptPlatformKey(attempt),
        attemptModelLabel(attempt),
      ]),
    ).entries(),
  );
  const questions = Array.from(
    new Set(run.attempts.map((attempt) => attempt.question)),
  );
  const models = modelPerformance(filteredAttempts);
  const showIndustryMetrics =
    run.attempts.length > 0 &&
    run.attempts.every((attempt) => attempt.questionCategory === "industry");
  const showModelRankings =
    filteredAttempts.length > 0 &&
    filteredAttempts.every(
      (attempt) => attempt.questionCategory === "industry",
    );
  const effectiveAnswers =
    run.metrics.effectiveAnswers ??
    run.attempts.filter(
      (attempt) =>
        attempt.status === "completed" && Boolean(attempt.answer?.trim()),
    ).length;
  const mentionPositionSamples = run.attempts.filter(
    (attempt) =>
      attempt.status === "completed" &&
      typeof attempt.mentionPosition === "number",
  ).length;
  const goAnchor = (id: RunDetailAnchorId) => {
    manualAnchorRef.current = { id, startedAt: Date.now() };
    setActiveAnchor(id);
    document
      .getElementById(id)
      ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="run-page" ref={runPageRef}>
      <ProgressExecutionActivity run={run} />
      <div className="run-page-head">
        {!embedded && (
          <Link
            className="back-link"
            href={backHref || `/monitoring-system/${run.monitorId}`}
          >
            <ArrowLeft size={15} />
            {backLabel || "返回监控详情"}
          </Link>
        )}
        <div className="run-title-row">
          <div>
            <span className={`status-chip ${run.status}`}>
              {runStatusLabel(run.status)}
            </span>
            <h1>{run.monitorName}</h1>
            <p>
              配置 V{run.version} ·{" "}
              {run.trigger === "manual"
                ? "手动执行"
                : run.trigger === "catch_up"
                  ? "停机补跑"
                  : "计划执行"}{" "}
              · {formatDateTime(run.startedAt)}
            </p>
          </div>
          <div className="detail-actions">
            <a
              className="secondary-button"
              href={projectResourceUrl(
                `/api/monitoring/downloads/runs/${run.id}.xlsx`,
              )}
            >
              <Download size={15} />
              导出 XLSX
            </a>
            {allowCancel &&
              ["queued", "running", "waiting_quota"].includes(run.status) && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `确认停止“${run.monitorName}”本次运行？当前已完成 ${run.metrics.completed}/${run.metrics.expected} 个回答，已完成结果会保留。`,
                    );
                    if (!confirmed) return;
                    setActionError("");
                    void Promise.resolve(onCancel()).catch((error: unknown) =>
                      setActionError(
                        error instanceof Error
                          ? error.message
                          : "停止请求失败，请稍后重试。",
                      ),
                    );
                  }}
                >
                  <PauseCircle size={15} />
                  尝试停止
                </button>
              )}
          </div>
        </div>
        {actionError && (
          <p className="form-error page-error" role="alert">
            {actionError}
          </p>
        )}
        {run.status === "review_required" && (
          <p className="form-error page-error" role="status">
            本次运行已进入人工复核状态，页面已停止自动刷新。当前版本尚无复核处理入口，请联系管理员排查；页面不会自行改写结果，也不会自动调整人民币余额或费用记录。
          </p>
        )}
      </div>
      <nav className="anchor-nav" aria-label="运行结果目录" ref={anchorNavRef}>
        {RUN_DETAIL_ANCHORS.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={activeAnchor === id ? "active" : ""}
            aria-current={activeAnchor === id ? "location" : undefined}
            onClick={() => goAnchor(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="run-content">
        <section id="overview" className="run-section">
          <div className="section-title">
            <div>
              <h2>指标看板</h2>
            </div>
            <small>所有百分比均标注实际有效样本分母</small>
          </div>
          <div className="run-metric-grid">
            <MetricCard
              label="预计采集"
              value={run.metrics.expected}
              detail="问题 × 平台 × 重复次数"
            />
            <MetricCard
              label="采集完成率"
              value={`${completion}%`}
              detail={`${run.metrics.completed + run.metrics.failed + run.metrics.stopped}/${run.metrics.expected} 条采集已结束`}
              tone="primary"
            />
            <MetricCard
              label="等待 / 处理中"
              value={`${run.metrics.queued} / ${run.metrics.processing}`}
              detail={`分母 ${run.metrics.expected} 个回答`}
            />
            <MetricCard
              label="成功回答"
              value={run.metrics.completed}
              detail={`分母 ${run.metrics.expected} 个回答`}
            />
            <MetricCard
              label="失败回答"
              value={run.metrics.failed}
              detail={`分母 ${run.metrics.expected} 个回答`}
            />
            <MetricCard
              label="已停止"
              value={run.metrics.stopped}
              detail={`分母 ${run.metrics.expected} 个回答`}
            />
            {showIndustryMetrics && (
              <>
                <MetricCard
                  label="品牌提及率"
                  value={
                    run.metrics.mentionRate === undefined
                      ? "—"
                      : `${run.metrics.mentionRate}%`
                  }
                  detail={`分母 ${run.metrics.completed} 个有效回答`}
                  tone="teal"
                />
                <MetricCard
                  label="平均提及位置"
                  value={
                    run.metrics.averageMentionPosition === undefined
                      ? "—"
                      : run.metrics.averageMentionPosition
                  }
                  detail={`分母 ${mentionPositionSamples} 个位置样本`}
                />
              </>
            )}
            <MetricCard
              label="引用总数"
              value={run.metrics.citations}
              detail={`${run.metrics.uniqueDomains} 个独立域名 · 分母 ${run.metrics.completed} 个有效回答`}
            />
            <MetricCard
              label="有效回答"
              value={effectiveAnswers}
              detail={`成功且正文非空 · 分母 ${run.metrics.completed} 个成功回答`}
            />
          </div>
        </section>
        <section id="progress" className="run-section content-card">
          <div className="section-title">
            <div>
              <h2>采集进度</h2>
            </div>
            <small>问题 × 平台 × 第 N 次回答</small>
          </div>
          <div className="answer-filters">
            <label>
              <Search size={14} />
              <select
                aria-label="按问题筛选采集进度"
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  setSelectedId(undefined);
                }}
              >
                <option value="">全部问题</option>
                {questions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <select
                aria-label="按模型筛选采集进度"
                value={platform}
                onChange={(event) => {
                  setPlatform(event.target.value);
                  setSelectedId(undefined);
                }}
              >
                <option value="">全部模型</option>
                {platforms.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <select
                aria-label="按状态筛选采集进度"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setSelectedId(undefined);
                }}
              >
                <option value="">全部状态</option>
                <option value="queued">等待</option>
                <option value="submitting">提交中</option>
                <option value="submission_unknown">提交待确认</option>
                <option value="accepted">已受理</option>
                <option value="processing">处理中</option>
                <option value="completed">完成</option>
                <option value="failed">失败</option>
                <option value="stopped">已停止</option>
                <option value="error">异常</option>
                <option value="cancelled_before_submit">已取消</option>
                <option value="review_required">需复核</option>
              </select>
            </label>
          </div>
          <AttemptMatrix
            attempts={filteredAttempts}
            selectedId={selected?.id}
            onSelect={(attempt) => {
              setSelectedId(attempt.id);
              goAnchor("answers");
            }}
          />
        </section>
        <section
          id="answers"
          className="run-section content-card answers-section"
          ref={answersSectionRef}
          tabIndex={-1}
          aria-labelledby="run-answers-heading"
        >
          <div className="section-title">
            <div>
              <h2 id="run-answers-heading">问答明细</h2>
            </div>
            <small>沿用采集进度筛选，共 {filteredAttempts.length} 个回答</small>
          </div>
          <AnswerViewer
            attempt={selected}
            siblings={filteredAttempts}
            onSelect={(attempt) => setSelectedId(attempt.id)}
          />
        </section>
        <section id="snapshot" className="run-section content-card">
          <div className="section-title">
            <div>
              <h2>监控配置快照</h2>
            </div>
            <small>本次运行始终使用配置 V{run.version}</small>
          </div>
          <div className="snapshot-grid">
            <article>
              <span>主品牌</span>
              <strong>{run.config.brandName}</strong>
              <small>{run.config.brandAliases.join("、") || "无别名"}</small>
            </article>
            <article>
              <span>配置版本</span>
              <strong>V{run.version}</strong>
              <small>历史运行绑定此不可变配置</small>
            </article>
            <article>
              <span>问题</span>
              <strong>{run.config.questions.length} 个</strong>
              <small>每个平台 {run.config.repetitions} 次</small>
            </article>
            <article>
              <span>平台</span>
              <strong>{run.config.platforms.length} 个</strong>
              <small>
                {run.config.platforms
                  .map((item) => item.displayName)
                  .join("、")}
              </small>
            </article>
            <article>
              <span>截图</span>
              <strong>
                {new Set(
                  run.config.platforms.map((item) => item.screenshotPolicy),
                ).size > 1
                  ? "按平台配置"
                  : screenshotPolicyLabel(
                      run.config.platforms[0]?.screenshotPolicy ?? 0,
                    )}
              </strong>
              <small>已保存的回答截图</small>
            </article>
            <article>
              <span>位置</span>
              <strong>{run.config.regionLabel}</strong>
              <small>移动端使用供应商默认位置</small>
            </article>
          </div>
          <div className="snapshot-details">
            <section>
              <h3>问题清单</h3>
              <ol>
                {run.config.questions.map((item, index) => (
                  <li key={`${index}:${item}`}>
                    <span>Q{index + 1}</span>
                    {item}
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3>平台与执行参数</h3>
              <div
                className="analysis-table snapshot-platforms"
                role="region"
                aria-label="平台与执行参数，可横向滚动"
                tabIndex={0}
              >
                <div className="analysis-table-head">
                  <span>平台</span>
                  <span>端</span>
                  <span>模式</span>
                  <span>截图</span>
                  <span>位置</span>
                </div>
                {run.config.platforms.map((item) => (
                  <div
                    className="analysis-table-row"
                    key={`${item.providerCode}:${item.clientType}`}
                  >
                    <strong>{item.displayName}</strong>
                    <span>
                      {item.clientType === "web" ? "网页版" : "手机版"}
                    </span>
                    <span>
                      {item.mode === "reasoning_search"
                        ? "深度思考"
                        : "标准问答"}
                    </span>
                    <span>{screenshotPolicyLabel(item.screenshotPolicy)}</span>
                    <span>
                      {item.clientType === "mobile"
                        ? "供应商默认"
                        : item.regionCode || "供应商默认"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
        <section id="citations" className="run-section content-card">
          <div className="section-title">
            <div>
              <h2>引用来源</h2>
            </div>
            <small>默认仅统计文内引用，可切换查看全部来源</small>
          </div>
          <IndustrySourceInsights
            attempts={filteredAttempts}
            onOpenAttempt={(attemptId) => {
              setSelectedId(attemptId);
              goAnchor("answers");
              window.requestAnimationFrame(() =>
                answersSectionRef.current?.focus({ preventScroll: true }),
              );
            }}
          />
        </section>
        <section id="signals" className="run-section content-card">
          <div className="section-title">
            <div>
              <h2>模型与引用表现</h2>
            </div>
            <small>仅统计成功且正文非空的有效回答及其明确引用</small>
          </div>
          <div
            className="analysis-table model-analysis"
            role="region"
            aria-label="模型与引用表现，可横向滚动"
            tabIndex={0}
          >
            <div
              className="analysis-table-head"
              style={
                showModelRankings
                  ? undefined
                  : {
                      gridTemplateColumns:
                        "minmax(160px, 1fr) repeat(3, 110px)",
                    }
              }
            >
              <span>平台</span>
              <span>成功率</span>
              <span>有效回答</span>
              {showModelRankings && <span>平均位置</span>}
              <span>引用</span>
            </div>
            {models.map((model) => (
              <div
                className="analysis-table-row"
                key={model.code}
                style={
                  showModelRankings
                    ? undefined
                    : {
                        gridTemplateColumns:
                          "minmax(160px, 1fr) repeat(3, 110px)",
                      }
                }
              >
                <strong>{model.name}</strong>
                <span>
                  {model.total
                    ? Math.round((model.successful / model.total) * 1000) / 10
                    : 0}
                  %
                </span>
                <span>{model.effective}</span>
                {showModelRankings && (
                  <span>
                    {model.positions.length
                      ? Math.round(
                          (model.positions.reduce(
                            (sum, position) => sum + position,
                            0,
                          ) /
                            model.positions.length) *
                            10,
                        ) / 10
                      : "—"}
                  </span>
                )}
                <span>{model.citations}</span>
              </div>
            ))}
            {!models.length && (
              <div className="compact-empty">当前筛选没有模型表现数据。</div>
            )}
          </div>
        </section>
        <section id="trend" className="run-section content-card">
          <div className="section-title">
            <div>
              <h2>趋势分析</h2>
            </div>
            <small>仅比较配置 V{run.version} 的已完成运行</small>
          </div>
          <RunTrendAnalysis
            runs={comparisonRuns}
            version={run.version}
            showIndustryMetrics={showIndustryMetrics}
          />
        </section>
      </div>
    </div>
  );
}
