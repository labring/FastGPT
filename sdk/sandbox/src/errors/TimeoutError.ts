import { SandboxException } from './SandboxException';

/**
 * Thrown when an operation times out.
 */
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

/**
 * Thrown when waiting for sandbox readiness times out.
 */
export class SandboxReadyTimeoutError extends SandboxException {
  constructor(sandboxId: string, timeoutMs: number) {
    super(`Sandbox ${sandboxId} did not become ready within ${timeoutMs}ms`, 'READY_TIMEOUT');
    this.name = 'SandboxReadyTimeoutError';
    Object.setPrototypeOf(this, SandboxReadyTimeoutError.prototype);
  }
}
