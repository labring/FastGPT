import type {
  Execution,
  ExecutionHandlers,
  NetworkPolicy as SdkNetworkPolicy,
  SandboxInfo as SdkSandboxInfo
} from '@alibaba-group/opensandbox';
import {
  ConnectionConfig,
  Sandbox,
  SandboxApiException,
  SandboxException,
  SandboxManager
} from '@alibaba-group/opensandbox';
import {
  CommandExecutionError,
  ConnectionError,
  FeatureNotSupportedError,
  SandboxNotFoundError,
  SandboxStateError
} from '../../errors';
import type {
  Endpoint,
  ContentReplaceEntry,
  DirectoryEntry,
  ExecuteOptions,
  ExecuteResult,
  FileDeleteResult,
  FileInfo,
  FileReadResult,
  FileWriteEntry,
  FileWriteResult,
  MoveEntry,
  PermissionEntry,
  ReadFileOptions,
  ResourceLimits,
  SandboxCreateSpec,
  SandboxEndpointSelector,
  SandboxEnsureRunningOptions,
  SandboxId,
  SandboxInfo,
  SandboxMetrics,
  SandboxState,
  SandboxStatus,
  SearchResult,
  StreamHandlers
} from '@/types';
import { BaseSandboxAdapter } from '../BaseSandboxAdapter';
import { BoundedOutputBuffer } from '@/utils/outputBuffer';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@/constants';
import { formatImageSpec, parseImageSpec } from '@/utils/image';
import type { OpenSandboxConfigType } from './type';
import { getFileDataByteLength } from '@/utils/files';

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 120;
const DEFAULT_LIFECYCLE_TIMEOUT_MS = 120_000;
const LIFECYCLE_POLL_INTERVAL_MS = 1_000;
export type { OpenSandboxConfigType } from './type';

type ResolvedSandboxInfo = {
  info: SdkSandboxInfo;
  status: SandboxStatus;
};

type SandboxInfoReader = () => Promise<SdkSandboxInfo | undefined>;

/**
 * Sandbox runtime type.
 * - docker: Full-featured runtime with pause/resume support
 * - kubernetes: Container orchestration runtime
 */
export type SandboxRuntimeType = 'docker' | 'kubernetes';

/**
 * Connection configuration options for OpenSandboxAdapter.
 */
export type OpenSandboxConnectionConfig = {
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
   * Sandbox runtime type.
   * @default 'docker'
   */
  runtime?: SandboxRuntimeType;
};

/**
 * OpenSandbox provider adapter.
 *
 * Full native support for all features via the OpenSandbox TypeScript SDK.
 *
 * @example
 * ```typescript
 * const adapter = new OpenSandboxAdapter(
 *   { sessionId: 'session-1', baseUrl: 'https://api.opensandbox.example.com' },
 *   { image: { repository: 'node', tag: '18-alpine' } }
 * );
 * await adapter.ensureRunning();
 *
 * const result = await adapter.execute('node --version');
 * console.log(result.stdout); // v18.x.x
 * ```
 */
export class OpenSandboxAdapter extends BaseSandboxAdapter {
  readonly provider = 'opensandbox' as const;
  readonly runtime: SandboxRuntimeType;

  private _sandbox?: Sandbox;
  private readonly _connection: ConnectionConfig;

  constructor(
    private readonly connectionConfig: OpenSandboxConnectionConfig,
    private readonly createConfig?: SandboxCreateSpec
  ) {
    super();
    this.runtime = connectionConfig.runtime ?? 'docker';
    this._connection = this.createConnectionConfig();
  }

  get rootPath(): string {
    const firstVolume = this.createConfig?.volumes?.[0] as { mountPath?: string } | undefined;
    const mountPath = firstVolume?.mountPath;
    return mountPath ? mountPath.replace(/\/+$/, '') : OPEN_SANDBOX_DEFAULT_ROOT_PATH;
  }

  get id(): SandboxId | undefined {
    return this._sandbox?.id;
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

  /** Replaces the bound SDK client and releases its transport. */
  private async replaceSandbox(sandbox: Sandbox): Promise<void> {
    const previous = this._sandbox;
    this._sandbox = sandbox;
    if (previous && previous !== sandbox) {
      await previous.close().catch(() => undefined);
    }
  }

  /** Releases the currently bound SDK client without changing the remote sandbox lifecycle. */
  private async releaseSandbox(): Promise<void> {
    const current = this._sandbox;
    this._sandbox = undefined;
    await current?.close().catch(() => undefined);
  }

  private createConnectionConfig(): ConnectionConfig {
    const { baseUrl, apiKey, requestTimeoutSeconds, debug, useServerProxy } = this.connectionConfig;

    return new ConnectionConfig({
      domain: baseUrl,
      apiKey,
      requestTimeoutSeconds: requestTimeoutSeconds ?? DEFAULT_REQUEST_TIMEOUT_SECONDS,
      debug,
      useServerProxy
    });
  }

  // ==================== Status Mapping ====================

  private static readonly STATE_MAP: Record<string, SandboxState> = {
    running: 'Running',
    creating: 'Creating',
    resuming: 'Starting',
    pausing: 'Stopping',
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

  private convertNetworkPolicy(
    networkPolicy?: SandboxCreateSpec['networkPolicy']
  ): SdkNetworkPolicy | undefined {
    if (!networkPolicy) return undefined;
    return {
      defaultAction: networkPolicy.defaultAction,
      egress: networkPolicy.egress?.map(({ action, target }) => ({ action, target }))
    };
  }

  private getCommandTimeoutSeconds(timeoutMs?: number): number | undefined {
    if (timeoutMs === undefined || timeoutMs <= 0) return undefined;
    return Math.ceil(timeoutMs / 1000);
  }

  private toExecuteResult(
    execution: Execution,
    stdout: BoundedOutputBuffer,
    stderr: BoundedOutputBuffer
  ): ExecuteResult {
    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: execution.exitCode ?? null,
      durationMs: execution.complete?.executionTimeMs,
      truncated: stdout.truncated || stderr.truncated
    };
  }

  // ==================== Lifecycle Methods ====================
  /** Reuses one manager transport for every administrative call in a lifecycle operation. */
  private async withSandboxManager<T>(
    callback: (manager: SandboxManager) => Promise<T>
  ): Promise<T> {
    const manager = SandboxManager.create({ connectionConfig: this._connection });
    try {
      return await callback(manager);
    } finally {
      await manager.close().catch(() => undefined);
    }
  }

  private resolveSandboxInfo(info: SdkSandboxInfo): ResolvedSandboxInfo {
    return { info, status: this.mapStatus(info.status) };
  }

  /** Finds the reusable remote resource identified by FastGPT's stable session id metadata. */
  private async getSandboxBySessionId(
    manager: SandboxManager
  ): Promise<ResolvedSandboxInfo | undefined> {
    const result = await manager.listSandboxInfos({
      metadata: { sessionId: this.connectionConfig.sessionId },
      pageSize: 100
    });
    const activeItems = result.items.filter(
      (item) => this.mapStatus(item.status).state !== 'UnExist'
    );
    const info = activeItems.find((item) => item.id === this._sandbox?.id) ?? activeItems[0];
    return info ? this.resolveSandboxInfo(info) : undefined;
  }

  private async getSandboxById({
    manager,
    sandboxId
  }: {
    manager: SandboxManager;
    sandboxId: SandboxId;
  }): Promise<ResolvedSandboxInfo | undefined> {
    try {
      return this.resolveSandboxInfo(await manager.getSandboxInfo(sandboxId));
    } catch (error) {
      if (this.isNotFoundError(error)) return undefined;
      throw error;
    }
  }

  /**
   * Waits for an asynchronous OpenSandbox lifecycle transition to reach an adapter state.
   * A disappeared resource is returned as undefined only when UnExist is an accepted state.
   */
  private async waitUntilSandboxState({
    sandboxId,
    expectedStates,
    readInfo,
    timeoutMs = DEFAULT_LIFECYCLE_TIMEOUT_MS
  }: {
    sandboxId: SandboxId;
    expectedStates: SandboxState[];
    readInfo: SandboxInfoReader;
    timeoutMs?: number;
  }): Promise<ResolvedSandboxInfo | undefined> {
    const startTime = Date.now();
    let currentState: SandboxState = 'UnExist';

    while (Date.now() - startTime < timeoutMs) {
      const info = await readInfo().catch((error) => {
        if (this.isNotFoundError(error)) return undefined;
        throw error;
      });
      if (!info) {
        if (expectedStates.includes('UnExist')) return undefined;
        throw new SandboxNotFoundError(`Sandbox ${sandboxId} no longer exists`);
      }

      const resolved = this.resolveSandboxInfo(info);
      currentState = resolved.status.state;
      if (expectedStates.includes(currentState)) return resolved;
      if (currentState === 'Error') {
        throw new ConnectionError(
          `Sandbox ${sandboxId} entered an error state: ${resolved.status.message ?? 'unknown error'}`,
          this.connectionConfig.baseUrl
        );
      }
      await this.sleep(LIFECYCLE_POLL_INTERVAL_MS);
    }

    throw new SandboxStateError(
      `Sandbox ${sandboxId} did not reach ${expectedStates.join(' or ')} within ${timeoutMs}ms`,
      currentState,
      expectedStates.join('|')
    );
  }

  private isNotFoundError(error: unknown): boolean {
    return error instanceof SandboxApiException && error.statusCode === 404;
  }

  private getSdkErrorCode(error: unknown): string | undefined {
    return error instanceof SandboxException ? error.error.code : undefined;
  }

  private getSdkErrorMessage(error: unknown): string | undefined {
    return error instanceof SandboxException ? error.error.message : undefined;
  }

  private getSdkOptions() {
    return {
      connectionConfig: this._connection,
      skipHealthCheck: this.createConfig?.skipHealthCheck,
      readyTimeoutSeconds: this.createConfig?.readyTimeoutSeconds,
      healthCheckPollingInterval: this.createConfig?.healthCheckPollingInterval
    };
  }

  private async createMissingSandbox(allowCreate: boolean): Promise<void> {
    if (!allowCreate) {
      throw new SandboxNotFoundError(
        `Sandbox session ${this.connectionConfig.sessionId} does not exist`
      );
    }
    await this.create();
  }

  /** Applies the shared state machine after a remote resource has been resolved. */
  private async ensureResolvedSandboxRunning({
    resolved,
    allowCreate,
    readInfo
  }: {
    resolved: ResolvedSandboxInfo;
    allowCreate: boolean;
    readInfo: SandboxInfoReader;
  }): Promise<void> {
    const sandboxId = resolved.info.id;
    switch (resolved.status.state) {
      case 'UnExist':
        await this.releaseSandbox();
        await this.createMissingSandbox(allowCreate);
        return;
      case 'Running':
        if (this._sandbox?.id !== sandboxId) await this.connect(sandboxId);
        else this._status = { state: 'Running' };
        return;
      case 'Creating':
      case 'Starting':
        await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['Running'],
          readInfo
        });
        if (this._sandbox?.id !== sandboxId) await this.connect(sandboxId);
        else this._status = { state: 'Running' };
        return;
      case 'Stopping': {
        const stopped = await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['Stopped', 'UnExist'],
          readInfo
        });
        if (!stopped) {
          await this.releaseSandbox();
          await this.createMissingSandbox(allowCreate);
          return;
        }
        await this.resume(sandboxId);
        return;
      }
      case 'Stopped':
        await this.resume(sandboxId);
        return;
      case 'Deleting':
        if (!allowCreate) {
          throw new ConnectionError(
            `Sandbox session ${this.connectionConfig.sessionId} is deleting`,
            this.connectionConfig.baseUrl
          );
        }
        await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['UnExist'],
          readInfo
        });
        await this.releaseSandbox();
        await this.create();
        return;
      case 'Error':
        throw new ConnectionError(
          `Sandbox error: ${resolved.status.message ?? 'unknown error'}`,
          this.connectionConfig.baseUrl
        );
    }
  }

  async ensureRunning(options: SandboxEnsureRunningOptions = {}): Promise<void> {
    const allowCreate = options.allowCreate ?? true;
    const boundSandbox = this._sandbox;

    if (boundSandbox) {
      try {
        const resolved = this.resolveSandboxInfo(await boundSandbox.getInfo());
        await this.ensureResolvedSandboxRunning({
          resolved,
          allowCreate,
          readInfo: async () => boundSandbox.getInfo()
        });
        return;
      } catch (error) {
        if (!this.isNotFoundError(error)) throw error;
        await this.releaseSandbox();
      }
    }

    await this.withSandboxManager(async (manager) => {
      const resolved = await this.getSandboxBySessionId(manager);
      if (!resolved) {
        await this.createMissingSandbox(allowCreate);
        return;
      }

      await this.ensureResolvedSandboxRunning({
        resolved,
        allowCreate,
        readInfo: async () =>
          (await this.getSandboxById({ manager, sandboxId: resolved.info.id }))?.info
      });
    });
  }
  async create(): Promise<void> {
    const cfg = this.createConfig;
    if (!cfg) {
      throw new ConnectionError(
        'Cannot create sandbox: createConfig is required but was not provided',
        this.connectionConfig.baseUrl
      );
    }
    if (!cfg.image?.repository) {
      throw new ConnectionError(
        'Cannot create sandbox: createConfig.image is required for opensandbox provider',
        this.connectionConfig.baseUrl
      );
    }
    try {
      this._status = { state: 'Creating' };

      const image = formatImageSpec(cfg.image);
      const resource = this.convertResourceLimits(cfg.resourceLimits);

      const sandbox = await Sandbox.create({
        ...this.getSdkOptions(),
        image,
        entrypoint: cfg.entrypoint,
        timeoutSeconds: cfg.timeoutSeconds ?? null,
        resource,
        env: cfg.env,
        metadata: {
          ...cfg.metadata,
          sessionId: this.connectionConfig.sessionId
        },
        networkPolicy: this.convertNetworkPolicy(cfg.networkPolicy),
        volumes: cfg.volumes as OpenSandboxConfigType['volumes'] | undefined,
        extensions: cfg.extensions
      });

      await this.replaceSandbox(sandbox);
      this._status = { state: 'Running' };
    } catch (error) {
      this._status = { state: 'Error', message: String(error) };
      throw new ConnectionError('Failed to create sandbox', this.connectionConfig.baseUrl, error);
    }
  }

  async connect(sandboxId: string): Promise<void> {
    try {
      this._status = { state: 'Starting' };

      const sandbox = await Sandbox.connect({
        sandboxId,
        ...this.getSdkOptions()
      });
      await this.replaceSandbox(sandbox);
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
      const resumed = await Sandbox.resume({ sandboxId, ...this.getSdkOptions() });
      await this.replaceSandbox(resumed);
      this._status = { state: 'Running' };
    } catch (error) {
      const code = this.getSdkErrorCode(error);
      if (code === 'DOCKER::SANDBOX_NOT_PAUSED') {
        await this.connect(sandboxId);
        return;
      }
      if (code === 'SANDBOX::API_NOT_SUPPORTED') {
        await this.releaseSandbox();
        throw new FeatureNotSupportedError(
          'Start/resume not supported by this runtime',
          'start',
          this.provider
        );
      }
      await this.releaseSandbox();
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
      await this.ensureRunning({ allowCreate: false });
    } catch (error) {
      if (error instanceof FeatureNotSupportedError) throw error;
      throw new CommandExecutionError(
        'Failed to start sandbox',
        'start',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async pauseResolvedSandbox({
    resolved,
    readInfo,
    pause
  }: {
    resolved: ResolvedSandboxInfo;
    readInfo: SandboxInfoReader;
    pause: () => Promise<void>;
  }): Promise<void> {
    const sandboxId = resolved.info.id;
    switch (resolved.status.state) {
      case 'UnExist':
      case 'Stopped':
        return;
      case 'Stopping':
        await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['Stopped', 'UnExist'],
          readInfo
        });
        return;
      case 'Deleting':
        await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['UnExist'],
          readInfo
        });
        return;
      case 'Creating':
      case 'Starting':
        await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['Running'],
          readInfo
        });
        break;
      case 'Error':
        throw new ConnectionError(
          `Sandbox error: ${resolved.status.message ?? 'unknown error'}`,
          this.connectionConfig.baseUrl
        );
      case 'Running':
        break;
    }

    await pause();
    await this.waitUntilSandboxState({
      sandboxId,
      expectedStates: ['Stopped', 'UnExist'],
      readInfo
    });
  }

  async stop(): Promise<void> {
    try {
      this._status = { state: 'Stopping' };

      const boundSandbox = this._sandbox;
      if (boundSandbox) {
        await this.pauseResolvedSandbox({
          resolved: this.resolveSandboxInfo(await boundSandbox.getInfo()),
          readInfo: async () => boundSandbox.getInfo(),
          pause: async () => boundSandbox.pause()
        });
      } else {
        await this.withSandboxManager(async (manager) => {
          const resolved = await this.getSandboxBySessionId(manager);
          if (!resolved) return;
          await this.pauseResolvedSandbox({
            resolved,
            readInfo: async () =>
              (await this.getSandboxById({ manager, sandboxId: resolved.info.id }))?.info,
            pause: async () => manager.pauseSandbox(resolved.info.id)
          });
        });
      }
      this._status = { state: 'Stopped' };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        await this.releaseSandbox();
        this._status = { state: 'Stopped' };
        return;
      }
      const message = this.getSdkErrorMessage(error);

      if (message?.toLowerCase().includes('already paused')) {
        this._status = { state: 'Stopped' };
        return;
      }

      const code = this.getSdkErrorCode(error);
      if (code === 'SANDBOX::API_NOT_SUPPORTED') {
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
    const affectsBoundSandbox = !this._sandbox || !sandboxId || sandboxId === this._sandbox.id;
    try {
      if (affectsBoundSandbox) this._status = { state: 'Deleting' };
      const targetId = sandboxId ?? this._sandbox?.id;

      if (targetId && targetId === this._sandbox?.id) {
        const boundSandbox = this._sandbox;
        await boundSandbox.kill();
        await this.waitUntilSandboxState({
          sandboxId: targetId,
          expectedStates: ['UnExist'],
          readInfo: async () => boundSandbox.getInfo()
        });
        await this.releaseSandbox();
        this._status = { state: 'UnExist' };
        return;
      }

      await this.withSandboxManager(async (manager) => {
        const resolved = targetId
          ? await this.getSandboxById({ manager, sandboxId: targetId })
          : await this.getSandboxBySessionId(manager);
        if (!resolved) return;

        await manager.killSandbox(resolved.info.id);
        await this.waitUntilSandboxState({
          sandboxId: resolved.info.id,
          expectedStates: ['UnExist'],
          readInfo: async () =>
            (await this.getSandboxById({ manager, sandboxId: resolved.info.id }))?.info
        });
      });
      if (affectsBoundSandbox) this._status = { state: 'UnExist' };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        if (affectsBoundSandbox) {
          await this.releaseSandbox();
          this._status = { state: 'UnExist' };
        }
        return;
      }
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
    await this.releaseSandbox();
  }

  /**
   * Get endpoint information for a provider endpoint or well-known service.
   */
  async getEndpoint(selector: SandboxEndpointSelector): Promise<Endpoint> {
    return this.getOpenSandboxEndpoint(selector);
  }

  private async getOpenSandboxEndpoint(port: number): Promise<Endpoint> {
    const raw = await this.sandbox.getEndpointUrl(port);
    const url = new URL(raw);
    const endpointPort = url.port ? Number.parseInt(url.port, 10) : port;
    return {
      host: url.hostname,
      port: endpointPort,
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      url: raw
    };
  }

  private convertSandboxInfo(info: SdkSandboxInfo): SandboxInfo {
    return {
      id: info.id,
      image: info.image === undefined ? undefined : parseImageSpec(info.image.uri),
      entrypoint: info.entrypoint,
      metadata: info.metadata,
      status: this.mapStatus(info.status),
      createdAt: info.createdAt,
      expiresAt: info.expiresAt ?? undefined
    };
  }

  async getInfo(): Promise<SandboxInfo | null> {
    try {
      if (this._sandbox) return this.convertSandboxInfo(await this._sandbox.getInfo());

      return await this.withSandboxManager(async (manager) => {
        const resolved = await this.getSandboxBySessionId(manager);
        return resolved ? this.convertSandboxInfo(resolved.info) : null;
      });
    } catch (error) {
      if (this.isNotFoundError(error)) return null;
      throw new CommandExecutionError(
        'Failed to get sandbox info',
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
  async readFiles(paths: string[], options?: ReadFileOptions): Promise<FileReadResult[]> {
    return Promise.all(
      paths.map(async (path) => {
        const normalizedPath = this.normalizePath(path);
        try {
          const range = options?.range ? `bytes=${options.range}` : undefined;
          const content = await this.sandbox.files.readBytes(normalizedPath, { range });
          return { path: normalizedPath, content, error: null };
        } catch (error) {
          return {
            path: normalizedPath,
            content: new Uint8Array(),
            error: error instanceof Error ? error : new Error(String(error))
          };
        }
      })
    );
  }

  async writeFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]> {
    return Promise.all(
      entries.map(async (entry) => {
        const path = this.normalizePath(entry.path);
        try {
          await this.sandbox.files.writeFiles([{ ...entry, path }]);
          return { path, bytesWritten: getFileDataByteLength(entry.data), error: null };
        } catch (error) {
          return {
            path,
            bytesWritten: 0,
            error: error instanceof Error ? error : new Error(String(error))
          };
        }
      })
    );
  }

  async deleteFiles(paths: string[]): Promise<FileDeleteResult[]> {
    const normalizedPaths = paths.map((path) => this.normalizePath(path));
    try {
      await this.sandbox.files.deleteFiles(normalizedPaths);
      return normalizedPaths.map((path) => ({ path, success: true, error: null }));
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      return normalizedPaths.map((path) => ({ path, success: false, error: normalizedError }));
    }
  }

  async moveFiles(entries: MoveEntry[]): Promise<void> {
    await this.sandbox.files.moveFiles(
      entries.map(({ source, destination }) => ({
        src: this.normalizePath(source),
        dest: this.normalizePath(destination)
      }))
    );
  }

  async replaceContent(entries: ContentReplaceEntry[]): Promise<void> {
    await this.sandbox.files.replaceContents(
      entries.map((entry) => ({ ...entry, path: this.normalizePath(entry.path) }))
    );
  }

  async createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    await this.sandbox.files.createDirectories(
      paths.map((path) => ({ path: this.normalizePath(path), ...options }))
    );
  }

  async deleteDirectories(
    paths: string[],
    _options?: { recursive?: boolean; force?: boolean }
  ): Promise<void> {
    await this.sandbox.files.deleteDirectories(paths.map((path) => this.normalizePath(path)));
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const entries = await this.sandbox.files.listDirectory({ path: this.normalizePath(path) });
    return entries.map((entry) => ({
      name: entry.path.split('/').filter(Boolean).pop() ?? entry.path,
      path: entry.path,
      isDirectory: entry.type === 'directory',
      isFile: entry.type === 'file',
      size: entry.size,
      modifiedAt: entry.modifiedAt
    }));
  }

  async getFileInfo(paths: string[]): Promise<Map<string, FileInfo>> {
    const info = await this.sandbox.files.getFileInfo(
      paths.map((path) => this.normalizePath(path))
    );
    return new Map(
      Object.entries(info).map(([path, entry]) => [
        path,
        {
          ...entry,
          isDirectory: entry.type === 'directory',
          isFile: entry.type === 'file',
          isSymlink: entry.type === 'symlink'
        }
      ])
    );
  }

  async setPermissions(entries: PermissionEntry[]): Promise<void> {
    const paths = entries.map((entry) => this.normalizePath(entry.path));
    const currentInfo = entries.some((entry) => entry.mode === undefined)
      ? await this.sandbox.files.getFileInfo(paths)
      : {};

    await this.sandbox.files.setPermissions(
      entries.map((entry, index) => {
        const path = paths[index] as string;
        const mode = entry.mode ?? currentInfo[path]?.mode;
        if (mode === undefined) {
          throw new Error(`Cannot preserve file mode for ${path}`);
        }
        return { ...entry, path, mode };
      })
    );
  }

  async search(pattern: string, path: string = '.'): Promise<SearchResult[]> {
    const results = await this.sandbox.files.search({
      path: this.normalizePath(path),
      pattern
    });
    return results.map((entry) => ({
      path: entry.path,
      isDirectory: entry.type === 'directory',
      isFile: entry.type === 'file'
    }));
  }

  override readFileStream(path: string): AsyncIterable<Uint8Array> {
    return this.sandbox.files.readBytesStream(this.normalizePath(path));
  }

  override async writeFileStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    await this.sandbox.files.writeFiles([{ path: this.normalizePath(path), data: stream }]);
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
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs),
          envs: options?.env
        },
        {
          skipAccumulation: true,
          onStdout: (msg) => {
            stdoutBuf.append(msg.text);
          },
          onStderr: (msg) => {
            stderrBuf.append(msg.text);
          }
        },
        options?.signal
      );

      return this.toExecuteResult(execution, stdoutBuf, stderrBuf);
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
    const onComplete = handlers.onComplete;
    const wantsComplete = Boolean(onComplete);
    const maxBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const stdoutBuf = wantsComplete ? new BoundedOutputBuffer(maxBytes, '\n') : undefined;
    const stderrBuf = wantsComplete ? new BoundedOutputBuffer(maxBytes, '\n') : undefined;

    try {
      const sdkHandlers: ExecutionHandlers = {
        skipAccumulation: true,
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
                const error = new Error(err.value ?? err.name ?? 'Execution error');
                error.name = err.name ?? 'ExecutionError';
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
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs),
          envs: options?.env
        },
        sdkHandlers,
        options?.signal
      );

      if (onComplete && stdoutBuf && stderrBuf) {
        await onComplete(this.toExecuteResult(execution, stdoutBuf, stderrBuf));
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
      const execution = await this.sandbox.commands.run(
        command,
        {
          workingDirectory: this.normalizePath(options?.workingDirectory),
          background: true,
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs),
          envs: options?.env
        },
        { skipAccumulation: true },
        options?.signal
      );

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
    return this.sandbox.isHealthy();
  }

  async getMetrics(): Promise<SandboxMetrics> {
    return this.sandbox.metrics.getMetrics();
  }
}
