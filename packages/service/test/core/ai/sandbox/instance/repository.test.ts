import { beforeEach, describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import {
  countRunningSandboxInstancesByType,
  createSandboxResourcesToArchiveCursor,
  deleteSandboxInstanceRecord,
  deleteSandboxResourceRecord,
  findInactiveRunningSandboxResources,
  findSandboxInstanceBySourceChatType,
  findSandboxInstanceBySandboxId,
  findSandboxInstanceBySandboxIdAndSource,
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesBySourceChatType,
  findSandboxResourcesBySourceChatTypeExcludeProvider,
  findSandboxResourcesBySource,
  findSandboxResourcesBySourceChatIds,
  findSkillRelatedSandboxResources,
  isSandboxStillArchiving,
  clearSandboxRuntimeUpgradeArchiveState,
  markSandboxArchived,
  markSandboxArchiving,
  markSandboxArchivingForRuntimeUpgrade,
  migrateArchivedSandboxInstanceRecord,
  markSandboxRestored,
  markSandboxRestoring,
  markSandboxResourceStopped,
  updateSandboxInstanceRecordBySandboxId,
  upsertRunningSandboxInstance,
  type SandboxResourceDoc
} from '@fastgpt/service/core/ai/sandbox/instance/repository';
import { SandboxStatusEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: getNanoid(),
      chatId,
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {
        teamId: getNanoid(),
        tmbId: getNanoid(),
        provider: 'opensandbox',
        image: { repository: 'old-image' }
      }
    });
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `instance-helper-${getNanoid()}`,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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

    const staleRecords = await findSandboxResourcesBySourceChatTypeExcludeProvider({
      provider: 'sealosdevbox',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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

    await upsertRunningSandboxInstance({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: 'user-1',
      chatId,
      storage: { mountPath: '/workspace' },
      limit: { cpuCount: 1 },
      metadata: {
        teamId,
        image: { repository: 'image' }
      }
    });

    const doc = await MongoSandboxInstance.findOne({ sandboxId });
    expect(doc).toMatchObject({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: 'user-1',
      chatId,
      status: SandboxStatusEnum.running
    });
    expect(doc?.appId).toBeUndefined();

    await expect(
      findSandboxInstanceBySourceChatType({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatId,
        type: SandboxTypeEnum.editDebug
      })
    ).resolves.toBeNull();

    await updateSandboxInstanceRecordBySandboxId({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      type: SandboxTypeEnum.editDebug,
      metadata: {
        teamId,
        image: { repository: 'updated' }
      }
    });

    await expect(
      countRunningSandboxInstancesByType(SandboxTypeEnum.editDebug, 'opensandbox')
    ).resolves.toBe(1);
    await expect(
      findSandboxResourcesBySourceChatIds({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatIds: [chatId]
      })
    ).resolves.toHaveLength(1);
    await expect(
      findSandboxResourcesBySource({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId
      })
    ).resolves.toHaveLength(1);
    await expect(
      findSandboxInstanceBySandboxId({
        provider: 'opensandbox',
        sandboxId,
        type: SandboxTypeEnum.editDebug
      })
    ).resolves.toMatchObject({ sandboxId });
    await expect(
      findSandboxInstanceBySandboxIdAndSource({
        provider: 'opensandbox',
        sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        type: SandboxTypeEnum.editDebug
      })
    ).resolves.toMatchObject({ sandboxId });
    await expect(
      findSandboxResourcesBySourceChatType({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
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

    await markSandboxResourceStopped({ provider: 'opensandbox', sandboxId });
    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      status: SandboxStatusEnum.stopped
    });

    await deleteSandboxResourceRecord({ provider: 'opensandbox', sandboxId });
    await expect(MongoSandboxInstance.countDocuments({ sandboxId })).resolves.toBe(0);
  });

  it('writes source fields and finds sandbox records by source-aware ownership', async () => {
    const skillId = `instance-helper-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;

    await upsertRunningSandboxInstance({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: '',
      chatId: 'edit-debug'
    });

    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    });
    await expect(
      findSandboxInstanceBySandboxIdAndSource({
        provider: 'opensandbox',
        sandboxId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId
      })
    ).resolves.toMatchObject({ sandboxId });
  });

  it('finds sandbox resources by new source fields without legacy appId fallbacks', async () => {
    const appId = `instance-helper-${getNanoid()}`;
    const appSandboxId = `instance-helper-${getNanoid()}`;
    const skillId = `instance-helper-${getNanoid()}`;
    const skillSandboxId = `instance-helper-${getNanoid()}`;

    await upsertRunningSandboxInstance({
      provider: 'opensandbox',
      sandboxId: appSandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId: 'source-only-app-chat'
    });
    await upsertRunningSandboxInstance({
      provider: 'opensandbox',
      sandboxId: skillSandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: '',
      chatId: 'source-only-skill-chat'
    });

    const [appDoc, skillDoc] = await Promise.all([
      MongoSandboxInstance.findOne({ sandboxId: appSandboxId }).lean(),
      MongoSandboxInstance.findOne({ sandboxId: skillSandboxId }).lean()
    ]);
    expect(appDoc).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId: 'source-only-app-chat'
    });
    expect(appDoc?.appId).toBeUndefined();
    expect(skillDoc).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'source-only-skill-chat'
    });
    expect(skillDoc?.appId).toBeUndefined();
    expect(skillDoc?.metadata?.skillId).toBeUndefined();

    await expect(
      findSandboxResourcesBySource({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId
      })
    ).resolves.toEqual([expect.objectContaining({ sandboxId: appSandboxId })]);
    await expect(
      findSandboxResourcesBySourceChatIds({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatIds: ['source-only-skill-chat']
      })
    ).resolves.toEqual([expect.objectContaining({ sandboxId: skillSandboxId })]);
    await expect(findSkillRelatedSandboxResources([skillId])).resolves.toEqual([
      expect.objectContaining({ sandboxId: skillSandboxId })
    ]);
  });

  it('finds inactive running resources and deletes records by id', async () => {
    const appId = `instance-helper-${getNanoid()}`;
    const inactiveDoc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `instance-helper-${getNanoid()}`,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: '',
      chatId: 'record-only-chat',
      type: SandboxTypeEnum.editDebug
    });

    expect(migratedDoc).toMatchObject({
      provider: 'sealosdevbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: 'user-1',
      chatId,
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
    const placeholderDoc = await MongoSandboxInstance.create({
      provider: 'sealosdevbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: `placeholder-${appId}`,
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: '',
      chatId,
      type: SandboxTypeEnum.editDebug
    });

    expect(String(migratedDoc?._id)).toBe(String(placeholderDoc._id));
    expect(migratedDoc).toMatchObject({
      provider: 'sealosdevbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: '',
      chatId,
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.stopped,
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    });
    await expect(MongoSandboxInstance.exists({ _id: oldDoc._id })).resolves.toBeNull();
  });

  it('archives inactive stopped records and restores them into the current provider', async () => {
    const inactiveBefore = new Date('2026-02-01T00:00:00.000Z');
    const sandboxId = `instance-helper-${getNanoid()}`;
    const appId = `instance-helper-${getNanoid()}`;
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
        sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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

  it('claims running records for runtime upgrade archive and restores original status on rollback', async () => {
    const sandboxId = `instance-helper-${getNanoid()}`;
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: `instance-helper-${getNanoid()}`,
      userId: 'user-1',
      chatId: 'edit-debug',
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date(),
      metadata: {
        image: { repository: 'old-image' }
      }
    });

    const archiving = await markSandboxArchivingForRuntimeUpgrade(doc);
    expect(archiving).toMatchObject({
      status: SandboxStatusEnum.stopped,
      metadata: {
        archive: {
          state: 'archiving'
        }
      }
    });
    await expect(
      markSandboxArchivingForRuntimeUpgrade({
        ...doc.toObject(),
        lastActiveAt: new Date('2025-01-01T00:00:00.000Z')
      } as SandboxResourceDoc)
    ).resolves.toBeNull();

    await clearSandboxRuntimeUpgradeArchiveState(doc);

    const stored = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(stored).toMatchObject({
      status: SandboxStatusEnum.running,
      metadata: {
        image: { repository: 'old-image' }
      }
    });
    expect(stored?.metadata?.archive).toBeUndefined();
  });

  it('streams archive candidates by lastActiveAt descending', async () => {
    const inactiveBefore = new Date('2026-02-01T00:00:00.000Z');
    const appId = `instance-helper-${getNanoid()}`;
    const [olderDoc, newerDoc] = await MongoSandboxInstance.create([
      {
        provider: 'opensandbox',
        sandboxId: `instance-helper-${getNanoid()}`,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
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
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
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
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
      findSandboxInstanceBySourceChatType({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatId,
        type: SandboxTypeEnum.sessionRuntime,
        status: SandboxStatusEnum.running
      })
    ).resolves.toMatchObject({ sandboxId });
    await expect(
      findSandboxResourcesBySourceChatType({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatId,
        type: SandboxTypeEnum.sessionRuntime
      })
    ).resolves.toHaveLength(1);
    expect(
      await countRunningSandboxInstancesByType(SandboxTypeEnum.sessionRuntime)
    ).toBeGreaterThan(0);

    await updateSandboxInstanceRecordBySandboxId({
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: `${appId}-updated`,
      userId: 'user-2',
      chatId: `${chatId}-updated`
    });

    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: `${appId}-updated`,
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
