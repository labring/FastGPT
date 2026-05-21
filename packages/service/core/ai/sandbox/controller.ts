import {
  generateSandboxId,
  SandboxStatusEnum,
  SANDBOX_SUSPEND_MINUTES
} from '@fastgpt/global/core/ai/sandbox/constants';
import { serviceEnv } from '../../../env';
import { MongoSandboxInstance } from './schema';
import {
  createSandbox,
  type ExecuteResult,
  type ISandbox,
  type OpenSandboxAdapter,
  type OpenSandboxConfigType,
  type ResourceLimits,
  type SandboxCreateSpec
} from '@fastgpt-sdk/sandbox-adapter';
import {
  getOpenSandboxConnectionConfig,
  getSealosConnectionConfig,
  buildOpenSandboxCreateConfig,
  getVolumeManagerConfig,
  deleteSessionVolume,
  getSandboxProviderConfig,
  type SandboxProviderConfig,
  type VolumeManagerResult
} from './config';
import { getLogger, LogCategories } from '../../../common/logger';
import { setCron } from '../../../common/system/cron';
import { subMinutes } from 'date-fns';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { SandboxResourceDoc } from './instance';
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

type UnionIdType = {
  appId: string;
  userId: string;
  chatId: string;
};

export type SandboxInfo = NonNullable<Awaited<ReturnType<ISandbox['getInfo']>>>;

const SANDBOX_PROVIDER_RETRY_TIMEOUT_MS = 30_000;
const SANDBOX_PROVIDER_RETRY_INTERVAL_MS = 1_000;
const SANDBOX_COMMAND_READY_TIMEOUT_MS = 120_000;
const SANDBOX_COMMAND_READY_INTERVAL_MS = 1_000;
const SANDBOX_COMMAND_READY_PROBE_TIMEOUT_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

function isRetryableSandboxProviderError(error: unknown): boolean {
  let current: unknown = error;

  while (current instanceof Error) {
    const errorLike = current as Error & {
      status?: unknown;
      rawBody?: unknown;
      cause?: unknown;
    };
    const status = typeof errorLike.status === 'number' ? errorLike.status : undefined;
    const rawBody = typeof errorLike.rawBody === 'string' ? errorLike.rawBody.toLowerCase() : '';
    const message = errorLike.message.toLowerCase();

    if (
      (status !== undefined && [502, 503, 504].includes(status)) ||
      rawBody.includes('no healthy upstream') ||
      message.includes('no healthy upstream')
    ) {
      return true;
    }

    current = errorLike.cause;
  }

  return false;
}

function isSandboxCommandChannelNotReadyError(error: unknown): boolean {
  const pending: unknown[] = [error];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!(current instanceof Error)) continue;

    const errorLike = current as Error & {
      commandError?: unknown;
      cause?: unknown;
    };
    const message = errorLike.message.toLowerCase();

    if (
      message.includes('pod is not running') ||
      message.includes('exec command timeout') ||
      message.includes('command execution failed: exec command timeout')
    ) {
      return true;
    }

    pending.push(errorLike.commandError, errorLike.cause);
  }

  return false;
}

/**
 * 对 provider 只读探测接口做临时网关错误重试。
 *
 * adaptor 已在 ensureRunning 内部处理 getInfo 的 502/503/504；但 endpoint/proxy
 * 能力也可能读取 provider info。这里限定为只读探测调用，避免重复执行 create/delete 等生命周期变更。
 */
async function retrySandboxProviderProbe<T>(
  operation: string,
  fn: () => Promise<T>,
  timeoutMs = SANDBOX_PROVIDER_RETRY_TIMEOUT_MS,
  intervalMs = SANDBOX_PROVIDER_RETRY_INTERVAL_MS
): Promise<T> {
  const startTime = Date.now();
  let lastError: unknown;

  while (Date.now() - startTime < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableSandboxProviderError(error)) {
        throw error;
      }
      await sleep(intervalMs);
    }
  }

  logger.warn('Sandbox provider probe retry exhausted', { operation, error: lastError });
  throw lastError;
}

/**
 * 等待 sandbox 的命令通道真正可执行。
 *
 * Sealos devbox 的 provider info 可能已经是 Running，但 exec API 仍短暂返回
 * "pod is not running: Pending" 或 exec 超时。这里用无副作用的 `true` 命令补齐
 * 命令通道 ready 判定，避免后续 writeFiles/execute 抢跑。
 */
async function waitUntilSandboxCommandReady(
  sandbox: ISandbox,
  timeoutMs = SANDBOX_COMMAND_READY_TIMEOUT_MS,
  intervalMs = SANDBOX_COMMAND_READY_INTERVAL_MS
): Promise<void> {
  const startTime = Date.now();
  let lastError: unknown;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await sandbox.execute('true', {
        timeoutMs: SANDBOX_COMMAND_READY_PROBE_TIMEOUT_MS
      });
      if (result.exitCode === 0) return;

      const error = new Error(result.stderr || result.stdout || 'Sandbox command probe failed');
      lastError = error;
      if (!isSandboxCommandChannelNotReadyError(error)) {
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (!isSandboxCommandChannelNotReadyError(error)) {
        throw error;
      }
    }

    await sleep(intervalMs);
  }

  logger.warn('Sandbox command channel retry exhausted', {
    provider: sandbox.provider,
    sandboxId: sandbox.id,
    error: lastError
  });
  throw lastError;
}

function toOpenSandboxCreateConfig(
  createConfig?: SandboxCreateSpec
): OpenSandboxConfigType | undefined {
  return createConfig as OpenSandboxConfigType | undefined;
}

export function buildSandboxAdapter(
  providerConfig: SandboxProviderConfig,
  props: {
    sandboxId: string;
    createConfig?: SandboxCreateSpec;
  }
): ISandbox {
  switch (providerConfig.provider) {
    case 'opensandbox':
      return createSandbox(
        'opensandbox',
        {
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          runtime: providerConfig.runtime,
          useServerProxy: providerConfig.useServerProxy,
          replaceDockerInternalWithLocalhost:
            serviceEnv.SANDBOX_PROXY_REPLACE_DOCKER_INTERNAL_WITH_LOCALHOST,
          sessionId: props.sandboxId
        },
        toOpenSandboxCreateConfig(props.createConfig)
      );

    case 'sealosdevbox':
      return createSandbox(
        'sealosdevbox',
        {
          baseUrl: providerConfig.baseUrl,
          token: providerConfig.token,
          sandboxId: props.sandboxId
        },
        props.createConfig
      );

    default:
      return assertNever(providerConfig);
  }
}

export function buildSandboxAdapterForResource(
  providerConfig: SandboxProviderConfig,
  instance: {
    sandboxId: string;
  }
): ISandbox {
  return buildSandboxAdapter(providerConfig, {
    sandboxId: instance.sandboxId
  });
}

export async function connectToSandbox(
  providerConfig: SandboxProviderConfig,
  sandboxId: string
): Promise<ISandbox> {
  const sandbox = buildSandboxAdapter(providerConfig, {
    sandboxId
  });

  await ensureConnectedSandboxRunning(sandbox);

  return sandbox;
}

/**
 * 确保沙盒不仅处于 provider 的 Running 状态，也已经可以执行命令。
 *
 * 生命周期恢复交给 adapter.ensureRunning 处理，避免外层直接 getInfo 绕过
 * provider adapter 内部对临时网关错误（如 devbox 503/no healthy upstream）的重试。
 * Running 状态仍额外等待命令通道 ready，避免底层 Pod/exec 通道未就绪时抢跑。
 */
export async function ensureConnectedSandboxRunning(sandbox: ISandbox): Promise<void> {
  await sandbox.ensureRunning();
  await sandbox.waitUntilReady();
  if (sandbox.provider === 'sealosdevbox') {
    await waitUntilSandboxCommandReady(sandbox);
  }
}

/**
 * 读取 ready 沙盒的 provider metadata；如果 provider info 接口短暂异常，则返回最小可用信息。
 *
 * 沙盒是否可用由 ensureRunning/waitUntilReady 保证，getInfo 只用于补写镜像、
 * 创建时间等展示型 metadata。不能让 devbox 网关的临时 503 再次中断已就绪的主流程。
 */
export async function getReadySandboxInfo(
  sandbox: ISandbox,
  fallback: {
    sandboxId: string;
    image: SandboxInfo['image'];
    entrypoint?: SandboxInfo['entrypoint'];
    status?: SandboxInfo['status'];
    createdAt?: SandboxInfo['createdAt'];
  }
): Promise<SandboxInfo> {
  try {
    const sandboxInfo = await sandbox.getInfo();
    if (sandboxInfo) return sandboxInfo;
  } catch (error) {
    logger.warn('Failed to read ready sandbox info, using fallback metadata', {
      provider: sandbox.provider,
      sandboxId: fallback.sandboxId,
      error
    });
  }

  return {
    id: sandbox.id ?? fallback.sandboxId,
    image: fallback.image,
    entrypoint: fallback.entrypoint ?? [],
    status: fallback.status ?? sandbox.status,
    createdAt: fallback.createdAt ?? new Date()
  };
}

export async function connectReadySandboxByInstance(
  providerConfig: SandboxProviderConfig,
  instance: {
    sandboxId: string;
  }
): Promise<{
  sandbox: ISandbox;
  sandboxInfo: SandboxInfo;
}> {
  const sandbox = await connectToSandbox(providerConfig, instance.sandboxId);

  try {
    const sandboxInfo = await getReadySandboxInfo(sandbox, {
      sandboxId: instance.sandboxId,
      image: { repository: '' },
      status: sandbox.status
    });
    return {
      sandbox,
      sandboxInfo
    };
  } catch (error) {
    await disconnectSandbox(sandbox).catch(() => undefined);
    throw error;
  }
}

export async function disconnectSandbox(sandbox: ISandbox): Promise<void> {
  if (sandbox.provider === 'opensandbox') {
    await (sandbox as OpenSandboxAdapter).close();
  }
}

export class SandboxClient {
  private appId?: string;
  private userId?: string;
  private chatId?: string;
  private sandboxId: string;
  readonly provider: ISandbox;

  constructor(
    private readonly props: {
      sandboxId: string;
      appId?: string;
      userId?: string;
      chatId?: string;
    },
    private readonly opts: {
      resourceLimits?: ResourceLimits;
      vmConfig?: VolumeManagerResult | undefined;
      createConfig?: SandboxCreateSpec;
    }
  ) {
    this.sandboxId = props.sandboxId;
    this.appId = props.appId;
    this.userId = props.userId;
    this.chatId = props.chatId;

    const providerName = serviceEnv.AGENT_SANDBOX_PROVIDER;

    if (providerName === 'sealosdevbox') {
      const config = getSealosConnectionConfig(this.sandboxId);
      this.provider = createSandbox('sealosdevbox', config, opts?.createConfig);
    } else if (providerName === 'opensandbox') {
      // volumes always come from vmConfig (ensures PVC binding is correct);
      // custom createConfig takes priority for image/entrypoint/env/metadata
      this.provider = createSandbox(
        'opensandbox',
        getOpenSandboxConnectionConfig({ sessionId: this.sandboxId }),
        buildOpenSandboxCreateConfig({
          resourceLimits: opts?.resourceLimits,
          volumes: opts?.vmConfig?.volumes,
          createConfig: opts?.createConfig
        })
      );
    } else if (providerName === 'e2b') {
      if (!serviceEnv.AGENT_SANDBOX_E2B_API_KEY) {
        throw new Error('AGENT_SANDBOX_E2B_API_KEY required');
      }
      this.provider = createSandbox('e2b', {
        apiKey: serviceEnv.AGENT_SANDBOX_E2B_API_KEY,
        sandboxId: this.sandboxId
      });
    } else if (!providerName) {
      throw new Error(
        'AGENT_SANDBOX_PROVIDER is not configured. Please set it in your environment variables.'
      );
    } else {
      throw new Error(`Unsupported sandbox provider: ${serviceEnv.AGENT_SANDBOX_PROVIDER}`);
    }
  }

  async ensureAvailable() {
    await MongoSandboxInstance.findOneAndUpdate(
      { provider: this.provider.provider, sandboxId: this.sandboxId },
      {
        $set: {
          status: SandboxStatusEnum.running,
          lastActiveAt: new Date()
        },
        $setOnInsert: {
          ...(this.appId !== undefined ? { appId: this.appId } : {}),
          ...(this.userId !== undefined ? { userId: this.userId } : {}),
          ...(this.chatId !== undefined ? { chatId: this.chatId } : {}),
          storage: this.opts?.vmConfig?.storage,
          ...(this.opts?.resourceLimits && {
            limit: {
              cpuCount: this.opts?.resourceLimits?.cpuCount,
              memoryMiB: this.opts?.resourceLimits?.memoryMiB,
              diskGiB: this.opts?.resourceLimits?.diskGiB
            }
          }),
          metadata: {
            volumeEnabled: !!this.opts?.vmConfig
          },
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    await ensureConnectedSandboxRunning(this.provider);
  }

  getSandboxId() {
    return this.sandboxId;
  }

  async exec(command: string, timeout?: number): Promise<ExecuteResult> {
    try {
      await this.ensureAvailable();
    } catch (err) {
      logger.error('Failed to ensure sandbox available', { sandboxId: this.sandboxId, error: err });
      return {
        stdout: '',
        stderr: `Sandbox service is not available: ${getErrText(err)}`,
        exitCode: -1
      };
    }

    return await this.provider
      .execute(command, {
        timeoutMs: timeout ? timeout * 1000 : undefined
      })
      .catch((err: unknown) => {
        logger.error('Failed to execute sandbox', { sandboxId: this.sandboxId, error: err });
        return {
          stdout: '',
          stderr: `Failed to execute sandbox: ${getErrText(err)}`,
          exitCode: -1
        };
      });
  }

  async delete() {
    await this.provider.delete();
    await deleteSessionVolume(this.sandboxId).catch((err) => {
      logger.error('Failed to delete sandbox volume', { sandboxId: this.sandboxId, error: err });
    });
    await MongoSandboxInstance.deleteOne({
      provider: this.provider.provider,
      sandboxId: this.sandboxId
    });
  }

  async stop() {
    await this.provider.stop();
    await MongoSandboxInstance.updateOne(
      { provider: this.provider.provider, sandboxId: this.sandboxId },
      { $set: { status: SandboxStatusEnum.stopped } }
    );
  }

  private static buildSandboxForResource(doc: SandboxResourceDoc): ISandbox {
    if (doc.provider === 'e2b') {
      if (!serviceEnv.AGENT_SANDBOX_E2B_API_KEY) {
        throw new Error('AGENT_SANDBOX_E2B_API_KEY required');
      }
      return createSandbox('e2b', {
        apiKey: serviceEnv.AGENT_SANDBOX_E2B_API_KEY,
        sandboxId: doc.sandboxId
      });
    }

    const providerConfig = getSandboxProviderConfig(doc.provider);
    return buildSandboxAdapterForResource(providerConfig, doc);
  }

  static async deleteResource(doc: SandboxResourceDoc) {
    const sandbox = SandboxClient.buildSandboxForResource(doc);

    await sandbox.delete();
    await deleteSessionVolume(doc.sandboxId).catch((err) => {
      logger.error('Failed to delete sandbox volume', { sandboxId: doc.sandboxId, error: err });
    });
    await MongoSandboxInstance.deleteOne({ _id: doc._id });
  }

  static async stopResource(doc: SandboxResourceDoc) {
    const sandbox = SandboxClient.buildSandboxForResource(doc);

    await sandbox.stop();
    await MongoSandboxInstance.updateOne(
      { _id: doc._id },
      { $set: { status: SandboxStatusEnum.stopped } }
    );
  }
}

export const getSandboxClient = async (
  props:
    | {
        sandboxId: string;
      }
    | UnionIdType,
  opts: {
    resourceLimits?: ResourceLimits;
    createConfig?: SandboxCreateSpec;
  } = {}
) => {
  const sandboxId = (() => {
    if ('sandboxId' in props) {
      return props.sandboxId;
    }

    const sandboxUserId = props.chatId === 'edit-debug' ? '' : props.userId;
    return generateSandboxId(props.appId, sandboxUserId, props.chatId);
  })();

  const vmConfig = await getVolumeManagerConfig(sandboxId);

  const sandbox = new SandboxClient({ ...props, sandboxId }, { ...opts, vmConfig });
  await sandbox.ensureAvailable();
  return sandbox;
};

// ==== Delete Sandboxes ====
export const deleteSandboxesByChatIds = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds: string[];
}) => {
  const instances = await MongoSandboxInstance.find({ appId, chatId: { $in: chatIds } }).lean();
  if (!instances.length) return;

  await Promise.allSettled(
    instances.map(async (doc) => {
      await SandboxClient.deleteResource(doc).catch((err) => {
        logger.error('Failed to delete sandbox', { sandboxId: doc.sandboxId, error: err });
        return Promise.reject(err);
      });
    })
  );
};
export const deleteSandboxesByAppId = async (appId: string) => {
  const instances = await MongoSandboxInstance.find({ appId }).lean();
  if (!instances.length) return;

  await Promise.allSettled(
    instances.map(async (doc) => {
      await SandboxClient.deleteResource(doc).catch((err) => {
        logger.error('Failed to delete sandbox', { sandboxId: doc.sandboxId, error: err });
      });
    })
  );
};

// 5 分钟检查一遍，暂停
export const cronJob = async () => {
  setCron('*/5 * * * *', async () => {
    const instances = await MongoSandboxInstance.find({
      status: SandboxStatusEnum.running,
      lastActiveAt: { $lt: subMinutes(new Date(), SANDBOX_SUSPEND_MINUTES) }
    }).lean();
    if (!instances.length) return;

    logger.info('Found running sandboxes inactive > 5 min', { count: instances.length });

    await batchRun(instances, async (doc) => {
      await SandboxClient.stopResource(doc).catch((err) => {
        logger.error('Failed to stop sandbox', { sandboxId: doc.sandboxId, error: err });
      });
    });
  });
};
