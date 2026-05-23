import type { ExecutionHandlers } from '@alibaba-group/opensandbox';
import {
  ConnectionConfig,
  Sandbox,
  SandboxException,
  SandboxManager,
  type Endpoint as SdkEndpoint
} from '@alibaba-group/opensandbox';
import {
  CommandExecutionError,
  ConnectionError,
  FeatureNotSupportedError,
  SandboxStateError
} from '../../errors';
import type {
  Endpoint,
  ExecuteOptions,
  ExecuteResult,
  FileWriteEntry,
  FileWriteResult,
  ResourceLimits,
  SandboxCreateSpec,
  SandboxEndpointSelector,
  SandboxId,
  SandboxInfo,
  SandboxMetrics,
  SandboxState,
  SandboxStatus,
  StreamHandlers
} from '@/types';
import { BaseSandboxAdapter } from '../BaseSandboxAdapter';
import { CommandPolyfillService } from '@/polyfill/CommandPolyfillService';
import { BoundedOutputBuffer } from '@/utils/outputBuffer';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@/constants';
import { formatImageSpec, parseImageSpec } from '@/utils/image';
import type { OpenSandboxConfigType } from './type';
import {
  getWriteEntryByteLength,
  toOpenSandboxWriteData,
  verifyCommittedUpload
} from './uploadRecovery';

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
export type { OpenSandboxConfigType } from './type';

/**
 * Sandbox runtime type.
 * - docker: Full-featured runtime with pause/resume support
 * - kubernetes: Container orchestration runtime
 */
export type SandboxRuntimeType = 'docker' | 'kubernetes';

/**
 * Connection configuration options for OpenSandboxAdapter.
 */
export interface OpenSandboxConnectionConfig {
  sessionId: string;

  /** Base URL for the OpenSandbox API */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** SDK request timeout in seconds */
  requestTimeoutSeconds?: number;
  /** Enable SDK HTTP debug logging */
  debug?: boolean;
  /** Route execd traffic through the OpenSandbox server proxy */
  useServerProxy?: boolean;
  /**
   * Rewrite OpenSandbox local endpoint host when sandbox-proxy runs on the host
   * instead of inside Docker/Kubernetes.
   */
  replaceDockerInternalWithLocalhost?: boolean;
  /**
   * Sandbox runtime type.
   * @default 'docker'
   */
  runtime?: SandboxRuntimeType;
}

/**
 * OpenSandbox provider adapter.
 *
 * Full native support for all features via the OpenSandbox TypeScript SDK.
 *
 * @example
 * ```typescript
 * const adapter = new OpenSandboxAdapter({
 *   baseUrl: 'https://api.opensandbox.example.com',
 *   apiKey: 'your-api-key'
 * });
 *
 * await adapter.create({
 *   image: { repository: 'node', tag: '18-alpine' }
 * });
 *
 * const result = await adapter.execute('node --version');
 * console.log(result.stdout); // v18.x.x
 * ```
 */
export class OpenSandboxAdapter extends BaseSandboxAdapter {
  readonly provider = 'opensandbox' as const;
  readonly runtime: SandboxRuntimeType;

  private _sandbox?: Sandbox;
  private _connection: ConnectionConfig;
  private _id?: SandboxId;

  constructor(
    private connectionConfig: OpenSandboxConnectionConfig,
    private createConfig?: SandboxCreateSpec
  ) {
    super();
    this.runtime = connectionConfig.runtime ?? 'docker';
    this._connection = this.createConnectionConfig();
    this.polyfillService = new CommandPolyfillService(this);
  }

  get rootPath(): string {
    const firstVolume = this.createConfig?.volumes?.[0] as { mountPath?: string } | undefined;
    const mountPath = firstVolume?.mountPath;
    return mountPath ? mountPath.replace(/\/+$/, '') : OPEN_SANDBOX_DEFAULT_ROOT_PATH;
  }

  get id(): SandboxId | undefined {
    return this._id;
  }

  private set sandbox(sandbox: Sandbox | undefined) {
    this._sandbox = sandbox;
    this._id = sandbox?.id;
  }

  private get sandbox(): Sandbox {
    if (!this._sandbox) {
      throw new SandboxStateError(
        'Sandbox not initialized. Call create() or connect() first.',
        'UnExist',
        'Running'
      );
    }
    return this._sandbox;
  }

  private createConnectionConfig(): ConnectionConfig {
    const { baseUrl, apiKey, requestTimeoutSeconds, debug, useServerProxy } = this.connectionConfig;

    return new ConnectionConfig({
      domain: baseUrl,
      apiKey,
      requestTimeoutSeconds,
      debug,
      useServerProxy
    });
  }

  // ==================== Status Mapping ====================

  private static readonly STATE_MAP: Record<string, SandboxState> = {
    running: 'Running',
    creating: 'Creating',
    starting: 'Starting',
    stopping: 'Stopping',
    stopped: 'Stopped',
    deleting: 'Deleting',
    error: 'Error',
    paused: 'Stopped',
    deleted: 'UnExist'
  };

  private mapStatus(sdkStatus: {
    state: string;
    reason?: string;
    message?: string;
  }): SandboxStatus {
    const state = OpenSandboxAdapter.STATE_MAP[sdkStatus.state.toLowerCase()] ?? 'Error';
    return {
      state,
      reason: sdkStatus.reason,
      message: sdkStatus.message
    };
  }

  // ==================== Image and Resource Conversion ====================

  private convertResourceLimits(
    resourceLimits?: ResourceLimits
  ): Record<string, string> | undefined {
    if (!resourceLimits) return undefined;

    const result: Record<string, string> = {};
    if (resourceLimits.cpuCount !== undefined) {
      result.cpu = resourceLimits.cpuCount.toString();
    }
    if (resourceLimits.memoryMiB !== undefined) {
      result.memory = `${resourceLimits.memoryMiB}Mi`;
    }
    if (resourceLimits.diskGiB !== undefined) {
      result.disk = `${resourceLimits.diskGiB}Gi`;
    }
    return result;
  }

  private parseResourceLimits(resource?: Record<string, string>): ResourceLimits | undefined {
    if (!resource) return undefined;

    const result: ResourceLimits = {};

    const cpu = resource.cpu;
    if (cpu) {
      const cpuCount = Number.parseInt(cpu, 10);
      if (!Number.isNaN(cpuCount)) result.cpuCount = cpuCount;
    }

    const memory = resource.memory;
    if (memory) {
      const match = memory.match(/^(\d+)(Mi|Gi)$/);
      if (match) {
        const value = Number.parseInt(match[1] || '0', 10);
        result.memoryMiB = match[2] === 'Mi' ? value : value * 1024;
      }
    }

    const disk = resource.disk;
    if (disk) {
      const match = disk.match(/^(\d+)Gi$/);
      if (match) {
        result.diskGiB = Number.parseInt(match[1] || '0', 10);
      }
    }

    return result;
  }

  private getCommandTimeoutSeconds(timeoutMs?: number): number | undefined {
    if (timeoutMs === undefined || timeoutMs <= 0) return undefined;
    return Math.ceil(timeoutMs / 1000);
  }

  private extractExitCode(execution: {
    error?: {
      value?: string;
      traceback?: string[];
    };
  }): number {
    const rawValue = execution.error?.value?.trim();
    if (rawValue) {
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    const traceback = execution.error?.traceback ?? [];
    for (const line of traceback) {
      const match = line.match(/exit status (\d+)/i);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }

    return 0;
  }

  // ==================== Lifecycle Methods ====================
  private async getSandboxBySessionId(): Promise<
    { id: string; status: SandboxStatus } | undefined
  > {
    const manager = SandboxManager.create({ connectionConfig: this._connection });
    try {
      const result = await manager.listSandboxInfos({
        metadata: { sessionId: this.connectionConfig.sessionId }
      });
      const val = result.items[0];

      if (val) {
        const status = this.mapStatus(val.status);

        return {
          id: val.id,
          status
        };
      }
    } finally {
      await manager.close().catch(() => undefined);
    }
  }

  private async waitUntilSessionDeleted(timeoutMs: number = 120000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      const sandbox = await this.getSandboxBySessionId();
      if (!sandbox) {
        return;
      }
      await this.sleep(checkInterval);
    }

    throw new SandboxStateError(
      `Sandbox session ${this.connectionConfig.sessionId} was not deleted within ${timeoutMs}ms`,
      'Deleting',
      'UnExist'
    );
  }

  private async killSandboxById(sandboxId: SandboxId): Promise<void> {
    const manager = SandboxManager.create({ connectionConfig: this._connection });
    try {
      await manager.killSandbox(sandboxId);
    } finally {
      await manager.close().catch(() => undefined);
    }
  }

  async ensureRunning(): Promise<void> {
    const sandbox = await this.getSandboxBySessionId();

    if (sandbox) {
      switch (sandbox.status.state) {
        case 'UnExist':
          await this.create();
          break;
        case 'Running':
          await this.connect(sandbox.id);
          break;
        case 'Creating':
        case 'Starting':
          await this.connect(sandbox.id);
          break;
        case 'Stopping':
        case 'Stopped':
          await this.resume(sandbox.id);
          break;
        case 'Deleting':
          await this.waitUntilSessionDeleted();
          await this.create();
          break;
        case 'Error':
          throw new ConnectionError(`Sandbox error: ${sandbox.status.message}`);
        default:
          throw new ConnectionError(`Sandbox state ${sandbox.status.state} not supported`);
      }
    } else {
      await this.create();
    }
  }
  async create(): Promise<void> {
    const cfg = this.createConfig;
    if (!cfg) {
      throw new ConnectionError(
        'Cannot create sandbox: createConfig is required but was not provided',
        this.connectionConfig.baseUrl
      );
    }
    if (!cfg.image) {
      throw new ConnectionError(
        'Cannot create sandbox: createConfig.image is required for opensandbox provider',
        this.connectionConfig.baseUrl
      );
    }
    try {
      this._status = { state: 'Creating' };

      const image = formatImageSpec(cfg.image);
      const resource = this.convertResourceLimits(cfg.resourceLimits);

      this.sandbox = await Sandbox.create({
        connectionConfig: this._connection,
        image,
        entrypoint: cfg.entrypoint,
        timeoutSeconds: cfg.timeoutSeconds ?? null,
        resource,
        env: cfg.env,
        metadata: {
          ...cfg.metadata,
          sessionId: this.connectionConfig.sessionId
        },
        networkPolicy: cfg.networkPolicy,
        volumes: cfg.volumes as OpenSandboxConfigType['volumes'] | undefined,
        extensions: cfg.extensions,
        skipHealthCheck: cfg.skipHealthCheck,
        readyTimeoutSeconds: cfg.readyTimeoutSeconds,
        healthCheckPollingInterval: cfg.healthCheckPollingInterval
      });

      await this.waitUntilReady();
      this._status = { state: 'Running' };
    } catch (error) {
      this._status = { state: 'Error', message: String(error) };
      throw new ConnectionError('Failed to create sandbox', this.connectionConfig.baseUrl, error);
    }
  }

  async connect(sandboxId: string): Promise<void> {
    try {
      this._status = { state: 'Starting' };

      this.sandbox = await Sandbox.connect({
        sandboxId,
        connectionConfig: this._connection,
        skipHealthCheck: this.createConfig?.skipHealthCheck,
        readyTimeoutSeconds: this.createConfig?.readyTimeoutSeconds,
        healthCheckPollingInterval: this.createConfig?.healthCheckPollingInterval
      });
      this._status = { state: 'Running' };
    } catch (error) {
      this._status = { state: 'Error', message: String(error) };
      throw new ConnectionError(
        `Failed to connect to sandbox ${sandboxId}`,
        this.connectionConfig.baseUrl,
        error
      );
    }
  }

  private async resume(sandboxId: string): Promise<void> {
    try {
      this._status = { state: 'Starting' };
      this.sandbox = await Sandbox.resume({
        sandboxId,
        connectionConfig: this._connection,
        skipHealthCheck: this.createConfig?.skipHealthCheck,
        readyTimeoutSeconds: this.createConfig?.readyTimeoutSeconds,
        healthCheckPollingInterval: this.createConfig?.healthCheckPollingInterval
      });
      this._status = { state: 'Running' };
    } catch (error) {
      this._status = { state: 'Error', message: String(error) };
      throw new ConnectionError(
        `Failed to resume sandbox ${sandboxId}`,
        this.connectionConfig.baseUrl,
        error
      );
    }
  }

  async start(): Promise<void> {
    try {
      this._status = { state: 'Starting' };
      // OpenSandbox resume returns a fresh Sandbox instance
      this.sandbox = await this.sandbox.resume();
      await this.waitUntilReady();
      this._status = { state: 'Running' };
    } catch (error) {
      const code = error instanceof SandboxException ? error.error.code : undefined;

      switch (code) {
        case 'DOCKER::SANDBOX_NOT_PAUSED':
          return;
        case 'SANDBOX::API_NOT_SUPPORTED':
          throw new FeatureNotSupportedError(
            'Start/resume not supported by this runtime',
            'start',
            this.provider
          );
        default:
          throw new CommandExecutionError(
            'Failed to start sandbox',
            'start',
            error instanceof Error ? error : undefined
          );
      }
    }
  }

  async stop(): Promise<void> {
    try {
      this._status = { state: 'Stopping' };

      const existing = await this.getSandboxBySessionId();
      if (!existing) {
        this._status = { state: 'Stopped' };
        return;
      }

      await this.killSandboxById(existing.id);
      if (existing.id === this._id) {
        this.sandbox = undefined;
      }
      this._status = { state: 'Stopped' };
    } catch (error) {
      const message = error instanceof SandboxException ? error.error.message : undefined;

      if (message?.includes('already paused')) {
        return;
      }

      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'SANDBOX::API_NOT_SUPPORTED'
      ) {
        throw new FeatureNotSupportedError(
          'Stop/pause not supported by this runtime',
          'stop',
          this.provider
        );
      }
      throw new CommandExecutionError(
        'Failed to stop sandbox',
        'stop',
        error instanceof Error ? error : undefined
      );
    }
  }

  async delete(sandboxId?: SandboxId): Promise<void> {
    try {
      this._status = { state: 'Deleting' };
      const targetId = sandboxId ?? this._id;

      if (targetId) {
        await this.killSandboxById(targetId);

        if (targetId === this._id) {
          this.sandbox = undefined;
        }
        this._status = { state: 'UnExist' };
        return;
      }

      const existing = await this.getSandboxBySessionId();
      if (existing) {
        await this.killSandboxById(existing.id);
        if (existing.id === this._id) {
          this.sandbox = undefined;
        }
      }
      this._status = { state: 'UnExist' };
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to delete sandbox',
        'delete',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Release client-side resources owned by this Sandbox instance.
   * Does NOT stop or delete the container - the sandbox keeps running.
   * Use this to disconnect from a sandbox without destroying it.
   */
  async close(): Promise<void> {
    await this.sandbox.close();
  }

  /**
   * Get endpoint information for a provider endpoint or well-known service.
   */
  async getEndpoint(selector: SandboxEndpointSelector): Promise<Endpoint> {
    return this.getOpenSandboxEndpoint(selector);
  }

  private async getOpenSandboxEndpoint(port: number): Promise<Endpoint> {
    const sdkEndpoint = (await this.sandbox.getEndpoint(port)) as SdkEndpoint;

    const raw = sdkEndpoint.endpoint;
    const colonIdx = raw.lastIndexOf(':');
    const hasPathBeforeColon = colonIdx !== -1 && raw.slice(0, colonIdx).includes('/');

    if (colonIdx !== -1 && !hasPathBeforeColon) {
      // "host:port" format
      const host = raw.slice(0, colonIdx);
      const parsedPort = parseInt(raw.slice(colonIdx + 1), 10);
      const portNumber = isNaN(parsedPort) ? port : parsedPort;
      const protocol: 'http' | 'https' = port === 443 ? 'https' : 'http';
      return { host, port: portNumber, protocol, url: `${protocol}://${raw}` };
    }

    // Path-based routing: "domain/route/.../44772" (reverse proxy with HTTPS)
    return {
      host: raw,
      port: port,
      protocol: 'https',
      url: `https://${raw}`
    };
  }

  private async getDirectEndpointOrigin(port: number): Promise<string> {
    if (!this.id) {
      throw new SandboxStateError(
        'Sandbox not initialized. Call create() or connect() first.',
        'UnExist',
        'Running'
      );
    }

    const headers: Record<string, string> = {
      ...this._connection.headers,
      Accept: 'application/json'
    };

    const response = await this._connection.fetch(
      `${this._connection.getBaseUrl()}/sandboxes/${this.id}/endpoints/${port}?use_server_proxy=false`,
      { method: 'GET', headers }
    );

    if (!response.ok) {
      throw new ConnectionError(
        `OpenSandbox endpoint lookup failed: HTTP ${response.status}`,
        this.connectionConfig.baseUrl
      );
    }

    const data = (await response.json()) as { endpoint?: string };
    if (!data.endpoint) {
      throw new ConnectionError('OpenSandbox returned no endpoint', this.connectionConfig.baseUrl);
    }

    let hostPort = data.endpoint.replace(/\/proxy\/\d+\/?$/, '');
    if (this.connectionConfig.replaceDockerInternalWithLocalhost) {
      hostPort = hostPort.replace(/^host\.docker\.internal\b/, 'localhost');
    }

    const url = new URL(/^https?:\/\//.test(hostPort) ? hostPort : `http://${hostPort}`);
    return url.origin;
  }

  async getInfo(): Promise<SandboxInfo | null> {
    if (!this._sandbox) {
      return null;
    }
    try {
      const info = await this.sandbox.getInfo();
      return {
        id: info.id,
        image:
          typeof info.image === 'string'
            ? parseImageSpec(info.image)
            : 'uri' in info.image
              ? parseImageSpec(info.image.uri)
              : info.image,
        entrypoint: info.entrypoint,
        metadata: info.metadata,
        status: this.mapStatus(info.status as { state: string; reason?: string; message?: string }),
        createdAt: info.createdAt,
        expiresAt: info.expiresAt ?? undefined,
        resourceLimits: this.parseResourceLimits(
          (info as Record<string, unknown>).resourceLimits as Record<string, string> | undefined
        )
      };
    } catch (error: any) {
      throw new CommandExecutionError(
        `Failed to get sandbox info`,
        'getInfo',
        error instanceof Error ? error : undefined
      );
    }
  }

  async renewExpiration(additionalSeconds: number): Promise<void> {
    try {
      await this.sandbox.renew(additionalSeconds);
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to renew sandbox expiration',
        'renew',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ==================== File System ====================
  async writeFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]> {
    const results: FileWriteResult[] = [];

    /**
     * Reads back committed file content for small-file verification.
     *
     * The SDK download endpoint is preferred. If that endpoint is temporarily unhealthy alongside
     * upload/info, fall back to the command polyfill so the guard can still verify already-written
     * small files.
     */
    const readCommittedFileBytes = async (path: string): Promise<Uint8Array | undefined> => {
      const sdkBytes = await this.sandbox.files.readBytes(path).catch(() => undefined);
      if (sdkBytes) return sdkBytes;

      const [readResult] = await super.readFiles([path]).catch(() => []);
      if (!readResult || readResult.error) return undefined;
      return readResult.content;
    };

    /**
     * Returns the committed file size after a failed upload.
     *
     * Prefer the SDK metadata API, but fall back to `stat` through the command channel because the
     * same OpenSandbox false-negative window can make `/files/info` return 500 immediately after
     * `/files/upload` has already written the file.
     */
    const getCommittedFileSize = async (path: string): Promise<number | undefined> => {
      const fileInfoMap = await this.sandbox.files.getFileInfo([path]).catch(() => undefined);
      const fileInfoSize = fileInfoMap?.[path]?.size;
      if (typeof fileInfoSize === 'number') return fileInfoSize;

      // `/files/info` may fail in the same false-negative window as `/files/upload`.
      // Fall back to `stat` through the command channel; this is still metadata-only.
      const result = await this.execute(
        `stat -c '%s' ${this.escapeShellArg(path)} 2>/dev/null || stat -f '%z' ${this.escapeShellArg(path)} 2>/dev/null || echo STAT_FAILED`,
        { maxOutputBytes: 1024 }
      ).catch(() => undefined);
      const statSize = Number.parseInt(result?.stdout.trim() || '', 10);
      return Number.isFinite(statSize) ? statSize : undefined;
    };

    /**
     * Writes one file through the OpenSandbox SDK and keeps the normal success path unchanged.
     *
     * The extra verification is intentionally local to `writeFiles`: only SDK upload failures enter
     * the false-negative guard, so healthy uploads still cost exactly one `/files/upload` request.
     */
    const writeFileWithUploadFalseNegativeGuard = async ({
      entry,
      normalizedPath,
      data,
      bytesWritten
    }: {
      entry: FileWriteEntry;
      normalizedPath: string;
      data: FileWriteEntry['data'];
      bytesWritten: number;
    }) => {
      try {
        await this.sandbox.files.writeFiles([
          {
            path: normalizedPath,
            data: data as any,
            mode: entry.mode,
            owner: entry.owner,
            group: entry.group
          }
        ]);
      } catch (error) {
        if (
          await verifyCommittedUpload({
            entry,
            normalizedPath,
            bytesWritten,
            error,
            getCommittedFileSize,
            readCommittedFileBytes
          })
        ) {
          return;
        }
        throw error;
      }
    };

    for (const entry of entries) {
      const normalizedPath = this.normalizePath(entry.path);
      try {
        // Calculate bytes from the caller's original input before converting Uint8Array to
        // ArrayBuffer for the OpenSandbox SDK. The value is later used by the false-negative
        // guard to verify that the committed file has the expected size.
        const bytesWritten = await getWriteEntryByteLength(entry);
        const data = toOpenSandboxWriteData(entry.data);

        await writeFileWithUploadFalseNegativeGuard({
          entry,
          normalizedPath,
          data: data as FileWriteEntry['data'],
          bytesWritten
        });

        results.push({ path: normalizedPath, bytesWritten, error: null });
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

  // ==================== Command Execution ====================
  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    const maxBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const stdoutBuf = new BoundedOutputBuffer(maxBytes, '\n');
    const stderrBuf = new BoundedOutputBuffer(maxBytes, '\n');

    try {
      const execution = await this.sandbox.commands.run(
        command,
        {
          workingDirectory: this.normalizePath(options?.workingDirectory),
          background: options?.background,
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs)
        },
        {
          onStdout: (msg) => {
            stdoutBuf.append(msg.text);
          },
          onStderr: (msg) => {
            stderrBuf.append(msg.text);
          }
        }
      );

      const exitCode = this.extractExitCode(execution);
      return {
        stdout: stdoutBuf.toString(),
        stderr: stderrBuf.toString(),
        exitCode,
        truncated: stdoutBuf.truncated || stderrBuf.truncated
      };
    } catch (error) {
      if (error instanceof SandboxStateError) throw error;
      throw new CommandExecutionError(
        `Command execution failed: ${command}`,
        command,
        error instanceof Error ? error : undefined
      );
    }
  }

  async executeStream(
    command: string,
    handlers: StreamHandlers,
    options?: ExecuteOptions
  ): Promise<void> {
    const wantsComplete = Boolean(handlers.onComplete);
    const maxBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const stdoutBuf = wantsComplete ? new BoundedOutputBuffer(maxBytes, '\n') : undefined;
    const stderrBuf = wantsComplete ? new BoundedOutputBuffer(maxBytes, '\n') : undefined;

    try {
      const sdkHandlers: ExecutionHandlers = {
        // Only inject onStdout/onStderr when the caller registered them or we
        // need to capture output for onComplete — avoids changing SDK behaviour
        // (e.g. buffering strategy) when no handlers are needed.
        ...(handlers.onStdout || wantsComplete
          ? {
              onStdout: async (msg) => {
                stdoutBuf?.append(msg.text);
                await handlers.onStdout?.(msg);
              }
            }
          : {}),
        ...(handlers.onStderr || wantsComplete
          ? {
              onStderr: async (msg) => {
                stderrBuf?.append(msg.text);
                await handlers.onStderr?.(msg);
              }
            }
          : {}),
        ...(handlers.onError
          ? {
              onError: async (err) => {
                const error = new Error(err.value || err.name || 'Execution error');
                error.name = err.name || 'ExecutionError';
                if (err.traceback?.length) {
                  error.stack = err.traceback.join('\n');
                }
                await handlers.onError?.(error);
              }
            }
          : {})
      };

      const execution = await this.sandbox.commands.run(
        command,
        {
          workingDirectory: this.normalizePath(options?.workingDirectory),
          background: options?.background,
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs)
        },
        sdkHandlers
      );

      if (wantsComplete) {
        const exitCode = this.extractExitCode(execution);
        await handlers.onComplete!({
          stdout: stdoutBuf!.toString(),
          stderr: stderrBuf!.toString(),
          exitCode,
          truncated: stdoutBuf!.truncated || stderrBuf!.truncated
        });
      }
    } catch (error) {
      throw new CommandExecutionError(
        `Streaming command execution failed: ${command}`,
        command,
        error instanceof Error ? error : undefined
      );
    }
  }

  async executeBackground(
    command: string,
    options?: ExecuteOptions
  ): Promise<{ sessionId: string; kill(): Promise<void> }> {
    try {
      const execution = await this.sandbox.commands.run(command, {
        workingDirectory: this.normalizePath(options?.workingDirectory),
        background: true,
        timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs)
      });

      if (!execution.id) {
        throw new CommandExecutionError(
          'Background execution did not return a session ID',
          command
        );
      }

      const sessionId = execution.id;
      const sandbox = this.sandbox;

      return {
        sessionId,
        kill: async (): Promise<void> => {
          try {
            await sandbox.commands.interrupt(sessionId);
          } catch (error) {
            throw new CommandExecutionError(
              `Failed to kill background session ${sessionId}`,
              'interrupt',
              error instanceof Error ? error : undefined
            );
          }
        }
      };
    } catch (error) {
      if (error instanceof CommandExecutionError) throw error;
      throw new CommandExecutionError(
        `Background command execution failed: ${command}`,
        command,
        error instanceof Error ? error : undefined
      );
    }
  }

  async interrupt(sessionId: string): Promise<void> {
    try {
      await this.sandbox.commands.interrupt(sessionId);
    } catch (error) {
      throw new CommandExecutionError(
        `Failed to interrupt session ${sessionId}`,
        'interrupt',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ==================== Health Check ====================

  async ping(): Promise<boolean> {
    try {
      if (await this.sandbox.health.ping()) {
        return true;
      }
    } catch {
      // OpenSandbox 的 `/ping` 在容器刚 ready 后可能短暂返回 500；下面用命令通道兜底验证。
    }

    try {
      const result = await this.execute('true', { timeoutMs: 3_000, maxOutputBytes: 1024 });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async getMetrics(): Promise<SandboxMetrics> {
    return this.sandbox.metrics.getMetrics();
  }
}
