import { ContainerSDK } from './container';
import { SandboxSDK } from './sandbox';

export { ContainerSDK } from './container';
export { SandboxSDK } from './sandbox';

// Export types (independent definitions, no external dependencies)
export type {
  CreateContainerInput,
  ContainerInfo,
  ContainerStatus,
  ContainerServer,
  ExecRequest,
  ExecResponse
} from './types';

/**
 * SDK Configuration
 */
export interface SDKConfig {
  baseUrl: string;
  token: string;
}

/**
 * Sandbox Server SDK
 * Provides type-safe API calls for all sandbox server operations
 *
 * @example
 * ```typescript
 * import { createSDK } from 'sandbox-server/sdk';
 *
 * const sdk = createSDK('http://localhost:3000', 'your-token');
 *
 * // Container lifecycle
 * await sdk.container.create({ name: 'test', image: 'node:18', resource: { cpu: 1, memory: 1024 } });
 * const info = await sdk.container.get('test');
 * await sdk.container.pause('test');
 * await sdk.container.start('test');
 * await sdk.container.delete('test');
 *
 * // Sandbox operations
 * const healthy = await sdk.sandbox.health('test');
 * const result = await sdk.sandbox.exec('test', { command: 'ls -la' });
 * ```
 */
export interface SandboxServerSDK {
  container: ContainerSDK;
  sandbox: SandboxSDK;
}

/**
 * Create a new SDK instance
 */
export function createSDK(baseUrl: string, token: string): SandboxServerSDK {
  return {
    container: new ContainerSDK(baseUrl, token),
    sandbox: new SandboxSDK(baseUrl, token)
  };
}

/**
 * Create a new SDK instance from config
 */
export function createSDKFromConfig(config: SDKConfig): SandboxServerSDK {
  return createSDK(config.baseUrl, config.token);
}
