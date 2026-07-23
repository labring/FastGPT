import type { ImageSpec, SandboxCreateSpec } from '../../types';
import type { Volume } from '@alibaba-group/opensandbox';

/** OpenSandbox runtime implementation. */
export type SandboxRuntimeType = 'docker' | 'kubernetes';

/** Connection configuration for the OpenSandbox SDK. */
export type OpenSandboxConnectionConfig = {
  sessionId: string;
  baseUrl: string;
  apiKey?: string;
  requestTimeoutSeconds?: number;
  debug?: boolean;
  useServerProxy?: boolean;
  runtime?: SandboxRuntimeType;
};

/** OpenSandbox creation configuration accepted by direct adapter consumers. */
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
  image: ImageSpec;
  metadata?: Record<string, string>;
  volumes?: Volume[];
};
