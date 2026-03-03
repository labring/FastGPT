import type { ProviderCapabilities } from '../types';

/**
 * Detects and reports on provider capabilities.
 *
 * This class can perform runtime capability detection by testing
 * specific features, or use static capability declarations.
 */
export class CapabilityDetector {
  /**
   * Create a static detector with known capabilities.
   */
  static fromCapabilities(capabilities: ProviderCapabilities): CapabilityDetector {
    return new CapabilityDetector(capabilities);
  }

  constructor(private readonly capabilities: ProviderCapabilities) {}

  /**
   * Get the full capability set.
   */
  getCapabilities(): ProviderCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if a specific capability is supported.
   */
  hasCapability<K extends keyof ProviderCapabilities>(capability: K): ProviderCapabilities[K] {
    return this.capabilities[capability];
  }

  /**
   * Check if filesystem operations need polyfilling.
   */
  needsFileSystemPolyfill(): boolean {
    return !this.capabilities.nativeFileSystem;
  }

  /**
   * Check if health check needs polyfilling.
   */
  needsHealthCheckPolyfill(): boolean {
    return !this.capabilities.nativeHealthCheck;
  }

  /**
   * Check if metrics need polyfilling.
   */
  needsMetricsPolyfill(): boolean {
    return !this.capabilities.nativeMetrics;
  }

  /**
   * Check if search needs polyfilling.
   */
  needsSearchPolyfill(): boolean {
    return !this.capabilities.supportsSearch;
  }

  /**
   * Get a summary of which features are native vs polyfilled.
   */
  getFeatureSummary(): {
    native: string[];
    polyfilled: string[];
    unsupported: string[];
  } {
    const native: string[] = [];
    const polyfilled: string[] = [];
    const unsupported: string[] = [];

    const checkCapability = (name: keyof ProviderCapabilities, needsPolyfill?: () => boolean) => {
      if (this.capabilities[name]) {
        native.push(name);
      } else if (needsPolyfill?.()) {
        polyfilled.push(name);
      } else if (needsPolyfill) {
        unsupported.push(name);
      }
    };

    checkCapability('supportsPauseResume');
    checkCapability('supportsRenews');
    checkCapability('supportsStreamingOutput');
    checkCapability('supportsBackgroundExecution');
    checkCapability('nativeFileSystem', () => this.needsFileSystemPolyfill());
    checkCapability('supportsBatchOperations');
    checkCapability('supportsStreamingTransfer');
    checkCapability('supportsPermissions');
    checkCapability('supportsSearch', () => this.needsSearchPolyfill());
    checkCapability('nativeHealthCheck', () => this.needsHealthCheckPolyfill());
    checkCapability('nativeMetrics', () => this.needsMetricsPolyfill());

    return { native, polyfilled, unsupported };
  }
}
