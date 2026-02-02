/**
 * Unique identifier for a sandbox.
 */
export type SandboxId = string;

/**
 * Sandbox status states.
 */
export type SandboxState =
  | 'Creating'
  | 'Running'
  | 'Pausing'
  | 'Paused'
  | 'Resuming'
  | 'Deleting'
  | 'Deleted'
  | 'Error'
  | string; // Extensible for provider-specific states

/**
 * Sandbox status information.
 */
export interface SandboxStatus {
  state: SandboxState;
  reason?: string;
  message?: string;
}

/**
 * Resource limits for a sandbox.
 */
export interface ResourceLimits {
  cpuCount?: number;
  memoryMiB?: number;
  diskGiB?: number;
}

/**
 * Image specification for sandbox creation.
 */
export interface ImageSpec {
  repository: string;
  tag?: string;
  digest?: string;
}

/**
 * Network policy for sandbox.
 */
export interface NetworkPolicy {
  allowEgress?: boolean;
  allowedHosts?: string[];
}

/**
 * Configuration for creating a sandbox.
 */
export interface SandboxConfig {
  /** Container image specification */
  image: ImageSpec;

  /** Entrypoint command */
  entrypoint?: string[];

  /** Timeout in seconds (0 for no timeout) */
  timeout?: number;

  /** Resource limits */
  resourceLimits?: ResourceLimits;

  /** Environment variables */
  env?: Record<string, string>;

  /** Metadata for the sandbox */
  metadata?: Record<string, string>;

  /** Network access policy */
  networkPolicy?: NetworkPolicy;

  /** Provider-specific extensions */
  extensions?: Record<string, unknown>;
}

/**
 * Information about a sandbox.
 */
export interface SandboxInfo {
  id: SandboxId;
  image: ImageSpec;
  entrypoint: string[];
  metadata?: Record<string, string>;
  status: SandboxStatus;
  createdAt: Date;
  expiresAt?: Date;
  resourceLimits?: ResourceLimits;
}

/**
 * Sandbox metrics.
 */
export interface SandboxMetrics {
  cpuCount: number;
  cpuUsedPercentage: number;
  memoryTotalMiB: number;
  memoryUsedMiB: number;
  timestamp: number;
}

/**
 * Endpoint information for accessing sandbox services.
 */
export interface Endpoint {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  url: string;
}
