import {TRPCError} from '@trpc/server';
import {RepositoryError} from '@frontmind/module-contracts/errors';
export function repositoryTrpcError(error: RepositoryError): TRPCError {
  const code = {
    NOT_FOUND: "NOT_FOUND",
    FORBIDDEN: "FORBIDDEN",
    CONFLICT: "CONFLICT",
    QUOTA_EXCEEDED: "PRECONDITION_FAILED",
    BALANCE_INSUFFICIENT: "PRECONDITION_FAILED",
    INVALID_STATE: "BAD_REQUEST",
  }[error.code] as
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "CONFLICT"
    | "PRECONDITION_FAILED"
    | "BAD_REQUEST";
  return new TRPCError({ code, message: error.message, cause: error });
}
export async function translateRepositoryErrors<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof RepositoryError)) throw error;
    throw repositoryTrpcError(error);
  }
}