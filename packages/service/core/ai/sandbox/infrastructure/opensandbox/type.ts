import type {
  NetworkPolicy,
  SandboxId,
  Volume as OpenSandboxVolume
} from '@alibaba-group/opensandbox';
import type { SandboxResourceLimitsType } from '../../type';

export type SandboxState = 'UnExist' | 'Running' | 'Creating' | 'Starting' | 'Deleting' | 'Error';

export type SandboxStatus = {
  state: SandboxState;
  reason?: string;
  message?: string;
};

export type SandboxInfo = {
  id: SandboxId;
  image?: string;
  entrypoint: string[];
  metadata?: Record<string, string>;
  status: SandboxStatus;
  createdAt: Date;
  expiresAt?: Date;
};

export type Endpoint = {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  url: string;
  headers?: Record<string, string>;
};

export type SandboxCreateSpec = {
  image?: string;
  entrypoint?: string[];
  timeoutSeconds?: number | null;
  resourceLimits?: SandboxResourceLimitsType;
  resourceRequests?: Pick<
    SandboxResourceLimitsType,
    'cpuCount' | 'memoryMiB' | 'ephemeralStorageSize'
  >;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
  volumes?: OpenSandboxVolume[];
  networkPolicy?: NetworkPolicy;
  extensions?: Record<string, string>;
  skipHealthCheck?: boolean;
  readyTimeoutSeconds?: number;
  healthCheckPollingInterval?: number;
};

export type ExecuteOptions = {
  workingDirectory?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  signal?: AbortSignal;
  maxOutputBytes?: number;
};

export type FileReadResult = {
  path: string;
  content: Uint8Array;
  error: Error | null;
};

export type OpenSandboxConnectionConfig = {
  deploymentId: string;
  sessionId: string;
  remoteSandboxId?: SandboxId;
  baseUrl: string;
  apiKey?: string;
};
