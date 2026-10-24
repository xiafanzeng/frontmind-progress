type Point = { x: number; y: number };

/** Shape-preserving cubic Hermite curve. Control points stay inside the local
 * value range. Only actual observations are plotted; gaps are split by caller. */
export function trendCurve(points: Point[]): string {
  if (!points.length) return "";
  const first = points[0]!;
  if (points.length < 3) return `M ${first.x},${first.y}` + points.slice(1).map(point => ` L ${point.x},${point.y}`).join("");
  const slopes = points.slice(1).map((point, index) => (point.y - points[index]!.y) / (point.x - points[index]!.x));
  const tangents = points.map((_, index) => {
    if (!index) return slopes[0]!;
    if (index === points.length - 1) return slopes[index - 1]!;
    const before = slopes[index - 1]!, after = slopes[index]!;
    if (before * after <= 0) return 0;
    return Math.sign(before) * Math.min(Math.abs((before + after) / 2), 3 * Math.abs(before), 3 * Math.abs(after));
  });
  let path = `M ${first.x},${first.y}`;
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1]!, right = points[index]!;
    const dx = (right.x - left.x) / 3;
    path += ` C ${left.x + dx},${left.y + tangents[index - 1]! * dx} ${right.x - dx},${right.y - tangents[index]! * dx} ${right.x},${right.y}`;
  }
  return path;
}
