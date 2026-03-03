/**
 * Base exception class for all sandbox-related errors.
 * Provides structured error information with codes and optional metadata.
 */
export class SandboxException extends Error {
  constructor(
    message: string,
    public readonly code: SandboxErrorCode = 'INTERNAL_UNKNOWN_ERROR',
    cause?: unknown
  ) {
    // @ts-expect-error - cause is a valid Error option in ES2022
    super(message, { cause });
    this.name = 'SandboxException';
    Object.setPrototypeOf(this, SandboxException.prototype);
  }

  /**
   * Returns a structured representation of the error for logging.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      cause: this.cause,
      stack: this.stack
    };
  }
}

/**
 * Error codes for sandbox exceptions.
 * Extensible via string intersection.
 */
export type SandboxErrorCode =
  | 'INTERNAL_UNKNOWN_ERROR'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'
  | 'READY_TIMEOUT'
  | 'UNHEALTHY'
  | 'INVALID_ARGUMENT'
  | 'UNEXPECTED_RESPONSE'
  | 'FEATURE_NOT_SUPPORTED'
  | 'SANDBOX_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_EXISTS'
  | 'COMMAND_FAILED'
  | (string & {});
