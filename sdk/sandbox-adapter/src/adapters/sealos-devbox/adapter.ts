import { CommandFilesystemPolyfill } from '../../polyfills/command-filesystem';
import {
  CommandExecutionError,
  ConnectionError,
  SandboxNotFoundError,
  SandboxStateError
} from '../../errors';
import type {
  Endpoint,
  ExecuteOptions,
  ExecuteResult,
  SandboxCapabilities,
  SandboxCreateSpec,
  SandboxEndpointSelector,
  SandboxEnsureRunningOptions,
  SandboxId,
  SandboxInfo,
  SandboxState,
  FileWriteEntry,
  FileWriteResult,
  FileReadResult,
  ReadFileOptions
} from '../../types';
import { BaseSandboxAdapter } from '../base';
import { DevboxClient, DevboxClientError } from './client';
import { DevboxPhaseEnum, type DevboxCreateRequest, type DevboxInfoData } from './types';
import { formatImageSpec, parseImageSpec } from '@/utils/image';
import { joinUrlPath } from '@/utils/url';
import { fileDataToUint8Array, isReadableStreamData, posixModeToOctalNumber } from '@/utils/files';
import { BoundedOutputBuffer } from '@/utils/outputBuffer';

const GET_INFO_RETRY_TIMEOUT_MS = 30_000;
const GET_INFO_RETRY_INTERVAL_MS = 1_000;
const LIFECYCLE_TIMEOUT_MS = 120_000;

/**
 * Configuration for Sealos Devbox Adapter.
 */
export type SealosDevboxConfig = {
  /** Base URL for the Sealos Devbox Server API */
  baseUrl: string;
  /** JWT authentication token */
  token: string;
  sandboxId: string;
  /**
   * Optional override for the Sealos httpgate wildcard domain. When omitted,
   * it is derived from gateway.url returned by Devbox Server.
   */
  httpgateDomain?: string;
};

/** Creation fields implemented by the Sealos Devbox API adapter. */
export type SealosDevboxCreateConfig = Pick<
  SandboxCreateSpec,
  'image' | 'env' | 'labels' | 'lifecycle' | 'kubeAccess' | 'workingDir' | 'upstreamID'
>;

export class SealosDevboxAdapter extends BaseSandboxAdapter {
  readonly provider = 'sealosdevbox' as const;
  readonly capabilities: SandboxCapabilities = {
    command: { streaming: false, background: false, interrupt: false },
    filesystem: { streamingRead: true, streamingWrite: true },
    metrics: true,
    expirationRenewal: false
  };

  get rootPath(): string {
    const workingDir = this.createConfig?.workingDir?.trim();
    return workingDir ? workingDir.replace(/\/+$/, '') : '/home/devbox/workspace';
  }

  private api: DevboxClient;
  private _id: SandboxId;

  constructor(
    private config: SealosDevboxConfig,
    private createConfig?: SealosDevboxCreateConfig
  ) {
    super();
    this.api = new DevboxClient({ baseUrl: config.baseUrl, token: config.token });
    this._id = config.sandboxId;
    this.polyfillService = new CommandFilesystemPolyfill(this);
  }

  get id(): SandboxId {
    return this._id;
  }

  private adaptStatus(data: DevboxInfoData): SandboxState {
    if (data.deletionTimestamp) {
      return 'Deleting';
    }

    switch (data.state.phase) {
      case DevboxPhaseEnum.Running:
        return 'Running';
      case DevboxPhaseEnum.Pending:
        return 'Creating';
      case DevboxPhaseEnum.Paused:
      case DevboxPhaseEnum.Stopped:
      case DevboxPhaseEnum.Shutdown:
        return 'Stopped';
      case DevboxPhaseEnum.Pausing:
      case DevboxPhaseEnum.Stopping:
      case DevboxPhaseEnum.Shutting:
        return 'Stopping';
      default:
        return 'Error';
    }
  }

  private buildCreateRequest(): DevboxCreateRequest {
    const spec = this.createConfig ?? {};
    const env = { ...(spec.env ?? {}) };
    if (spec.workingDir && !env.CODEX_GATEWAY_CWD) {
      env.CODEX_GATEWAY_CWD = spec.workingDir;
    }

    return {
      name: this._id,
      image: spec.image?.repository ? formatImageSpec(spec.image) : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      labels: spec.labels,
      upstreamID: spec.upstreamID,
      kubeAccess: spec.kubeAccess,
      pauseAt: spec.lifecycle?.pauseAt,
      archiveAfterPauseTime: spec.lifecycle?.archiveAfterPauseTime
    };
  }

  private assertMutationSuccess(props: {
    response: { code: number; message?: string };
    action: string;
    acceptedCodes?: number[];
  }): void {
    if (
      (props.response.code >= 200 && props.response.code < 300) ||
      props.acceptedCodes?.includes(props.response.code)
    ) {
      return;
    }

    throw new Error(
      props.response.message || `Devbox ${props.action} failed with code ${props.response.code}`
    );
  }

  private isNotFoundResponse(res: { code?: number; message?: string }): boolean {
    return (
      res.code === 404 ||
      String(res.message ?? '')
        .toLowerCase()
        .includes('not found')
    );
  }

  private isRetryableGetInfoError(error: unknown): boolean {
    let current: unknown = error;

    while (current instanceof Error) {
      if (current instanceof DevboxClientError) {
        const rawBody = current.rawBody.toLowerCase();
        return [502, 503, 504].includes(current.status) || rawBody.includes('no healthy upstream');
      }
      current = current.cause;
    }

    return false;
  }

  /**
   * Devbox gateway can briefly return 502/503/504 during restart before the sandbox
   * status is readable. Limit retry to the initial info probe to avoid repeating
   * lifecycle mutations such as create/resume/delete.
   */
  private async getInfoWithProviderRetry(
    timeoutMs = GET_INFO_RETRY_TIMEOUT_MS,
    intervalMs = GET_INFO_RETRY_INTERVAL_MS
  ): Promise<SandboxInfo | null> {
    const startTime = Date.now();
    let lastError: unknown;

    while (Date.now() - startTime < timeoutMs) {
      try {
        return await this.getInfo();
      } catch (error) {
        lastError = error;
        if (!this.isRetryableGetInfoError(error)) {
          throw error;
        }
        await this.sleep(intervalMs);
      }
    }

    throw lastError;
  }

  /** Wait until a successful pause request is reflected by the provider state. */
  private async waitUntilStopped(timeoutMs = LIFECYCLE_TIMEOUT_MS): Promise<void> {
    const startTime = Date.now();
    let currentState: SandboxState = 'Stopping';

    while (Date.now() - startTime < timeoutMs) {
      const info = await this.getInfo();
      if (!info) return;

      currentState = info.status.state;
      if (currentState === 'Stopped') return;
      if (currentState === 'Error') {
        throw new ConnectionError(
          `Sandbox ${this._id} entered an error state while pausing`,
          this.config.baseUrl
        );
      }
      await this.sleep(GET_INFO_RETRY_INTERVAL_MS);
    }

    throw new SandboxStateError(
      `Sandbox ${this._id} did not stop within ${timeoutMs}ms`,
      currentState,
      'Stopped'
    );
  }

  // ==================== Lifecycle Methods ====================

  async getInfo(): Promise<SandboxInfo | null> {
    try {
      const res = await this.api.info(this._id);
      if (this.isNotFoundResponse(res)) return null;
      if (res.code !== 200 || !res.data) {
        throw new ConnectionError(
          `Failed to get sandbox info: ${res.message}`,
          this.config.baseUrl
        );
      }

      const data: DevboxInfoData = res.data;

      this._status = {
        state: this.adaptStatus(data),
        reason: data.state.phase,
        message: res.message
      };
      return {
        id: data.name,
        image: parseImageSpec(data.image),
        entrypoint: [],
        status: this._status,
        createdAt: data.creationTimestamp ? new Date(data.creationTimestamp) : new Date()
      };
    } catch (error) {
      if (error instanceof ConnectionError) throw error;
      throw new ConnectionError('Failed to get sandbox info', this.config.baseUrl, error);
    }
  }

  async ensureRunning(options: SandboxEnsureRunningOptions = {}): Promise<void> {
    try {
      const allowCreate = options.allowCreate ?? true;
      const sandbox = await this.getInfoWithProviderRetry();
      if (sandbox) {
        const status = sandbox.status.state;
        switch (status) {
          case 'Running':
            return;
          case 'Creating':
          case 'Starting':
            await this.waitUntilReady();
            return;
          case 'Stopping':
          case 'Stopped':
            await this.start();
            return;
          case 'Deleting':
            if (!allowCreate) {
              throw new ConnectionError(`Sandbox ${sandbox.id} is deleting`, this.config.baseUrl);
            }
            await this.waitUntilDeleted();
            await this.create();
            return;
          case 'Error':
            throw new ConnectionError(
              `Sandbox ${sandbox.id} is in error state: ${sandbox.status.reason ?? sandbox.status.message ?? 'unknown'}`,
              this.config.baseUrl
            );
          default:
            throw new ConnectionError(`Sandbox state ${status} not supported`, this.config.baseUrl);
        }
      }

      if (!allowCreate) {
        throw new SandboxNotFoundError(`Sandbox ${this._id} does not exist`);
      }
      await this.create();
    } catch (error) {
      if (error instanceof ConnectionError || error instanceof SandboxNotFoundError) {
        throw error;
      }
      throw new ConnectionError(`Failed to ensure sandbox running`, this.config.baseUrl, error);
    }
  }
  /** Create the configured Devbox and wait until its info endpoint reports ready. */
  async create(): Promise<void> {
    try {
      this._status = { state: 'Creating' };
      const res = await this.api.create(this.buildCreateRequest());
      this.assertMutationSuccess({ response: res, action: 'create' });
      await this.waitUntilReady();
      this._status = { state: 'Running' };
    } catch (error) {
      throw new ConnectionError('Failed to create sandbox', this.config.baseUrl, error);
    }
  }

  async stop(): Promise<void> {
    try {
      this._status = { state: 'Stopping' };
      const res = await this.api.pause(this._id);
      if (this.isNotFoundResponse(res)) {
        this._status = { state: 'Stopped' };
        return;
      }
      this.assertMutationSuccess({ response: res, action: 'pause' });
      await this.waitUntilStopped();
      this._status = { state: 'Stopped' };
    } catch (error) {
      throw new ConnectionError('Failed to stop sandbox', this.config.baseUrl, error);
    }
  }

  async start(): Promise<void> {
    try {
      this._status = { state: 'Starting' };
      const res = await this.api.resume(this._id);
      this.assertMutationSuccess({ response: res, action: 'resume' });
      await this.waitUntilReady();
      this._status = { state: 'Running' };
    } catch (error) {
      throw new ConnectionError('Failed to resume sandbox', this.config.baseUrl, error);
    }
  }

  async delete(sandboxId?: SandboxId): Promise<void> {
    try {
      const targetId = sandboxId ?? this._id;
      this._status = { state: 'Deleting' };
      const res = await this.api.delete(targetId);
      this.assertMutationSuccess({ response: res, action: 'delete', acceptedCodes: [404] });
      this._id = targetId;
      await this.waitUntilDeleted();
      this._status = { state: 'UnExist' };
    } catch (error) {
      throw new ConnectionError('Failed to delete sandbox', this.config.baseUrl, error);
    }
  }

  // ==================== File System ====================

  async writeFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]> {
    const results: FileWriteResult[] = [];
    for (const entry of entries) {
      const normalizedPath = this.normalizePath(entry.path);
      try {
        const uploadBody = await (async () => {
          if (isReadableStreamData(entry.data)) {
            return entry.data;
          }

          return fileDataToUint8Array(entry.data);
        })();

        const modeStr =
          entry.mode === undefined
            ? undefined
            : String(posixModeToOctalNumber(entry.mode)).padStart(4, '0');

        const res = await this.api.uploadFile({
          name: this._id,
          params: {
            path: normalizedPath,
            mode: modeStr
          },
          content: uploadBody as BodyInit
        });

        if (res.code !== 200) {
          throw new Error(res.message || `Upload failed with code ${res.code}`);
        }

        const bytesWritten =
          res.data?.sizeBytes ?? (uploadBody instanceof Uint8Array ? uploadBody.byteLength : 0);

        results.push({
          path: normalizedPath,
          bytesWritten,
          error: null
        });
      } catch (error) {
        results.push({
          path: normalizedPath,
          bytesWritten: 0,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }
    return results;
  }

  async readFiles(paths: string[], options?: ReadFileOptions): Promise<FileReadResult[]> {
    const results: FileReadResult[] = [];
    for (const path of paths) {
      const normalizedPath = this.normalizePath(path);
      try {
        if (options?.offset !== undefined || options?.length !== undefined) {
          const [fallbackResult] = await super.readFiles([normalizedPath], options);
          if (fallbackResult) {
            results.push(fallbackResult);
            continue;
          }
        }

        const buffer = await this.api.downloadFile(this._id, { path: normalizedPath });
        results.push({
          path: normalizedPath,
          content: new Uint8Array(buffer),
          error: null
        });
      } catch (error) {
        results.push({
          path: normalizedPath,
          content: new Uint8Array(),
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }
    return results;
  }

  override readFileStream(path: string): AsyncIterable<Uint8Array> {
    return this.api.downloadFileStream(this._id, {
      path: this.normalizePath(path)
    });
  }

  override async writeFileStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const results = await this.writeFiles([
      {
        path: normalizedPath,
        data: stream
      }
    ]);
    const firstResult = results[0];
    if (firstResult?.error) {
      throw firstResult.error;
    }
  }

  // ==================== Command Execution ====================

  private getCommandTimeoutSeconds(timeoutMs?: number): number | undefined {
    if (timeoutMs === undefined || timeoutMs <= 0) return undefined;
    return Math.min(Math.max(Math.ceil(timeoutMs / 1000), 1), 600);
  }

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    const commandWithEnv = (() => {
      const entries = Object.entries(options?.env ?? {});
      if (entries.length === 0) return command;

      const exports = entries.map(([key, value]) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          throw new TypeError(`Invalid environment variable name: ${key}`);
        }
        return `export ${key}=${this.escapeShellArg(value)}`;
      });
      return `${exports.join('; ')}; ${command}`;
    })();
    const cmd = this.buildCommand(commandWithEnv, this.normalizePath(options?.workingDirectory));
    try {
      const res = await this.api.exec({
        name: this._id,
        request: {
          command: cmd,
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs)
        },
        signal: options?.signal
      });

      if (!res.data) {
        throw new CommandExecutionError(`Command execution failed: ${res.message}`, command);
      }

      const maxOutputBytes = options?.maxOutputBytes ?? 1024 * 1024;
      const stdout = new BoundedOutputBuffer(maxOutputBytes, '');
      const stderr = new BoundedOutputBuffer(maxOutputBytes, '');
      stdout.append(res.data.stdout);
      stderr.append(res.data.stderr);
      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: res.data.exitCode,
        truncated: stdout.truncated || stderr.truncated
      };
    } catch (error) {
      throw new CommandExecutionError(
        `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
        command,
        error instanceof Error ? error : undefined
      );
    }
  }
  async getEndpoint(selector: SandboxEndpointSelector): Promise<Endpoint> {
    const target = await this.getHttpgateTarget(selector);
    const url = new URL(target.origin);

    return {
      host: url.host,
      port: target.port,
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      url: joinUrlPath(target.origin, target.basePath)
    };
  }

  private async getHttpgateTarget(
    port: number
  ): Promise<{ origin: string; basePath: string; port: number }> {
    const res = await this.api.info(this._id);
    if (res.code !== 200 || !res.data) {
      throw new ConnectionError(`Failed to get devbox info: ${res.message}`, this.config.baseUrl);
    }

    const gatewayUrl = res.data.gateway?.url;
    if (!gatewayUrl) {
      throw new ConnectionError(
        'Devbox info does not include gateway.url; cannot derive httpgate endpoint',
        this.config.baseUrl
      );
    }

    const gateway = new URL(gatewayUrl);
    const uniqueID = this.getGatewayUniqueID(res.data, gateway);
    const domain = this.getHttpgateDomain(gateway);
    return {
      origin: `${gateway.protocol}//devbox-${uniqueID}-${port}.${domain}`,
      basePath: '',
      port
    };
  }

  private getGatewayUniqueID(data: DevboxInfoData, gateway: URL): string {
    if (data.gateway?.uniqueID) return data.gateway.uniqueID;

    const parts = gateway.pathname.split('/').filter(Boolean);
    const uniqueID = parts[parts.length - 1];
    if (!uniqueID) {
      throw new ConnectionError(
        'Devbox gateway.url does not include uniqueID; cannot derive httpgate endpoint',
        this.config.baseUrl
      );
    }
    return uniqueID;
  }

  private getHttpgateDomain(gateway: URL): string {
    if (this.config.httpgateDomain) {
      return this.normalizeHttpgateDomain(this.config.httpgateDomain);
    }

    const separator = '-gateway.';
    const index = gateway.host.indexOf(separator);
    if (index !== -1) {
      return gateway.host.slice(index + separator.length);
    }

    throw new ConnectionError(
      `Cannot derive httpgate domain from gateway host "${gateway.host}"`,
      this.config.baseUrl
    );
  }

  private normalizeHttpgateDomain(domain: string): string {
    const trimmed = domain.trim().replace(/^\.+|\.+$/g, '');
    if (!trimmed) {
      throw new ConnectionError('httpgateDomain is empty', this.config.baseUrl);
    }
    if (trimmed.includes('://')) {
      return new URL(trimmed).host;
    }
    return trimmed;
  }

  // ==================== Health Check ====================

  /**
   * Check if the devbox is ready by querying info endpoint.
   * Ready when spec, status, and phase are all "Running".
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.api.info(this._id);
      if (res.code !== 200) return false;
      if (!res.data) return false;

      return res.data.state.phase === DevboxPhaseEnum.Running;
    } catch {
      return false;
    }
  }
}
