import { beforeEach, describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import {
  buildSandboxInstanceLookup,
  countRunningSandboxInstancesByType,
  createSandboxResourcesToArchiveCursor,
  deleteSandboxInstanceRecord,
  deleteSandboxResourceRecord,
  findInactiveRunningSandboxResources,
  findSandboxAppIdBySandboxId,
  findSandboxInstanceByAppChatType,
  findSandboxInstanceBySandboxId,
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesByAppChatType,
  findSandboxResourcesByAppChatTypeExcludeProvider,
  findSandboxResourcesByAppId,
  findSandboxResourcesByChatIds,
  findSkillRelatedSandboxResources,
  isSandboxStillArchiving,
  markSandboxArchived,
  markSandboxArchiving,
  migrateArchivedSandboxInstanceRecord,
  markSandboxRestored,
  markSandboxRestoring,
  markSandboxResourceStopped,
  updateSandboxInstanceRecordBySandboxId,
  upsertRunningSandboxInstance,
  type SandboxResourceDoc
} from '@fastgpt/service/core/ai/sandbox/instance/repository';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

const collectArchiveCursor = async (
  params: Parameters<typeof createSandboxResourcesToArchiveCursor>[0]
) => {
  const cursor = createSandboxResourcesToArchiveCursor(params);
  const resources: SandboxResourceDoc[] = [];

  try {
    for await (const resource of cursor) {
      resources.push(resource);
    }
  } finally {
    await cursor.close();
  }

  return resources;
};

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
      findSandboxInstanceBySandboxId({
        provider: 'opensandbox',
        sandboxId,
        appId,
        type: SandboxTypeEnum.editDebug
      })
    ).resolves.toMatchObject({ sandboxId });
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

  it('migrates archived records to the current provider without deleting archive metadata', async () => {
    const appId = `instance-helper-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      appId,
      userId: 'user-1',
      chatId: 'record-only-chat',
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.stopped,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    });

    const migratedDoc = await migrateArchivedSandboxInstanceRecord({
      source: {
        provider: 'opensandbox',
        sandboxId,
        _id: doc._id
      },
      provider: 'sealosdevbox',
      appId,
      userId: '',
      chatId: 'record-only-chat',
      type: SandboxTypeEnum.editDebug
    });

    expect(migratedDoc).toMatchObject({
      provider: 'sealosdevbox',
      sandboxId,
      appId,
      userId: '',
      chatId: 'record-only-chat',
      status: SandboxStatusEnum.stopped,
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    });
    const migratedExists = await MongoSandboxInstance.exists({ _id: doc._id });
    expect(String(migratedExists?._id)).toBe(String(doc._id));
    await expect(MongoSandboxInstance.countDocuments({ sandboxId })).resolves.toBe(1);
  });

  it('moves archived metadata into an existing current-provider placeholder record', async () => {
    const appId = `instance-helper-${getNanoid()}`;
    const chatId = `placeholder-chat-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;
    const oldDoc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      appId,
      userId: 'user-1',
      chatId,
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.stopped,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {
        archive: {
          state: 'archived'
        },
        skillId: appId
      }
    });
    const placeholderDoc = await MongoSandboxInstance.create({
      provider: 'sealosdevbox',
      sandboxId,
      appId: `placeholder-${appId}`,
      userId: '',
      chatId: `placeholder-${chatId}`,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {
        volumeEnabled: false
      }
    });

    const migratedDoc = await migrateArchivedSandboxInstanceRecord({
      source: {
        provider: 'opensandbox',
        sandboxId,
        _id: oldDoc._id
      },
      provider: 'sealosdevbox',
      appId,
      userId: '',
      chatId,
      type: SandboxTypeEnum.editDebug
    });

    expect(String(migratedDoc?._id)).toBe(String(placeholderDoc._id));
    expect(migratedDoc).toMatchObject({
      provider: 'sealosdevbox',
      sandboxId,
      appId,
      userId: '',
      chatId,
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.stopped,
      metadata: {
        archive: {
          state: 'archived'
        },
        skillId: appId
      }
    });
    await expect(MongoSandboxInstance.exists({ _id: oldDoc._id })).resolves.toBeNull();
  });

  it('archives inactive stopped records and restores them into the current provider', async () => {
    const inactiveBefore = new Date('2026-02-01T00:00:00.000Z');
    const sandboxId = `instance-helper-${getNanoid()}`;
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      appId: `instance-helper-${getNanoid()}`,
      userId: 'user-1',
      chatId: 'archive-chat',
      type: SandboxTypeEnum.sessionRuntime,
      status: SandboxStatusEnum.stopped,
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date(),
      metadata: {
        image: { repository: 'image' }
      }
    });

    await expect(collectArchiveCursor({ inactiveBefore })).resolves.toEqual([
      expect.objectContaining({ sandboxId })
    ]);

    const archiving = await markSandboxArchiving(doc, inactiveBefore);
    expect(archiving).toMatchObject({
      sandboxId,
      metadata: {
        archive: {
          state: 'archiving'
        }
      }
    });
    await expect(isSandboxStillArchiving(archiving!, inactiveBefore)).resolves.toBe(true);
    await expect(
      upsertRunningSandboxInstance({
        provider: doc.provider,
        sandboxId
      })
    ).resolves.toBeNull();

    await markSandboxArchived(doc);
    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      status: SandboxStatusEnum.stopped,
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    });

    await expect(collectArchiveCursor({ inactiveBefore })).resolves.not.toContainEqual(
      expect.objectContaining({ sandboxId })
    );

    const restoringDoc = await markSandboxRestoring(doc);
    expect(restoringDoc).toMatchObject({
      metadata: {
        archive: {
          state: 'restoring'
        }
      }
    });

    const restoredDoc = await markSandboxRestored(doc, {
      appId: doc.appId,
      userId: 'user-1',
      chatId: 'restore-provider-chat',
      metadata: {
        volumeEnabled: false
      }
    });

    expect(restoredDoc).toMatchObject({
      provider: 'opensandbox',
      status: SandboxStatusEnum.running,
      metadata: {
        volumeEnabled: false
      }
    });
    const stored = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(stored?.provider).toBe('opensandbox');
    expect(stored?.metadata?.archive).toBeUndefined();
    expect(stored?.metadata?.provider).toBeUndefined();
    expect(stored?.storage).toBeUndefined();
  });

  it('streams archive candidates by lastActiveAt descending', async () => {
    const inactiveBefore = new Date('2026-02-01T00:00:00.000Z');
    const appId = `instance-helper-${getNanoid()}`;
    const [olderDoc, newerDoc] = await MongoSandboxInstance.create([
      {
        provider: 'opensandbox',
        sandboxId: `instance-helper-${getNanoid()}`,
        appId,
        userId: 'user-1',
        chatId: 'archive-old-chat',
        type: SandboxTypeEnum.sessionRuntime,
        status: SandboxStatusEnum.stopped,
        lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date(),
        metadata: {
          image: { repository: 'image' }
        }
      },
      {
        provider: 'opensandbox',
        sandboxId: `instance-helper-${getNanoid()}`,
        appId,
        userId: 'user-1',
        chatId: 'archive-new-chat',
        type: SandboxTypeEnum.sessionRuntime,
        status: SandboxStatusEnum.stopped,
        lastActiveAt: new Date('2026-01-20T00:00:00.000Z'),
        createdAt: new Date(),
        metadata: {
          image: { repository: 'image' }
        }
      },
      {
        provider: 'opensandbox',
        sandboxId: `instance-helper-${getNanoid()}`,
        appId,
        userId: 'user-1',
        chatId: 'archive-active-chat',
        type: SandboxTypeEnum.sessionRuntime,
        status: SandboxStatusEnum.stopped,
        lastActiveAt: new Date('2026-02-20T00:00:00.000Z'),
        createdAt: new Date(),
        metadata: {
          image: { repository: 'image' }
        }
      }
    ]);

    const resources = await collectArchiveCursor({
      inactiveBefore,
      providers: ['opensandbox']
    });

    expect(resources.map((item) => item.sandboxId)).toEqual([
      newerDoc.sandboxId,
      olderDoc.sandboxId
    ]);
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
