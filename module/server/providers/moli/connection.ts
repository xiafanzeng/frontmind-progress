import { createMoliClientFromEnvironment } from './runtime.js';

/** Read-only connection check. Returns no credential, balance, or raw payload. */
export async function checkMoliConnection(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl?: typeof fetch,
) {
  const models = await createMoliClientFromEnvironment(env, fetchImpl).listModels();
  return { connected: true as const, provider: 'moli' as const, modelCount: models.length };
}
