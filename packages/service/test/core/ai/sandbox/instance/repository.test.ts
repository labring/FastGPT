import { beforeEach, describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import {
  buildSandboxInstanceLookup,
  countRunningSandboxInstancesByType,
  deleteSandboxInstanceRecord,
  deleteSandboxResourceRecord,
  findInactiveRunningSandboxResources,
  findSandboxAppIdBySandboxId,
  findSandboxInstanceByAppChatType,
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesByAppChatType,
  findSandboxResourcesByAppChatTypeExcludeProvider,
  findSandboxResourcesByAppId,
  findSandboxResourcesByChatIds,
  findSkillRelatedSandboxResources,
  markSandboxResourceStopped,
  updateSandboxInstanceRecordBySandboxId,
  upsertRunningSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/instance/repository';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

describe('sandbox instance helpers', () => {
  beforeEach(async () => {
    await MongoSandboxInstance.deleteMany({ sandboxId: /^instance-helper-/ });
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

  it('builds lookup by sandbox id and object id', () => {
    const objectId = String(new MongoSandboxInstance()._id);

    expect(buildSandboxInstanceLookup('plain-id')).toEqual({ $or: [{ sandboxId: 'plain-id' }] });
    expect(buildSandboxInstanceLookup(objectId)).toEqual({
      $or: [{ sandboxId: objectId }, { _id: objectId }]
    });
  });

  it('upserts running instance and supports common repository queries', async () => {
    const appId = `instance-helper-${getNanoid()}`;
    const chatId = `chat-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;
    const teamId = getNanoid();
    const skillId = getNanoid();

    await upsertRunningSandboxInstance({
      provider: 'opensandbox',
      sandboxId,
      appId,
      userId: 'user-1',
      chatId,
      storage: { mountPath: '/workspace' },
      limit: { cpuCount: 1 },
      metadata: {
        teamId,
        skillId,
        image: { repository: 'image' }
      }
    });

    const doc = await MongoSandboxInstance.findOne({ sandboxId });
    expect(doc).toMatchObject({
      provider: 'opensandbox',
      appId,
      userId: 'user-1',
      chatId,
      status: SandboxStatusEnum.running
    });

    await expect(
      findSandboxInstanceByAppChatType({
        provider: 'opensandbox',
        appId,
        chatId,
        type: SandboxTypeEnum.editDebug
      })
    ).resolves.toBeNull();

    await updateSandboxInstanceRecordBySandboxId({
      provider: 'opensandbox',
      sandboxId,
      type: SandboxTypeEnum.editDebug,
      metadata: {
        teamId,
        skillId,
        image: { repository: 'updated' }
      }
    });

    await expect(
      countRunningSandboxInstancesByType(SandboxTypeEnum.editDebug, 'opensandbox')
    ).resolves.toBe(1);
    await expect(findSandboxResourcesByChatIds({ appId, chatIds: [chatId] })).resolves.toHaveLength(
      1
    );
    await expect(findSandboxResourcesByAppId(appId)).resolves.toHaveLength(1);
    await expect(findSandboxAppIdBySandboxId(sandboxId)).resolves.toBe(appId);
    await expect(findSandboxAppIdBySandboxId(`instance-helper-${getNanoid()}`)).resolves.toBe(
      undefined
    );
    await expect(
      findSandboxResourcesByAppChatType({
        provider: 'opensandbox',
        appId,
        chatId,
        type: SandboxTypeEnum.editDebug
      })
    ).resolves.toHaveLength(1);
    await expect(
      findSandboxInstanceBySandboxIdAndTeam({
        provider: 'opensandbox',
        sandboxId,
        teamId
      })
    ).resolves.toMatchObject({ sandboxId });
    await expect(
      findSandboxResourceBySandboxIdAndTeam({
        provider: 'opensandbox',
        sandboxId,
        teamId
      })
    ).resolves.toMatchObject({ sandboxId });
    await expect(findSkillRelatedSandboxResources([skillId])).resolves.toHaveLength(1);

    await markSandboxResourceStopped({ provider: 'opensandbox', sandboxId });
    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      status: SandboxStatusEnum.stopped
    });

    await deleteSandboxResourceRecord({ provider: 'opensandbox', sandboxId });
    await expect(MongoSandboxInstance.countDocuments({ sandboxId })).resolves.toBe(0);
  });

  it('finds inactive running resources and deletes records by id', async () => {
    const appId = `instance-helper-${getNanoid()}`;
    const inactiveDoc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `instance-helper-${getNanoid()}`,
      appId,
      userId: 'user-1',
      chatId: 'inactive-chat',
      type: SandboxTypeEnum.sessionRuntime,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date(),
      metadata: {
        image: { repository: 'image' }
      }
    });
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `instance-helper-${getNanoid()}`,
      appId,
      userId: 'user-1',
      chatId: 'active-chat',
      type: SandboxTypeEnum.sessionRuntime,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date('2026-12-01T00:00:00.000Z'),
      createdAt: new Date(),
      metadata: {
        image: { repository: 'image' }
      }
    });

    const inactive = await findInactiveRunningSandboxResources(
      new Date('2026-02-01T00:00:00.000Z')
    );
    expect(inactive.map((item) => item.sandboxId)).toEqual([inactiveDoc.sandboxId]);

    await deleteSandboxInstanceRecord(inactiveDoc._id);
    await expect(MongoSandboxInstance.exists({ _id: inactiveDoc._id })).resolves.toBeNull();
  });

  it('supports repository optional provider and update branches', async () => {
    const appId = `instance-helper-${getNanoid()}`;
    const chatId = `chat-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;
    const teamId = getNanoid();

    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      appId,
      userId: 'user-1',
      chatId,
      type: SandboxTypeEnum.sessionRuntime,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {
        teamId
      }
    });

    await expect(
      findSandboxInstanceByAppChatType({
        appId,
        chatId,
        type: SandboxTypeEnum.sessionRuntime,
        status: SandboxStatusEnum.running
      })
    ).resolves.toMatchObject({ sandboxId });
    await expect(
      findSandboxResourcesByAppChatType({
        appId,
        chatId,
        type: SandboxTypeEnum.sessionRuntime
      })
    ).resolves.toHaveLength(1);
    expect(
      await countRunningSandboxInstancesByType(SandboxTypeEnum.sessionRuntime)
    ).toBeGreaterThan(0);

    await updateSandboxInstanceRecordBySandboxId({
      sandboxId,
      appId: `${appId}-updated`,
      userId: 'user-2',
      chatId: `${chatId}-updated`
    });

    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      appId: `${appId}-updated`,
      userId: 'user-2',
      chatId: `${chatId}-updated`,
      type: SandboxTypeEnum.sessionRuntime,
      metadata: {
        teamId
      }
    });
    await expect(
      findSandboxInstanceBySandboxIdAndTeam({
        sandboxId,
        teamId
      })
    ).resolves.toMatchObject({ sandboxId });
    await expect(
      findSandboxResourceBySandboxIdAndTeam({
        sandboxId,
        teamId
      })
    ).resolves.toMatchObject({ sandboxId });

    const doc = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    await deleteSandboxResourceRecord({
      provider: 'opensandbox',
      sandboxId,
      _id: doc?._id
    });
    await expect(MongoSandboxInstance.exists({ sandboxId })).resolves.toBeNull();
  });
});
