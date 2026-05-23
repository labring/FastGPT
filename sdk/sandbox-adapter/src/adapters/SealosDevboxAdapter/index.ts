import { CommandPolyfillService } from '@/polyfill/CommandPolyfillService';
import { CommandExecutionError, ConnectionError, FeatureNotSupportedError } from '../../errors';
import type {
  Endpoint,
  ExecuteOptions,
  ExecuteResult,
  SandboxCreateSpec,
  SandboxEndpointSelector,
  SandboxId,
  SandboxInfo,
  SandboxState
} from '../../types';
import { BaseSandboxAdapter } from '../BaseSandboxAdapter';
import { DevboxApi, DevboxApiError } from './api';
import { DevboxPhaseEnum, type DevboxCreateRequest, type DevboxInfoData } from './type';
import { formatImageSpec, parseImageSpec } from '@/utils/image';
import { joinUrlPath, normalizePathPrefix } from '@/utils/url';

const GET_INFO_RETRY_TIMEOUT_MS = 30_000;
const GET_INFO_RETRY_INTERVAL_MS = 1_000;

/**
 * Configuration for Sealos Devbox Adapter.
 */
export interface SealosDevboxConfig {
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
}

export class SealosDevboxAdapter extends BaseSandboxAdapter {
  readonly provider = 'sealosdevbox' as const;

  get rootPath(): string {
    const workingDir = this.createConfig?.workingDir?.trim();
    return workingDir ? workingDir.replace(/\/+$/, '') : '/home/devbox/workspace';
  }

  private api: DevboxApi;
  private _id: SandboxId;

  constructor(
    private config: SealosDevboxConfig,
    private createConfig?: SandboxCreateSpec
  ) {
    super();
    this.api = new DevboxApi({ baseUrl: config.baseUrl, token: config.token });
    this._id = config.sandboxId;
    this.polyfillService = new CommandPolyfillService(this);
  }

  get id(): SandboxId {
    return this._id;
  }

  private StatusAdapt(data: DevboxInfoData): SandboxState {
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

    return this.removeUndefined({
      name: this._id,
      image: spec.image ? formatImageSpec(spec.image) : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      labels: spec.labels,
      upstreamID: spec.upstreamID,
      kubeAccess: spec.kubeAccess,
      pauseAt: spec.lifecycle?.pauseAt,
      archiveAfterPauseTime: spec.lifecycle?.archiveAfterPauseTime
    });
  }

  private removeUndefined<T extends Record<string, unknown>>(obj: T): T {
    return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
  }

  private assertMutationSuccess(
    res: { code: number; message?: string },
    action: string,
    okCodes: number[] = []
  ): void {
    if ((res.code >= 200 && res.code < 300) || okCodes.includes(res.code)) {
      return;
    }

    throw new Error(res.message || `Devbox ${action} failed with code ${res.code}`);
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
      if (current instanceof DevboxApiError) {
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

  // ==================== Lifecycle Methods ====================

  async getInfo(): Promise<SandboxInfo | null> {
    try {
      const res = await this.api.info(this._id);
      if (res.code !== 200) return null;
      if (!res.data) return Promise.reject(res.message);

      const data: DevboxInfoData = res.data;

      this._status = {
        state: this.StatusAdapt(data),
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
    } catch (error: any) {
      throw new CommandExecutionError(
        `Failed to get sandbox info`,
        'getInfo',
        error instanceof Error ? error : undefined
      );
    }
  }

  async ensureRunning(): Promise<void> {
    try {
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

      // Not found, create sandbox
      await this.create();
    } catch (error: any) {
      if (error instanceof ConnectionError) {
        throw error;
      }
      throw new ConnectionError(`Failed to ensure sandbox running`, this.config.baseUrl, error);
    }
  }
  /*  
    创建可用沙盒
  */
  async create(): Promise<void> {
    try {
      this._status = { state: 'Creating' };
      const res = await this.api.create(this.buildCreateRequest());
      this.assertMutationSuccess(res, 'create');
      await this.waitUntilReady();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this._status = { state: 'Running' };
    } catch (error) {
      throw new ConnectionError('Failed to create sandbox', this.config.baseUrl, error);
    }
  }

  async stop(): Promise<void> {
    try {
      this._status = { state: 'Stopping' };
      const res = await this.api.stop(this._id);
      if (this.isNotFoundResponse(res)) {
        this._status = { state: 'Stopped' };
        return;
      }
      this.assertMutationSuccess(res, 'stop');
      this._status = { state: 'Stopped' };
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to stop sandbox',
        'stop',
        error instanceof Error ? error : undefined
      );
    }
  }

  async start(): Promise<void> {
    try {
      this._status = { state: 'Starting' };
      const res = await this.api.resume(this._id);
      this.assertMutationSuccess(res, 'resume');
      await this.waitUntilReady();
      this._status = { state: 'Running' };
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to resume sandbox',
        'resume',
        error instanceof Error ? error : undefined
      );
    }
  }

  async delete(sandboxId?: SandboxId): Promise<void> {
    try {
      const targetId = sandboxId ?? this._id;
      this._status = { state: 'Deleting' };
      const res = await this.api.delete(targetId);
      this.assertMutationSuccess(res, 'delete', [404]);
      this._id = targetId;
      await this.waitUntilDeleted();
      this._status = { state: 'UnExist' };
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to delete sandbox',
        'delete',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ==================== Command Execution ====================

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    const cmd = this.buildCommand(command, this.normalizePath(options?.workingDirectory));
    try {
      const res = await this.api.exec(this._id, {
        command: cmd,
        timeoutSeconds: options?.timeoutMs ? Math.ceil(options.timeoutMs / 1000) : undefined
      });

      if (!res.data) {
        throw new CommandExecutionError(`Command execution failed: ${res.message}`, command);
      }

      return {
        stdout: res.data.stdout,
        stderr: res.data.stderr,
        exitCode: res.data.exitCode
      };
    } catch (error: any) {
      throw new CommandExecutionError(
        `Command execution failed: ${error?.message || error?.code}`,
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
  ): Promise<{ origin: string; basePath: string; port: number; password?: string }> {
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

    const prefix = 'devbox-gateway.';
    if (!gateway.host.startsWith(prefix)) {
      throw new ConnectionError(
        `Cannot derive httpgate domain from gateway host "${gateway.host}"`,
        this.config.baseUrl
      );
    }

    return gateway.host.slice(prefix.length);
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
