/** 运行态 client 只管理连接复用、工作目录、自愈重连和命令执行；生命周期交由 runtime/service。 */
import { SandboxApiException } from '@alibaba-group/opensandbox';
import type { ExecuteResult } from '@fastgpt/global/core/ai/sandbox/type';
import { isAppSandboxSourceType } from '@fastgpt/global/common/chat/source';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../../../common/logger';
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import { SandboxNotFoundError, SandboxStateError } from '../../infrastructure/opensandbox/errors';
import { getSandboxRuntimeProfile } from '../../infrastructure/opensandbox/runtimeProfile';
import { deleteSandboxResource } from '../resource';
import { getSandboxRuntimePaths, resolveSandboxRuntimePath } from '../../utils';
import type { SandboxClientQuery, SandboxRuntimeOptions, PreparedSandboxRuntime } from './type';
import { ensureSandboxRuntime } from './service';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 判断底层异常是否代表远端容器丢失或 JuiceFS FUSE 挂载断连，适合触发慢路径自愈重建并重试一次。
 */
export function isRecoverableSandboxError(error: unknown): boolean {
  if (error instanceof SandboxNotFoundError || error instanceof SandboxStateError) {
    return true;
  }
  if (error instanceof SandboxApiException) {
    return error.statusCode === 404 || error.statusCode === 502 || error.statusCode === 503;
  }
  if (error && typeof error === 'object') {
    const message = 'message' in error ? String(error.message) : '';
    if (/ENOTCONN|Transport endpoint is not connected/i.test(message)) {
      return true;
    }
    if ('cause' in error && error.cause && error.cause !== error) {
      return isRecoverableSandboxError(error.cause);
    }
  }
  return false;
}

/** 每个 client 持有独立连接；复用或自愈时重新准备运行态，避免跨 generation 使用旧句柄。 */
export class SandboxClient {
  private runtime: PreparedSandboxRuntime;
  private readonly query: SandboxClientQuery;
  private readonly prepare: (
    connection: PreparedSandboxRuntime,
    options?: { verifyHealth?: boolean }
  ) => Promise<PreparedSandboxRuntime>;
  private ensureAvailablePromise?: Promise<void>;
  private preparedWorkDirectory?: { opensandbox: OpenSandboxClient; promise: Promise<void> };
  private get runtimePaths() {
    return getSandboxRuntimePaths({
      sourceType: this.query.sourceType,
      workDirectory: getSandboxRuntimeProfile().workDirectory,
      chatId: this.query.chatId
    });
  }

  constructor(params: {
    query: SandboxClientQuery;
    runtime: PreparedSandboxRuntime;
    prepare: (
      connection: PreparedSandboxRuntime,
      options?: { verifyHealth?: boolean }
    ) => Promise<PreparedSandboxRuntime>;
  }) {
    this.query = params.query;
    this.runtime = params.runtime;
    this.prepare = params.prepare;
  }

  get opensandbox(): OpenSandboxClient {
    return this.runtime.opensandbox;
  }

  /** 同一个 client 上并行工具调用共用准备任务，不缓存跨调用的生命周期状态。 */
  async ensureAvailable(options?: { verifyHealth?: boolean }) {
    if (this.ensureAvailablePromise) return this.ensureAvailablePromise;
    const promise = (async () => {
      const previous = this.runtime.opensandbox;
      this.runtime = await this.prepare(this.runtime, options);
      if (previous !== this.runtime.opensandbox) {
        this.preparedWorkDirectory = undefined;
        await previous.close().catch(() => undefined);
      }
    })();
    this.ensureAvailablePromise = promise;
    try {
      await promise;
    } finally {
      if (this.ensureAvailablePromise === promise) this.ensureAvailablePromise = undefined;
    }
  }

  /** 在乐观直连后的首次业务操作遭遇容器消失或 FUSE 断连时，强制走慢路径探测并重建容器。 */
  async recover(): Promise<void> {
    await this.runtime.opensandbox.close().catch(() => undefined);
    this.preparedWorkDirectory = undefined;
    await this.ensureAvailable({ verifyHealth: true });
  }

  /**
   * 仅对已准备好的客户端执行一次失败自愈重试（不重复调用 `ensureAvailable`）。
   * 适用于调用前已经完成 `getSandboxClient` 或 `ensureAvailable` 的链路。
   */
  async retryOnRecoverableError<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (!isRecoverableSandboxError(error)) {
        throw error;
      }
      await this.recover();
      return await fn();
    }
  }

  /** 确保运行时可用后执行业务操作，遇到可恢复的容器/FUSE 断连异常时自动自愈重试一次。 */
  async runWithRecovery<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureAvailable();
    return this.retryOnRecoverableError(fn);
  }

  /** 为 App 和 Builder 会话创建默认工作目录，连接切换后重新准备；Skill 使用共享根目录。 */
  private prepareWorkDirectory() {
    if (!isAppSandboxSourceType(this.query.sourceType)) return Promise.resolve();
    const opensandbox = this.opensandbox;
    if (this.preparedWorkDirectory?.opensandbox === opensandbox) {
      return this.preparedWorkDirectory.promise;
    }
    const promise = opensandbox
      .createDirectories([this.runtimePaths.sessionWorkDirectory])
      .catch((error) => {
        if (this.preparedWorkDirectory?.opensandbox === opensandbox) {
          this.preparedWorkDirectory = undefined;
        }
        throw error;
      });
    this.preparedWorkDirectory = { opensandbox, promise };
    return promise;
  }

  getSandboxId() {
    return this.query.sandboxId;
  }

  getContext() {
    return {
      sourceType: this.query.sourceType,
      sourceId: this.query.sourceId,
      userId: this.query.userId,
      chatId: this.query.chatId
    };
  }

  getRuntimePaths() {
    return this.runtimePaths;
  }

  /** 将调用方文件路径解析到当前会话目录。 */
  resolveRuntimePath(path?: string, options: { allowAbsolutePath?: boolean } = {}) {
    return resolveSandboxRuntimePath(path, this.runtimePaths, options);
  }

  /**
   * 在可用 sandbox 中执行命令。
   *
   * 执行前会先 ensureAvailable；若乐观直连遇到容器丢失或 FUSE 断连则自愈重连后重试 1 次。
   * 失败时返回标准 ExecuteResult，让 workflow 能把错误当作工具输出处理。
   */
  async exec(command: string, timeout?: number): Promise<ExecuteResult> {
    try {
      await this.ensureAvailable();
    } catch (err) {
      logger.error('Failed to ensure sandbox available', {
        sandboxId: this.query.sandboxId,
        error: err
      });
      return {
        stdout: '',
        stderr: `Sandbox service is not available: ${getErrText(err)}`,
        exitCode: -1
      };
    }

    const runCommand = async () => {
      await this.prepareWorkDirectory();
      return this.opensandbox.execute(command, {
        timeoutMs: timeout ? timeout * 1000 : undefined,
        ...(isAppSandboxSourceType(this.query.sourceType)
          ? { workingDirectory: this.runtimePaths.sessionWorkDirectory }
          : {})
      });
    };

    try {
      return await this.retryOnRecoverableError(runCommand);
    } catch (err: unknown) {
      logger.error('Failed to execute sandbox', { sandboxId: this.query.sandboxId, error: err });
      return {
        stdout: '',
        stderr: `Failed to execute sandbox: ${getErrText(err)}`,
        exitCode: -1
      };
    }
  }

  /** 释放底层 OpenSandbox 连接句柄。 */
  async close(): Promise<void> {
    await this.opensandbox.close().catch(() => undefined);
  }

  /** 删除当前运行态 client 对应的资源记录、持久卷和远端容器。 */
  async delete(): Promise<void> {
    await this.close();
    await deleteSandboxResource({
      sandboxId: this.query.sandboxId
    });
  }
}

/** 真实业务使用入口：统一准备运行态后返回 client。 */
export async function getSandboxClient(
  query: SandboxClientQuery,
  options: SandboxRuntimeOptions = {}
) {
  const runtime = await ensureSandboxRuntime({ query, options });
  return new SandboxClient({
    query,
    runtime,
    prepare: (connection, prepareOptions) =>
      ensureSandboxRuntime({
        query,
        options,
        connection,
        verifyHealth: prepareOptions?.verifyHealth
      })
  });
}
