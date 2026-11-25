import type {
  FileInfo as SdkFileInfo,
  NetworkPolicy,
  SandboxId,
  Volume
} from '@alibaba-group/opensandbox';
import type { SandboxResourceLimitsType } from '../../type';

export type SandboxState =
  | 'UnExist'
  | 'Running'
  | 'Creating'
  | 'Starting'
  | 'Stopping'
  | 'Stopped'
  | 'Deleting'
  | 'Error';

export type SandboxStatus = {
  state: SandboxState;
  reason?: string;
  message?: string;
};

export type ImageSpec = {
  repository: string;
  tag?: string;
  digest?: string;
};

export type OpenSandboxRuntime = 'docker' | 'kubernetes';

export type ResourceLimits = SandboxResourceLimitsType;

export type SandboxInfo = {
  id: SandboxId;
  image?: ImageSpec;
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
  image?: string | ImageSpec;
  entrypoint?: string[];
  timeoutSeconds?: number | null;
  resourceLimits?: ResourceLimits;
  resourceRequests?: ResourceLimits;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
  volumes?: Volume[];
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

export type FileWriteResult = {
  path: string;
  bytesWritten: number;
  error: Error | null;
};

export type FileReadResult = {
  path: string;
  content: Uint8Array;
  error: Error | null;
};

export type FileDeleteResult = {
  path: string;
  success: boolean;
  error: Error | null;
};

export type ContentReplaceResult = {
  path: string;
  status: 'replaced' | 'unmatched' | 'unknown' | 'skipped';
  replacedCount?: number;
};

export type DirectoryEntry = Pick<SdkFileInfo, 'path' | 'size' | 'modifiedAt'> & {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
};

export type FileInfo = Omit<SdkFileInfo, 'type'> & {
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
};

export type OpenSandboxConnectionConfig = {
  sessionId: string;
  remoteSandboxId?: SandboxId;
  baseUrl: string;
  apiKey?: string;
  useServerProxy?: boolean;
};
