import type { ICommandExecution } from './ICommandExecution';
import type { IFileSystem } from './IFileSystem';
import type { IHealthCheck } from './IHealthCheck';
import type { ISandboxLifecycle } from './ISandboxLifecycle';
import type { Endpoint, SandboxEndpointSelector } from '../types';

/**
 * Unified sandbox interface.
 * Composes all sandbox behaviors into a single interface.
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

  /** Resolve an endpoint exposed by the sandbox provider. */
  getEndpoint(selector: SandboxEndpointSelector): Promise<Endpoint>;
}
