import type { Volume as OpenSandboxVolume } from '@alibaba-group/opensandbox';

/**
 * Unique identifier for a sandbox.
 */
export type SandboxId = string;

/** Controls whether ensureRunning may create a missing provider resource. */
export type SandboxEnsureRunningOptions = {
  allowCreate?: boolean;
};

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
export type SandboxStatus = {
  state: SandboxState;
  reason?: string;
  message?: string;
};

/**
 * Resource limits for a sandbox.
 */
export type ResourceLimits = {
  cpuCount?: number;
  memoryMiB?: number;
  diskGiB?: number;
};

/**
 * Image specification for sandbox creation.
 */
export type ImageSpec = {
  repository: string;
  tag?: string;
  digest?: string;
};

export type LabelSpec = {
  key: string;
  value: string;
};

export type LifecyclePolicy = {
  pauseAt?: string;
  archiveAfterPauseTime?: string;
};

export type KubeAccessPolicy = {
  enabled?: boolean;
  roleTemplate?: 'view' | 'edit' | 'admin';
};

export type NetworkRuleAction = 'allow' | 'deny';

export type NetworkRule = {
  action: NetworkRuleAction;
  target: string;
};

export type NetworkPolicy = {
  defaultAction?: NetworkRuleAction;
  egress?: NetworkRule[];
};

/**
 * Information about a sandbox.
 */
export type SandboxInfo = {
  id: SandboxId;
  image?: ImageSpec;
  entrypoint: string[];
  metadata?: Record<string, string>;
  status: SandboxStatus;
  createdAt: Date;
  expiresAt?: Date;
  resourceLimits?: ResourceLimits;
};

/**
 * Sandbox metrics.
 */
export type SandboxMetrics = {
  cpuCount: number;
  cpuUsedPercentage: number;
  memoryTotalMiB: number;
  memoryUsedMiB: number;
  timestamp: number;
};

/**
 * Endpoint information for accessing sandbox services.
 */
export type Endpoint = {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  url: string;
};

/** Provider features that callers must check before using optional operations. */
export type SandboxCapabilities = {
  readonly command: {
    readonly streaming: boolean;
    readonly background: boolean;
    readonly interrupt: boolean;
  };
  readonly filesystem: {
    readonly streamingRead: boolean;
    readonly streamingWrite: boolean;
  };
  readonly metrics: boolean;
  readonly expirationRenewal: boolean;
};

/**
 * App-facing create spec shared by callers that choose a provider at runtime.
 *
 * The surface is intentionally wider than any single provider API: FastGPT builds
 * one runtime profile and maps it to a provider-specific create config before it
 * reaches the adapter factory.
 */
export type SandboxCreateSpec = {
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

  /** String metadata persisted by providers for filtering and traceability. */
  metadata?: Record<string, string>;

  /** Provider-visible labels, mainly used by Kubernetes-backed providers such as Sealos. */
  labels?: LabelSpec[];

  /** Pause/archive policy for providers with managed lifecycle support. */
  lifecycle?: LifecyclePolicy;

  /** Kubernetes permission template for providers that expose in-sandbox kube access. */
  kubeAccess?: KubeAccessPolicy;

  /** OpenSandbox volume mounts. */
  volumes?: OpenSandboxVolume[];

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
};

export type SandboxEndpointSelector = number;
