import type { SourceEvidenceRow } from "@frontmind/module-ui/components/SourceEvidenceList";
import type { RunAttempt } from "../../domain";

/** Number once before filtering so list numbers keep matching the answer. */
export function sourceEvidenceRows(attempt: RunAttempt): SourceEvidenceRow[] {
  const reserved = new Set(
    attempt.allSources.flatMap((source) =>
      typeof source.providerPosition === "number" &&
      Number.isSafeInteger(source.providerPosition) &&
      source.providerPosition > 0
        ? [source.providerPosition]
        : [],
    ),
  );
  let nextNumber = 1;
  return attempt.allSources.map((source) => {
    const explicit =
      attempt.citationProvenance === "explicit" &&
      source.isCited === true &&
      (!source.citationProvenance || source.citationProvenance === "explicit");
    const providerNumber = source.providerPosition;
    let number: number;
    if (
      typeof providerNumber === "number" &&
      Number.isSafeInteger(providerNumber) &&
      providerNumber > 0
    ) {
      number = providerNumber;
    } else {
      while (reserved.has(nextNumber)) nextNumber += 1;
      number = nextNumber++;
    }
    return {
      id: source.id,
      number,
      title: source.title || "未命名来源",
      site: source.siteName || source.domain,
      type: explicit ? "cited" : "reference",
      publishedAt: source.publishedAt,
      url: source.url,
      excerpt: source.citedText || source.summary,
    };
  });
}
