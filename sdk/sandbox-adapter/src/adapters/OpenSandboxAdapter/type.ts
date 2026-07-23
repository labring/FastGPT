import type { ImageSpec, SandboxCreateSpec } from '@/types';
import type { Volume } from '@alibaba-group/opensandbox';

/**
 * Configuration for creating a sandbox.
 */
export type OpenSandboxConfigType = Pick<
  SandboxCreateSpec,
  | 'entrypoint'
  | 'timeoutSeconds'
  | 'resourceLimits'
  | 'env'
  | 'networkPolicy'
  | 'extensions'
  | 'skipHealthCheck'
  | 'readyTimeoutSeconds'
  | 'healthCheckPollingInterval'
> & {
  /** Container image specification */
  image: ImageSpec;

  /** Metadata for the sandbox */
  metadata?: Record<string, string>;

  /** Optional volume mounts for persistent storage */
  volumes?: Volume[];
};
