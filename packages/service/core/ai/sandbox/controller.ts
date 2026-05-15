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
  type ResourceLimits,
  type SandboxCreateSpec
} from '@fastgpt-sdk/sandbox-adapter';
import {
  getOpenSandboxConnectionConfig,
  getSealosConnectionConfig,
  buildOpenSandboxCreateConfig,
  getVolumeManagerConfig,
  deleteSessionVolume,
  type VolumeManagerResult
} from './config';
import { buildSandboxAdapterForResource, getSandboxProviderConfig } from './provider';
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
          ...(this.appId ? { appId: this.appId } : {}),
          ...(this.userId ? { userId: this.userId } : {}),
          ...(this.chatId ? { chatId: this.chatId } : {}),
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
    await this.provider.ensureRunning();
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
    await MongoSandboxInstance.deleteOne({ sandboxId: this.sandboxId });
  }

  async stop() {
    await this.provider.stop();
    await MongoSandboxInstance.updateOne(
      { sandboxId: this.sandboxId },
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
