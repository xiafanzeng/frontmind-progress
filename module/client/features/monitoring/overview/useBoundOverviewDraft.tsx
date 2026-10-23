import type { SetStateAction } from "react";
import type { RunAttempt } from "../../../domain";
import { useOverviewDraft } from "./useOverviewDraft";
import { downloadHandoff } from "./overviewModel";

export function overviewDraftBasis(attempt: RunAttempt | undefined, check: string, context?: string) {
  if (!attempt) return null;
  return {
    answerId: attempt.id, runId: attempt.runId || null, questionId: attempt.questionId,
    answerRevision: attempt.revision ?? null, resultUpdatedAt: attempt.resultUpdatedAt || null,
    question: attempt.question, originalAnswer: attempt.answer || null, check, context: context || null,
    originalJudgment: { mentioned: attempt.brandMentioned ?? null, position: attempt.mentionPosition ?? null,
      sentiment: attempt.sentiment || "unknown", keywordEvaluations: attempt.keywordEvaluations || [], citationProvenance: attempt.citationProvenance || null },
    originalSources: attempt.allSources || [], citedSources: attempt.sources,
  };
}
export type OverviewDraftBasis = NonNullable<ReturnType<typeof overviewDraftBasis>>;
type DraftHistory<T> = { basis: OverviewDraftBasis | null; value: T };
type BoundDraft<T> = { schemaVersion: 2; basis: OverviewDraftBasis; value: T; boundAt: string; history: DraftHistory<T>[] };
function isBound<T>(value: unknown): value is BoundDraft<T> {
  return Boolean(value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === 2 && "basis" in value && "value" in value);
}

/** Keep the existing storage key so unversioned drafts remain recoverable.
 * Compare exact evidence snapshots, including text when revision is unavailable.
 * Never automatically assign legacy text to the latest answer revision. */
export function useBoundOverviewDraft<T>(key: string, fallback: T, basis: OverviewDraftBasis | null) {
  const [stored, setStored, persisted] = useOverviewDraft<BoundDraft<T> | T | null>(key, null);
  const bound = isBound<T>(stored) ? stored : null;
  const value = bound ? bound.value : stored === null ? fallback : stored as T;
  const stale = stored !== null && (!bound || JSON.stringify(bound.basis) !== JSON.stringify(basis));
  const setValue = (action: SetStateAction<T>) => {
    if (!basis || stale) return;
    setStored(previous => {
      const previousBound = isBound<T>(previous) ? previous : null;
      const previousValue = previousBound ? previousBound.value : fallback;
      const next = typeof action === "function" ? (action as (value: T) => T)(previousValue) : action;
      return { schemaVersion: 2, basis, value: next, boundAt: previousBound?.boundAt || new Date().toISOString(), history: previousBound?.history || [] };
    });
  };
  const rebind = () => {
    if (!basis || !stale) return;
    setStored({ schemaVersion: 2, basis, value, boundAt: new Date().toISOString(), history: [...(bound?.history || []), { basis: bound?.basis || null, value }] });
  };
  return { value, setValue, persisted, stale, rebind, basis: bound?.basis || null, history: bound?.history || [], stored };
}

export function DraftVersionNotice({ stale, stored, onRebind, currentRevision }: {
  stale: boolean; stored: unknown; onRebind: () => void; currentRevision?: number;
}) {
  if (!stale) return null;
  return <div className="fm-ov-notice pending" role="status"><strong>此草稿的证据已变化，或旧草稿未记录版本</strong><p>当前回答：{currentRevision ? `V${currentRevision}` : "版本未返回"}。旧文字已保留；请核对当前原文、判定和资料，再继续编辑。</p><div className="fm-ov-draft-version-actions"><button type="button" className="fm-secondary-button" onClick={() => downloadHandoff("frontmind-previous-draft.json", { kind: "previous-draft", submitted: false, requiresReview: true, stored })}>下载旧草稿</button><button type="button" className="fm-secondary-button" onClick={onRebind}>已核对当前证据，沿用草稿文字</button></div></div>;
}
