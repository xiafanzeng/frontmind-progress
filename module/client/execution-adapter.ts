import {projectBusinessExecution,type PublicBusinessEvidence} from "@frontmind/module-contracts/execution";
import type {MonitorRun} from "./domain";
const stamp = (value?: string | null) => value ? Date.parse(value) : Number.NaN;
export function monitoringPublicExecution(run: MonitorRun) {
  const terminal = [
    "completed",
    "partial_completed",
    "failed",
    "cancelled",
  ].includes(run.status);
  const status =
    run.status === "failed"
      ? "error"
      : run.status === "cancelled"
        ? "cancelled"
        : terminal
          ? "ended"
          : ["waiting_quota", "review_required"].includes(run.status)
            ? "waiting"
            : "running";
  const entries: PublicBusinessEvidence[] = [
    {
      id: `${run.id}:created`,
      turnId: run.id,
      rank: 0,
      timestamp: stamp(run.createdAt),
      phase: "preparing_collection",
      status: run.startedAt
        ? "ended"
        : status === "running"
          ? "waiting"
          : status,
    },
  ];
  if (run.startedAt)
    entries.push({
      id: `${run.id}:started`,
      turnId: run.id,
      rank: 1,
      timestamp: stamp(run.startedAt),
      phase: "collecting",
      status,
      ...(run.completedAt ? { finishedAt: stamp(run.completedAt) } : {}),
    });
  const samples = run.attempts
    .filter((attempt) => attempt.capturedAt)
    .sort((a, b) => stamp(a.capturedAt) - stamp(b.capturedAt));
  if (samples.length)
    entries.push({
      id: `${run.id}:samples`,
      turnId: run.id,
      rank: 2,
      timestamp: stamp(samples.at(-1)!.capturedAt),
      phase: "showing_samples",
      status: "ended",
    });
  if (run.completedAt)
    entries.push({
      id: `${run.id}:finished`,
      turnId: run.id,
      rank: 3,
      timestamp: stamp(run.completedAt),
      phase: "collection_result",
      status,
    });
  for (const [index, attempt] of run.attempts.entries()) {
    const subject = [attempt.platformName, attempt.question].filter(Boolean).join(" · ");
    if (attempt.submittedAt) entries.push({ id: `${run.id}:${attempt.id}:submitted`, turnId: run.id, rank: 1 + index / Math.max(1, run.attempts.length), timestamp: stamp(attempt.submittedAt), phase: "collecting", subject,
      status: ["submission_unknown", "review_required"].includes(attempt.status) ? "waiting" : attempt.status === "failed" ? "error" : attempt.terminalAt ? "ended" : "running" });
    if (attempt.terminalAt || attempt.resultUpdatedAt) entries.push({ id: `${run.id}:${attempt.id}:result:${attempt.revision ?? 0}`, turnId: run.id, rank: 2 + index / Math.max(1, run.attempts.length), timestamp: stamp(attempt.resultUpdatedAt ?? attempt.terminalAt), phase: attempt.answer ? "showing_samples" : "collection_result", subject,
      status: attempt.status === "completed" ? "ended" : attempt.status === "stopped" ? "cancelled" : "error" });
  }
  return projectBusinessExecution(run.id, entries);
}
