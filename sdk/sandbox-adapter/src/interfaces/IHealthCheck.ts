import type { SandboxMetrics } from '../types';

/**
 * Interface for health checking and metrics.
 * Follows Interface Segregation Principle.
 */
export interface IHealthCheck {
  /**
   * Check if the sandbox is healthy and responsive.
   * @returns true if healthy, false otherwise
   */
  ping(): Promise<boolean>;

  /**
   * Get current resource metrics.
   * @returns Current metrics (CPU, memory usage)
   */
  getMetrics(): Promise<SandboxMetrics>;

  /**
   * Stream metrics in real-time.
   * Not all providers support this.
   * @returns Async iterable of metric snapshots
   */
  streamMetrics?(): AsyncIterable<SandboxMetrics>;
}
