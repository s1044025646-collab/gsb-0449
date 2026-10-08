/** 稳定的机器可读错误码。 */
export type ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'ASSET_NOT_FOUND'
  | 'POOL_NOT_FOUND'
  | 'ZERO_INPUT'
  | 'ZERO_OUTPUT'
  | 'INSUFFICIENT_OUTPUT'
  | 'INVALID_DIRECTION'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'VERIFY_FAILED'
  | 'NOT_FOUND'
  | 'LIMIT_EXCEEDED';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}
