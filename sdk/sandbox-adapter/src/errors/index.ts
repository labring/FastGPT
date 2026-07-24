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

/** Base error for every adapter failure exposed to consumers. */
export class SandboxException extends Error {
  constructor(
    message: string,
    public readonly code: SandboxErrorCode = 'INTERNAL_UNKNOWN_ERROR',
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'SandboxException';
    Object.setPrototypeOf(this, SandboxException.prototype);
  }

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

export class ConnectionError extends SandboxException {
  constructor(
    message: string,
    public readonly endpoint?: string,
    cause?: unknown
  ) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

export class FeatureNotSupportedError extends SandboxException {
  constructor(
    message: string,
    public readonly feature: string,
    public readonly provider: string
  ) {
    super(`Feature not supported by ${provider}: ${message}`, 'FEATURE_NOT_SUPPORTED');
    this.name = 'FeatureNotSupportedError';
    Object.setPrototypeOf(this, FeatureNotSupportedError.prototype);
  }
}

export class SandboxNotFoundError extends SandboxException {
  constructor(message: string) {
    super(message, 'SANDBOX_NOT_FOUND');
    this.name = 'SandboxNotFoundError';
    Object.setPrototypeOf(this, SandboxNotFoundError.prototype);
  }
}

export class SandboxStateError extends SandboxException {
  constructor(
    message: string,
    public readonly currentState: string,
    public readonly requiredState?: string
  ) {
    super(
      `Invalid sandbox state: ${message} (current: ${currentState}${requiredState ? `, required: ${requiredState}` : ''})`,
      'INVALID_STATE'
    );
    this.name = 'SandboxStateError';
    Object.setPrototypeOf(this, SandboxStateError.prototype);
  }
}

export class TimeoutError extends SandboxException {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly operation: string
  ) {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class SandboxReadyTimeoutError extends SandboxException {
  constructor(sandboxId: string, timeoutMs: number) {
    super(`Sandbox ${sandboxId} did not become ready within ${timeoutMs}ms`, 'READY_TIMEOUT');
    this.name = 'SandboxReadyTimeoutError';
    Object.setPrototypeOf(this, SandboxReadyTimeoutError.prototype);
  }
}

export class CommandExecutionError extends SandboxException {
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly commandError?: Error;

  constructor(
    message: string,
    public readonly command: string,
    exitCodeOrCause?: number | Error,
    stdout?: string,
    stderr?: string
  ) {
    super(
      message,
      'COMMAND_FAILED',
      exitCodeOrCause instanceof Error ? exitCodeOrCause : undefined
    );
    this.name = 'CommandExecutionError';
    Object.setPrototypeOf(this, CommandExecutionError.prototype);

    if (exitCodeOrCause instanceof Error) this.commandError = exitCodeOrCause;
    else {
      this.exitCode = exitCodeOrCause;
      this.stdout = stdout;
      this.stderr = stderr;
    }
  }

  getCombinedOutput(): string {
    const output = this.stdout ?? '';
    if (!this.stderr) return output;
    return output ? `${output}\n${this.stderr}` : this.stderr;
  }
}

export type FileErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'PATH_IS_DIRECTORY'
  | 'PATH_NOT_DIRECTORY'
  | 'INVALID_PATH'
  | 'QUOTA_EXCEEDED'
  | 'TRANSFER_ERROR';

export class FileOperationError extends SandboxException {
  constructor(
    message: string,
    public readonly path: string,
    public readonly fileErrorCode: FileErrorCode,
    cause?: unknown
  ) {
    super(message, fileErrorCode, cause);
    this.name = 'FileOperationError';
    Object.setPrototypeOf(this, FileOperationError.prototype);
  }
}
