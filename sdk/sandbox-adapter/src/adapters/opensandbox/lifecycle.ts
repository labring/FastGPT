import type {
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
  ConnectionError,
  FeatureNotSupportedError,
  SandboxNotFoundError,
  SandboxStateError
} from '../../errors';
import type {
  ResourceLimits,
  SandboxEnsureRunningOptions,
  SandboxId,
  SandboxInfo,
  SandboxState,
  SandboxStatus
} from '../../types';
import { formatImageSpec, parseImageSpec } from '../../utils/image';
import type { OpenSandboxConfigType, OpenSandboxConnectionConfig } from './types';

const DEFAULT_REQUEST_TIMEOUT_SECONDS = 120;
const DEFAULT_LIFECYCLE_TIMEOUT_MS = 120_000;
const LIFECYCLE_POLL_INTERVAL_MS = 1_000;

type ResolvedSandboxInfo = {
  info: SdkSandboxInfo;
  status: SandboxStatus;
};

type SandboxInfoReader = () => Promise<SdkSandboxInfo | undefined>;

const STATE_MAP: Record<string, SandboxState> = {
  running: 'Running',
  creating: 'Creating',
  resuming: 'Starting',
  pausing: 'Stopping',
  deleting: 'Deleting',
  error: 'Error',
  paused: 'Stopped',
  deleted: 'UnExist'
};

/** Owns the OpenSandbox SDK client and all remote lifecycle transitions. */
export class OpenSandboxLifecycle {
  private boundSandbox?: Sandbox;
  private readonly connection: ConnectionConfig;
  private currentStatus: SandboxStatus = { state: 'Creating' };

  constructor(
    private readonly connectionConfig: OpenSandboxConnectionConfig,
    private readonly createConfig?: OpenSandboxConfigType
  ) {
    const { baseUrl, apiKey, requestTimeoutSeconds, debug, useServerProxy } = connectionConfig;
    this.connection = new ConnectionConfig({
      domain: baseUrl,
      apiKey,
      requestTimeoutSeconds: requestTimeoutSeconds ?? DEFAULT_REQUEST_TIMEOUT_SECONDS,
      debug,
      useServerProxy
    });
  }

  get id(): SandboxId | undefined {
    return this.boundSandbox?.id;
  }

  get status(): SandboxStatus {
    return this.currentStatus;
  }

  /** Return the bound SDK client or fail before a provider operation is attempted. */
  get sandbox(): Sandbox {
    if (!this.boundSandbox) {
      throw new SandboxStateError(
        'Sandbox not initialized. Call ensureRunning(), create(), or connect() first.',
        'UnExist',
        'Running'
      );
    }
    return this.boundSandbox;
  }

  private setStatus(status: SandboxStatus): void {
    this.currentStatus = status;
  }

  private mapStatus(status: { state: string; reason?: string; message?: string }): SandboxStatus {
    return {
      state: STATE_MAP[status.state.toLowerCase()] ?? 'Error',
      reason: status.reason,
      message: status.message
    };
  }

  private resolveSandboxInfo(info: SdkSandboxInfo): ResolvedSandboxInfo {
    return { info, status: this.mapStatus(info.status) };
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

  private convertResourceLimits(limits?: ResourceLimits): Record<string, string> | undefined {
    if (!limits) return undefined;

    return {
      ...(limits.cpuCount === undefined ? {} : { cpu: String(limits.cpuCount) }),
      ...(limits.memoryMiB === undefined ? {} : { memory: `${limits.memoryMiB}Mi` }),
      ...(limits.diskGiB === undefined ? {} : { disk: `${limits.diskGiB}Gi` })
    };
  }

  private convertNetworkPolicy(
    policy?: OpenSandboxConfigType['networkPolicy']
  ): SdkNetworkPolicy | undefined {
    if (!policy) return undefined;
    return {
      defaultAction: policy.defaultAction,
      egress: policy.egress?.map(({ action, target }) => ({ action, target }))
    };
  }

  private getSdkOptions() {
    return {
      connectionConfig: this.connection,
      skipHealthCheck: this.createConfig?.skipHealthCheck,
      readyTimeoutSeconds: this.createConfig?.readyTimeoutSeconds,
      healthCheckPollingInterval: this.createConfig?.healthCheckPollingInterval
    };
  }

  private getSdkErrorCode(error: unknown): string | undefined {
    return error instanceof SandboxException ? error.error.code : undefined;
  }

  private isNotFoundError(error: unknown): boolean {
    return error instanceof SandboxApiException && error.statusCode === 404;
  }

  private async replaceSandbox(sandbox: Sandbox): Promise<void> {
    const previous = this.boundSandbox;
    this.boundSandbox = sandbox;
    if (previous && previous !== sandbox) {
      await previous.close().catch(() => {});
    }
  }

  private async releaseSandbox(): Promise<void> {
    const current = this.boundSandbox;
    this.boundSandbox = undefined;
    await current?.close().catch(() => {});
  }

  private async withSandboxManager<T>(
    callback: (manager: SandboxManager) => Promise<T>
  ): Promise<T> {
    const manager = SandboxManager.create({ connectionConfig: this.connection });
    try {
      return await callback(manager);
    } finally {
      await manager.close().catch(() => {});
    }
  }

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
    const info = activeItems.find((item) => item.id === this.boundSandbox?.id) ?? activeItems[0];
    return info ? this.resolveSandboxInfo(info) : undefined;
  }

  private async getSandboxById(props: {
    manager: SandboxManager;
    sandboxId: SandboxId;
  }): Promise<ResolvedSandboxInfo | undefined> {
    try {
      return this.resolveSandboxInfo(await props.manager.getSandboxInfo(props.sandboxId));
    } catch (error) {
      if (this.isNotFoundError(error)) return undefined;
      throw error;
    }
  }

  private async waitUntilSandboxState(props: {
    sandboxId: SandboxId;
    expectedStates: SandboxState[];
    readInfo: SandboxInfoReader;
    timeoutMs?: number;
  }): Promise<ResolvedSandboxInfo | undefined> {
    const timeoutMs = props.timeoutMs ?? DEFAULT_LIFECYCLE_TIMEOUT_MS;
    const startTime = Date.now();
    let currentState: SandboxState = 'UnExist';

    while (Date.now() - startTime < timeoutMs) {
      const info = await props.readInfo().catch((error) => {
        if (this.isNotFoundError(error)) return undefined;
        throw error;
      });
      if (!info) {
        if (props.expectedStates.includes('UnExist')) return undefined;
        throw new SandboxNotFoundError(`Sandbox ${props.sandboxId} no longer exists`);
      }

      const resolved = this.resolveSandboxInfo(info);
      currentState = resolved.status.state;
      this.setStatus(resolved.status);
      if (props.expectedStates.includes(currentState)) return resolved;
      if (currentState === 'Error') {
        throw new ConnectionError(
          `Sandbox ${props.sandboxId} entered an error state: ${resolved.status.message ?? 'unknown error'}`,
          this.connectionConfig.baseUrl
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LIFECYCLE_POLL_INTERVAL_MS));
    }

    throw new SandboxStateError(
      `Sandbox ${props.sandboxId} did not reach ${props.expectedStates.join(' or ')} within ${timeoutMs}ms`,
      currentState,
      props.expectedStates.join('|')
    );
  }

  private async createMissingSandbox(allowCreate: boolean): Promise<void> {
    if (!allowCreate) {
      throw new SandboxNotFoundError(
        `Sandbox session ${this.connectionConfig.sessionId} does not exist`
      );
    }
    await this.create();
  }

  private async ensureResolvedSandboxRunning(props: {
    resolved: ResolvedSandboxInfo;
    allowCreate: boolean;
    readInfo: SandboxInfoReader;
  }): Promise<void> {
    const sandboxId = props.resolved.info.id;
    switch (props.resolved.status.state) {
      case 'UnExist':
        await this.releaseSandbox();
        return this.createMissingSandbox(props.allowCreate);
      case 'Running':
        if (this.boundSandbox?.id !== sandboxId) await this.connect(sandboxId);
        else this.setStatus({ state: 'Running' });
        return;
      case 'Creating':
      case 'Starting':
        await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['Running'],
          readInfo: props.readInfo
        });
        if (this.boundSandbox?.id !== sandboxId) await this.connect(sandboxId);
        else this.setStatus({ state: 'Running' });
        return;
      case 'Stopping': {
        const stopped = await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['Stopped', 'UnExist'],
          readInfo: props.readInfo
        });
        if (!stopped) {
          await this.releaseSandbox();
          return this.createMissingSandbox(props.allowCreate);
        }
        return this.resume(sandboxId);
      }
      case 'Stopped':
        return this.resume(sandboxId);
      case 'Deleting':
        if (!props.allowCreate) {
          throw new ConnectionError(
            `Sandbox session ${this.connectionConfig.sessionId} is deleting`,
            this.connectionConfig.baseUrl
          );
        }
        await this.waitUntilSandboxState({
          sandboxId,
          expectedStates: ['UnExist'],
          readInfo: props.readInfo
        });
        await this.releaseSandbox();
        return this.create();
      case 'Error':
        throw new ConnectionError(
          `Sandbox error: ${props.resolved.status.message ?? 'unknown error'}`,
          this.connectionConfig.baseUrl
        );
    }
  }

  /** Ensure the reusable session resource exists and is running. */
  async ensureRunning(options: SandboxEnsureRunningOptions = {}): Promise<void> {
    const allowCreate = options.allowCreate ?? true;
    const boundSandbox = this.boundSandbox;

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
      if (!resolved) return this.createMissingSandbox(allowCreate);

      await this.ensureResolvedSandboxRunning({
        resolved,
        allowCreate,
        readInfo: async () =>
          (await this.getSandboxById({ manager, sandboxId: resolved.info.id }))?.info
      });
    });
  }

  /** Create and bind a new remote sandbox. */
  async create(): Promise<void> {
    const config = this.createConfig;
    if (!config?.image?.repository) {
      throw new ConnectionError(
        'Cannot create OpenSandbox resource without createConfig.image',
        this.connectionConfig.baseUrl
      );
    }

    try {
      this.setStatus({ state: 'Creating' });
      const sandbox = await Sandbox.create({
        ...this.getSdkOptions(),
        image: formatImageSpec(config.image),
        entrypoint: config.entrypoint,
        timeoutSeconds: config.timeoutSeconds ?? null,
        resource: this.convertResourceLimits(config.resourceLimits),
        env: config.env,
        metadata: { ...config.metadata, sessionId: this.connectionConfig.sessionId },
        networkPolicy: this.convertNetworkPolicy(config.networkPolicy),
        volumes: config.volumes,
        extensions: config.extensions
      });
      await this.replaceSandbox(sandbox);
      this.setStatus({ state: 'Running' });
    } catch (error) {
      this.setStatus({ state: 'Error', message: String(error) });
      throw new ConnectionError('Failed to create sandbox', this.connectionConfig.baseUrl, error);
    }
  }

  /** Bind a fresh SDK client to an existing running sandbox. */
  async connect(sandboxId: SandboxId): Promise<void> {
    try {
      this.setStatus({ state: 'Starting' });
      const sandbox = await Sandbox.connect({ sandboxId, ...this.getSdkOptions() });
      await this.replaceSandbox(sandbox);
      this.setStatus({ state: 'Running' });
    } catch (error) {
      this.setStatus({ state: 'Error', message: String(error) });
      throw new ConnectionError(
        `Failed to connect to sandbox ${sandboxId}`,
        this.connectionConfig.baseUrl,
        error
      );
    }
  }

  private async resume(sandboxId: SandboxId): Promise<void> {
    try {
      this.setStatus({ state: 'Starting' });
      const resumed = await Sandbox.resume({ sandboxId, ...this.getSdkOptions() });
      await this.replaceSandbox(resumed);
      this.setStatus({ state: 'Running' });
    } catch (error) {
      const code = this.getSdkErrorCode(error);
      if (code === 'DOCKER::SANDBOX_NOT_PAUSED') return this.connect(sandboxId);
      if (code === 'SANDBOX::API_NOT_SUPPORTED') {
        await this.releaseSandbox();
        throw new FeatureNotSupportedError(
          'Start/resume not supported by this runtime',
          'start',
          'opensandbox'
        );
      }
      await this.releaseSandbox();
      this.setStatus({ state: 'Error', message: String(error) });
      throw new ConnectionError(
        `Failed to resume sandbox ${sandboxId}`,
        this.connectionConfig.baseUrl,
        error
      );
    }
  }

  async start(): Promise<void> {
    await this.ensureRunning({ allowCreate: false });
  }

  /** Delete the remote OpenSandbox resource while leaving external workspace storage intact. */
  async stop(): Promise<void> {
    await this.delete();
  }

  /** Permanently delete a remote sandbox by id or stable session metadata. */
  async delete(sandboxId?: SandboxId): Promise<void> {
    const affectsBoundSandbox =
      !this.boundSandbox || !sandboxId || sandboxId === this.boundSandbox.id;
    try {
      if (affectsBoundSandbox) this.setStatus({ state: 'Deleting' });
      const targetId = sandboxId ?? this.boundSandbox?.id;

      if (targetId && targetId === this.boundSandbox?.id) {
        const boundSandbox = this.boundSandbox;
        await boundSandbox.kill();
        await this.waitUntilSandboxState({
          sandboxId: targetId,
          expectedStates: ['UnExist'],
          readInfo: async () => boundSandbox.getInfo()
        });
        await this.releaseSandbox();
        this.setStatus({ state: 'UnExist' });
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
      if (affectsBoundSandbox) this.setStatus({ state: 'UnExist' });
    } catch (error) {
      if (this.isNotFoundError(error)) {
        if (affectsBoundSandbox) {
          await this.releaseSandbox();
          this.setStatus({ state: 'UnExist' });
        }
        return;
      }
      throw new ConnectionError('Failed to delete sandbox', this.connectionConfig.baseUrl, error);
    }
  }

  async getInfo(): Promise<SandboxInfo | null> {
    try {
      const info = this.boundSandbox
        ? this.convertSandboxInfo(await this.boundSandbox.getInfo())
        : await this.withSandboxManager(async (manager) => {
            const resolved = await this.getSandboxBySessionId(manager);
            return resolved ? this.convertSandboxInfo(resolved.info) : null;
          });
      if (info) this.setStatus(info.status);
      return info;
    } catch (error) {
      if (this.isNotFoundError(error)) return null;
      throw new ConnectionError('Failed to get sandbox info', this.connectionConfig.baseUrl, error);
    }
  }

  async renewExpiration(timeoutSeconds: number): Promise<void> {
    try {
      await this.sandbox.renew(timeoutSeconds);
    } catch (error) {
      throw new ConnectionError(
        'Failed to renew sandbox expiration',
        this.connectionConfig.baseUrl,
        error
      );
    }
  }

  async close(): Promise<void> {
    await this.releaseSandbox();
  }
}
