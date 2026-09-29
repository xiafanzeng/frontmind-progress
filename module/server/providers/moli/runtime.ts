import { MoliClient } from './client.js';
import { MoliConfigurationError } from './errors.js';

/** Server-only factory for new module API handlers; never import from client/. */
export function createMoliClientFromEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl?: typeof fetch,
): MoliClient {
  const timeoutMs = Number(env.MOLI_TIMEOUT_MS ?? 20_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new MoliConfigurationError('MOLI_TIMEOUT_MS must be a positive integer');
  }
  return new MoliClient({
    token: env.MOLI_API_TOKEN ?? '',
    origin: env.MOLI_API_ORIGIN?.trim() || env.MOLI_API_BASE_URL?.trim() || undefined,
    timeoutMs,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}
