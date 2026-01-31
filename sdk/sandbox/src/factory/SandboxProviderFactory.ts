import { MinimalProviderAdapter, OpenSandboxAdapter } from '../adapters';
import type { ISandbox } from '../interfaces';

/**
 * Configuration for creating a sandbox provider.
 */
export interface ProviderConfig {
  /** Provider type */
  provider: 'opensandbox' | 'minimal' | string;

  /** Connection configuration (provider-specific) */
  connection?: {
    baseUrl?: string;
    apiKey?: string;
    [key: string]: unknown;
  };

  /** Provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Factory for creating sandbox provider instances.
 *
 * Following the Factory Pattern, this centralizes provider
 * creation and configuration.
 *
 * Example:
 * ```typescript
 * const sandbox = await SandboxProviderFactory.create({
 *   provider: 'opensandbox',
 *   connection: { apiKey: 'xxx' }
 * });
 *
 * await sandbox.create({ image: { repository: 'node', tag: '18' } });
 * ```
 */
const customProviders = new Map<string, (config: ProviderConfig) => ISandbox>();

/**
 * Create a sandbox provider instance.
 *
 * @param config Provider configuration
 * @returns Configured sandbox instance
 * @throws Error if provider type is unknown
 */
function createProvider(config: ProviderConfig): ISandbox {
  switch (config.provider) {
    case 'opensandbox':
      return new OpenSandboxAdapter({
        baseUrl: config.connection?.baseUrl,
        apiKey: config.connection?.apiKey,
        runtime: config.connection?.runtime as 'docker' | 'kubernetes' | undefined
      });

    case 'minimal':
      return new MinimalProviderAdapter();

    default: {
      // Check custom providers
      const customFactory = customProviders.get(config.provider);
      if (customFactory) {
        return customFactory(config);
      }
      throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
}

/**
 * Register a custom provider adapter.
 *
 * @param name Provider name
 * @param factory Function that creates the adapter
 */
function registerProvider(name: string, factory: (config: ProviderConfig) => ISandbox): void {
  customProviders.set(name, factory);
}

/**
 * Get list of available providers.
 */
function getAvailableProviders(): string[] {
  return ['opensandbox', 'minimal', ...customProviders.keys()];
}

/**
 * Factory for creating sandbox provider instances.
 *
 * Following the Factory Pattern, this centralizes provider
 * creation and configuration.
 *
 * Example:
 * ```typescript
 * const sandbox = await SandboxProviderFactory.create({
 *   provider: 'opensandbox',
 *   connection: { apiKey: 'xxx' }
 * });
 *
 * await sandbox.create({ image: { repository: 'node', tag: '18' } });
 * ```
 */
export const SandboxProviderFactory = {
  create: createProvider,
  registerProvider,
  getAvailableProviders
};

/**
 * Convenience function for creating sandboxes.
 *
 * Shorthand for SandboxProviderFactory.create()
 */
export function createSandbox(config: ProviderConfig): ISandbox {
  return SandboxProviderFactory.create(config);
}
