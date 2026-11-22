import { posix } from 'node:path';
import {
  ConnectionConfig,
  DEFAULT_EXECD_PORT,
  ExecutionEventDispatcher,
  Sandbox,
  SandboxManager,
  SandboxReadyTimeoutException,
  SandboxUnhealthyException,
  type ContentReplaceEntry,
  type Execution,
  type FileInfo as SdkFileInfo,
  type MoveEntry,
  type SandboxId,
  type SandboxInfo as SdkSandboxInfo,
  type Volume,
  type WriteEntry
} from '@alibaba-group/opensandbox';
import { createDataPlaneHeaders } from '@alibaba-group/opensandbox/internal';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  batchRun,
  delayWithSignal,
  getAbortError,
  throwIfAborted
} from '@fastgpt/global/common/system/utils';
import type { ExecuteResult } from '@fastgpt/global/core/ai/sandbox/type';
import {
  getOpenSandboxClientConfig,
  getOpenSandboxRuntimeConfig,
  type OpenSandboxClientConfig,
  type OpenSandboxRuntimeConfig
} from './config';
import {
  CommandExecutionError,
  ConnectionError,
  hasMatchingErrorInCauseChain,
  isConfirmedSandboxUnavailableError,
  isRecoverableSandboxError,
  isSandboxContainerNotFoundApiError,
  isSandboxFileNotFoundError,
  isTransientSandboxConnectError,
  SandboxNotFoundError,
  SandboxStateError
} from './errors';
import {
  OPEN_SANDBOX_CREATE_REQUEST_TIMEOUT_SECONDS,
  OPEN_SANDBOX_REQUEST_TIMEOUT_SECONDS
} from '../../constants';
import {
  assertLegacyCompatibleSessionSandboxOwner,
  listLegacyCompatibleSandboxesBySessionId
} from '../../legacy';
import type {
  ContentReplaceResult,
  DirectoryEntry,
  Endpoint,
  ExecuteOptions,
  FileDeleteResult,
  FileInfo,
  FileReadResult,
  FileWriteResult,
  OpenSandboxConnectionConfig,
  ResourceLimits,
  SandboxCreateSpec,
  SandboxInfo,
  SandboxState
} from './type';
import {
  BoundedOutputBuffer,
  formatImageSpec,
  getFileDataByteLength,
  isReadableStreamData,
  octalNumberToPosixMode,
  parseImageSpec,
  posixModeToOctalNumber
} from './utils';

const DEFAULT_CONNECT_READY_TIMEOUT_SECONDS = 10;
const DEFAULT_LIFECYCLE_TIMEOUT_MS = 120_000;
const LIFECYCLE_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const WRITE_FILES_CONCURRENCY = 8;

const STATE_MAP: Record<string, SandboxState> = {
  running: 'Running',
  creating: 'Creating',
  pending: 'Creating',
  allocated: 'Starting',
  resuming: 'Starting',
  pausing: 'Stopping',
  stopping: 'Deleting',
  deleting: 'Deleting',
  error: 'Error',
  paused: 'Stopped',
  deleted: 'UnExist'
};

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

type SharedConnectionSlot = {
  key: string;
  connection: ConnectionConfig;
};

const sharedConnections = new Map<number, SharedConnectionSlot>();

type SandboxOwner = { sessionId?: string };

/** 反向孤儿 GC 必须严格校验 `app === 'fastgpt'`，绝不误删存量无标签或外部容器。 */
function assertManagedSandboxOwner(info: SdkSandboxInfo, owner: SandboxOwner): void {
  if (
    info.metadata?.app !== 'fastgpt' ||
    (owner.sessionId !== undefined && info.metadata.sessionId !== owner.sessionId)
  ) {
    throw new Error(`OpenSandbox managed ownership mismatch: ${info.id}`);
  }
}

/**
 * 复用已初始化 transport 的 `ConnectionConfig`，每个超时层级仅保留一条最新配置的连接池，
 * 配置变更时主动关闭旧 transport 避免凭证与连接池泄漏。
 */
function getSharedOpenSandboxConnection(params: {
  baseUrl: string;
  apiKey?: string;
  useServerProxy?: boolean;
  requestTimeoutSeconds?: number;
}): ConnectionConfig {
  const useServerProxy = params.useServerProxy ?? true;
  const requestTimeoutSeconds =
    params.requestTimeoutSeconds ?? OPEN_SANDBOX_REQUEST_TIMEOUT_SECONDS;
  const cacheKey = JSON.stringify([params.baseUrl, params.apiKey ?? '', useServerProxy]);
  const existing = sharedConnections.get(requestTimeoutSeconds);
  if (existing?.key === cacheKey) return existing.connection;

  if (existing) {
    void existing.connection.closeTransport?.().catch(() => {});
  }

  const created = new ConnectionConfig({
    domain: params.baseUrl,
    apiKey: params.apiKey,
    requestTimeoutSeconds,
    debug: false,
    useServerProxy
  }).withTransportIfMissing();
  sharedConnections.set(requestTimeoutSeconds, { key: cacheKey, connection: created });
  return created;
}

async function withOpenSandboxManager<T>(
  connection: ConnectionConfig,
  fn: (manager: SandboxManager) => Promise<T>
): Promise<T> {
  const manager = SandboxManager.create({ connectionConfig: connection });
  try {
    return await fn(manager);
  } finally {
    await manager.close().catch(() => {});
  }
}

/**
 * OpenSandbox 客户端：直接封装 `@alibaba-group/opensandbox@^1.2.1` 控制面与 `execd` 数据面。
 */
export class OpenSandboxClient {
  private boundSandbox?: Sandbox;
  private remoteSandboxId?: SandboxId;
  private readonly connection: ConnectionConfig;

  constructor(
    private readonly connectionConfig: OpenSandboxConnectionConfig,
    private readonly createConfig?: SandboxCreateSpec
  ) {
    this.remoteSandboxId = connectionConfig.remoteSandboxId;
    this.connection = getSharedOpenSandboxConnection({
      baseUrl: connectionConfig.baseUrl,
      apiKey: connectionConfig.apiKey,
      useServerProxy: connectionConfig.useServerProxy
    });
  }

  get rootPath(): string {
    return (
      this.createConfig?.env?.FASTGPT_WORKDIR?.replace(/\/+$/, '') || OPEN_SANDBOX_DEFAULT_ROOT_PATH
    );
  }

  get id(): SandboxId | undefined {
    return this.boundSandbox?.id ?? this.remoteSandboxId;
  }

  protected normalizePath(path: string = ''): string {
    if (!path || path === '.' || path === './') return this.rootPath;
    const raw = path.startsWith('/') ? path : `${this.rootPath}/${path}`;
    const normalized = posix.normalize(raw);
    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
  }

  private get sandbox(): Sandbox {
    if (!this.boundSandbox) {
      throw new SandboxStateError('Sandbox not initialized', {
        currentState: 'UnExist',
        requiredState: 'Running'
      });
    }
    return this.boundSandbox;
  }

  private mapStatus(status: { state: string; reason?: string; message?: string }): {
    state: SandboxState;
    reason?: string;
    message?: string;
  } {
    return {
      state: STATE_MAP[status.state.toLowerCase()] ?? 'Error',
      reason: status.reason,
      message: status.message
    };
  }

  /** 探测 execd 数据面与工作区目录是否同时就绪；`FILE_NOT_FOUND` 视为工作区目录尚未创建（容器已就绪）。 */
  private readonly checkWorkspaceReady = async (sbx: Sandbox): Promise<boolean> => {
    try {
      const info = await sbx.files.getFileInfo([this.rootPath]);
      const rootEntry = info[this.rootPath];
      return !rootEntry || rootEntry.type === 'directory';
    } catch (error) {
      if (isSandboxFileNotFoundError(error)) return true;
      throw error;
    }
  };

  private getConnectSdkOptions(options?: {
    skipHealthCheck?: boolean;
    healthCheck?: (sbx: Sandbox) => Promise<boolean>;
  }) {
    return {
      connectionConfig: this.connection,
      skipHealthCheck: options?.skipHealthCheck ?? this.createConfig?.skipHealthCheck,
      readyTimeoutSeconds: DEFAULT_CONNECT_READY_TIMEOUT_SECONDS,
      healthCheckPollingInterval: this.createConfig?.healthCheckPollingInterval,
      healthCheck: options?.healthCheck ?? this.checkWorkspaceReady
    };
  }

  private async bind(sandbox: Sandbox): Promise<void> {
    const prev = this.boundSandbox;
    this.boundSandbox = sandbox;
    this.remoteSandboxId = sandbox.id;
    if (prev && prev !== sandbox) await prev.close().catch(() => {});
  }

  private async releaseSandbox(): Promise<void> {
    const current = this.boundSandbox;
    this.boundSandbox = undefined;
    await current?.close().catch(() => {});
  }

  private async withManager<T>(fn: (manager: SandboxManager) => Promise<T>): Promise<T> {
    return withOpenSandboxManager(this.connection, fn);
  }

  private async killAndWaitUnExist({
    manager,
    sandboxId,
    signal
  }: {
    manager: SandboxManager;
    sandboxId: SandboxId;
    signal?: AbortSignal;
  }): Promise<void> {
    await (signal ? manager.killSandbox(sandboxId, signal) : manager.killSandbox(sandboxId));
    await this.waitUntilState({
      sandboxId,
      expected: ['UnExist'],
      readInfo: () => manager.getSandboxInfo(sandboxId),
      signal
    });
  }

  private async listBySessionId(
    manager: SandboxManager,
    signal?: AbortSignal
  ): Promise<SdkSandboxInfo[]> {
    return listLegacyCompatibleSandboxesBySessionId({
      manager,
      sessionId: this.connectionConfig.sessionId,
      isActive: (item) => this.mapStatus(item.status).state !== 'UnExist',
      signal
    });
  }

  private async waitUntilState({
    sandboxId,
    expected,
    readInfo,
    signal
  }: {
    sandboxId: SandboxId;
    expected: SandboxState[];
    readInfo: () => Promise<SdkSandboxInfo | undefined>;
    signal?: AbortSignal;
  }): Promise<SdkSandboxInfo | undefined> {
    const start = Date.now();
    let state: SandboxState = 'UnExist';
    while (Date.now() - start < DEFAULT_LIFECYCLE_TIMEOUT_MS) {
      throwIfAborted(signal);
      const info = await readInfo().catch((err) =>
        isSandboxContainerNotFoundApiError(err) ? undefined : Promise.reject(err)
      );
      if (!info) {
        if (expected.includes('UnExist')) return undefined;
        throw new SandboxNotFoundError(`Sandbox ${sandboxId} no longer exists`);
      }
      assertLegacyCompatibleSessionSandboxOwner(info, this.connectionConfig);
      const status = this.mapStatus(info.status);
      state = status.state;
      if (expected.includes(state)) return info;
      if (state === 'Error') {
        throw new ConnectionError(
          `Sandbox ${sandboxId} entered an error state: ${status.message ?? 'unknown error'}`,
          { endpoint: this.connectionConfig.baseUrl }
        );
      }
      await delayWithSignal(LIFECYCLE_POLL_INTERVAL_MS, signal);
    }
    throw new SandboxStateError(
      `Sandbox ${sandboxId} timed out waiting for ${expected.join('|')}`,
      {
        currentState: state,
        requiredState: expected.join('|')
      }
    );
  }

  private async resolveToRunning({
    info,
    readInfo,
    signal,
    operationId
  }: {
    info: SdkSandboxInfo;
    readInfo: () => Promise<SdkSandboxInfo | undefined>;
    signal?: AbortSignal;
    operationId?: string;
  }): Promise<void> {
    throwIfAborted(signal);
    assertLegacyCompatibleSessionSandboxOwner(info, this.connectionConfig);
    const status = this.mapStatus(info.status);
    switch (status.state) {
      case 'UnExist':
        await this.releaseSandbox();
        return this.create({ signal, operationId });
      case 'Running':
        if (this.boundSandbox?.id !== info.id) {
          await this.connect(info.id, { verifiedInfo: info, signal });
        }
        return;
      case 'Creating':
      case 'Starting':
        await this.waitUntilState({ sandboxId: info.id, expected: ['Running'], readInfo, signal });
        if (this.boundSandbox?.id !== info.id) {
          await this.connect(info.id, { verifiedInfo: info, signal });
        }
        return;
      case 'Deleting':
        await this.waitUntilState({ sandboxId: info.id, expected: ['UnExist'], readInfo, signal });
        await this.releaseSandbox();
        return this.create({ signal, operationId });
      case 'Stopping':
      case 'Stopped':
        await this.withManager((manager) =>
          this.killAndWaitUnExist({ manager, sandboxId: info.id, signal })
        );
        await this.releaseSandbox();
        return this.create({ signal, operationId });
      case 'Error':
        throw new ConnectionError(`Sandbox error: ${status.message ?? 'unknown error'}`, {
          endpoint: this.connectionConfig.baseUrl
        });
    }
  }

  /**
   * 连接已处于 `running` 的远端容器。
   *
   * - 快路径：已持有 `remoteSandboxId` 时直接 `Sandbox.connect({ skipHealthCheck: true })`；
   * - 慢路径：无 `remoteSandboxId`（如存量 `upstream/main` 记录首次连接）则按 `sessionId` 发现并记录 `remoteSandboxId`。
   */
  async connectRunning(options?: {
    verifyHealth?: boolean;
    remoteSandboxId?: SandboxId;
  }): Promise<void> {
    const verifyHealth = options?.verifyHealth === true;
    if (options?.remoteSandboxId) {
      this.remoteSandboxId = options.remoteSandboxId;
    }

    // 当权威目标 instanceId 发生变化（如同 PVC 原位重建）时，必须先释放旧句柄，避免继续复用过期连接。
    if (
      this.boundSandbox &&
      this.remoteSandboxId &&
      this.boundSandbox.id !== this.remoteSandboxId
    ) {
      await this.releaseSandbox();
    }

    if (!verifyHealth) {
      if (this.boundSandbox) {
        return;
      }
      if (this.remoteSandboxId) {
        try {
          await this.connect(this.remoteSandboxId, {
            skipOwnerCheck: true,
            skipHealthCheck: true
          });
          return;
        } catch (error) {
          if (error instanceof SandboxNotFoundError) {
            this.remoteSandboxId = undefined;
          }
          throw error;
        }
      }
    }

    const checkAndBind = async (info?: SdkSandboxInfo) => {
      if (!info) {
        throw new SandboxNotFoundError(
          `Sandbox session ${this.connectionConfig.sessionId} does not exist`
        );
      }
      assertLegacyCompatibleSessionSandboxOwner(info, this.connectionConfig);
      const status = this.mapStatus(info.status);
      if (status.state !== 'Running') {
        await this.releaseSandbox();
        throw new SandboxStateError('Cannot connect to inactive sandbox', {
          currentState: status.state,
          requiredState: 'Running'
        });
      }
      if (this.boundSandbox?.id !== info.id) {
        await this.connect(info.id, { verifiedInfo: info });
        return;
      }
      if (!(this.createConfig?.skipHealthCheck ?? false)) {
        let healthy: boolean;
        try {
          healthy = await this.checkWorkspaceReady(this.boundSandbox);
        } catch (error) {
          if (isSandboxContainerNotFoundApiError(error)) {
            await this.releaseSandbox();
            this.remoteSandboxId = undefined;
            throw new SandboxNotFoundError(`Sandbox ${info.id} does not exist`, { cause: error });
          }
          throw new ConnectionError(`Failed to verify sandbox ${info.id} workspace health`, {
            endpoint: this.connectionConfig.baseUrl,
            cause: error
          });
        }
        if (!healthy) {
          await this.releaseSandbox();
          throw new SandboxStateError('Sandbox workspace is unhealthy', {
            currentState: 'Error',
            requiredState: 'Running'
          });
        }
      }
    };

    try {
      if (this.boundSandbox) {
        const boundInfo = await this.getBoundInfoOrRelease();
        if (boundInfo) {
          return await checkAndBind(boundInfo);
        }
      }

      await this.withManager(async (manager) => {
        const directInfo = await this.getDirectTargetInfo(manager);
        if (directInfo) {
          await checkAndBind(directInfo);
          return;
        }

        const items = await this.listBySessionId(manager);
        await checkAndBind(items[0]);
      });
    } catch (error) {
      throw this.translateConnectError({
        sandboxId: this.remoteSandboxId ?? this.connectionConfig.sessionId,
        error
      });
    }
  }

  /** 读取当前已绑定实例信息；若远端已不存在则清理本地绑定并回退。 */
  private async getBoundInfoOrRelease(): Promise<SdkSandboxInfo | undefined> {
    if (!this.boundSandbox) return undefined;
    try {
      return await this.boundSandbox.getInfo();
    } catch (err) {
      if (!isSandboxContainerNotFoundApiError(err)) throw err;
      await this.releaseSandbox();
      this.remoteSandboxId = undefined;
      return undefined;
    }
  }

  /** 按 remoteSandboxId 直接查询实例；若已 404 则清除失效引用。 */
  private async getDirectTargetInfo(manager: SandboxManager): Promise<SdkSandboxInfo | undefined> {
    if (!this.remoteSandboxId) return undefined;
    try {
      return await manager.getSandboxInfo(this.remoteSandboxId);
    } catch (err) {
      if (!isSandboxContainerNotFoundApiError(err)) throw err;
      this.remoteSandboxId = undefined;
      return undefined;
    }
  }

  /** 确保远端容器存在且进入 Running，不存在或正在销毁完毕后重建；传入 operationId 时会围栏清理过期代次容器。 */
  async ensureRunning(options?: { signal?: AbortSignal; operationId?: string }): Promise<void> {
    throwIfAborted(options?.signal);
    const bound = this.boundSandbox;
    const boundInfo = await this.getBoundInfoOrRelease();
    if (boundInfo && bound) {
      return this.resolveToRunning({
        info: boundInfo,
        readInfo: () => bound.getInfo(),
        signal: options?.signal,
        operationId: options?.operationId
      });
    }

    await this.withManager(async (manager) => {
      const directTarget = await this.getDirectTargetInfo(manager);
      if (directTarget && this.mapStatus(directTarget.status).state !== 'UnExist') {
        await this.resolveToRunning({
          info: directTarget,
          readInfo: () => manager.getSandboxInfo(directTarget.id),
          signal: options?.signal,
          operationId: options?.operationId
        });
        return;
      }

      const items = await this.listBySessionId(manager, options?.signal);
      if (options?.operationId) {
        const matching = items.find(
          (item) =>
            item.metadata?.operationId === options.operationId &&
            this.mapStatus(item.status).state !== 'UnExist'
        );
        const staleItems = items.filter((item) => item.id !== matching?.id);
        for (const stale of staleItems) {
          throwIfAborted(options.signal);
          assertLegacyCompatibleSessionSandboxOwner(stale, this.connectionConfig);
          try {
            await this.killAndWaitUnExist({
              manager,
              sandboxId: stale.id,
              signal: options.signal
            });
          } catch (err) {
            if (options.signal?.aborted) throw err;
            if (isSandboxContainerNotFoundApiError(err)) continue;
            throw new ConnectionError('Failed to clean up stale session sandbox', {
              endpoint: this.connectionConfig.baseUrl,
              cause: err
            });
          }
        }
        if (!matching) {
          return this.create(options);
        }
        await this.resolveToRunning({
          info: matching,
          readInfo: () => manager.getSandboxInfo(matching.id),
          signal: options.signal,
          operationId: options.operationId
        });
        return;
      }

      const target = items[0];
      if (!target) {
        return this.create(options);
      }
      await this.resolveToRunning({
        info: target,
        readInfo: () => manager.getSandboxInfo(target.id),
        signal: options?.signal,
        operationId: options?.operationId
      });
    });
  }

  /** 创建新的 OpenSandbox 容器并显式写入部署与会话标签（`timeoutSeconds: null` 由 FastGPT 接管生命周期）。 */
  async create(options?: { signal?: AbortSignal; operationId?: string }): Promise<void> {
    const config = this.createConfig;
    if (!config?.image) {
      throw new ConnectionError('Cannot create OpenSandbox resource without createConfig.image', {
        endpoint: this.connectionConfig.baseUrl
      });
    }
    const rawImage =
      typeof config.image === 'string' ? config.image : formatImageSpec(config.image);
    /** 将 FastGPT 资源规格转换为 OpenSandbox SDK 的 k8s 风格资源字段，未设置的维度不下发。 */
    const toSdkResource = (resource?: ResourceLimits) =>
      resource
        ? {
            ...(resource.cpuCount === undefined ? {} : { cpu: String(resource.cpuCount) }),
            ...(resource.memoryMiB === undefined ? {} : { memory: `${resource.memoryMiB}Mi` })
          }
        : undefined;

    try {
      throwIfAborted(options?.signal);
      const createConnection = getSharedOpenSandboxConnection({
        baseUrl: this.connectionConfig.baseUrl,
        apiKey: this.connectionConfig.apiKey,
        useServerProxy: this.connectionConfig.useServerProxy,
        requestTimeoutSeconds: OPEN_SANDBOX_CREATE_REQUEST_TIMEOUT_SECONDS
      });
      const sandbox = await Sandbox.create({
        connectionConfig: createConnection,
        skipHealthCheck: config.skipHealthCheck,
        readyTimeoutSeconds: config.readyTimeoutSeconds,
        healthCheckPollingInterval: config.healthCheckPollingInterval,
        healthCheck: this.checkWorkspaceReady,
        image: rawImage,
        entrypoint: config.entrypoint,
        timeoutSeconds: config.timeoutSeconds ?? null,
        resource: toSdkResource(config.resourceLimits),
        resourceRequests: toSdkResource(config.resourceRequests),
        env: config.env,
        metadata: {
          ...config.metadata,
          app: 'fastgpt',
          sessionId: this.connectionConfig.sessionId,
          ...(options?.operationId ? { operationId: options.operationId } : {})
        },
        networkPolicy: config.networkPolicy,
        volumes: config.volumes,
        extensions: config.extensions,
        signal: options?.signal
      });
      if (options?.signal?.aborted) {
        await sandbox.kill().catch(() => {});
        await sandbox.close().catch(() => {});
        throw getAbortError(options.signal);
      }

      // 创建后改用 30s 常规连接池重新绑定，避免后续数据面读写继续继承 210s 创建超时。
      let boundTarget = sandbox;
      try {
        const rebound = await Sandbox.connect({
          sandboxId: sandbox.id,
          connectionConfig: this.connection,
          skipHealthCheck: true,
          signal: options?.signal
        });
        await sandbox.close().catch(() => {});
        boundTarget = rebound;
      } catch (rebindError) {
        if (options?.signal?.aborted) {
          await sandbox.kill().catch(() => {});
          await sandbox.close().catch(() => {});
          throw rebindError;
        }
      }

      await this.bind(boundTarget);
    } catch (error) {
      if (
        options?.signal?.aborted ||
        error instanceof RangeError ||
        (error instanceof TypeError && !('cause' in error && error.cause))
      ) {
        throw error;
      }
      throw new ConnectionError('Failed to create sandbox', {
        endpoint: this.connectionConfig.baseUrl,
        cause: error
      });
    }
  }

  /**
   * 统一将 SDK 连接/探测异常映射为运行态边界异常，保留原始 `cause`：
   * 仅在明确确认容器不存在、工作区返回 HTTP 200 非目录或无瞬时 `cause` 的 Unhealthy 时抛出 `SandboxNotFoundError`/`SandboxStateError`；
   * 网关 502/503/504、`POD_IP_NOT_AVAILABLE`、传输重置及未确认健康结果的就绪超时一律包装为 `ConnectionError`。
   */
  private translateConnectError({
    sandboxId,
    error,
    lastProbeOutcome = 'none'
  }: {
    sandboxId: SandboxId;
    error: unknown;
    lastProbeOutcome?: 'none' | 'confirmed_unhealthy' | 'error';
  }): Error {
    if (
      error instanceof SandboxNotFoundError ||
      error instanceof SandboxStateError ||
      error instanceof ConnectionError
    ) {
      return error;
    }
    if (error instanceof Error && error.message.startsWith('OpenSandbox ownership mismatch:')) {
      return error;
    }
    if (isSandboxContainerNotFoundApiError(error)) {
      return new SandboxNotFoundError(`Sandbox ${sandboxId} does not exist`, { cause: error });
    }
    if (error instanceof SandboxReadyTimeoutException) {
      if (lastProbeOutcome === 'confirmed_unhealthy') {
        return new SandboxStateError(`Sandbox ${sandboxId} workspace is unhealthy`, {
          currentState: 'Error',
          requiredState: 'Running',
          cause: error
        });
      }
      if (isConfirmedSandboxUnavailableError(error.cause)) {
        const isNotFound = hasMatchingErrorInCauseChain({
          error: error.cause,
          predicate: (current) =>
            current instanceof SandboxNotFoundError || isSandboxContainerNotFoundApiError(current)
        });
        return isNotFound
          ? new SandboxNotFoundError(`Sandbox ${sandboxId} does not exist`, { cause: error })
          : new SandboxStateError(`Sandbox ${sandboxId} runtime or workspace is unhealthy`, {
              currentState: 'Error',
              requiredState: 'Running',
              cause: error
            });
      }
      return new ConnectionError(`Failed to verify sandbox ${sandboxId} readiness`, {
        endpoint: this.connectionConfig.baseUrl,
        cause: error
      });
    }
    if (error instanceof SandboxUnhealthyException) {
      if (isTransientSandboxConnectError(error.cause)) {
        return new ConnectionError(`Failed to verify sandbox ${sandboxId} health`, {
          endpoint: this.connectionConfig.baseUrl,
          cause: error
        });
      }
      return new SandboxStateError(`Sandbox ${sandboxId} runtime or workspace is unhealthy`, {
        currentState: 'Error',
        requiredState: 'Running',
        cause: error
      });
    }
    return new ConnectionError(`Failed to connect to sandbox ${sandboxId}`, {
      endpoint: this.connectionConfig.baseUrl,
      cause: error
    });
  }

  /** 连接指定远端容器。 */
  private async connect(
    sandboxId: SandboxId,
    options?: {
      verifiedInfo?: SdkSandboxInfo;
      skipOwnerCheck?: boolean;
      skipHealthCheck?: boolean;
      signal?: AbortSignal;
    }
  ): Promise<void> {
    let lastProbeOutcome: 'none' | 'confirmed_unhealthy' | 'error' = 'none';
    const trackedHealthCheck = async (sbx: Sandbox): Promise<boolean> => {
      lastProbeOutcome = 'none';
      try {
        const healthy = await this.checkWorkspaceReady(sbx);
        lastProbeOutcome = healthy ? 'none' : 'confirmed_unhealthy';
        return healthy;
      } catch (probeError) {
        lastProbeOutcome = 'error';
        throw probeError;
      }
    };

    try {
      throwIfAborted(options?.signal);
      if (!options?.verifiedInfo && !options?.skipOwnerCheck) {
        const info = await this.withManager((manager) => manager.getSandboxInfo(sandboxId));
        throwIfAborted(options?.signal);
        assertLegacyCompatibleSessionSandboxOwner(info, this.connectionConfig);
      }
      await this.bind(
        await Sandbox.connect({
          sandboxId,
          ...this.getConnectSdkOptions({
            skipHealthCheck: options?.skipHealthCheck,
            healthCheck: trackedHealthCheck
          }),
          signal: options?.signal
        })
      );
    } catch (error) {
      if (options?.signal?.aborted) {
        throw error;
      }
      throw this.translateConnectError({ sandboxId, error, lastProbeOutcome });
    }
  }

  /** 停止容器并释放挂载的 RWO PVC。 */
  async stop(options?: { signal?: AbortSignal }): Promise<void> {
    await this.delete(options);
  }

  /** 销毁远端容器并轮询确认进入 `UnExist`，确保 RWO PVC 彻底卸载。 */
  async delete(options?: { signal?: AbortSignal }): Promise<void> {
    const signal = options?.signal;
    try {
      throwIfAborted(signal);

      let deletedBoundId: SandboxId | undefined;
      if (this.boundSandbox) {
        const bound = this.boundSandbox;
        deletedBoundId = bound.id;
        try {
          throwIfAborted(signal);
          const boundInfo = await bound.getInfo();
          throwIfAborted(signal);
          assertLegacyCompatibleSessionSandboxOwner(boundInfo, this.connectionConfig);
          await bound.kill();
          await this.waitUntilState({
            sandboxId: bound.id,
            expected: ['UnExist'],
            readInfo: () => bound.getInfo(),
            signal
          });
          await this.releaseSandbox();
          if (this.remoteSandboxId === bound.id) this.remoteSandboxId = undefined;
        } catch (boundErr) {
          if (signal?.aborted || !isSandboxContainerNotFoundApiError(boundErr)) throw boundErr;
          // 绑定容器已不存在时仍需清理本地绑定引用，以便继续执行同 session 残留清理
          await this.releaseSandbox();
          if (this.remoteSandboxId === bound.id) this.remoteSandboxId = undefined;
        }
      }

      await this.withManager(async (manager) => {
        throwIfAborted(signal);
        const targetIds = new Set<SandboxId>();
        if (this.remoteSandboxId && this.remoteSandboxId !== deletedBoundId) {
          targetIds.add(this.remoteSandboxId);
        }
        for (const item of await this.listBySessionId(manager, signal)) {
          if (item.id !== deletedBoundId) targetIds.add(item.id);
        }

        for (const id of targetIds) {
          throwIfAborted(signal);
          const info = await manager.getSandboxInfo(id).catch((err) => {
            if (signal?.aborted || !isSandboxContainerNotFoundApiError(err)) throw err;
            return undefined;
          });
          if (!info) continue;
          throwIfAborted(signal);
          assertLegacyCompatibleSessionSandboxOwner(info, this.connectionConfig);
          await this.killAndWaitUnExist({ manager, sandboxId: id, signal }).catch((err) => {
            if (signal?.aborted || !isSandboxContainerNotFoundApiError(err)) throw err;
          });
        }
      });

      this.remoteSandboxId = undefined;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (isSandboxContainerNotFoundApiError(error)) {
        await this.releaseSandbox();
        this.remoteSandboxId = undefined;
        return;
      }
      throw new ConnectionError('Failed to delete sandbox', {
        endpoint: this.connectionConfig.baseUrl,
        cause: error
      });
    }
  }

  async getInfo(): Promise<SandboxInfo | null> {
    try {
      const raw =
        (await this.getBoundInfoOrRelease()) ??
        (await this.withManager(async (manager) => {
          const directInfo = await this.getDirectTargetInfo(manager);
          if (directInfo) return directInfo;
          const items = await this.listBySessionId(manager);
          return items[0] ?? null;
        }));
      if (!raw) return null;
      assertLegacyCompatibleSessionSandboxOwner(raw, this.connectionConfig);
      return {
        id: raw.id,
        image: raw.image?.uri ? parseImageSpec(raw.image.uri) : undefined,
        entrypoint: raw.entrypoint,
        metadata: raw.metadata,
        status: this.mapStatus(raw.status),
        createdAt: raw.createdAt,
        expiresAt: raw.expiresAt ?? undefined
      };
    } catch (error) {
      if (isSandboxContainerNotFoundApiError(error)) return null;
      throw new ConnectionError('Failed to get sandbox info', {
        endpoint: this.connectionConfig.baseUrl,
        cause: error
      });
    }
  }

  async close(): Promise<void> {
    await this.releaseSandbox();
  }

  async getEndpoint(port: number = DEFAULT_EXECD_PORT): Promise<Endpoint> {
    const ep = await this.sandbox.getEndpoint(port);
    if (!ep.endpoint) {
      throw new ConnectionError(`OpenSandbox endpoint for port ${port} is empty`, {
        endpoint: this.connectionConfig.baseUrl
      });
    }
    const raw = `${this.connection.protocol}://${ep.endpoint}`;
    const url = new URL(raw);
    const headers = createDataPlaneHeaders(
      this.connection.headers ?? {},
      ep.headers,
      Boolean(this.connection.useServerProxy),
      this.connectionConfig.apiKey
    );
    return {
      host: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : port,
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      url: raw.replace(/\/+$/, ''),
      ...(Object.keys(headers).length > 0 ? { headers } : {})
    };
  }

  async readFiles(paths: string[]): Promise<FileReadResult[]> {
    return Promise.all(
      paths.map((inputPath) => {
        const path = this.normalizePath(inputPath);
        return this.sandbox.files.readBytes(path).then(
          (content) => ({ path, content, error: null }),
          (err) => ({ path, content: new Uint8Array(), error: toError(err) })
        );
      })
    );
  }

  /** 写入单个或多个文件并逐条返回结果；非流式文件按唯一路径波次通过 SDK 并发写入。 */
  async writeFiles(entries: WriteEntry[]): Promise<FileWriteResult[]> {
    if (entries.length === 0) return [];

    type IndexedEntry = {
      index: number;
      entry: WriteEntry;
      path: string;
    };

    const normalized: IndexedEntry[] = entries.map((entry, index) => ({
      index,
      entry,
      path: this.normalizePath(entry.path)
    }));
    const results: FileWriteResult[] = new Array(normalized.length);

    const writeSingleViaSdk = async (item: IndexedEntry): Promise<FileWriteResult> => {
      let streamedBytes = 0;
      try {
        const data: WriteEntry['data'] = (() => {
          if (!isReadableStreamData(item.entry.data)) return item.entry.data;

          const source = item.entry.data;
          return (async function* () {
            const reader = source.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                if (value) {
                  streamedBytes += value.byteLength;
                  yield value;
                }
              }
            } finally {
              reader.releaseLock();
            }
          })();
        })();

        await this.sandbox.files.writeFiles([
          {
            path: item.path,
            data,
            owner: item.entry.owner,
            group: item.entry.group,
            mode:
              item.entry.mode === undefined ? undefined : posixModeToOctalNumber(item.entry.mode)
          }
        ]);
        return {
          path: item.path,
          bytesWritten: isReadableStreamData(item.entry.data)
            ? streamedBytes
            : getFileDataByteLength(item.entry.data),
          error: null
        };
      } catch (err) {
        return {
          path: item.path,
          bytesWritten: 0,
          error: toError(err)
        };
      }
    };

    const flushInlineBatch = async (inlineRun: IndexedEntry[]) => {
      if (inlineRun.length === 0) return;
      // 按唯一路径切分波次并发上传，保证同路径顺序稳定且无并发写竞态。
      const waves: IndexedEntry[][] = [];
      let currentWave: IndexedEntry[] = [];
      const seenPaths = new Set<string>();
      for (const item of inlineRun) {
        if (seenPaths.has(item.path)) {
          waves.push(currentWave);
          currentWave = [];
          seenPaths.clear();
        }
        currentWave.push(item);
        seenPaths.add(item.path);
      }
      if (currentWave.length > 0) waves.push(currentWave);

      for (const wave of waves) {
        await batchRun(
          wave,
          async (item) => {
            results[item.index] = await writeSingleViaSdk(item);
          },
          WRITE_FILES_CONCURRENCY
        );
      }
    };

    let inlineRun: IndexedEntry[] = [];
    for (const item of normalized) {
      if (typeof item.entry.data === 'string' || item.entry.data instanceof Uint8Array) {
        inlineRun.push(item);
        continue;
      }
      await flushInlineBatch(inlineRun);
      inlineRun = [];
      // 流式写入直接经 SDK 透传，并在遇到流式项时同步前面的内联写入以保持全局写序。
      results[item.index] = await writeSingleViaSdk(item);
    }
    await flushInlineBatch(inlineRun);

    return results;
  }

  async deleteFiles(paths: string[]): Promise<FileDeleteResult[]> {
    if (paths.length === 0) return [];
    const normalizedPaths = paths.map((inputPath) => this.normalizePath(inputPath));
    try {
      await this.sandbox.files.deleteFiles(normalizedPaths);
      return normalizedPaths.map((path) => ({ path, success: true, error: null }));
    } catch (error) {
      if (normalizedPaths.length === 1 || isRecoverableSandboxError(error)) {
        const err = toError(error);
        return normalizedPaths.map((path) => ({ path, success: false, error: err }));
      }
      return Promise.all(
        normalizedPaths.map(async (path) => {
          try {
            await this.sandbox.files.deleteFiles([path]);
            return { path, success: true, error: null };
          } catch (itemError) {
            return { path, success: false, error: toError(itemError) };
          }
        })
      );
    }
  }

  async moveFiles(entries: MoveEntry[]): Promise<void> {
    await this.sandbox.files.moveFiles(
      entries.map(({ src, dest }) => ({
        src: this.normalizePath(src),
        dest: this.normalizePath(dest)
      }))
    );
  }

  /** 按原文替换文件内容，按每个文件的编辑序号分批提交。 */
  async replaceContent(entries: ContentReplaceEntry[]): Promise<ContentReplaceResult[]> {
    const batches: { entry: ContentReplaceEntry; index: number }[][] = [];
    const editCountByPath = new Map<string, number>();
    const results: ContentReplaceResult[] = [];

    entries.forEach((entry, index) => {
      const path = this.normalizePath(entry.path);
      const batchIndex = editCountByPath.get(path) ?? 0;
      editCountByPath.set(path, batchIndex + 1);
      (batches[batchIndex] ??= []).push({ entry: { ...entry, path }, index });
      results.push({ path, status: 'skipped' });
    });

    for (const batch of batches) {
      const batchResults = await this.sandbox.files.replaceContentsDetailed(
        batch.map(({ entry }) => entry)
      );
      const replacedByPath = new Map(
        batchResults.map(({ path, replacedCount }) => [path, replacedCount])
      );
      for (const { entry, index } of batch) {
        const replacedCount = replacedByPath.get(entry.path);
        results[index] = (() => {
          if (replacedCount === undefined) return { path: entry.path, status: 'unknown' };
          if (replacedCount === 0) return { path: entry.path, status: 'unmatched' };
          return { path: entry.path, status: 'replaced', replacedCount };
        })();
      }
      if (batchResults.some(({ replacedCount }) => replacedCount === 0)) break;
    }

    return results;
  }

  async createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    if (paths.length === 0) return;
    await this.sandbox.files.createDirectories(
      paths.map((path) => ({
        path: this.normalizePath(path),
        ...options,
        mode: options?.mode === undefined ? undefined : posixModeToOctalNumber(options.mode)
      }))
    );
  }

  async deleteDirectories(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.sandbox.files.deleteDirectories(paths.map((path) => this.normalizePath(path)));
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const entries = await this.sandbox.files.listDirectory({
      path: this.normalizePath(path)
    });
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
    if (paths.length === 0) return new Map();
    const normalizedPaths = paths.map((path) => this.normalizePath(path));
    const info = await this.sandbox.files.getFileInfo(normalizedPaths).catch(async (error) => {
      if (!isSandboxFileNotFoundError(error)) throw error;
      if (normalizedPaths.length === 1) return {} as Record<string, SdkFileInfo>;
      const items = await Promise.all(
        normalizedPaths.map((p) =>
          this.sandbox.files
            .getFileInfo([p])
            .catch((e) => (isSandboxFileNotFoundError(e) ? {} : Promise.reject(e)))
        )
      );
      return Object.assign({}, ...items) as Record<string, SdkFileInfo>;
    });

    return new Map(
      Object.entries(info).map(([path, entry]) => [
        path,
        {
          ...entry,
          mode: entry.mode === undefined ? undefined : octalNumberToPosixMode(entry.mode),
          isDirectory: entry.type === 'directory',
          isFile: entry.type === 'file',
          isSymlink: entry.type === 'symlink'
        }
      ])
    );
  }

  readFileStream(
    path: string,
    options?: { range?: string; offset?: number; limit?: number }
  ): AsyncIterable<Uint8Array> {
    const normalized = this.normalizePath(path);
    return options
      ? this.sandbox.files.readBytesStream(normalized, options)
      : this.sandbox.files.readBytesStream(normalized);
  }

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    const maxBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const buffers = {
      stdout: new BoundedOutputBuffer(maxBytes),
      stderr: new BoundedOutputBuffer(maxBytes)
    };
    const timeoutSeconds =
      options?.timeoutMs !== undefined && options.timeoutMs > 0
        ? Math.ceil(options.timeoutMs / 1000)
        : undefined;

    try {
      const execution: Execution = { logs: { stdout: [], stderr: [] }, result: [] };
      const dispatcher = new ExecutionEventDispatcher(execution, {
        skipAccumulation: true,
        onStdout: (msg) => buffers.stdout.append(msg.text),
        onStderr: (msg) => buffers.stderr.append(msg.text)
      });
      const streamController = new AbortController();
      const abortFromCaller = () => streamController.abort(options?.signal?.reason);

      if (options?.signal?.aborted) {
        abortFromCaller();
        throw toError(options.signal.reason ?? 'Command execution aborted');
      }
      options?.signal?.addEventListener('abort', abortFromCaller, { once: true });

      let terminalReceived = false;
      try {
        const stream = this.sandbox.commands.runStream(
          command,
          {
            workingDirectory: this.normalizePath(options?.workingDirectory),
            timeoutSeconds,
            envs: options?.env
          },
          streamController.signal
        );
        for await (const event of stream) {
          await dispatcher.dispatch(event);
          if (event.type === 'execution_complete' || event.type === 'error') {
            terminalReceived = true;
            // 终态事件到达后立即取消仍在等待 EOF 的 SSE 连接，消除固定尾延迟。
            streamController.abort();
            break;
          }
        }
      } finally {
        options?.signal?.removeEventListener('abort', abortFromCaller);
        if (!streamController.signal.aborted) streamController.abort();
      }

      if (!terminalReceived) {
        throw new Error('OpenSandbox command stream ended without a terminal event');
      }

      const exitCode = (() => {
        if (!execution.error) {
          return execution.complete ? 0 : null;
        }
        if (
          typeof execution.error.exitCode === 'number' &&
          Number.isInteger(execution.error.exitCode)
        ) {
          return execution.error.exitCode;
        }
        const errorValue = execution.error.value?.trim();
        return errorValue && /^-?\d+$/.test(errorValue) ? Number(errorValue) : null;
      })();

      return {
        stdout: buffers.stdout.toString(),
        stderr: buffers.stderr.toString(),
        exitCode,
        durationMs: execution.complete?.executionTimeMs,
        truncated: buffers.stdout.truncated || buffers.stderr.truncated
      };
    } catch (error) {
      if (error instanceof SandboxStateError) throw error;
      throw new CommandExecutionError(`Command execution failed: ${command}`, {
        command,
        cause: toError(error)
      });
    }
  }
}

/** 构造已配置校验后的 OpenSandbox 客户端实例。 */
function buildOpenSandboxClient(
  clientConfig: OpenSandboxClientConfig,
  props: {
    sandboxId: string;
    remoteSandboxId?: string;
    createConfig?: SandboxCreateSpec;
  }
): OpenSandboxClient {
  return new OpenSandboxClient(
    {
      apiKey: clientConfig.apiKey,
      baseUrl: clientConfig.baseUrl,
      useServerProxy: clientConfig.useServerProxy,
      sessionId: props.sandboxId,
      ...(props.remoteSandboxId ? { remoteSandboxId: props.remoteSandboxId } : {})
    },
    props.createConfig
  );
}

/** 构造带运行态创建规格（环境变量、网络策略、资源限额与持久卷）的 OpenSandbox 客户端。 */
export function createRuntimeOpenSandboxClient(props: {
  sandboxId: string;
  remoteSandboxId?: string;
  resourceLimits?: ResourceLimits;
  volumes?: Volume[];
  createConfig?: SandboxCreateSpec;
  runtimeConfig?: OpenSandboxRuntimeConfig;
}): OpenSandboxClient {
  const config =
    props.runtimeConfig ??
    getOpenSandboxRuntimeConfig({
      resourceLimits: props.resourceLimits,
      volumes: props.volumes,
      createConfig: props.createConfig
    });

  return buildOpenSandboxClient(config.clientConfig, {
    sandboxId: props.sandboxId,
    remoteSandboxId: props.remoteSandboxId,
    createConfig: {
      ...config.createConfig,
      ...(props.volumes !== undefined ? { volumes: props.volumes } : {})
    }
  });
}

/** 构造资源清理与历史操作恢复使用的 OpenSandbox 客户端（不依赖镜像创建配置）。 */
export function createOpenSandboxResourceClient(props: {
  sandboxId: string;
  instanceId?: string;
}): OpenSandboxClient {
  return buildOpenSandboxClient(getOpenSandboxClientConfig(), {
    sandboxId: props.sandboxId,
    remoteSandboxId: props.instanceId
  });
}

/** 连接当前部署下正在运行的 OpenSandbox 容器。 */
export async function connectToOpenSandbox(props: {
  sandboxId: string;
  remoteSandboxId?: string;
  verifyHealth?: boolean;
}): Promise<OpenSandboxClient> {
  const client = createOpenSandboxResourceClient({
    sandboxId: props.sandboxId,
    instanceId: props.remoteSandboxId
  });
  await client.connectRunning({
    verifyHealth: props.verifyHealth,
    remoteSandboxId: props.remoteSandboxId
  });
  return client;
}

/** 静默释放客户端连接句柄，不影响远端容器生命周期。 */
export async function disconnectSandbox(sandbox: OpenSandboxClient): Promise<void> {
  await sandbox.close().catch(() => {});
}

export type ManagedOpenSandboxItem = {
  id: SandboxId;
  sessionId?: string;
  state: SandboxState;
  createdAt: Date;
  metadata?: Record<string, string>;
};

async function withSharedSandboxManager<T>(
  config: OpenSandboxClientConfig,
  fn: (manager: SandboxManager) => Promise<T>
): Promise<T> {
  const connection = getSharedOpenSandboxConnection({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    useServerProxy: config.useServerProxy
  });
  return withOpenSandboxManager(connection, fn);
}

/** 列出 FastGPT 管理的活跃 OpenSandbox 容器；校验 `app` 标签防止误删外部容器。 */
export async function listManagedOpenSandboxes(
  config: OpenSandboxClientConfig = getOpenSandboxClientConfig()
): Promise<ManagedOpenSandboxItem[]> {
  return withSharedSandboxManager(config, async (manager) => {
    const items: ManagedOpenSandboxItem[] = [];
    for (let page = 1; ; page++) {
      const res = await manager.listSandboxInfos({
        metadata: { app: 'fastgpt' },
        pageSize: 100,
        page
      });
      for (const raw of res.items) {
        if (raw.metadata?.app !== 'fastgpt') continue;
        const state = STATE_MAP[raw.status.state.toLowerCase()] ?? 'Error';
        if (state === 'UnExist' || state === 'Deleting') continue;
        items.push({
          id: raw.id,
          sessionId: raw.metadata?.sessionId,
          state,
          createdAt: raw.createdAt,
          metadata: raw.metadata
        });
      }
      if (!res.pagination?.hasNextPage) {
        return items;
      }
    }
  });
}

/**
 * 销毁孤儿容器前重新核对受管与会话标签；标签变化拒绝删除，404 视为幂等成功。
 */
export async function killManagedOpenSandboxById(
  target: SandboxOwner & { remoteSandboxId: SandboxId },
  config: OpenSandboxClientConfig = getOpenSandboxClientConfig()
): Promise<void> {
  await withSharedSandboxManager(config, async (manager) => {
    const info = await manager.getSandboxInfo(target.remoteSandboxId).catch((error) => {
      if (isSandboxContainerNotFoundApiError(error)) return undefined;
      throw error;
    });
    if (!info) return;
    assertManagedSandboxOwner(info, target);
    await manager.killSandbox(target.remoteSandboxId).catch((error) => {
      if (!isSandboxContainerNotFoundApiError(error)) throw error;
    });
  });
}
