import { SandboxException } from './SandboxException';

/**
 * Thrown when an operation is attempted in an invalid sandbox state.
 */
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
