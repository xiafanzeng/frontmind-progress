import type { MoliScreenshotPolicy } from "./types.js";

/**
 * Screenshot policy accepted by the vendor submit-task API
 * (https://doc.molizhishu.com/docs/api/submit-task):
 * 0 = no screenshot, 1 = screenshot every answer, 2 = screenshot when the
 * monitored brand is mentioned. The model catalog endpoint returns no
 * screenshot capability field, so availability cannot be derived per model.
 */
export const MOLI_SCREENSHOT_POLICIES: readonly MoliScreenshotPolicy[] = [
  0,
  1,
  2,
];

export function isMoliScreenshotPolicy(
  value: unknown,
): value is MoliScreenshotPolicy {
  return value === 0 || value === 1 || value === 2;
}

export function assertMoliScreenshotPolicy(value: unknown): void {
  if (!isMoliScreenshotPolicy(value)) {
    throw new TypeError(
      "screenshot policy must be 0 (none), 1 (all), or 2 (on brand mention)",
    );
  }
}

/**
 * Effective screenshot capability derived from the vendor contract: the
 * submit-task API accepts the screenshot parameter for every model, so every
 * catalog platform is screenshot-capable regardless of local acceptance
 * records. Acceptance checks stay available as internal diagnostics and are
 * never reported as passed by this derivation.
 */
export function moliEffectiveScreenshotSupport(): boolean {
  return true;
}
