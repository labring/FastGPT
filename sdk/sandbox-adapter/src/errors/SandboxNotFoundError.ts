import { SandboxException } from './SandboxException';

/** Thrown when the provider confirms that the physical sandbox does not exist. */
export class SandboxNotFoundError extends SandboxException {
  constructor(message: string) {
    super(message, 'SANDBOX_NOT_FOUND');
    this.name = 'SandboxNotFoundError';
    Object.setPrototypeOf(this, SandboxNotFoundError.prototype);
  }
}
