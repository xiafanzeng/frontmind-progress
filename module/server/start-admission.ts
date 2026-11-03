import { AsyncLocalStorage } from "node:async_hooks";

const admission = new AsyncLocalStorage<(() => Promise<void>) | undefined>();

/** The authenticated host owns prerequisites; independent workers have no UI admission. */
export function runWithProgressStartAdmission<T>(
  check: (() => Promise<void>) | undefined,
  action: () => T,
): T {
  return admission.run(check, action);
}

/** Only new configurations and starts call this; reads, stops and settlement do not. */
export async function assertProgressStartAllowed() {
  await admission.getStore()?.();
}
