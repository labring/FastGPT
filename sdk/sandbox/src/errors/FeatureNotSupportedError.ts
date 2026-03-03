import { SandboxException } from './SandboxException';

/**
 * Thrown when a provider does not natively support a feature
 * and no polyfill is available.
 */
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
