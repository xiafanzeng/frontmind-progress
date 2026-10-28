import { createHash } from "node:crypto";
import type { MoliResultItem } from "../server/providers/moli/index.js";
import { keywordReturnState } from "../shared/overviewAnalysis.js";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

/** Excludes provider timestamps and billing amount so metadata refreshes do not create content revisions. */
export function hashAuthoritativeResult(item: MoliResultItem): string {
  const revisionMaterial = {
    status: item.status,
    answerContent: item.answerContent,
    shareUrl: item.shareUrl,
    reasoningProcess: item.reasoningProcess,
    searchKeywords: item.searchKeywords,
    references: item.references.map(
      ({ raw: _raw, iconUrl: _iconUrl, ...reference }) => reference,
    ),
    citationProvenance: item.citationProvenance,
    allReferences: item.allReferences.map(
      ({ raw: _raw, iconUrl: _iconUrl, ...reference }) => reference,
    ),
    media: item.media.map(({ raw: _raw, ...media }) => media),
    sentiment: item.sentiment,
    mentionPosition: item.mentionPosition,
    mentionContext: item.mentionContext,
    competitorRankings: item.competitorRankings,
    allRankings: item.allRankings,
    categoryRanking: item.categoryRanking,
    keywordEvaluations: item.keywordEvaluations,
    competitorEvaluations: item.competitorEvaluations,
    // Preserve null/empty/missing evidence states and competitor-only revisions.
    rawCompetitorEvaluations: item.raw?.competitorEvaluations,
    // null -> [] is a real evidence-state change even when both normalize to [].
    // Keep it versioned so a later empty result cannot retain an older null state.
    keywordEvaluationState: keywordReturnState(item.raw?.keywordEvaluations, item.keywordEvaluations || []),
    errorMessage: item.errorMessage,
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(revisionMaterial)))
    .digest("hex");
}
