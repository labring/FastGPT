import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  createSandboxResourcesToArchiveCursor,
  existsSandboxInstanceBySandboxId,
  findInactiveRunningSandboxResources,
  findSandboxInstanceBySandboxId,
  findSandboxInstanceBySandboxIdAndSource,
  findSandboxInstanceBySource,
  findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesBySource,
  findSandboxResourcesBySourceExcludeProvider,
  findSkillRelatedSandboxResources,
  touchRunningSandboxInstance,
  updateSandboxInstanceRecordBySandboxId,
  type SandboxResourceDoc
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/type';

const prefix = 'lifecycle-repository-';
const oldDate = new Date('2025-01-01T00:00:00.000Z');

const createAppIdentity = (overrides?: Partial<{ sourceId: string; userId: string }>) => ({
  sourceId: overrides?.sourceId ?? `${prefix}app-${getNanoid()}`,
  userId: overrides?.userId ?? `${prefix}user-${getNanoid()}`,
  sandboxId: `${prefix}${getNanoid()}`
});

const collectArchiveCursor = async (params: {
  inactiveBefore: Date;
  providers?: Array<'opensandbox' | 'sealosdevbox'>;
}) => {
  const cursor = createSandboxResourcesToArchiveCursor(params);
  const resources: SandboxResourceDoc[] = [];
  try {
    for await (const resource of cursor) resources.push(resource);
  } finally {
    await cursor.close();
  }
  return resources;
};

describe('sandbox instance repository', () => {
  beforeAll(async () => {
    await MongoSandboxInstance.init();
  });

  beforeEach(async () => {
    await MongoSandboxInstance.deleteMany({ sandboxId: new RegExp(`^${prefix}`) });
  });

  it('touches only the matching published running instance and preserves stable metadata', async () => {
    const identity = createAppIdentity();
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      status: SandboxInstanceStatusEnum.running,
      lastActiveAt: oldDate,
      createdAt: oldDate,
      metadata: { teamId: 'team-1' }
    });

    const touched = await touchRunningSandboxInstance({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      storage: { mountPath: '/workspace' },
      limit: { cpuCount: 2 },
      metadata: {
        volumeEnabled: true
      }
    });

    expect(touched).toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      storage: { mountPath: '/workspace' },
      limit: { cpuCount: 2 },
      metadata: { teamId: 'team-1', volumeEnabled: true }
    });
    expect(touched?.lastActiveAt.getTime()).toBeGreaterThan(oldDate.getTime());
    expect(touched?.metadata?.activeSaga).toBeUndefined();

    await expect(
      touchRunningSandboxInstance({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        metadata: { activeSaga: { sagaId: 'invalid', type: 'stop' } }
      })
    ).rejects.toThrow('cannot contain activeSaga');

    await expect(
      touchRunningSandboxInstance({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        userId: 'another-user'
      })
    ).resolves.toBeNull();

    await MongoSandboxInstance.updateOne(
      { sandboxId: identity.sandboxId },
      {
        $set: {
          status: SandboxInstanceStatusEnum.stopping,
          'metadata.activeSaga': { sagaId: 'stop-saga', type: 'stop' }
        }
      }
    );
    await expect(
      touchRunningSandboxInstance({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...identity
      })
    ).resolves.toBeNull();
  });

  it('returns only inactive stable records to automatic stop and archive jobs', async () => {
    const inactiveBefore = new Date('2025-02-01T00:00:00.000Z');
    const inactiveRunning = createAppIdentity();
    const boundaryRunning = createAppIdentity();
    const stoppedOpenSandbox = createAppIdentity();
    const stoppedDevbox = createAppIdentity();
    const stopping = createAppIdentity();
    const archiving = createAppIdentity();

    await MongoSandboxInstance.create([
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...inactiveRunning,
        status: SandboxInstanceStatusEnum.running,
        lastActiveAt: oldDate,
        createdAt: oldDate
      },
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...boundaryRunning,
        status: SandboxInstanceStatusEnum.running,
        lastActiveAt: inactiveBefore,
        createdAt: oldDate
      },
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...stoppedOpenSandbox,
        status: SandboxInstanceStatusEnum.stopped,
        lastActiveAt: oldDate,
        createdAt: oldDate
      },
      {
        provider: 'sealosdevbox',
        sourceType: ChatSourceTypeEnum.app,
        ...stoppedDevbox,
        status: SandboxInstanceStatusEnum.stopped,
        lastActiveAt: oldDate,
        createdAt: oldDate
      },
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...stopping,
        status: SandboxInstanceStatusEnum.stopping,
        lastActiveAt: oldDate,
        createdAt: oldDate,
        metadata: { activeSaga: { sagaId: 'stop-saga', type: 'stop' } }
      },
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...archiving,
        status: SandboxInstanceStatusEnum.archiving,
        lastActiveAt: oldDate,
        createdAt: oldDate,
        metadata: { activeSaga: { sagaId: 'archive-saga', type: 'archive' } }
      }
    ]);

    expect(
      (await findInactiveRunningSandboxResources(inactiveBefore)).map((item) => item.sandboxId)
    ).toEqual([inactiveRunning.sandboxId]);
    expect(
      (await collectArchiveCursor({ inactiveBefore })).map((item) => item.sandboxId).sort()
    ).toEqual([stoppedDevbox.sandboxId, stoppedOpenSandbox.sandboxId].sort());
    expect(
      (await collectArchiveCursor({ inactiveBefore, providers: ['opensandbox'] })).map(
        (item) => item.sandboxId
      )
    ).toEqual([stoppedOpenSandbox.sandboxId]);
  });

  it('queries physical, logical, provider and Skill ownership consistently', async () => {
    const sharedSourceId = `${prefix}app-${getNanoid()}`;
    const openSandbox = createAppIdentity({ sourceId: sharedSourceId });
    const devbox = createAppIdentity({ sourceId: sharedSourceId });
    const skillId = `${prefix}skill-${getNanoid()}`;
    const skillSandboxId = `${prefix}${getNanoid()}`;

    await MongoSandboxInstance.create([
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...openSandbox,
        status: SandboxInstanceStatusEnum.running,
        lastActiveAt: oldDate,
        createdAt: oldDate,
        metadata: { teamId: 'team-1' }
      },
      {
        provider: 'sealosdevbox',
        sourceType: ChatSourceTypeEnum.app,
        ...devbox,
        status: SandboxInstanceStatusEnum.stopped,
        lastActiveAt: oldDate,
        createdAt: oldDate
      },
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        userId: ChatSourceTypeEnum.skillEdit,
        sandboxId: skillSandboxId,
        status: SandboxInstanceStatusEnum.running,
        lastActiveAt: oldDate,
        createdAt: oldDate
      }
    ]);

    await expect(
      existsSandboxInstanceBySandboxId({
        provider: 'opensandbox',
        sandboxId: openSandbox.sandboxId
      })
    ).resolves.toBe(true);
    await expect(
      findSandboxInstanceBySandboxId({ sandboxId: openSandbox.sandboxId })
    ).resolves.toMatchObject({ sourceId: sharedSourceId });
    await expect(
      findSandboxInstanceBySandboxIdAndSource({
        sandboxId: openSandbox.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: sharedSourceId
      })
    ).resolves.toMatchObject({ userId: openSandbox.userId });
    await expect(
      findSandboxInstanceBySource({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: sharedSourceId,
        userId: openSandbox.userId
      })
    ).resolves.toMatchObject({ sandboxId: openSandbox.sandboxId });
    expect(
      (
        await findSandboxResourcesBySource({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: sharedSourceId
        })
      ).map((item) => item.sandboxId)
    ).toEqual(expect.arrayContaining([openSandbox.sandboxId, devbox.sandboxId]));
    expect(
      (
        await findSandboxResourcesBySourceExcludeProvider({
          provider: 'opensandbox',
          sourceType: ChatSourceTypeEnum.app,
          sourceId: sharedSourceId
        })
      ).map((item) => item.sandboxId)
    ).toEqual([devbox.sandboxId]);
    await expect(
      findSandboxResourceBySandboxIdAndTeam({
        sandboxId: openSandbox.sandboxId,
        teamId: 'team-1'
      })
    ).resolves.toMatchObject({ sandboxId: openSandbox.sandboxId });
    expect(
      (await findSkillRelatedSandboxResources([skillId])).map((item) => item.sandboxId)
    ).toEqual([skillSandboxId]);
    await expect(
      findSandboxResourcesBySource({
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        sourceId: sharedSourceId
      })
    ).rejects.toThrow('ChatAgentHelper source does not support sandbox resources');
  });

  it('updates ownership and stable metadata together', async () => {
    const identity = createAppIdentity();
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      status: SandboxInstanceStatusEnum.running,
      lastActiveAt: oldDate,
      createdAt: oldDate,
      metadata: { teamId: 'team-1' }
    });

    const updated = await updateSandboxInstanceRecordBySandboxId({
      sandboxId: identity.sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: `${prefix}moved-app`,
      userId: `${prefix}moved-user`,
      metadata: {
        tmbId: 'tmb-1'
      },
      touchActive: true
    });

    expect(updated).toMatchObject({
      sourceId: `${prefix}moved-app`,
      userId: `${prefix}moved-user`,
      status: SandboxInstanceStatusEnum.running,
      metadata: { teamId: 'team-1', tmbId: 'tmb-1' }
    });
    expect(updated?.metadata?.activeSaga).toBeUndefined();
    expect(updated?.lastActiveAt.getTime()).toBeGreaterThan(oldDate.getTime());

    await MongoSandboxInstance.updateOne(
      { sandboxId: identity.sandboxId },
      { $set: { status: SandboxInstanceStatusEnum.stopped } }
    );
    await expect(
      updateSandboxInstanceRecordBySandboxId({
        sandboxId: identity.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: identity.sourceId,
        userId: identity.userId,
        touchActive: true
      })
    ).resolves.toBeNull();
  });
});
