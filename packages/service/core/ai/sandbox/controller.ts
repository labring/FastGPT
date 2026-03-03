import {
  generateSandboxId,
  SandboxStatusEnum,
  SANDBOX_SUSPEND_MINUTES,
  AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_SEALOS_BASEURL,
  AGENT_SANDBOX_SEALOS_TOKEN
} from '@fastgpt/global/core/ai/sandbox/constants';
import { MongoSandboxInstance } from './schema';
import { SealosDevboxAdapter, type ExecuteResult } from '@fastgpt-sdk/sandbox-adapter';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../../common/logger';
import { setCron } from '../../../common/system/cron';
import { addMilliseconds } from 'date-fns';
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

type UnionIdType = {
  appId: string;
  userId: string;
  chatId: string;
};

export class SandboxInstance extends SealosDevboxAdapter {
  private appId: string;
  private userId: string;
  private chatId: string;
  private sandboxId: string;

  constructor(params: UnionIdType) {
    if (AGENT_SANDBOX_PROVIDER !== 'sealos-devbox') {
      throw new Error(`Unsupported sandbox provider: ${AGENT_SANDBOX_PROVIDER}`);
    }
    if (!AGENT_SANDBOX_SEALOS_BASEURL || !AGENT_SANDBOX_SEALOS_TOKEN) {
      throw new Error('AGENT_SANDBOX_SEALOS_BASEURL / AGENT_SANDBOX_SEALOS_TOKEN required');
    }

    super({
      baseUrl: AGENT_SANDBOX_SEALOS_BASEURL,
      token: AGENT_SANDBOX_SEALOS_TOKEN,
      sandboxId: generateSandboxId(params.appId, params.userId, params.chatId)
    });

    this.appId = params.appId;
    this.userId = params.userId;
    this.chatId = params.chatId;
    this.sandboxId = generateSandboxId(this.appId, this.userId, this.chatId);
  }

  async ensureAvailable() {
    await mongoSessionRun(async (session) => {
      await MongoSandboxInstance.findOneAndUpdate(
        { sandboxId: this.sandboxId },
        {
          $set: { status: SandboxStatusEnum.running, lastActiveAt: new Date() },
          $setOnInsert: {
            appId: this.appId,
            userId: this.userId,
            chatId: this.chatId,
            createdAt: new Date()
          }
        },
        { upsert: true, session }
      );
      await this.create({ image: { repository: 'ubuntu', tag: '22.04' } });
    });
  }

  async exec(command: string, timeout?: number): Promise<ExecuteResult> {
    try {
      await this.ensureAvailable();
    } catch {
      return {
        stdout: '',
        stderr: 'Sandbox service is not available, please try again later',
        exitCode: -1
      };
    }

    return await this.execute(command, {
      timeoutMs: timeout ? timeout * 1000 : undefined
    });
  }

  async delete() {
    await mongoSessionRun(async (session) => {
      await MongoSandboxInstance.deleteOne({ sandboxId: this.sandboxId }, { session });
      await super.delete();
    });
  }

  async stop() {
    await mongoSessionRun(async (session) => {
      await MongoSandboxInstance.updateOne(
        { sandboxId: this.sandboxId },
        { $set: { status: SandboxStatusEnum.stoped } },
        { session }
      );
      await super.stop();
    });
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
      new SandboxInstance({
        appId: doc.appId,
        userId: doc.userId,
        chatId: doc.chatId
      }).delete()
    )
  );
};
export const deleteSandboxesByAppId = async (appId: string) => {
  const instances = await MongoSandboxInstance.find({ appId }).lean();
  if (!instances.length) return;

  await Promise.allSettled(
    instances.map((doc) =>
      new SandboxInstance({
        appId: doc.appId,
        userId: doc.userId,
        chatId: doc.chatId
      }).delete()
    )
  );
};

// 5 分钟检查一遍，暂停
export const cronJob = async () => {
  setCron('*/5 * * * *', async () => {
    const instances = await MongoSandboxInstance.find({
      status: SandboxStatusEnum.running,
      lastActiveAt: { $lt: addMilliseconds(new Date(), -SANDBOX_SUSPEND_MINUTES * 60 * 1000) }
    }).lean();
    if (!instances.length) return;

    logger.info('Found running sandboxes inactive > 5 min', { count: instances.length });

    await Promise.allSettled(
      instances.map((doc) =>
        new SandboxInstance({
          appId: doc.appId,
          userId: doc.userId,
          chatId: doc.chatId
        }).stop()
      )
    );
  });
};
