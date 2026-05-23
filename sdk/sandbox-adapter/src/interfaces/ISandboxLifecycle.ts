import type { SandboxId, SandboxInfo, SandboxStatus } from '../types';

/**
 * Interface for sandbox lifecycle operations.
 * Follows Interface Segregation Principle - only lifecycle methods.
 */
export interface ISandboxLifecycle {
  /** Unique identifier for this sandbox */
  readonly id?: SandboxId;

  /** Current status of the sandbox */
  readonly status: SandboxStatus;

  /**
   * Ensure the sandbox is running.
   */
  ensureRunning(): Promise<void>;

  /**
   * Create a new sandbox with the given configuration.
   * The sandbox ID is assigned after creation.
   */
  create(): Promise<void>;

  /**
   * Start a stopped sandbox.
   */
  start(): Promise<void>;

  /**
   * Stop a running sandbox (graceful shutdown).
   */
  stop(): Promise<void>;

  /**
   * Delete the sandbox permanently.
   *
   * When `sandboxId` is provided, implementations should delete that target
   * sandbox directly without requiring callers to first bind the adapter via
   * `connect()`.
   */
  delete(sandboxId?: SandboxId): Promise<void>;

  /**
   * Get detailed information about the sandbox.
   */
  getInfo(): Promise<SandboxInfo | null>;

  /**
   * Wait until the sandbox is ready (healthy and responsive).
   * @param timeoutMs Maximum time to wait in milliseconds
   * @throws {SandboxReadyTimeoutError} If timeout is exceeded
   */
  waitUntilReady(timeoutMs?: number): Promise<void>;
  waitUntilDeleted(timeoutMs?: number): Promise<void>;

  /**
   * Renew the sandbox expiration, extending its lifetime.
   * Not all providers support this.
   * @param additionalSeconds Seconds to extend
   */
  renewExpiration(additionalSeconds: number): Promise<void>;
}
