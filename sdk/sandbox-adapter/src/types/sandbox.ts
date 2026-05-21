/**
 * Unique identifier for a sandbox.
 */
export type SandboxId = string;

/**
 * Sandbox status states.
 */
export type SandboxState =
  | 'UnExist'
  | 'Running'
  | 'Creating'
  | 'Starting'
  | 'Stopping'
  | 'Stopped'
  | 'Deleting'
  | 'Error';

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

export interface LabelSpec {
  key: string;
  value: string;
}

export interface LifecyclePolicy {
  pauseAt?: string;
  archiveAfterPauseTime?: string;
}

export interface KubeAccessPolicy {
  enabled?: boolean;
  roleTemplate?: 'view' | 'edit' | 'admin';
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

/**
 * App-facing create spec shared by callers that choose a provider at runtime.
 * Individual adapters should map only the fields their backend actually supports.
 */
export interface SandboxCreateSpec {
  image?: ImageSpec;
  entrypoint?: string[];
  timeout?: number;
  timeoutSeconds?: number | null;
  resourceLimits?: ResourceLimits;
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
  labels?: LabelSpec[];
  lifecycle?: LifecyclePolicy;
  kubeAccess?: KubeAccessPolicy;
  networkPolicy?: NetworkPolicy;
  volumes?: unknown[];
  workingDir?: string;
  upstreamID?: string;
  extensions?: Record<string, unknown>;
  skipHealthCheck?: boolean;
  readyTimeoutSeconds?: number;
  healthCheckPollingInterval?: number;
}

export type SandboxEndpointSelector = number;
