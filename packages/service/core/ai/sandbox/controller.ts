import {
  generateSandboxId,
  SandboxStatusEnum,
  SANDBOX_SUSPEND_MINUTES
} from '@fastgpt/global/core/ai/sandbox/constants';
import { env } from '../../../env';
import { MongoSandboxInstance } from './schema';
import {
  createSandbox,
  type ExecuteResult,
  type ISandbox,
  type ResourceLimits
} from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../common/logger';
import { setCron } from '../../../common/system/cron';
import { subMinutes } from 'date-fns';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
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
    props:
      | {
          sandboxId: string;
        }
      | UnionIdType,
    opts: {
      resourceLimits?: ResourceLimits;
    } = {}
  ) {
    if ('sandboxId' in props) {
      this.sandboxId = props.sandboxId;
    } else {
      this.appId = props.appId;
      this.userId = props.userId;
      this.chatId = props.chatId;
      this.sandboxId = generateSandboxId(this.appId, this.userId, this.chatId);
    }

    const providerName = env.AGENT_SANDBOX_PROVIDER;

    const params = (() => {
      if (providerName === 'sealosdevbox') {
        if (!env.AGENT_SANDBOX_SEALOS_BASEURL || !env.AGENT_SANDBOX_SEALOS_TOKEN) {
          throw new Error('AGENT_SANDBOX_SEALOS_BASEURL / AGENT_SANDBOX_SEALOS_TOKEN required');
        }
        return {
          provider: 'sealosdevbox' as const,
          config: {
            baseUrl: env.AGENT_SANDBOX_SEALOS_BASEURL,
            token: env.AGENT_SANDBOX_SEALOS_TOKEN,
            sandboxId: this.sandboxId
          },
          createConfig: undefined
        };
      } else if (providerName === 'opensandbox') {
        return {
          provider: 'opensandbox' as const,
          config: {
            baseUrl: env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
            token: env.AGENT_SANDBOX_OPENSANDBOX_TOKEN,
            sandboxId: this.sandboxId
          }
        };
      } else if (providerName === 'e2b') {
        return {
          provider: 'e2b' as const,
          config: {
            apiKey: env.AGENT_SANDBOX_E2B_API_KEY,
            sandboxId: this.sandboxId
          }
        };
      } else if (!providerName) {
        throw new Error(
          'AGENT_SANDBOX_PROVIDER is not configured. Please set it in your environment variables.'
        );
      } else {
        throw new Error(`Unsupported sandbox provider: ${env.AGENT_SANDBOX_PROVIDER}`);
      }
    })();
    this.provider = createSandbox(params.provider, params.config, params.createConfig);
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
      .catch((err) => {
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
    await MongoSandboxInstance.deleteOne({ sandboxId: this.sandboxId });
  }

  async stop() {
    await this.provider.stop();
    await MongoSandboxInstance.updateOne(
      { sandboxId: this.sandboxId },
      { $set: { status: SandboxStatusEnum.stoped } }
    );
  }
}

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
    instances.map((doc) =>
      new SandboxClient({
        sandboxId: doc.sandboxId
      })
        .delete()
        .catch((err) => {
          logger.error('Failed to delete sandbox', { sandboxId: doc.sandboxId, error: err });
        })
    )
  );
};
export const deleteSandboxesByAppId = async (appId: string) => {
  const instances = await MongoSandboxInstance.find({ appId }).lean();
  if (!instances.length) return;

  await Promise.allSettled(
    instances.map((doc) =>
      new SandboxClient({
        sandboxId: doc.sandboxId
      }).delete()
    )
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

    await batchRun(instances, (doc) =>
      new SandboxClient({
        sandboxId: doc.sandboxId
      })
        .stop()
        .catch((error) => {
          logger.error('Failed to stop sandbox', { sandboxId: doc.sandboxId, error });
        })
    );
  });
};
