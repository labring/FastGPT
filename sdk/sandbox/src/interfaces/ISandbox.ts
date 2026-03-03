import type { ProviderCapabilities } from '../types';
import type { ICommandExecution } from './ICommandExecution';
import type { IFileSystem } from './IFileSystem';
import type { IHealthCheck } from './IHealthCheck';
import type { ISandboxLifecycle } from './ISandboxLifecycle';

/**
 * Unified sandbox interface.
 * Composes all sandbox capabilities into a single interface.
 *
 * This is the primary interface that consumers interact with.
 * All concrete adapters must implement this interface.
 *
 * Following Interface Segregation Principle, this interface
 * is composed of smaller, focused interfaces.
 */
export interface ISandbox extends ISandboxLifecycle, ICommandExecution, IFileSystem, IHealthCheck {
  /** Provider name (e.g., 'opensandbox') */
  readonly provider: string;

  /** Provider capability flags */
  readonly capabilities: ProviderCapabilities;

  /**
   * Close the connection and release resources.
   * Should be called when done with the sandbox.
   */
  close(): Promise<void>;
}
