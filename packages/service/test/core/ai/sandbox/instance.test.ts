import { beforeEach, describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  findSandboxResourcesByAppChatTypeExcludeProvider,
  updateSandboxInstanceEndpoint
} from '@fastgpt/service/core/ai/sandbox/instance';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxProtocolEnum, SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

describe('sandbox instance helpers', () => {
  beforeEach(async () => {
    await MongoSandboxInstance.deleteMany({ sandboxId: /^instance-helper-/ });
  });

  it('marks reused sandbox as running when endpoint is refreshed', async () => {
    const lastActiveAt = new Date(Date.now() - 60_000);
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `instance-helper-${getNanoid()}`,
      appId: getNanoid(),
      userId: getNanoid(),
      chatId: getNanoid(),
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.stopped,
      lastActiveAt,
      createdAt: new Date(),
      metadata: {
        teamId: getNanoid(),
        tmbId: getNanoid(),
        skillId: getNanoid(),
        provider: 'opensandbox',
        image: { repository: 'test-image' }
      }
    });
    const endpoint = {
      host: 'sandbox.local',
      port: 8080,
      protocol: SandboxProtocolEnum.http,
      url: 'http://sandbox.local:8080'
    };

    await updateSandboxInstanceEndpoint({
      instanceId: doc._id,
      endpoint
    });

    const updated = await MongoSandboxInstance.findById(doc._id).lean();
    expect(updated).toMatchObject({
      status: SandboxStatusEnum.running,
      metadata: {
        endpoint
      }
    });
    expect(updated?.lastActiveAt.getTime()).toBeGreaterThan(lastActiveAt.getTime());
  });

  it('finds stale app-chat sandbox records from inactive providers only', async () => {
    const appId = `instance-helper-${getNanoid()}`;
    const chatId = 'edit-debug';
    const oldProviderDoc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `instance-helper-${getNanoid()}`,
      appId,
      userId: getNanoid(),
      chatId,
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {
        teamId: getNanoid(),
        tmbId: getNanoid(),
        skillId: appId,
        provider: 'opensandbox',
        image: { repository: 'old-image' }
      }
    });
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `instance-helper-${getNanoid()}`,
      appId,
      userId: getNanoid(),
      chatId: 'normal-chat',
      type: SandboxTypeEnum.sessionRuntime,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {
        teamId: getNanoid(),
        tmbId: getNanoid(),
        provider: 'opensandbox',
        image: { repository: 'runtime-image' }
      }
    });

    const staleRecords = await findSandboxResourcesByAppChatTypeExcludeProvider({
      provider: 'sealosdevbox',
      appId,
      chatId,
      type: SandboxTypeEnum.editDebug
    });

    expect(staleRecords.map((item) => String(item._id))).toEqual([String(oldProviderDoc._id)]);
  });
});
