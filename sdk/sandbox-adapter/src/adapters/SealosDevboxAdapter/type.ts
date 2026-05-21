/**
 * Devbox phases representing various lifecycle states.
 */
export enum DevboxPhaseEnum {
  Running = 'Running',
  Pending = 'Pending',
  Paused = 'Paused',
  Pausing = 'Pausing',

  // Response error
  Stopped = 'Stopped',
  Stopping = 'Stopping',
  Shutdown = 'Shutdown',
  Shutting = 'Shutting',
  Error = 'Error',
  Unknown = 'Unknown'
}
/** Configuration for the Devbox REST API client. */
export interface DevboxApiConfig {
  /** Base URL of the devbox server */
  baseUrl: string;
  /** JWT token for authentication */
  token: string;
}

/** Unified API response envelope. */
export interface DevboxApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** Request body for the exec endpoint. */
export interface ExecRequest {
  command: string[];
  /** Optional stdin content */
  stdin?: string;
  /** Timeout in seconds [1, 600], default 30 */
  timeoutSeconds?: number;
  /** Target container name, defaults to first container in Pod */
  container?: string;
}

/** Response data from the exec endpoint. */
export interface ExecResponseData {
  podName: string;
  container: string;
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  executedAt: string;
}

/** Response data from create/pause/stop/resume/delete endpoints. */
export interface DevboxMutationData {
  name: string;
  namespace?: string;
  state?: string;
  status?: string;
}

/** Request body for the create endpoint. */
export interface DevboxCreateRequest {
  name: string;
  image?: string;
  env?: Record<string, string>;
  labels?: Array<{ key: string; value: string }>;
  upstreamID?: string;
  kubeAccess?: {
    enabled?: boolean;
    roleTemplate?: 'view' | 'edit' | 'admin';
  };
  pauseAt?: string;
  archiveAfterPauseTime?: string;
}

/** SSH connection info returned by the info endpoint. */
export interface DevboxSshInfo {
  user: string;
  host: string;
  port: number;
  target: string;
  link: string;
  command: string;
  privateKeyEncoding: string;
  privateKeyBase64: string;
}

/** HTTP gateway info returned by the info endpoint. */
export interface DevboxGatewayInfo {
  url: string;
  token?: string;
  port?: number;
  uniqueID?: string;
}

/** Response data from the GET info endpoint. */
export interface DevboxInfoData {
  name: string;
  image?: string;
  creationTimestamp?: string;
  deletionTimestamp?: string | null;
  state: {
    phase: `${DevboxPhaseEnum}`;
  };
  ssh: DevboxSshInfo;
  gateway?: DevboxGatewayInfo;
  codeServerGateway?: DevboxGatewayInfo & {
    password?: string;
  };
}

/** Response data from the upload endpoint. */
export interface UploadResponseData {
  name: string;
  podName: string;
  container: string;
  path: string;
  sizeBytes: number;
  mode: string;
  uploadedAt: string;
  timeoutSecond: number;
}

/** Query parameters for file upload. */
export interface UploadFileParams {
  /** Remote path inside the container */
  path: string;
  /** File permission, octal string e.g. "0644" */
  mode?: string;
  /** Timeout in seconds [1, 3600], default 300 */
  timeoutSeconds?: number;
  /** Target container name */
  container?: string;
}

/** Query parameters for file download. */
export interface DownloadFileParams {
  /** Remote file path inside the container */
  path: string;
  /** Suggested filename for the response header */
  filename?: string;
  /** Timeout in seconds [1, 3600], default 300 */
  timeoutSeconds?: number;
  /** Target container name */
  container?: string;
}
