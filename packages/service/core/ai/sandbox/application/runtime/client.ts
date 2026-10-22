/** 运行态 client 只管理连接复用、工作目录和命令执行；生命周期交由 runtime/service。 */
import { isAppSandboxSourceType } from '@fastgpt/global/common/chat/source';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../../../common/logger';
import type { ExecuteResult, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { deleteSandboxResource, stopSandboxResource } from '../resource';
import { existsSandboxInstanceBySandboxId } from '../../infrastructure/instance/repository';
import { getConfiguredSandboxProvider } from '../../infrastructure/provider/config';
import { getSandboxRuntimeProfile } from '../../infrastructure/provider/runtimeProfile';
import { getSandboxRuntimePaths, resolveSandboxRuntimePath } from '../../utils';
import type { SandboxProviderType } from '../../type';
import type { SandboxClientQuery, SandboxRuntimeOptions, PreparedSandboxRuntime } from './type';
import { ensureSandboxRuntime, connectRunningSandbox } from './service';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/** 每个 client 持有独立连接；复用时重新准备运行态，避免跨 generation 使用旧 adapter。 */
export class SandboxClient {
  private runtime: PreparedSandboxRuntime;
  private readonly query: SandboxClientQuery;
  private readonly prepare: (connection: PreparedSandboxRuntime) => Promise<PreparedSandboxRuntime>;
  private ensureAvailablePromise?: Promise<void>;
  private preparedWorkDirectory?: { provider: ISandbox; promise: Promise<void> };
  private get runtimePaths() {
    return getSandboxRuntimePaths({
      sourceType: this.query.sourceType,
      workDirectory: getSandboxRuntimeProfile(this.runtime.resource.provider).workDirectory,
      chatId: this.query.chatId
    });
  }

  constructor(params: {
    query: SandboxClientQuery;
    runtime: PreparedSandboxRuntime;
    prepare: (connection: PreparedSandboxRuntime) => Promise<PreparedSandboxRuntime>;
  }) {
    this.query = params.query;
    this.runtime = params.runtime;
    this.prepare = params.prepare;
  }

  get provider(): ISandbox {
    return this.runtime.adapter;
  }

  /** 同一个 client 上并行工具调用共用准备任务，不缓存跨调用的生命周期状态。 */
  async ensureAvailable() {
    if (this.ensureAvailablePromise) return this.ensureAvailablePromise;
    const promise = (async () => {
      const previous = this.runtime.adapter;
      this.runtime = await this.prepare(this.runtime);
      if (previous !== this.runtime.adapter) {
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

  /** 为 App 和 Builder 会话创建默认工作目录，连接切换后重新准备；Skill 使用共享根目录。 */
  private prepareWorkDirectory() {
    if (!isAppSandboxSourceType(this.query.sourceType)) return Promise.resolve();
    const provider = this.provider;
    if (this.preparedWorkDirectory?.provider === provider)
      return this.preparedWorkDirectory.promise;
    const promise = provider
      .createDirectories([this.runtimePaths.sessionWorkDirectory])
      .catch((error) => {
        if (this.preparedWorkDirectory?.provider === provider)
          this.preparedWorkDirectory = undefined;
        throw error;
      });
    this.preparedWorkDirectory = { provider, promise };
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

  /** 将调用方文件路径解析到当前会话目录；绝对路径默认不限制 workspace 范围。 */
  resolveRuntimePath(
    path?: string,
    options: { allowAbsolutePath?: boolean; allowOutsideWorkspace?: boolean } = {}
  ) {
    return resolveSandboxRuntimePath(path, this.runtimePaths, options);
  }

  /**
   * 在可用 sandbox 中执行命令。
   *
   * 执行前会先 ensureAvailable；失败时返回标准 ExecuteResult，让 workflow 能把错误当作工具输出处理。
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

    return await this.prepareWorkDirectory()
      .then(() =>
        this.provider.execute(command, {
          timeoutMs: timeout ? timeout * 1000 : undefined,
          ...(isAppSandboxSourceType(this.query.sourceType)
            ? { workingDirectory: this.runtimePaths.sessionWorkDirectory }
            : {})
        })
      )
      .catch((err: unknown) => {
        logger.error('Failed to execute sandbox', { sandboxId: this.query.sandboxId, error: err });
        return {
          stdout: '',
          stderr: `Failed to execute sandbox: ${getErrText(err)}`,
          exitCode: -1
        };
      });
  }

  /**
   * 删除当前运行态 client 对应的资源记录和远端资源。
   */
  async delete() {
    await this.provider.close().catch(() => undefined);
    await deleteSandboxResource({
      provider: this.runtime.resource.provider,
      sandboxId: this.query.sandboxId
    });
  }

  /** 按 provider stop 策略停止远端资源，并把本地实例状态标记为 stopped。 */
  async stop() {
    await this.provider.close().catch(() => undefined);
    await stopSandboxResource({
      provider: this.runtime.resource.provider,
      sandboxId: this.query.sandboxId
    });
  }
}

/** 只读本地实例记录，不触发远端创建或归档恢复。 */
export async function checkSandboxRuntimeInstanceExists(
  props: Pick<SandboxClientQuery, 'sandboxId'>,
  opts: { providerName?: SandboxProviderType } = {}
) {
  return existsSandboxInstanceBySandboxId({
    provider: opts.providerName ?? getConfiguredSandboxProvider(),
    sandboxId: props.sandboxId
  });
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
    prepare: (connection) => ensureSandboxRuntime({ query, options, connection })
  });
}

/** 保活入口只连接已经运行的资源，不激活或迁移实例。 */
export async function getRunningSandboxClient(
  query: SandboxClientQuery,
  options: SandboxRuntimeOptions = {}
) {
  const runtime = await connectRunningSandbox({ query, options });
  return new SandboxClient({
    query,
    runtime,
    prepare: (connection) => connectRunningSandbox({ query, options, ...connection })
  });
}
