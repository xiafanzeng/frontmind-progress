import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { ProgressRouter } from "../../../server/client-router";
import { mapRunDetail, mapRunSummary } from "../../apiMappers";
import type { MonitorRun, MonitoringQuestionCategory, RunAttempt } from "../../domain";
import { isMonitoringUuid } from "../../identifiers";
import { trpc } from "../../trpc";
import { filterRunsByRange } from "./selectors";
import type { MonitoringQueryState } from "./types";
import { attemptFromDetail } from "./useMonitoringDataSource";

type RunDetail = inferRouterOutputs<ProgressRouter>["runs"]["get"];
export type DetailQuestion = { id: string; label: string; category?: MonitoringQuestionCategory | null };
export type QuestionDetailData = {
  runs: MonitorRun[];
  run?: MonitorRun;
  questions: DetailQuestion[];
  linkedAnswer?: RunAttempt;
  loading: boolean;
  error?: string;
  retry?: () => void;
  historyLimited?: boolean;
};

// runs.get carries the immutable version snapshot. Use its canonical question
// and platform IDs so a monitoring.answers.get deep link selects the same row.
// Keep this adaptation local: the existing run report's identifiers stay intact.
function mapDetail(output: RunDetail) {
  const run = mapRunDetail(output);
  const questions = output.configuration.questions.map((question) => ({
    id: question.questionId,
    label: question.questionSnapshot,
    category: question.categorySnapshot,
  }));
  const attempts = run.attempts.map((attempt, index) => {
    const raw = output.attempts[index]!.attempt;
    const question = output.configuration.questions.find((item) => item.ordinal === raw.monitorQuestionOrdinal);
    const platform = output.configuration.platforms.find((item) => item.ordinal === raw.monitorPlatformOrdinal);
    return {
      ...attempt,
      runId: run.id,
      questionId: question?.questionId || attempt.questionId,
      platformId: platform?.platformId,
    };
  });
  return { run: { ...run, attempts }, questions };
}

export function useQuestionDetailData(query: MonitoringQueryState, timezone: string): QuestionDetailData {
  const validMonitor = isMonitoringUuid(query.monitorId);
  const monitorId = validMonitor ? query.monitorId! : "00000000-0000-0000-0000-000000000000";
  const options = { refetchInterval: 10_000, refetchIntervalInBackground: false, trpc: { abortOnUnmount: true } };
  const history = trpc.runs.list.useQuery({ monitorId, limit: 100 }, { ...options, enabled: validMonitor });
  const runs = useMemo(() => (history.data || []).filter((item) => item.monitorId === query.monitorId).map((item) => mapRunSummary(item, "问题监控")), [history.data, query.monitorId]);
  const inRange = filterRunsByRange(runs, query.range, query.from, query.to, timezone);
  const runId = query.runId || inRange[0]?.id;
  const validRun = validMonitor && isMonitoringUuid(runId);
  const detail = trpc.runs.get.useQuery(
    { runId: validRun ? runId! : "00000000-0000-0000-0000-000000000000" },
    { ...options, enabled: validRun },
  );
  const currentDetail = detail.data?.run.id === runId ? detail.data : undefined;
  const listed = currentDetail?.attempts.find((item) => item.attempt.id === query.answerId);
  const validAnswer = validMonitor && isMonitoringUuid(query.answerId);
  // Failed/pending attempts without a result have no answers.get resource.
  const fetchAnswer = validAnswer && (!validRun || !detail.isLoading) && !(listed && !listed.result);
  const subject = query.subject.startsWith("competitor:")
    ? { kind: "competitor" as const, name: query.subject.slice("competitor:".length) }
    : { kind: "self" as const };
  // Resolve a supplied answer independently of the history page/date window.
  // The workspace adopts its owning run before displaying any answer body.
  const answer = trpc.monitoring.answers.get.useQuery(
    { monitorId, answerId: validAnswer ? query.answerId! : "00000000-0000-0000-0000-000000000000", subject },
    { ...options, enabled: fetchAnswer },
  );
  const currentAnswer = fetchAnswer && answer.data?.answerId === query.answerId ? answer.data : undefined;
  const mapped = useMemo(() => currentDetail && currentDetail.run.monitorId === query.monitorId ? mapDetail(currentDetail) : undefined, [currentDetail, query.monitorId]);
  const wrongMonitor = Boolean(currentDetail && currentDetail.run.monitorId !== query.monitorId);
  return {
    runs,
    run: mapped?.run,
    questions: mapped?.questions || [],
    linkedAnswer: currentAnswer ? attemptFromDetail(currentAnswer) : undefined,
    loading: history.isLoading || (fetchAnswer && !listed && !currentAnswer && !answer.error) || (validRun && !currentDetail && !detail.error),
    error: wrongMonitor ? "该运行不属于当前监控配置，请重新选择运行。" : history.error?.message || (fetchAnswer ? answer.error?.message : undefined) || detail.error?.message,
    retry: () => {
      void history.refetch();
      if (fetchAnswer) void answer.refetch();
      if (validRun) void detail.refetch();
    },
    // The existing history endpoint is capped; do not imply it contains every
    // historical run. Older answer/run deep links still use the direct reads.
    historyLimited: runs.length === 100,
  };
}

export function previewQuestionDetailData(runs: MonitorRun[], query: MonitoringQueryState, timezone: string): QuestionDetailData {
  const ownedRuns = runs.filter((run) => run.monitorId === query.monitorId);
  const linkedRun = ownedRuns.find((run) => run.attempts.some((attempt) => attempt.id === query.answerId));
  const run = linkedRun || ownedRuns.find((run) => run.id === query.runId) || filterRunsByRange(ownedRuns, query.range, query.from, query.to, timezone)[0];
  return {
    runs: ownedRuns,
    run,
    questions: [...new Map(run?.attempts.map((attempt) => [attempt.questionId, { id: attempt.questionId, label: attempt.question, category: attempt.questionCategory }]) || []).values()],
    linkedAnswer: run?.attempts.find((attempt) => attempt.id === query.answerId),
    loading: false,
  };
}
