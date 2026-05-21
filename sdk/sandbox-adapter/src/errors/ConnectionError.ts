import { SandboxException } from './SandboxException';

/**
 * Thrown when connection to a sandbox fails.
 */
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
