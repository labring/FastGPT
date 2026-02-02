/**
 * Provider capability flags.
 * Used for feature detection and polyfill routing.
 */
export interface ProviderCapabilities {
  /** Provider supports pausing and resuming sandboxes */
  supportsPauseResume: boolean;

  /** Provider supports extending sandbox expiration */
  supportsRenews: boolean;

  /** Provider supports real-time streaming command output */
  supportsStreamingOutput: boolean;

  /** Provider supports background/long-running execution */
  supportsBackgroundExecution: boolean;

  /** Provider has native filesystem API (not just command-based) */
  nativeFileSystem: boolean;

  /** Provider supports batch file operations */
  supportsBatchOperations: boolean;

  /** Provider supports streaming file transfers */
  supportsStreamingTransfer: boolean;

  /** Provider supports file permission operations */
  supportsPermissions: boolean;

  /** Provider supports file search functionality */
  supportsSearch: boolean;

  /** Provider has native health check endpoint */
  nativeHealthCheck: boolean;

  /** Provider has native metrics endpoint */
  nativeMetrics: boolean;
}

/**
 * Helper to create full capability set (for fully-featured providers).
 */
export function createFullCapabilities(): ProviderCapabilities {
  return {
    supportsPauseResume: true,
    supportsRenews: true,
    supportsStreamingOutput: true,
    supportsBackgroundExecution: true,
    nativeFileSystem: true,
    supportsBatchOperations: true,
    supportsStreamingTransfer: true,
    supportsPermissions: true,
    supportsSearch: true,
    nativeHealthCheck: true,
    nativeMetrics: true
  };
}

/**
 * Helper to create minimal capability set (command-only providers).
 */
export function createMinimalCapabilities(): ProviderCapabilities {
  return {
    supportsPauseResume: false,
    supportsRenews: false,
    supportsStreamingOutput: false,
    supportsBackgroundExecution: false,
    nativeFileSystem: false,
    supportsBatchOperations: false,
    supportsStreamingTransfer: false,
    supportsPermissions: false,
    supportsSearch: false,
    nativeHealthCheck: false,
    nativeMetrics: false
  };
}
