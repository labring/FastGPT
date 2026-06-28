import { beforeEach, describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  countRunningSandboxInstancesByType,
  clearSandboxArchiveState,
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
  clearFailedSandboxArchiveState,
  clearStaleArchivingSandboxStates,
  markSandboxArchived,
  markSandboxArchiveFailed,
  markSandboxArchiving,
  markSandboxArchivingForRuntimeUpgrade,
  markSandboxDeletingError,
  markSandboxRuntimeUpgradeArchiveFailed,
  markStaleDeletingSandboxStatesArchived,
  migrateArchivedSandboxInstanceRecord,
  markSandboxRestored,
  markSandboxRestoring,
  markSandboxResourceStopped,
  tryMarkSandboxDeleting,
  updateSandboxInstanceRecordBySandboxId,
  upsertRunningSandboxInstance,
  type SandboxResourceDoc
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
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

describe('sandbox instance repository', () => {
  beforeEach(async () => {
    await MongoSandboxInstance.deleteMany({ sandboxId: /^instance-helper-/ });
  });

  const oldStoppedActiveAt = new Date('2026-01-01T00:00:00.000Z');

  const createStoppedEditDebugRecord = async ({
    sandboxId,
    sourceId,
    metadata = { teamId: 'team-1' }
  }: {
    sandboxId: string;
    sourceId?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const record = {
      provider: 'opensandbox',
      sandboxId,
      ...(sourceId
        ? {
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId
          }
        : {}),
      userId: '',
      chatId: 'edit-debug',
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.stopped,
      lastActiveAt: oldStoppedActiveAt,
      createdAt: oldStoppedActiveAt,
      metadata
    };

    // Legacy records were created before source fields became required.
    return sourceId
      ? MongoSandboxInstance.create(record)
      : MongoSandboxInstance.collection.insertOne(record);
  };

  const touchEditDebugRecord = ({ sandboxId, sourceId }: { sandboxId: string; sourceId: string }) =>
    updateSandboxInstanceRecordBySandboxId({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId,
      metadata: {
        teamId: 'team-1',
        versionId: 'version-1'
      },
      touchActive: true
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

  it('touches stopped sandbox records as running when ownership update confirms activity', async () => {
    const skillId = `instance-helper-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;

    await createStoppedEditDebugRecord({ sandboxId, sourceId: skillId });
    await touchEditDebugRecord({ sandboxId, sourceId: skillId });

    const touchedDoc = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(touchedDoc).toMatchObject({
      status: SandboxStatusEnum.running,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      metadata: {
        teamId: 'team-1',
        versionId: 'version-1'
      }
    });
    expect(touchedDoc?.lastActiveAt.getTime()).toBeGreaterThan(oldStoppedActiveAt.getTime());
  });

  it('touches legacy records without source fields and writes current ownership', async () => {
    const skillId = `instance-helper-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;

    await createStoppedEditDebugRecord({ sandboxId });

    await expect(touchEditDebugRecord({ sandboxId, sourceId: skillId })).resolves.toMatchObject({
      sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      status: SandboxStatusEnum.running
    });

    const touchedDoc = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(touchedDoc).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      status: SandboxStatusEnum.running,
      metadata: {
        teamId: 'team-1',
        versionId: 'version-1'
      }
    });
    expect(touchedDoc?.lastActiveAt.getTime()).toBeGreaterThan(oldStoppedActiveAt.getTime());
  });

  it('does not touch records that already belong to another source', async () => {
    const skillId = `instance-helper-${getNanoid()}`;
    const otherSkillId = `instance-helper-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;

    await createStoppedEditDebugRecord({
      sandboxId,
      sourceId: otherSkillId,
      metadata: {
        teamId: 'team-other'
      }
    });

    await expect(touchEditDebugRecord({ sandboxId, sourceId: skillId })).resolves.toBeNull();

    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      status: SandboxStatusEnum.stopped,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: otherSkillId,
      lastActiveAt: oldStoppedActiveAt,
      metadata: {
        teamId: 'team-other'
      }
    });
  });

  it('does not touch archived sandbox records back to running', async () => {
    const skillId = `instance-helper-${getNanoid()}`;
    const sandboxId = `instance-helper-${getNanoid()}`;

    await createStoppedEditDebugRecord({
      sandboxId,
      sourceId: skillId,
      metadata: {
        teamId: 'team-1',
        archive: {
          state: 'archived'
        }
      }
    });

    await expect(touchEditDebugRecord({ sandboxId, sourceId: skillId })).resolves.toBeNull();

    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      status: SandboxStatusEnum.stopped,
      lastActiveAt: oldStoppedActiveAt,
      metadata: {
        teamId: 'team-1',
        archive: {
          state: 'archived'
        }
      }
    });
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

    const deletingResult = await tryMarkSandboxDeleting(archiving!, { inactiveBefore });
    expect(deletingResult.matchedCount).toBe(1);
    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      metadata: {
        archive: {
          state: 'deleting'
        }
      }
    });

    await markSandboxArchived(archiving!);
    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      status: SandboxStatusEnum.stopped,
      metadata: {
        image: { repository: 'fastgpt-agent-sandbox', tag: 'latest' },
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

  it('claims running records for runtime upgrade archive', async () => {
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
      status: SandboxStatusEnum.running,
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
  });

  it('writes current provider runtime image when archive is marked archived', async () => {
    const sandboxId = `instance-helper-${getNanoid()}`;
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: `instance-helper-${getNanoid()}`,
      userId: 'user-1',
      chatId: 'edit-debug',
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date(),
      metadata: {
        image: { repository: 'old-image', tag: 'v1' }
      }
    });

    const archiving = await markSandboxArchivingForRuntimeUpgrade(doc);
    await tryMarkSandboxDeleting(archiving!);
    await markSandboxArchived(archiving!);

    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      status: SandboxStatusEnum.stopped,
      metadata: {
        image: { repository: 'fastgpt-agent-sandbox', tag: 'latest' },
        archive: {
          state: 'archived'
        }
      }
    });
  });

  it('marks runtime upgrade archive as failed and allows retrying archive claim', async () => {
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
      status: SandboxStatusEnum.running,
      metadata: {
        archive: {
          state: 'archiving'
        }
      }
    });

    await markSandboxArchiveFailed(archiving!, 'archive failed');
    await markSandboxRuntimeUpgradeArchiveFailed(archiving!, 'archive failed again');

    const failed = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(failed).toMatchObject({
      status: SandboxStatusEnum.running,
      metadata: {
        archive: {
          state: 'failed',
          error: 'archive failed'
        }
      }
    });

    const retrying = await markSandboxArchivingForRuntimeUpgrade(failed as SandboxResourceDoc);
    expect(retrying).toMatchObject({
      status: SandboxStatusEnum.running,
      metadata: {
        archive: {
          state: 'archiving'
        }
      }
    });
    expect(retrying?.metadata?.archive?.error).toBeUndefined();
    expect(retrying?.metadata?.archive?.failedAt).toBeUndefined();
  });

  it('uses archive startedAt as CAS token for deleting, failed and stale cleanup', async () => {
    const sandboxId = `instance-helper-${getNanoid()}`;
    const appId = `instance-helper-${getNanoid()}`;
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: 'user-1',
      chatId: 'archive-cas-chat',
      type: SandboxTypeEnum.sessionRuntime,
      status: SandboxStatusEnum.stopped,
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date(),
      metadata: {
        image: { repository: 'image' }
      }
    });
    const inactiveBefore = new Date('2026-02-01T00:00:00.000Z');
    const oldArchiving = await markSandboxArchiving(doc, inactiveBefore);
    expect(oldArchiving?.metadata?.archive?.startedAt).toBeDefined();
    await markSandboxArchiveFailed(oldArchiving!, 'first attempt failed');
    const failed = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(failed).toMatchObject({
      metadata: {
        archive: {
          state: 'failed'
        }
      }
    });

    const newArchiving = await markSandboxArchivingForRuntimeUpgrade(failed as SandboxResourceDoc);
    expect(newArchiving?.metadata?.archive?.state).toBe('archiving');
    await expect(tryMarkSandboxDeleting(oldArchiving!, { inactiveBefore })).resolves.toMatchObject({
      matchedCount: 0
    });
    await expect(clearSandboxArchiveState(oldArchiving!)).resolves.toMatchObject({
      matchedCount: 0
    });
    await expect(markSandboxArchiveFailed(oldArchiving!, 'late failure')).resolves.toMatchObject({
      matchedCount: 0
    });
    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      metadata: {
        archive: {
          state: 'archiving'
        }
      }
    });

    await expect(tryMarkSandboxDeleting(newArchiving!, { inactiveBefore })).resolves.toMatchObject({
      matchedCount: 1
    });
    await markSandboxDeletingError(newArchiving!, 'delete failed');
    await clearStaleArchivingSandboxStates(new Date('2026-12-01T00:00:00.000Z'));
    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      metadata: {
        archive: {
          state: 'deleting',
          error: 'delete failed'
        }
      }
    });
    await expect(clearFailedSandboxArchiveState(newArchiving!)).resolves.toMatchObject({
      matchedCount: 0
    });
  });

  it('marks stale deleting archives as archived from stale cleanup', async () => {
    const sandboxId = `instance-helper-${getNanoid()}`;
    const appId = `instance-helper-${getNanoid()}`;
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: 'user-1',
      chatId: 'archive-finalize-chat',
      type: SandboxTypeEnum.sessionRuntime,
      status: SandboxStatusEnum.stopped,
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date(),
      metadata: {
        image: { repository: 'old-image' }
      }
    });
    const inactiveBefore = new Date('2026-02-01T00:00:00.000Z');
    const archiving = await markSandboxArchiving(doc, inactiveBefore);
    await expect(tryMarkSandboxDeleting(archiving!, { inactiveBefore })).resolves.toMatchObject({
      matchedCount: 1
    });
    await MongoSandboxInstance.updateOne(
      { sandboxId },
      {
        $set: {
          'metadata.archive.deleteStartedAt': new Date('2026-01-01T00:01:00.000Z')
        }
      }
    );

    await expect(
      markStaleDeletingSandboxStatesArchived(new Date('2026-01-01T00:00:30.000Z'))
    ).resolves.toMatchObject({
      modifiedCount: 0
    });
    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      metadata: {
        archive: {
          state: 'deleting'
        }
      }
    });

    await expect(
      markStaleDeletingSandboxStatesArchived(new Date('2026-01-01T00:16:00.000Z'))
    ).resolves.toMatchObject({
      matchedCount: 1
    });

    await expect(MongoSandboxInstance.findOne({ sandboxId }).lean()).resolves.toMatchObject({
      status: SandboxStatusEnum.stopped,
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    });
  });

  it('claims deleting archive records for restore', async () => {
    const sandboxId = `instance-helper-${getNanoid()}`;
    const appId = `instance-helper-${getNanoid()}`;
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: 'user-1',
      chatId: 'archive-restore-chat',
      type: SandboxTypeEnum.sessionRuntime,
      status: SandboxStatusEnum.stopped,
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date(),
      metadata: {
        archive: {
          state: 'deleting',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          deleteStartedAt: new Date('2026-01-01T00:01:00.000Z')
        }
      }
    });

    await expect(markSandboxRestoring(doc)).resolves.toMatchObject({
      metadata: {
        archive: {
          state: 'restoring'
        }
      }
    });
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
