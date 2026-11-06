import { useEffect, useState } from "react";
import type { MonitorRun, MonitorSummary, MonitoringQuestionCategory } from "../../domain";
import { trpc } from "../../trpc";

export type ProjectQuestion = {
  id: string;
  monitorId: string;
  label: string;
  category?: MonitoringQuestionCategory | null;
  monitor: MonitorSummary;
};
export const questionKey = (item: Pick<ProjectQuestion, "monitorId" | "id">) => `${item.monitorId}:${item.id}`;

/** Read each existing configuration without rewriting its historical question IDs. */
export function useProjectQuestions(projectId: string, monitors: MonitorSummary[], runs: MonitorRun[], enabled: boolean) {
  const utils = trpc.useUtils();
  const [state, setState] = useState<{ projectId: string; questions: ProjectQuestion[]; loading: boolean; error: string }>({ projectId, questions: [], loading: enabled, error: "" });
  const [revision, setRevision] = useState(0);
  const identity = monitors.map(item => `${item.id}:${item.activeVersion}`).join(",");
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState(previous => ({ projectId, questions: previous.projectId === projectId ? previous.questions.filter(q => monitors.some(m => m.id === q.monitorId)) : [], loading: true, error: "" }));
    void (async () => {
      const questions: ProjectQuestion[] = [];
      let failures = 0;
      // Small batches avoid a burst of reads for projects with many old configurations.
      for (let index = 0; index < monitors.length; index += 4) {
        if (cancelled) return;
        const batch = await Promise.allSettled(monitors.slice(index, index + 4).map(async monitor => {
          const detail = await utils.monitors.get.fetch({ monitorId: monitor.id });
          return detail.questions.map(question => ({ id: question.questionId, monitorId: monitor.id, label: question.questionSnapshot, category: question.categorySnapshot, monitor }));
        }));
        for (const result of batch) {
          if (result.status === "fulfilled") questions.push(...result.value);
          else failures += 1;
        }
      }
      if (!cancelled) setState({ projectId, questions, loading: false, error: failures ? `${failures} 项问题配置读取失败，请重试。` : "" });
    })();
    return () => { cancelled = true; };
  }, [projectId, identity, enabled, revision, utils]);
  const questions = enabled ? (state.projectId === projectId ? state.questions : []) : monitors.flatMap(monitor =>
    [...new Map(runs.filter(run => run.monitorId === monitor.id).flatMap(run => run.attempts.map(attempt => [attempt.questionId, { id: attempt.questionId, monitorId: monitor.id, label: attempt.question, category: attempt.questionCategory, monitor }] as const))).values()],
  );
  return { questions: questions.map(question => ({ ...question, monitor: monitors.find(m => m.id === question.monitorId) || question.monitor })), loading: enabled && state.loading, error: enabled ? state.error : "", retry: () => setRevision(value => value + 1) };
}
