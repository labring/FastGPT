import { posix } from 'node:path';
import {
  ConnectionConfig,
  DEFAULT_EXECD_PORT,
  ExecutionEventDispatcher,
  Sandbox,
  SandboxApiException,
  SandboxManager,
  SandboxReadyTimeoutException,
  SandboxUnhealthyException,
  type ContentReplaceEntry,
  type Execution,
  type FileInfo,
  type MoveEntry,
  type SandboxId,
  type SandboxInfo as SdkSandboxInfo,
  type WriteEntry
} from '@alibaba-group/opensandbox';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxDeploymentIdSchema } from '@fastgpt/global/core/ai/sandbox/volume';
import type { ExecuteResult } from '@fastgpt/global/core/ai/sandbox/type';
import { getInstanceId } from '../../../../../common/system/config/instanceId';
import type { SandboxResourceLimitsType } from '../../type';
import type { VolumeManagerResult } from '../volume/service';
import { getOpenSandboxRuntimeConfig, type OpenSandboxClientConfig } from './config';
import {
  CommandExecutionError,
  ConnectionError,
  SandboxException,
  SandboxNotFoundError,
  SandboxStateError
} from './errors';
import type {
  Endpoint,
  ExecuteOptions,
  FileReadResult,
  OpenSandboxConnectionConfig,
  SandboxCreateSpec,
  SandboxInfo,
  SandboxState,
  SandboxStatus
} from './type';
import { BoundedOutputBuffer } from './utils';

const DEFAULT_REQUEST_TIMEOUT_SECONDS = 120;
const DEFAULT_CONNECT_READY_TIMEOUT_SECONDS = 10;
const DEFAULT_LIFECYCLE_TIMEOUT_MS = 120_000;
const LIFECYCLE_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const WRITE_FALLBACK_CONCURRENCY = 8;

const STATE_MAP: Record<string, SandboxState> = {
  running: 'Running',
  creating: 'Creating',
  pending: 'Creating',
  allocated: 'Starting',
  stopping: 'Deleting',
  deleting: 'Deleting',
  error: 'Error',
  deleted: 'UnExist'
};

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

const sharedConnections = new Map<string, ConnectionConfig>();

type SandboxOwner = { deploymentId: string; sessionId?: string };

/** 物理 ID 与列表过滤都不是授权依据；每次受控管理或慢路径校验远端资源前精确校验完整归属。 */
function assertSandboxOwner(info: SdkSandboxInfo, owner: SandboxOwner): void {
  if (
    info.metadata?.app !== 'fastgpt' ||
    info.metadata.deploymentId !== owner.deploymentId ||
    info.metadata.sessionId !== owner.sessionId
  ) {
    throw new Error(`OpenSandbox ownership mismatch: ${info.id}`);
  }
}

/**
 * 复用已初始化 transport 的 ConnectionConfig，使 SDK 共享底层 undici keep-alive 连接池，
 * 避免每次调用 `Sandbox.connect / create / SandboxManager.create` 新建独立连接池。
 */
function getSharedOpenSandboxConnection(params: {
  baseUrl: string;
  apiKey?: string;
}): ConnectionConfig {
  const cacheKey = JSON.stringify([params.baseUrl, params.apiKey ?? '']);
  const existing = sharedConnections.get(cacheKey);
  if (existing) return existing;

  const created = new ConnectionConfig({
    domain: params.baseUrl,
    apiKey: params.apiKey,
    requestTimeoutSeconds: DEFAULT_REQUEST_TIMEOUT_SECONDS,
    debug: false,
    useServerProxy: true
  }).withTransportIfMissing();
  sharedConnections.set(cacheKey, created);
  return created;
}

/** OpenSandbox 客户端，直接封装 `@alibaba-group/opensandbox` 控制面与 `execd` 数据面能力。 */
export class OpenSandboxClient {
  private boundSandbox?: Sandbox;
  private remoteSandboxId?: SandboxId;
  private readonly connection: ConnectionConfig;
  private currentStatus: SandboxStatus = { state: 'Creating' };

  constructor(
    private readonly connectionConfig: OpenSandboxConnectionConfig,
    private readonly createConfig?: SandboxCreateSpec
  ) {
    SandboxDeploymentIdSchema.parse(connectionConfig.deploymentId);
    this.remoteSandboxId = connectionConfig.remoteSandboxId;
    this.connection = getSharedOpenSandboxConnection({
      baseUrl: connectionConfig.baseUrl,
      apiKey: connectionConfig.apiKey
    });
  }

  get rootPath(): string {
    return (
      this.createConfig?.volumes?.[0]?.mountPath?.replace(/\/+$/, '') ||
      OPEN_SANDBOX_DEFAULT_ROOT_PATH
    );
  }

  get id(): SandboxId | undefined {
    return this.boundSandbox?.id ?? this.remoteSandboxId;
  }

  get status(): SandboxStatus {
    return this.currentStatus;
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

  private mapStatus(status: SdkSandboxInfo['status']): SandboxStatus {
    return {
      state: STATE_MAP[status.state.toLowerCase()] ?? 'Error',
      reason: status.reason,
      message: status.message
    };
  }

  /**
   * 探测 execd 数据面与持久化 `/workspace` 挂载点是否同时可用。
   * 当 JuiceFS FUSE 进程或 CSI Mount Pod 崩溃导致 `ENOTCONN` 时，这里会失败并触发上层自愈重建。
   */
  private readonly checkWorkspaceReady = async (sbx: Sandbox): Promise<boolean> => {
    const info = await sbx.files.getFileInfo([this.rootPath]);
    const rootEntry = info[this.rootPath];
    return !rootEntry || rootEntry.type === 'directory';
  };

  private getCreateSdkOptions() {
    return {
      connectionConfig: this.connection,
      skipHealthCheck: this.createConfig?.skipHealthCheck,
      readyTimeoutSeconds: this.createConfig?.readyTimeoutSeconds,
      healthCheckPollingInterval: this.createConfig?.healthCheckPollingInterval,
      healthCheck: this.checkWorkspaceReady
    };
  }

  private getConnectSdkOptions(options?: { skipHealthCheck?: boolean }) {
    return {
      connectionConfig: this.connection,
      skipHealthCheck: options?.skipHealthCheck ?? this.createConfig?.skipHealthCheck,
      readyTimeoutSeconds: DEFAULT_CONNECT_READY_TIMEOUT_SECONDS,
      healthCheckPollingInterval: this.createConfig?.healthCheckPollingInterval,
      healthCheck: this.checkWorkspaceReady
    };
  }

  private isNotFound(error: unknown): boolean {
    return error instanceof SandboxApiException && error.statusCode === 404;
  }

  private async bind(sandbox: Sandbox): Promise<void> {
    const prev = this.boundSandbox;
    this.boundSandbox = sandbox;
    this.remoteSandboxId = sandbox.id;
    this.currentStatus = { state: 'Running' };
    if (prev && prev !== sandbox) await prev.close().catch(() => {});
  }

  private async releaseSandbox(): Promise<void> {
    const current = this.boundSandbox;
    this.boundSandbox = undefined;
    await current?.close().catch(() => {});
  }

  private async withManager<T>(fn: (manager: SandboxManager) => Promise<T>): Promise<T> {
    const manager = SandboxManager.create({ connectionConfig: this.connection });
    try {
      return await fn(manager);
    } finally {
      await manager.close().catch(() => {});
    }
  }

  private async listBySessionId(manager: SandboxManager): Promise<SdkSandboxInfo[]> {
    const items: SdkSandboxInfo[] = [];
    for (let page = 1; ; page++) {
      const res = await manager.listSandboxInfos({
        metadata: {
          app: 'fastgpt',
          deploymentId: this.connectionConfig.deploymentId,
          sessionId: this.connectionConfig.sessionId
        },
        pageSize: 100,
        page
      });
      for (const item of res.items) {
        assertSandboxOwner(item, this.connectionConfig);
        if (this.mapStatus(item.status).state !== 'UnExist') items.push(item);
      }
      if (!res.pagination?.hasNextPage) return items;
    }
  }

  private async waitUntilState({
    sandboxId,
    expected,
    readInfo
  }: {
    sandboxId: SandboxId;
    expected: SandboxState[];
    readInfo: () => Promise<SdkSandboxInfo | undefined>;
  }): Promise<SdkSandboxInfo | undefined> {
    const start = Date.now();
    let state: SandboxState = 'UnExist';
    while (Date.now() - start < DEFAULT_LIFECYCLE_TIMEOUT_MS) {
      const info = await readInfo().catch((err) =>
        this.isNotFound(err) ? undefined : Promise.reject(err)
      );
      if (!info) {
        if (expected.includes('UnExist')) return undefined;
        throw new SandboxNotFoundError(`Sandbox ${sandboxId} no longer exists`);
      }
      assertSandboxOwner(info, this.connectionConfig);
      const status = this.mapStatus(info.status);
      state = status.state;
      this.currentStatus = status;
      if (expected.includes(state)) return info;
      if (state === 'Error') {
        throw new ConnectionError(
          `Sandbox ${sandboxId} entered an error state: ${status.message ?? 'unknown error'}`,
          { endpoint: this.connectionConfig.baseUrl }
        );
      }
      await new Promise((r) => setTimeout(r, LIFECYCLE_POLL_INTERVAL_MS));
    }
    throw new SandboxStateError(
      `Sandbox ${sandboxId} timed out waiting for ${expected.join('|')}`,
      {
        currentState: state,
        requiredState: expected.join('|')
      }
    );
  }

  private async resolveToRunning(
    info: SdkSandboxInfo,
    readInfo: () => Promise<SdkSandboxInfo | undefined>
  ): Promise<void> {
    assertSandboxOwner(info, this.connectionConfig);
    const status = this.mapStatus(info.status);
    switch (status.state) {
      case 'UnExist':
        await this.releaseSandbox();
        return this.create();
      case 'Running':
        if (this.boundSandbox?.id !== info.id) {
          await this.connect(info.id, { verifiedInfo: info });
        } else {
          this.currentStatus = { state: 'Running' };
        }
        return;
      case 'Creating':
      case 'Starting':
        await this.waitUntilState({ sandboxId: info.id, expected: ['Running'], readInfo });
        if (this.boundSandbox?.id !== info.id) {
          await this.connect(info.id, { verifiedInfo: info });
        } else {
          this.currentStatus = { state: 'Running' };
        }
        return;
      case 'Deleting':
        await this.waitUntilState({ sandboxId: info.id, expected: ['UnExist'], readInfo });
        await this.releaseSandbox();
        return this.create();
      case 'Error':
        throw new ConnectionError(`Sandbox error: ${status.message ?? 'unknown error'}`, {
          endpoint: this.connectionConfig.baseUrl
        });
    }
  }

  /**
   * 连接已处于 `running` 的远端容器。
   *
   * - 默认快路径（`verifyHealth !== true` 且已持有持久化 `instanceId`）：乐观直连 `Sandbox.connect({ skipHealthCheck: true })`，
   *   省去 `getSandboxInfo` 与 `/workspace` 探测往返；容器不存在时由 404 触发上层重建，FUSE 异常则由调用方失败自愈重连。
   * - 慢路径 / 自愈校验（`verifyHealth: true` 或无 `instanceId`）：先校验远端实例状态与归属，再探测 `/workspace` 挂载健康度。
   */
  async connectRunning(options?: { verifyHealth?: boolean }): Promise<void> {
    const verifyHealth = options?.verifyHealth === true;

    if (!verifyHealth) {
      if (this.boundSandbox) {
        this.currentStatus = { state: 'Running' };
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
      assertSandboxOwner(info, this.connectionConfig);
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
        const healthy = await this.checkWorkspaceReady(this.boundSandbox).catch(() => false);
        if (!healthy) {
          await this.releaseSandbox();
          throw new SandboxStateError('Sandbox workspace is unhealthy', {
            currentState: 'Error',
            requiredState: 'Running'
          });
        }
      }
      this.currentStatus = { state: 'Running' };
    };

    if (this.boundSandbox) {
      const info = await this.boundSandbox.getInfo().catch(async (err) => {
        if (!this.isNotFound(err)) throw err;
        await this.releaseSandbox();
        this.remoteSandboxId = undefined;
        return undefined;
      });
      return checkAndBind(info);
    }

    await this.withManager(async (manager) => {
      if (this.remoteSandboxId) {
        const targetId = this.remoteSandboxId;
        const info = await manager.getSandboxInfo(targetId).catch((err) => {
          if (!this.isNotFound(err)) throw err;
          this.remoteSandboxId = undefined;
          return undefined;
        });
        await checkAndBind(info);
        return;
      }

      const items = await this.listBySessionId(manager);
      await checkAndBind(items[0]);
    });
  }

  async ensureRunning(): Promise<void> {
    if (this.boundSandbox) {
      const bound = this.boundSandbox;
      const info = await bound.getInfo().catch(async (err) => {
        if (!this.isNotFound(err)) throw err;
        await this.releaseSandbox();
        this.remoteSandboxId = undefined;
        return undefined;
      });
      if (info) return this.resolveToRunning(info, () => bound.getInfo());
    }

    await this.withManager(async (manager) => {
      if (this.remoteSandboxId) {
        const targetId = this.remoteSandboxId;
        const directTarget = await manager.getSandboxInfo(targetId).catch((err) => {
          if (!this.isNotFound(err)) throw err;
          this.remoteSandboxId = undefined;
          return undefined;
        });
        if (directTarget && this.mapStatus(directTarget.status).state !== 'UnExist') {
          await this.resolveToRunning(directTarget, () => manager.getSandboxInfo(directTarget.id));
          return;
        }
      }

      const items = await this.listBySessionId(manager);
      const target = items[0];
      if (!target) {
        return this.create();
      }
      await this.resolveToRunning(target, () => manager.getSandboxInfo(target.id));
    });
  }

  async create(): Promise<void> {
    const config = this.createConfig;
    const image = config?.image?.trim();
    if (!image) {
      throw new ConnectionError('Cannot create OpenSandbox resource without createConfig.image', {
        endpoint: this.connectionConfig.baseUrl
      });
    }

    try {
      this.currentStatus = { state: 'Creating' };
      const { resourceLimits: limits, resourceRequests: requests } = config!;
      const createSpec = {
        ...this.getCreateSdkOptions(),
        image,
        entrypoint: config!.entrypoint,
        timeoutSeconds: config!.timeoutSeconds ?? null,
        resource: limits
          ? {
              ...(limits.cpuCount === undefined ? {} : { cpu: String(limits.cpuCount) }),
              ...(limits.memoryMiB === undefined ? {} : { memory: `${limits.memoryMiB}Mi` }),
              ...(limits.ephemeralStorageSize === undefined
                ? {}
                : { 'ephemeral-storage': limits.ephemeralStorageSize })
            }
          : undefined,
        resourceRequests: requests
          ? {
              ...(requests.cpuCount === undefined ? {} : { cpu: String(requests.cpuCount) }),
              ...(requests.memoryMiB === undefined ? {} : { memory: `${requests.memoryMiB}Mi` }),
              ...(requests.ephemeralStorageSize === undefined
                ? {}
                : { 'ephemeral-storage': requests.ephemeralStorageSize })
            }
          : undefined,
        env: config!.env,
        metadata: {
          ...config!.metadata,
          app: 'fastgpt',
          deploymentId: this.connectionConfig.deploymentId,
          sessionId: this.connectionConfig.sessionId
        },
        networkPolicy: config!.networkPolicy,
        volumes: config!.volumes,
        extensions: config!.extensions
      };

      // Docker 运行态下 OpenSandbox 为 egress sidecar 探测随机宿主机端口存在极小概率 TOCTOU 竞争（返回 HTTP 500 port is already allocated）；
      // 仅对服务端 5xx 创建异常在清理潜在半成品容器后执行有限退避重试，4xx 参数/配额错误与就绪超时直接抛出。
      const maxAttempts = 3;
      let sandbox: Sandbox | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          sandbox = await Sandbox.create(createSpec);
          break;
        } catch (createErr) {
          const isTransientServerError =
            createErr instanceof SandboxApiException &&
            typeof createErr.statusCode === 'number' &&
            createErr.statusCode >= 500;
          if (!isTransientServerError || attempt >= maxAttempts) {
            throw createErr;
          }
          await this.withManager(async (manager) => {
            const leftovers = await this.listBySessionId(manager);
            for (const item of leftovers) {
              await manager.killSandbox(item.id).catch(() => {});
            }
          }).catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        }
      }

      try {
        await this.bind(sandbox!);
      } catch (error) {
        await sandbox!.close().catch(() => {});
        throw error;
      }
    } catch (error) {
      this.currentStatus = { state: 'Error', message: String(error) };
      throw new ConnectionError('Failed to create sandbox', {
        endpoint: this.connectionConfig.baseUrl,
        cause: error
      });
    }
  }

  /** 连接指定远端容器；非快路径先校验完整归属与数据面健康。 */
  async connect(
    sandboxId: SandboxId,
    options?: {
      verifiedInfo?: SdkSandboxInfo;
      skipOwnerCheck?: boolean;
      skipHealthCheck?: boolean;
    }
  ): Promise<void> {
    try {
      if (!options?.verifiedInfo && !options?.skipOwnerCheck) {
        const info = await this.withManager((manager) => manager.getSandboxInfo(sandboxId));
        assertSandboxOwner(info, this.connectionConfig);
      }
      this.currentStatus = { state: 'Starting' };
      await this.bind(
        await Sandbox.connect({
          sandboxId,
          ...this.getConnectSdkOptions({ skipHealthCheck: options?.skipHealthCheck })
        })
      );
    } catch (error) {
      this.currentStatus = { state: 'Error', message: String(error) };
      if (this.isNotFound(error)) {
        throw new SandboxNotFoundError(`Sandbox ${sandboxId} does not exist`);
      }
      if (
        error instanceof SandboxReadyTimeoutException ||
        error instanceof SandboxUnhealthyException
      ) {
        throw new SandboxStateError(`Sandbox ${sandboxId} runtime or workspace is unhealthy`, {
          currentState: 'Error',
          requiredState: 'Running'
        });
      }
      throw new ConnectionError(`Failed to connect to sandbox ${sandboxId}`, {
        endpoint: this.connectionConfig.baseUrl,
        cause: error
      });
    }
  }

  /** 销毁远端容器并等待其彻底退出（闲置停止与彻底删除均复用此方法）。 */
  async delete(sandboxId?: SandboxId): Promise<void> {
    const affectsSession = !sandboxId || sandboxId === this.id;
    try {
      if (affectsSession) this.currentStatus = { state: 'Deleting' };

      if (this.boundSandbox && (!sandboxId || sandboxId === this.boundSandbox.id)) {
        const bound = this.boundSandbox;
        assertSandboxOwner(await bound.getInfo(), this.connectionConfig);
        await bound.kill();
        await this.waitUntilState({
          sandboxId: bound.id,
          expected: ['UnExist'],
          readInfo: () => bound.getInfo()
        });
        await this.releaseSandbox();
        if (this.remoteSandboxId === bound.id) this.remoteSandboxId = undefined;
        this.currentStatus = { state: 'UnExist' };
        return;
      }

      await this.withManager(async (manager) => {
        const targetIds = new Set<SandboxId>();
        if (sandboxId) {
          targetIds.add(sandboxId);
        } else {
          if (this.remoteSandboxId) targetIds.add(this.remoteSandboxId);
          for (const item of await this.listBySessionId(manager)) {
            targetIds.add(item.id);
          }
        }

        for (const id of targetIds) {
          const info = await manager.getSandboxInfo(id).catch((err) => {
            if (!this.isNotFound(err)) throw err;
            return undefined;
          });
          if (!info) continue;
          assertSandboxOwner(info, this.connectionConfig);
          await manager
            .killSandbox(id)
            .then(() =>
              this.waitUntilState({
                sandboxId: id,
                expected: ['UnExist'],
                readInfo: () => manager.getSandboxInfo(id)
              })
            )
            .catch((err) => {
              if (!this.isNotFound(err)) throw err;
            });
        }
      });

      if (affectsSession) {
        this.remoteSandboxId = undefined;
        this.currentStatus = { state: 'UnExist' };
      }
    } catch (error) {
      if (this.isNotFound(error)) {
        if (affectsSession) {
          await this.releaseSandbox();
          this.remoteSandboxId = undefined;
          this.currentStatus = { state: 'UnExist' };
        }
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
      const raw = await (() => {
        if (this.boundSandbox) return this.boundSandbox.getInfo();
        return this.withManager(async (manager) => {
          if (this.remoteSandboxId) {
            return manager
              .getSandboxInfo(this.remoteSandboxId)
              .catch((err) => (this.isNotFound(err) ? null : Promise.reject(err)));
          }
          const items = await this.listBySessionId(manager);
          return items[0] ?? null;
        });
      })();
      if (!raw) return null;
      assertSandboxOwner(raw, this.connectionConfig);
      const status = this.mapStatus(raw.status);
      this.currentStatus = status;
      return {
        id: raw.id,
        image: raw.image?.uri,
        entrypoint: raw.entrypoint,
        metadata: raw.metadata,
        status,
        createdAt: raw.createdAt,
        expiresAt: raw.expiresAt ?? undefined
      };
    } catch (error) {
      if (this.isNotFound(error)) return null;
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
    const raw = ep.endpoint
      ? `${this.connection.protocol}://${ep.endpoint}`
      : await this.sandbox.getEndpointUrl(port);
    const url = new URL(raw);
    const epHeaders = ep.headers ?? {};
    const hasApiKeyHeader = Object.keys(epHeaders).some(
      (key) => key.toLowerCase() === 'open-sandbox-api-key'
    );
    const headers: Record<string, string> = {
      ...(this.connectionConfig.apiKey && !hasApiKeyHeader
        ? { 'OPEN-SANDBOX-API-KEY': this.connectionConfig.apiKey }
        : {}),
      ...epHeaders
    };
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
      paths.map((p) => {
        const path = this.normalizePath(p);
        return this.sandbox.files.readBytes(path).then(
          (content) => ({ path, content, error: null }),
          (err) => ({ path, content: new Uint8Array(), error: toError(err) })
        );
      })
    );
  }

  /**
   * 写入单个或多个文件到沙盒文件系统，失败直接抛出异常（对齐 OpenSandbox SDK 原生契约）。
   *
   * `@alibaba-group/opensandbox` SDK 的 `files.writeFiles(entries)` 内部实现是串行逐个上传；
   * 当调用方批量写入多份内存数据时，优先构造单次多部分 `POST /files/upload` 请求一次性提交，
   * 若批量请求失败则降级为有界并发逐文件写入。
   */
  async writeFiles(entries: WriteEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const normalizedEntries = entries.map((entry) => ({
      ...entry,
      path: this.normalizePath(entry.path)
    }));

    type InlineUploadData = string | Blob | ArrayBuffer | Uint8Array;
    const isInlineUploadData = (data: WriteEntry['data']): data is InlineUploadData =>
      typeof data === 'string' ||
      data instanceof Blob ||
      data instanceof ArrayBuffer ||
      data instanceof Uint8Array;

    const toUploadFileBlob = (data: InlineUploadData): Blob => {
      if (typeof data === 'string') {
        return new Blob([data], { type: 'text/plain; charset=utf-8' });
      }
      if (data instanceof Blob) {
        return data.type ? data : new Blob([data], { type: 'application/octet-stream' });
      }
      if (data instanceof ArrayBuffer) {
        return new Blob([data], { type: 'application/octet-stream' });
      }
      return new Blob(
        [new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)],
        { type: 'application/octet-stream' }
      );
    };

    const hasDistinctPaths =
      new Set(normalizedEntries.map((entry) => entry.path)).size === normalizedEntries.length;
    const canBatchUpload =
      normalizedEntries.length > 1 &&
      hasDistinctPaths &&
      normalizedEntries.every((entry) => isInlineUploadData(entry.data));

    if (canBatchUpload) {
      try {
        const endpoint = await this.getEndpoint(DEFAULT_EXECD_PORT);
        const form = new FormData();
        for (const entry of normalizedEntries) {
          const metadataJson = JSON.stringify({
            path: entry.path,
            owner: entry.owner,
            group: entry.group,
            mode: entry.mode
          });
          form.append(
            'metadata',
            new Blob([metadataJson], { type: 'application/json' }),
            'metadata'
          );
          const fileName = posix.basename(entry.path) || 'file';
          form.append('file', toUploadFileBlob(entry.data as InlineUploadData), fileName);
        }

        const response = await this.connection.uploadFetch(`${endpoint.url}/files/upload`, {
          method: 'POST',
          headers: endpoint.headers,
          body: form,
          redirect: 'manual'
        });
        if (response.ok) {
          return;
        }
        await response.body?.cancel().catch(() => {});
      } catch {
        // 批量快速路径失败时静默回退至有界并发逐文件写入。
      }
    }

    if (normalizedEntries.length === 1 || !hasDistinctPaths) {
      for (const entry of normalizedEntries) {
        await this.sandbox.files.writeFiles([entry]);
      }
      return;
    }

    let cursor = 0;
    const workerCount = Math.min(WRITE_FALLBACK_CONCURRENCY, normalizedEntries.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < normalizedEntries.length) {
          const index = cursor++;
          await this.sandbox.files.writeFiles([normalizedEntries[index]]);
        }
      })
    );
  }

  async deleteFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.sandbox.files.deleteFiles(paths.map((p) => this.normalizePath(p)));
  }

  async moveFiles(entries: MoveEntry[]): Promise<void> {
    await this.sandbox.files.moveFiles(
      entries.map(({ src, dest }) => ({
        src: this.normalizePath(src),
        dest: this.normalizePath(dest)
      }))
    );
  }

  /**
   * 按原文替换文件内容，同一文件的多处修改按传入顺序依次生效。
   *
   * OpenSandbox `execd` 的 `/files/replace` 请求体以路径为键，单次请求同一路径只保留最后一项，
   * 因此先做 POSIX 路径归一化，再按“每个文件的第 n 处修改”分批提交：不同文件合并在同一请求，
   * 同一文件的后续修改进入下一批。服务端返回 `replacedCount === 0` 时抛出异常并中止后续批次；
   * 当前批次的其他修改可能已生效。
   */
  async replaceContent(entries: ContentReplaceEntry[]): Promise<void> {
    const batches: ContentReplaceEntry[][] = [];
    const editCountByPath = new Map<string, number>();
    for (const entry of entries) {
      const path = this.normalizePath(entry.path);
      const batchIndex = editCountByPath.get(path) ?? 0;
      editCountByPath.set(path, batchIndex + 1);
      (batches[batchIndex] ??= []).push({ ...entry, path });
    }

    for (const batch of batches) {
      const results = await this.sandbox.files.replaceContentsDetailed(batch);
      const unmatchedPaths = results
        .filter(({ replacedCount }) => replacedCount === 0)
        .map(({ path }) => path);
      if (unmatchedPaths.length > 0) {
        throw new SandboxException(
          `Content to replace was not found in: ${unmatchedPaths.join(', ')}. Other edits in this batch may have been applied; read the files before retrying.`,
          { code: 'REPLACE_CONTENT_NOT_FOUND' }
        );
      }
    }
  }

  async createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    await this.sandbox.files.createDirectories(
      paths.map((path) => ({ ...options, path: this.normalizePath(path) }))
    );
  }

  async deleteDirectories(paths: string[]): Promise<void> {
    await this.sandbox.files.deleteDirectories(paths.map((path) => this.normalizePath(path)));
  }

  async listDirectory(path: string, options?: { depth?: number }): Promise<FileInfo[]> {
    return this.sandbox.files.listDirectory({
      path: this.normalizePath(path),
      ...(options?.depth !== undefined ? { depth: options.depth } : {})
    });
  }

  async getFileInfo(paths: string[]): Promise<Map<string, FileInfo>> {
    const normalizedPaths = paths.map((path) => this.normalizePath(path));
    const isFileNotFound = (err: unknown): err is SandboxApiException =>
      err instanceof SandboxApiException && err.error.code === 'FILE_NOT_FOUND';
    const info = await this.sandbox.files.getFileInfo(normalizedPaths).catch(async (error) => {
      if (!isFileNotFound(error)) throw error;
      if (normalizedPaths.length === 1) return {} as Record<string, FileInfo>;
      const items = await Promise.all(
        normalizedPaths.map((p) =>
          this.sandbox.files
            .getFileInfo([p])
            .catch((e) => (isFileNotFound(e) ? {} : Promise.reject(e)))
        )
      );
      return Object.assign({}, ...items) as Record<string, FileInfo>;
    });

    return new Map(Object.entries(info));
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
      stdout: new BoundedOutputBuffer(maxBytes, '\n'),
      stderr: new BoundedOutputBuffer(maxBytes, '\n')
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
export function buildOpenSandboxClient(
  clientConfig: OpenSandboxClientConfig,
  props: {
    sandboxId: string;
    deploymentId: string;
    remoteSandboxId?: string;
    createConfig?: SandboxCreateSpec;
  }
): OpenSandboxClient {
  const createConfig = (() => {
    const spec = props.createConfig;
    if (!spec) return undefined;
    const image = spec.image?.trim();
    if (!image) {
      throw new Error('OpenSandbox create config requires an image');
    }
    return { ...spec, image };
  })();

  return new OpenSandboxClient(
    {
      apiKey: clientConfig.apiKey,
      baseUrl: clientConfig.baseUrl,
      sessionId: props.sandboxId,
      deploymentId: props.deploymentId,
      ...(props.remoteSandboxId ? { remoteSandboxId: props.remoteSandboxId } : {})
    },
    createConfig
  );
}

/** 构造带运行态创建规格（环境变量、网络策略、资源限额与持久卷）的 OpenSandbox 客户端。 */
export function createRuntimeOpenSandboxClient(props: {
  sandboxId: string;
  deploymentId: string;
  remoteSandboxId?: string;
  resourceLimits?: SandboxResourceLimitsType;
  vmConfig?: VolumeManagerResult | undefined;
  createConfig?: SandboxCreateSpec;
}): OpenSandboxClient {
  const config = getOpenSandboxRuntimeConfig({
    runtime: true,
    sessionId: props.sandboxId,
    resourceLimits: props.resourceLimits,
    vmConfig: props.vmConfig,
    createConfig: props.createConfig
  });

  return buildOpenSandboxClient(config.clientConfig, {
    sandboxId: props.sandboxId,
    deploymentId: props.deploymentId,
    remoteSandboxId: props.remoteSandboxId,
    createConfig: config.createConfig
  });
}

/** 构造资源清理与历史操作恢复使用的 OpenSandbox 客户端（不反向依赖镜像或卷创建配置）。 */
export async function createOpenSandboxResourceClient(props: {
  sandboxId: string;
  instanceId?: string;
}): Promise<OpenSandboxClient> {
  const config = getOpenSandboxRuntimeConfig();

  return buildOpenSandboxClient(config.clientConfig, {
    sandboxId: props.sandboxId,
    deploymentId: await getInstanceId(),
    remoteSandboxId: props.instanceId,
    createConfig: config.createConfig
  });
}

export type ManagedOpenSandboxItem = {
  id: SandboxId;
  sessionId?: string;
  state: SandboxState;
  createdAt: Date;
  metadata?: Record<string, string>;
};

/** 列出指定部署拥有的活跃沙盒；同时校验返回标签，避免共享 OpenSandbox 集群跨部署 GC。 */
export async function listManagedOpenSandboxes(
  config: { baseUrl: string; apiKey?: string },
  deploymentId: string
): Promise<ManagedOpenSandboxItem[]> {
  const connection = getSharedOpenSandboxConnection({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey
  });
  const manager = SandboxManager.create({ connectionConfig: connection });
  try {
    const items: ManagedOpenSandboxItem[] = [];
    for (let page = 1; ; page++) {
      const res = await manager.listSandboxInfos({
        metadata: { app: 'fastgpt', deploymentId },
        pageSize: 100,
        page
      });
      for (const raw of res.items) {
        if (raw.metadata?.app !== 'fastgpt' || raw.metadata.deploymentId !== deploymentId) continue;
        const state = STATE_MAP[raw.status.state.toLowerCase()] ?? 'Error';
        if (state === 'UnExist' || state === 'Deleting') continue;
        items.push({
          id: raw.id,
          sessionId: raw.metadata?.sessionId,
          state,
          createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt),
          metadata: raw.metadata
        });
      }
      if (!res.pagination?.hasNextPage) {
        return items;
      }
    }
  } finally {
    await manager.close().catch(() => {});
  }
}

/**
 * 销毁孤儿容器前重新核对部署与会话标签；标签变化拒绝删除，404 视为幂等成功。
 */
export async function killManagedOpenSandboxById(
  config: {
    baseUrl: string;
    apiKey?: string;
  },
  target: SandboxOwner & { remoteSandboxId: SandboxId }
): Promise<void> {
  SandboxDeploymentIdSchema.parse(target.deploymentId);
  const connection = getSharedOpenSandboxConnection({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey
  });
  const manager = SandboxManager.create({ connectionConfig: connection });
  try {
    const info = await manager.getSandboxInfo(target.remoteSandboxId).catch((error) => {
      if (error instanceof SandboxApiException && error.statusCode === 404) {
        return undefined;
      }
      throw error;
    });
    if (!info) return;
    assertSandboxOwner(info, target);
    await manager.killSandbox(target.remoteSandboxId).catch((error) => {
      if (error instanceof SandboxApiException && error.statusCode === 404) {
        return;
      }
      throw error;
    });
  } finally {
    await manager.close().catch(() => {});
  }
}
