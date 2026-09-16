import type { FetchedMedia, ImageDerivatives } from "./contracts/object-store.js";

export interface MediaObjectIdentity {
  tenantId: string; projectId: string; runId: string; attemptId: string; sha256: string;
}

/** Credential-bearing clients and generic media infrastructure stay in Core.
 * The module makes all retry, result acceptance and task-state decisions. */
export interface ProgressInfrastructure {
  createConsumerTaskId(attemptId: string): string;
  classifyProviderError(error: unknown): { retryable: boolean; submissionUnknown: boolean; code?: string | number };
  compressJsonPayload(value: unknown): { body: Uint8Array; sha256: string; uncompressedBytes: number };
  createRawResultObjectKey(identity: MediaObjectIdentity): string;
  createArchivedMediaKeys(identity: MediaObjectIdentity): { original: string; display: string; thumbnail: string };
  fetchRemoteMedia(url: string, options: { maxBytes: number; signal?: AbortSignal }): Promise<FetchedMedia>;
  createImageDerivatives(body: Uint8Array): Promise<ImageDerivatives>;
  isRejectedMedia(error: unknown): boolean;
}
