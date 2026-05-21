import type { ImageSpec, NetworkPolicy, ResourceLimits } from '@/types';
import type { Volume } from '@alibaba-group/opensandbox';

/**
 * Configuration for creating a sandbox.
 */
export interface OpenSandboxConfigType {
  /** Container image specification */
  image: ImageSpec;

  /** Entrypoint command */
  entrypoint?: string[];

  /** Timeout in seconds (0 for no timeout) */
  timeout?: number;

  /** Sandbox timeout in seconds. Set to `null` to require explicit cleanup. */
  timeoutSeconds?: number | null;

  /** Resource limits */
  resourceLimits?: ResourceLimits;

  /** Environment variables */
  env?: Record<string, string>;

  /** Metadata for the sandbox */
  metadata?: Record<string, any>;

  /** Network access policy */
  networkPolicy?: NetworkPolicy;

  /** Optional volume mounts for persistent storage */
  volumes?: Volume[];

  /** Provider-specific extensions */
  extensions?: Record<string, unknown>;

  /** Skip readiness checks after create/connect */
  skipHealthCheck?: boolean;

  /** Max seconds to wait for sandbox readiness */
  readyTimeoutSeconds?: number;

  /** Poll interval for readiness checks in milliseconds */
  healthCheckPollingInterval?: number;
}
