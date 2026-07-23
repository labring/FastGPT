import type {
  Execution,
  ExecutionHandlers,
  NetworkPolicy as SdkNetworkPolicy,
  SandboxInfo as SdkSandboxInfo,
  WriteEntry as SdkWriteEntry
} from '@alibaba-group/opensandbox';
import {
  ConnectionConfig,
  DEFAULT_HEALTH_CHECK_POLLING_INTERVAL_MILLIS,
  DEFAULT_READY_TIMEOUT_SECONDS,
  Sandbox,
  SandboxException,
  SandboxManager,
  type Endpoint as SdkEndpoint
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
  ExecuteOptions,
  ExecuteResult,
  FileWriteEntry,
  FileWriteResult,
  ResourceLimits,
  SandboxCreateSpec,
  SandboxEndpointSelector,
  SandboxEnsureRunningOptions,
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
import { toOpenSandboxWriteData, verifyCommittedUpload } from './uploadRecovery';
import { getWriteEntryByteLength } from '@/utils/files';

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
  private readonly _connection: ConnectionConfig;
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

  /**
   * Replaces a statically-created SDK client and releases the previous independent transport.
   * Instance resume is handled separately because the SDK intentionally shares its transport with
   * the fresh Sandbox object it returns.
   */
  private async replaceSandbox(sandbox: Sandbox): Promise<void> {
    const previous = this._sandbox;
    this.sandbox = sandbox;
    if (previous && previous !== sandbox) {
      await previous.close().catch(() => undefined);
    }
  }

  /** Releases the currently bound SDK client without changing the remote sandbox lifecycle. */
  private async releaseSandbox(): Promise<void> {
    const current = this._sandbox;
    this.sandbox = undefined;
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
    pending: 'Creating',
    running: 'Running',
    creating: 'Creating',
    resuming: 'Starting',
    starting: 'Starting',
    pausing: 'Stopping',
    stopping: 'Stopping',
    stopped: 'Stopped',
    deleting: 'Deleting',
    error: 'Error',
    failed: 'Error',
    paused: 'Stopped',
    deleted: 'UnExist',
    terminated: 'UnExist'
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
        const value = Number.parseInt(match[1] ?? '0', 10);
        result.memoryMiB = match[2] === 'Mi' ? value : value * 1024;
      }
    }

    const disk = resource.disk;
    if (disk) {
      const match = disk.match(/^(\d+)Gi$/);
      if (match) {
        result.diskGiB = Number.parseInt(match[1] ?? '0', 10);
      }
    }

    return result;
  }

  private getCommandTimeoutSeconds(timeoutMs?: number): number | undefined {
    if (timeoutMs === undefined || timeoutMs <= 0) return undefined;
    return Math.ceil(timeoutMs / 1000);
  }

  private extractExitCode(execution: Pick<Execution, 'exitCode' | 'error'>): number {
    if (typeof execution.exitCode === 'number') return execution.exitCode;

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

    return execution.error ? 1 : 0;
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
    const info = activeItems.find((item) => item.id === this._id) ?? activeItems[0];
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

  private async waitUntilSessionDeleted({
    manager,
    timeoutMs = DEFAULT_LIFECYCLE_TIMEOUT_MS
  }: {
    manager: SandboxManager;
    timeoutMs?: number;
  }): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (!(await this.getSandboxBySessionId(manager))) return;
      await this.sleep(LIFECYCLE_POLL_INTERVAL_MS);
    }

    throw new SandboxStateError(
      `Sandbox session ${this.connectionConfig.sessionId} was not deleted within ${timeoutMs}ms`,
      'Deleting',
      'UnExist'
    );
  }

  private isNotFoundError(error: unknown): boolean {
    let current: unknown = error;
    while (current && typeof current === 'object') {
      const value = current as {
        status?: unknown;
        statusCode?: unknown;
        code?: unknown;
        message?: unknown;
        error?: { code?: unknown; message?: unknown };
        cause?: unknown;
      };
      const code = String(value.code ?? value.error?.code ?? '').toLowerCase();
      const message = String(value.message ?? value.error?.message ?? '').toLowerCase();
      const status = Number(value.status ?? value.statusCode);
      if (
        status === 404 ||
        code.includes('not_found') ||
        code.includes('notfound') ||
        code === '404' ||
        message.includes('not found')
      ) {
        return true;
      }
      current = value.cause;
    }
    return false;
  }

  private getSdkErrorCode(error: unknown): string | undefined {
    if (error instanceof SandboxException) return error.error.code;
    if (!error || typeof error !== 'object') return undefined;
    const value = error as { code?: unknown; error?: { code?: unknown } };
    const code = value.code ?? value.error?.code;
    return typeof code === 'string' ? code : undefined;
  }

  private getSdkErrorMessage(error: unknown): string | undefined {
    if (error instanceof SandboxException) return error.error.message;
    if (!error || typeof error !== 'object') return undefined;
    const value = error as { message?: unknown; error?: { message?: unknown } };
    const message = value.message ?? value.error?.message;
    return typeof message === 'string' ? message : undefined;
  }

  private convertMetadata(metadata?: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata ?? {})) {
      if (value === undefined) continue;
      const serialized = (() => {
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
          return String(value);
        }
        return JSON.stringify(value);
      })();
      if (serialized !== undefined) result[key] = serialized;
    }
    return result;
  }

  /** Uses the SDK custom health hook while retaining FastGPT's command-channel fallback. */
  private async isSandboxHealthy(sandbox: Sandbox): Promise<boolean> {
    try {
      if (await sandbox.health.ping()) return true;
    } catch {
      // Execd ping may briefly return 500 after the lifecycle state becomes Running.
    }

    try {
      const execution = await sandbox.commands.run(
        'true',
        { timeoutSeconds: 3 },
        { skipAccumulation: true }
      );
      return this.extractExitCode(execution) === 0;
    } catch {
      return false;
    }
  }

  private getSdkConnectionOptions() {
    return {
      connectionConfig: this._connection,
      skipHealthCheck: this.createConfig?.skipHealthCheck,
      healthCheck: (sandbox: Sandbox) => this.isSandboxHealthy(sandbox),
      readyTimeoutSeconds: this.createConfig?.readyTimeoutSeconds,
      healthCheckPollingInterval: this.createConfig?.healthCheckPollingInterval
    };
  }

  private async waitUntilSandboxReady(sandbox: Sandbox): Promise<void> {
    if (this.createConfig?.skipHealthCheck) return;
    await sandbox.waitUntilReady({
      readyTimeoutSeconds: this.createConfig?.readyTimeoutSeconds ?? DEFAULT_READY_TIMEOUT_SECONDS,
      pollingIntervalMillis:
        this.createConfig?.healthCheckPollingInterval ??
        DEFAULT_HEALTH_CHECK_POLLING_INTERVAL_MILLIS,
      healthCheck: (target) => this.isSandboxHealthy(target)
    });
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
    readInfo,
    waitUntilDeleted
  }: {
    resolved: ResolvedSandboxInfo;
    allowCreate: boolean;
    readInfo: SandboxInfoReader;
    waitUntilDeleted: () => Promise<void>;
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
        await waitUntilDeleted();
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
          readInfo: async () => boundSandbox.getInfo(),
          waitUntilDeleted: async () => {
            await this.waitUntilSandboxState({
              sandboxId: boundSandbox.id,
              expectedStates: ['UnExist'],
              readInfo: async () => boundSandbox.getInfo()
            });
          }
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
          (await this.getSandboxById({ manager, sandboxId: resolved.info.id }))?.info,
        waitUntilDeleted: async () => this.waitUntilSessionDeleted({ manager })
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
        ...this.getSdkConnectionOptions(),
        image,
        entrypoint: cfg.entrypoint,
        timeoutSeconds: cfg.timeoutSeconds ?? null,
        resource,
        env: cfg.env,
        metadata: {
          ...this.convertMetadata(cfg.metadata),
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
    if (this._sandbox?.id === sandboxId) {
      this._status = { state: 'Running' };
      return;
    }

    try {
      this._status = { state: 'Starting' };

      const sandbox = await Sandbox.connect({
        sandboxId,
        ...this.getSdkConnectionOptions()
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

      const boundSandbox = this._sandbox?.id === sandboxId ? this._sandbox : undefined;
      if (boundSandbox) {
        // Instance resume returns a fresh object that intentionally shares the current transport.
        const resumed = await boundSandbox.resume({ skipHealthCheck: true });
        this.sandbox = resumed;
        await this.waitUntilSandboxReady(resumed);
      } else {
        const resumed = await Sandbox.resume({
          sandboxId,
          ...this.getSdkConnectionOptions()
        });
        await this.replaceSandbox(resumed);
      }
      this._status = { state: 'Running' };
    } catch (error) {
      const code = this.getSdkErrorCode(error);
      if (code === 'DOCKER::SANDBOX_NOT_PAUSED') {
        if (this._sandbox?.id !== sandboxId) await this.connect(sandboxId);
        this._status = { state: 'Running' };
        return;
      }
      if (code === 'SANDBOX::API_NOT_SUPPORTED') {
        throw new FeatureNotSupportedError(
          'Start/resume not supported by this runtime',
          'start',
          this.provider
        );
      }
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

      if (message?.includes('already paused')) {
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
    try {
      this._status = { state: 'Deleting' };
      const targetId = sandboxId ?? this._id;

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
      this._status = { state: 'UnExist' };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        if (!sandboxId || sandboxId === this._id) await this.releaseSandbox();
        this._status = { state: 'UnExist' };
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
    const sdkEndpoint = (await this.sandbox.getEndpoint(port)) as SdkEndpoint;

    const raw = sdkEndpoint.endpoint;
    try {
      const url = new URL(raw);
      const parsedPort = url.port ? Number.parseInt(url.port, 10) : undefined;
      return {
        host: url.hostname,
        port: parsedPort !== undefined && Number.isFinite(parsedPort) ? parsedPort : port,
        protocol: url.protocol === 'https:' ? 'https' : 'http',
        url: raw
      };
    } catch {
      // OpenSandbox docker runtime may return "host:port" or path-based host strings.
    }

    const colonIdx = raw.lastIndexOf(':');
    const hasPathBeforeColon = colonIdx !== -1 && raw.slice(0, colonIdx).includes('/');

    if (colonIdx !== -1 && !hasPathBeforeColon) {
      // "host:port" format
      const host = raw.slice(0, colonIdx);
      const parsedPort = Number.parseInt(raw.slice(colonIdx + 1), 10);
      const portNumber = Number.isNaN(parsedPort) ? port : parsedPort;
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

  private convertSandboxInfo(info: SdkSandboxInfo): SandboxInfo {
    return {
      id: info.id,
      image:
        info.image === undefined
          ? undefined
          : typeof info.image === 'string'
            ? parseImageSpec(info.image)
            : 'uri' in info.image
              ? parseImageSpec(info.image.uri)
              : info.image,
      entrypoint: info.entrypoint,
      metadata: info.metadata,
      status: this.mapStatus(info.status),
      createdAt: info.createdAt,
      expiresAt: info.expiresAt ?? undefined,
      resourceLimits: this.parseResourceLimits(
        (info as Record<string, unknown>).resourceLimits as Record<string, string> | undefined
      )
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
      const statSize = Number.parseInt(result?.stdout.trim() ?? '', 10);
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
      data: NonNullable<SdkWriteEntry['data']>;
      bytesWritten: number;
    }) => {
      try {
        await this.sandbox.files.writeFiles([
          {
            path: normalizedPath,
            data,
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
          data,
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

  override readFileStream(path: string): AsyncIterable<Uint8Array> {
    return this.sandbox.files.readBytesStream(this.normalizePath(path));
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
          skipAccumulation: true,
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
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs)
        },
        sdkHandlers
      );

      if (onComplete && stdoutBuf && stderrBuf) {
        const exitCode = this.extractExitCode(execution);
        await onComplete({
          stdout: stdoutBuf.toString(),
          stderr: stderrBuf.toString(),
          exitCode,
          truncated: stdoutBuf.truncated || stderrBuf.truncated
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
      const execution = await this.sandbox.commands.run(
        command,
        {
          workingDirectory: this.normalizePath(options?.workingDirectory),
          background: true,
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs)
        },
        { skipAccumulation: true }
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
    return this.isSandboxHealthy(this.sandbox);
  }

  async getMetrics(): Promise<SandboxMetrics> {
    return this.sandbox.metrics.getMetrics();
  }
}
