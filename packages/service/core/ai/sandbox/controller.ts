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
  type SandboxCreateSpec,
  type SandboxProxyTarget
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
import type { SkillSandboxEndpointType } from '@fastgpt/global/core/agentSkills/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

type UnionIdType = {
  appId: string;
  userId: string;
  chatId: string;
};

type CodeServerProxyTarget = Extract<SandboxProxyTarget, { service: 'code-server' }>;
type SandboxInfo = NonNullable<Awaited<ReturnType<ISandbox['getInfo']>>>;

const buildSandboxProxyRevision = (endpoint: SkillSandboxEndpointType): string =>
  hashStr(endpoint.url).slice(0, 16);

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
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
 * 部分 provider 会先把资源状态置为 Running，但底层 Pod/exec 通道仍可能处于 Pending；
 * 如果此时立刻写文件或执行命令，会出现 "pod is not running: Pending" 这类抢跑错误。
 */
export async function ensureConnectedSandboxRunning(sandbox: ISandbox): Promise<void> {
  const info = await sandbox.getInfo();
  if (!info) {
    await sandbox.ensureRunning();
    await sandbox.waitUntilReady();
    return;
  }

  if (info.status.state === 'Stopped' || info.status.state === 'Stopping') {
    await sandbox.start();
    await sandbox.waitUntilReady();
    return;
  }

  if (['Deleting', 'UnExist', 'Error'].includes(info.status.state)) {
    throw new Error(`Provider sandbox ${sandbox.id ?? info.id} is ${info.status.state}`);
  }

  // Running/Creating/Starting 都必须再等命令通道 ready，避免状态与 Pod 实际可执行状态不一致。
  await sandbox.waitUntilReady();
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
    const sandboxInfo = await sandbox.getInfo();
    if (!sandboxInfo) {
      throw new Error('Sandbox not found');
    }
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

export async function getSandboxEndpoint(sandbox: ISandbox): Promise<SkillSandboxEndpointType> {
  const endpointResolver = sandbox as unknown as {
    getEndpoint?: (selector: 'code-server') => Promise<SkillSandboxEndpointType>;
  };

  if (!endpointResolver.getEndpoint) {
    throw new Error(
      `Sandbox provider "${sandbox.provider}" does not expose endpoint capability through @fastgpt/sandbox. This edit-debug workflow currently requires opensandbox-compatible endpoint support.`
    );
  }

  const endpoint = await endpointResolver.getEndpoint('code-server');
  return {
    host: endpoint.host,
    port: endpoint.port,
    protocol: endpoint.protocol,
    url: endpoint.url,
    proxyRevision: buildSandboxProxyRevision(endpoint)
  };
}

export async function getSandboxCodeServerProxyTarget(
  sandbox: ISandbox
): Promise<CodeServerProxyTarget> {
  const proxyResolver = sandbox as unknown as {
    getProxyTarget?: (service: 'code-server') => Promise<CodeServerProxyTarget>;
  };

  if (!proxyResolver.getProxyTarget) {
    throw new Error(
      `Sandbox provider "${sandbox.provider}" does not expose proxy target capability through @fastgpt/sandbox.`
    );
  }

  return proxyResolver.getProxyTarget('code-server');
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
    } else {
      return generateSandboxId(props.appId, props.userId, props.chatId);
    }
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
