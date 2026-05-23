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

export type NetworkRuleAction = 'allow' | 'deny';

export interface NetworkRule {
  action: NetworkRuleAction;
  target: string;
}

export interface NetworkPolicy {
  defaultAction?: NetworkRuleAction;
  egress?: NetworkRule[];
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
 *
 * The surface is intentionally wider than any single provider API: FastGPT builds
 * one runtime profile, then each adapter maps the fields its backend supports and
 * ignores the rest. Keep provider-specific fields documented here so callers do
 * not need to import per-adapter request types.
 */
export interface SandboxCreateSpec {
  /** Container image to run. Required by OpenSandbox, optional for Sealos template-based devboxes. */
  image?: ImageSpec;

  /** Entrypoint command used by providers that support overriding the container process. */
  entrypoint?: string[];

  /** Sandbox lifetime in seconds. `null` means the provider should require explicit cleanup. */
  timeoutSeconds?: number | null;

  /** CPU, memory, and disk limits, mapped only by providers with native resource controls. */
  resourceLimits?: ResourceLimits;

  /** Environment variables injected when the sandbox is created. */
  env?: Record<string, string>;

  /** App-level metadata for traceability; providers may persist or ignore it. */
  metadata?: Record<string, unknown>;

  /** Provider-visible labels, mainly used by Kubernetes-backed providers such as Sealos. */
  labels?: LabelSpec[];

  /** Pause/archive policy for providers with managed lifecycle support. */
  lifecycle?: LifecyclePolicy;

  /** Kubernetes permission template for providers that expose in-sandbox kube access. */
  kubeAccess?: KubeAccessPolicy;

  /** Provider-native volume mount specs; shape is intentionally provider-defined. */
  volumes?: unknown[];

  /** Provider-native outbound network policy. OpenSandbox currently matches FQDN/wildcard rules. */
  networkPolicy?: NetworkPolicy;

  /** Opaque provider extension parameters passed through to backends that support them. */
  extensions?: Record<string, string>;

  /** Default workspace directory for relative paths and command execution. */
  workingDir?: string;

  /** Stable upstream business id used by providers for reuse, grouping, or audit trails. */
  upstreamID?: string;

  /** Skip post-create readiness checks when the caller or provider handles readiness elsewhere. */
  skipHealthCheck?: boolean;

  /** Maximum seconds to wait for the sandbox to become ready. */
  readyTimeoutSeconds?: number;

  /** Readiness polling interval in milliseconds. */
  healthCheckPollingInterval?: number;
}

export type SandboxEndpointSelector = number;
