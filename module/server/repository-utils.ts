export function pricingDimensionsKey(input: {
  pricingClass: "domestic" | "overseas";
  mode: "search" | "reasoning_search";
  screenshotEnabled: boolean;
}) {
  return `${input.pricingClass}:${input.mode}:${input.screenshotEnabled ? 1 : 0}`;
}
export function affectedRows(result: unknown): number {
  if (
    result &&
    typeof result === "object" &&
    "affectedRows" in result &&
    typeof result.affectedRows === "number"
  )
    return result.affectedRows;
  if (Array.isArray(result)) return affectedRows(result[0]);
  return 0;
}