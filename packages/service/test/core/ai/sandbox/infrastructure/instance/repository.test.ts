import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  sandboxMigrationId,
  systemMigrationStateCollectionName,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import {
  getLegacySandboxInstanceCollection,
  MongoSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  advanceSandboxOperation,
  backfillSandboxInstanceTeamId,
  claimSandboxOperation,
  completeSandboxOperation,
  countActiveSandboxInstances,
  createSandboxProvisioningInstance,
  createSandboxResourcesToArchiveCursor,
  deleteClaimedSandboxRecord,
  findExistingSandboxVolumeClaimNames,
  findInactiveRunningSandboxResources,
  findLegacySandboxInstanceBySandboxId,
  findLegacySandboxInstancesBySandboxIds,
  findStaleSandboxOperations,
  hasPendingLegacySandboxInstance,
  markSandboxOperationFailed,
  touchRunningSandboxInstance,
  updateSandboxInstanceRecordBySandboxId,
  type SandboxResourceDoc
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum
} from '@fastgpt/service/core/ai/sandbox/constants';

const prefix = 'lifecycle-repository-';
const oldDate = new Date('2025-01-01T00:00:00.000Z');

const createAppIdentity = () => ({
  sourceId: `${prefix}app-${getNanoid()}`,
  userId: `${prefix}user-${getNanoid()}`,
  sandboxId: `${prefix}${getNanoid()}`
});

const collectArchiveCursor = async (inactiveBefore: Date) => {
  const cursor = createSandboxResourcesToArchiveCursor(inactiveBefore);
  const resources: SandboxResourceDoc[] = [];
  try {
    for await (const resource of cursor) resources.push(resource);
  } finally {
    await cursor.close();
  }
  return resources;
};

describe('sandbox instance lifecycle repository', () => {
  beforeAll(async () => {
    await MongoSandboxInstance.init();
  });

  beforeEach(async () => {
    await MongoSandboxInstance.deleteMany({ sandboxId: new RegExp(`^${prefix}`) });
    await getLegacySandboxInstanceCollection().deleteMany({ sandboxId: new RegExp(`^${prefix}`) });
    await MongoSandboxInstance.db
      .collection(systemMigrationStateCollectionName)
      .deleteMany({ _id: sandboxMigrationId as never });
  });

  afterAll(async () => {
    await MongoSandboxInstance.deleteMany({ sandboxId: new RegExp(`^${prefix}`) });
    await getLegacySandboxInstanceCollection().deleteMany({ sandboxId: new RegExp(`^${prefix}`) });
    await MongoSandboxInstance.db
      .collection(systemMigrationStateCollectionName)
      .deleteMany({ _id: sandboxMigrationId as never });
  });

  it('selects recent rollback phases without admitting recent forward operations or other statuses', async () => {
    const resources = [];
    for (let index = 0; index < 3; index++) {
      const { instance } = await createSandboxProvisioningInstance({
        sourceType: ChatSourceTypeEnum.app,
        ...createAppIdentity(),
        teamId: 'recovery-query-team'
      });
      resources.push(instance!);
    }
    await MongoSandboxInstance.updateOne(
      { _id: resources[0]._id },
      { $set: { 'operation.heartbeatAt': oldDate } }
    );
    await claimSandboxOperation({
      resource: resources[1],
      status: 'provisioning',
      type: 'provision',
      phase: 'rollbackClaimed'
    });
    const params = { statuses: ['provisioning'] as const, heartbeatBefore: new Date('2026-01-01') };
    const stale = await findStaleSandboxOperations({ ...params, statuses: [...params.statuses] });
    expect(stale.map((resource) => resource.sandboxId)).toEqual([resources[0].sandboxId]);
    const recoverable = await findStaleSandboxOperations({
      ...params,
      statuses: [...params.statuses],
      retryPhases: ['rollbackClaimed']
    });
    expect(recoverable.map((resource) => resource.sandboxId).sort()).toEqual(
      [resources[0].sandboxId, resources[1].sandboxId].sort()
    );
    expect(
      await findStaleSandboxOperations({
        statuses: ['restoring'],
        heartbeatBefore: new Date(),
        retryPhases: ['rollbackClaimed']
      })
    ).toEqual([]);
  });

  it('creates one provisioning claim and never upserts a running record', async () => {
    const identity = createAppIdentity();
    const first = await createSandboxProvisioningInstance({
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1'
    });
    const duplicate = await createSandboxProvisioningInstance({
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1'
    });

    expect(first.created).toBe(true);
    expect(first.instance).toMatchObject({
      status: SandboxInstanceStatusEnum.provisioning,
      operation: { type: SandboxOperationTypeEnum.provision, phase: 'claimed' }
    });
    expect(duplicate.created).toBe(false);
    expect(String(duplicate.instance?._id)).toBe(String(first.instance?._id));
    await expect(
      touchRunningSandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        ...identity
      })
    ).resolves.toBeNull();
    expect(await MongoSandboxInstance.countDocuments({ sandboxId: identity.sandboxId })).toBe(1);
  });

  it('publishes provisioning only for the current operation token', async () => {
    const identity = createAppIdentity();
    const { instance } = await createSandboxProvisioningInstance({
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1'
    });
    const operationId = instance!.operation!.id;

    await expect(
      completeSandboxOperation({
        resource: instance!,
        operationId: 'stale-token',
        fromStatus: SandboxInstanceStatusEnum.provisioning,
        status: SandboxInstanceStatusEnum.running,
        touchActive: true
      })
    ).resolves.toBeNull();

    await expect(
      completeSandboxOperation({
        resource: instance!,
        operationId,
        fromStatus: SandboxInstanceStatusEnum.provisioning,
        status: SandboxInstanceStatusEnum.running,
        touchActive: true
      })
    ).resolves.toMatchObject({ status: SandboxInstanceStatusEnum.running });

    await expect(
      MongoSandboxInstance.findOne({ sandboxId: identity.sandboxId }).lean()
    ).resolves.not.toHaveProperty('operation');
  });

  it('touches only the matching published identity and preserves stable fields', async () => {
    const identity = createAppIdentity();
    const { instance } = await createSandboxProvisioningInstance({
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1'
    });
    await completeSandboxOperation({
      resource: instance!,
      operationId: instance!.operation!.id,
      fromStatus: SandboxInstanceStatusEnum.provisioning,
      status: SandboxInstanceStatusEnum.running
    });

    await expect(
      touchRunningSandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        ...identity
      })
    ).resolves.toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      teamId: 'team-1'
    });

    await expect(
      touchRunningSandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        userId: 'another-user'
      })
    ).resolves.toBeNull();
  });

  it('uses workspace claimName as CAS without overwriting storage', async () => {
    const identity = createAppIdentity();
    const storage = {
      volumes: [
        {
          name: 'workspace',
          claimName: 'fastgpt-session-current-generation',
          mountPath: '/workspace'
        }
      ],
      mountPath: '/workspace'
    };
    const running = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      status: SandboxInstanceStatusEnum.running,
      lastActiveAt: oldDate,
      createdAt: oldDate,
      storage
    });

    await expect(
      touchRunningSandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        expectedWorkspaceClaimName: 'fastgpt-session-stale-generation'
      })
    ).resolves.toBeNull();
    await expect(
      touchRunningSandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        expectedWorkspaceClaimName: 'fastgpt-session-current-generation'
      })
    ).resolves.toMatchObject({ storage });
    await expect(MongoSandboxInstance.findById(running._id).lean()).resolves.toMatchObject({
      storage
    });
  });

  it('advances, fails and completes a stop operation with CAS fencing', async () => {
    const identity = createAppIdentity();
    const running = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      status: SandboxInstanceStatusEnum.running,
      lastActiveAt: oldDate,
      createdAt: oldDate
    });
    const claimed = await claimSandboxOperation({
      resource: running.toObject() as SandboxResourceDoc,
      status: SandboxInstanceStatusEnum.stopping,
      type: SandboxOperationTypeEnum.stop,
      matchLastActiveAt: true
    });
    const operationId = claimed!.operation!.id;

    await expect(
      advanceSandboxOperation({
        resource: claimed!,
        operationId,
        status: SandboxInstanceStatusEnum.stopping,
        phase: 'providerStopped'
      })
    ).resolves.toMatchObject({ operation: { phase: 'providerStopped' } });
    await markSandboxOperationFailed({
      resource: claimed!,
      operationId,
      status: SandboxInstanceStatusEnum.stopping,
      retryAfter: new Date(Date.now() + 5 * 60 * 1000),
      error: 'provider timeout'
    });
    await expect(MongoSandboxInstance.findById(claimed!._id).lean()).resolves.toMatchObject({
      status: SandboxInstanceStatusEnum.stopping,
      operation: { error: 'provider timeout' }
    });
    const failed = await MongoSandboxInstance.findById(claimed!._id).lean<SandboxResourceDoc>();
    const retried = await claimSandboxOperation({
      resource: failed!,
      status: SandboxInstanceStatusEnum.stopping,
      type: SandboxOperationTypeEnum.stop
    });
    expect(retried?.operation).toMatchObject({
      phase: 'providerStopped',
      type: SandboxOperationTypeEnum.stop,
      previousStatus: SandboxInstanceStatusEnum.running
    });
    expect(retried?.operation?.id).not.toBe(operationId);
    await expect(
      completeSandboxOperation({
        resource: claimed!,
        operationId,
        fromStatus: SandboxInstanceStatusEnum.stopping,
        status: SandboxInstanceStatusEnum.stopped
      })
    ).resolves.toBeNull();
    await expect(
      completeSandboxOperation({
        resource: retried!,
        operationId: retried!.operation!.id,
        fromStatus: SandboxInstanceStatusEnum.stopping,
        status: SandboxInstanceStatusEnum.stopped
      })
    ).resolves.toMatchObject({ status: SandboxInstanceStatusEnum.stopped });
  });

  it('fences any previous operation before deleting its record', async () => {
    const identity = createAppIdentity();
    const stable = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      status: SandboxInstanceStatusEnum.running,
      lastActiveAt: oldDate,
      createdAt: oldDate
    });
    const resource = stable.toObject() as SandboxResourceDoc;
    const stopping = await claimSandboxOperation({
      resource,
      status: SandboxInstanceStatusEnum.stopping,
      type: SandboxOperationTypeEnum.stop
    });
    const deleting = await claimSandboxOperation({
      resource: stopping!,
      status: SandboxInstanceStatusEnum.deleting,
      type: SandboxOperationTypeEnum.delete
    });

    await expect(
      deleteClaimedSandboxRecord({
        resource: deleting!,
        operationId: stopping!.operation!.id
      })
    ).resolves.toMatchObject({ deletedCount: 0 });
    await expect(
      deleteClaimedSandboxRecord({
        resource: deleting!,
        operationId: deleting!.operation!.id
      })
    ).resolves.toMatchObject({ deletedCount: 1 });
  });

  it('only returns stable running and stopped records to automatic jobs', async () => {
    const runningIdentity = createAppIdentity();
    const stoppedIdentity = createAppIdentity();
    await MongoSandboxInstance.create([
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...runningIdentity,
        status: SandboxInstanceStatusEnum.running,
        lastActiveAt: oldDate,
        createdAt: oldDate
      },
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...stoppedIdentity,
        status: SandboxInstanceStatusEnum.stopped,
        lastActiveAt: oldDate,
        createdAt: oldDate
      }
    ]);
    expect(
      (await findInactiveRunningSandboxResources(new Date())).map((item) => item.sandboxId)
    ).toContain(runningIdentity.sandboxId);
    expect((await collectArchiveCursor(new Date())).map((item) => item.sandboxId)).toContain(
      stoppedIdentity.sandboxId
    );
  });

  it('counts active instances across sources, with optional team filtering', async () => {
    const teamId = `${prefix}team-${getNanoid()}`;
    const fixtures = [
      {
        status: SandboxInstanceStatusEnum.provisioning,
        operationType: SandboxOperationTypeEnum.provision
      },
      { status: SandboxInstanceStatusEnum.running },
      { status: SandboxInstanceStatusEnum.stopping, operationType: SandboxOperationTypeEnum.stop },
      {
        status: SandboxInstanceStatusEnum.archiving,
        operationType: SandboxOperationTypeEnum.archive
      },
      {
        status: SandboxInstanceStatusEnum.restoring,
        operationType: SandboxOperationTypeEnum.restore
      },
      { status: SandboxInstanceStatusEnum.stopped },
      { status: SandboxInstanceStatusEnum.archived },
      {
        status: SandboxInstanceStatusEnum.deleting,
        operationType: SandboxOperationTypeEnum.delete
      },
      { status: SandboxInstanceStatusEnum.running, missingTeam: true }
    ] as const;
    const baseline = await countActiveSandboxInstances();
    await MongoSandboxInstance.create(
      fixtures.map((fixture, index) => ({
        provider: 'opensandbox',
        sourceType: index % 2 ? ChatSourceTypeEnum.skillEdit : ChatSourceTypeEnum.app,
        ...createAppIdentity(),
        status: fixture.status,
        lastActiveAt: oldDate,
        createdAt: oldDate,
        ...('missingTeam' in fixture ? {} : { teamId }),
        ...('operationType' in fixture
          ? {
              operation: {
                id: getNanoid(),
                type: fixture.operationType,
                phase: 'claimed',
                startedAt: oldDate,
                heartbeatAt: oldDate
              }
            }
          : {})
      }))
    );

    await getLegacySandboxInstanceCollection().insertOne({
      provider: 'sealosdevbox',
      sourceType: ChatSourceTypeEnum.app,
      ...createAppIdentity(),
      teamId,
      status: SandboxInstanceStatusEnum.running,
      lastActiveAt: oldDate,
      createdAt: oldDate
    });

    // 4 种活跃状态（provisioning/running/stopping/restoring）计入团队用量；
    // archiving 已在回收不占额，缺归属的 running 只计系统总量，v2 遗留记录不占 v3 配额。
    expect(await countActiveSandboxInstances()).toBe(baseline + 5);
    expect(await countActiveSandboxInstances({ teamId })).toBe(4);
    expect(await countActiveSandboxInstances({ teamId: `${prefix}missing-team` })).toBe(0);
  });

  it('backfills only missing team ids and never overwrites existing ownership', async () => {
    const identity = createAppIdentity();
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      status: SandboxInstanceStatusEnum.running,
      lastActiveAt: oldDate,
      createdAt: oldDate
    });

    await expect(
      backfillSandboxInstanceTeamId({
        sandboxId: identity.sandboxId,
        teamId: 'team-fill'
      })
    ).resolves.toMatchObject({ modifiedCount: 1 });
    await expect(
      backfillSandboxInstanceTeamId({
        sandboxId: identity.sandboxId,
        teamId: 'team-other'
      })
    ).resolves.toMatchObject({ modifiedCount: 0 });
    await expect(
      backfillSandboxInstanceTeamId({
        sandboxId: `${prefix}missing`,
        teamId: 'team-fill'
      })
    ).resolves.toMatchObject({ modifiedCount: 0 });

    expect(
      (await MongoSandboxInstance.findOne({ sandboxId: identity.sandboxId }).lean())?.teamId
    ).toBe('team-fill');
  });

  it('refuses updateSandboxInstanceRecordBySandboxId when record is in transitional state', async () => {
    const identity = createAppIdentity();
    const created = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-id-transitional',
      status: SandboxInstanceStatusEnum.running,
      lastActiveAt: oldDate,
      createdAt: oldDate
    });
    const doc = created.toObject();

    const claimedStopping = await claimSandboxOperation({
      resource: {
        _id: doc._id,
        provider: 'opensandbox',
        sandboxId: doc.sandboxId,
        status: SandboxInstanceStatusEnum.running
      },
      status: SandboxInstanceStatusEnum.stopping,
      type: SandboxOperationTypeEnum.stop
    });
    expect(claimedStopping?.status).toBe(SandboxInstanceStatusEnum.stopping);

    // updateSandboxInstanceRecordBySandboxId 即使不传 touchActive 也必须拒绝更新过渡态记录
    await expect(
      updateSandboxInstanceRecordBySandboxId({
        sandboxId: doc.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: identity.sourceId,
        userId: identity.userId,
        versionId: 'v-new'
      })
    ).resolves.toBeNull();
  });

  it('unions volume claimNames from both v3 and read-only v2 collections', async () => {
    const v3Identity = createAppIdentity();
    const v2Identity = createAppIdentity();
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...v3Identity,
      teamId: 'team-vol',
      status: SandboxInstanceStatusEnum.running,
      storage: {
        volumes: [
          { name: 'workspace', claimName: 'fastgpt-session-v3-claim', mountPath: '/home/sandbox' }
        ]
      },
      lastActiveAt: oldDate,
      createdAt: oldDate
    });
    await getLegacySandboxInstanceCollection().insertOne({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...v2Identity,
      teamId: 'team-vol',
      status: SandboxInstanceStatusEnum.stopped,
      storage: {
        volumes: [
          { name: 'workspace', claimName: 'fastgpt-session-v2-claim', mountPath: '/workspace' }
        ]
      },
      lastActiveAt: oldDate,
      createdAt: oldDate
    });

    const found = await findExistingSandboxVolumeClaimNames([
      'fastgpt-session-v3-claim',
      'fastgpt-session-v2-claim',
      'fastgpt-session-orphan-claim'
    ]);
    expect(found).toEqual(new Set(['fastgpt-session-v3-claim', 'fastgpt-session-v2-claim']));
  });

  it('gates pending legacy v2 records only before sandboxMigrationId succeeds and exposes read-only v2 lookups', async () => {
    const appIdentity = createAppIdentity();
    const deletingIdentity = createAppIdentity();
    const skillId = `${prefix}skill-${getNanoid()}`;
    const skillSandboxId = `${prefix}skill-sb-${getNanoid()}`;
    const migrationStateCol = MongoSandboxInstance.db.collection(
      systemMigrationStateCollectionName
    );

    await getLegacySandboxInstanceCollection().insertMany([
      {
        provider: 'sealosdevbox',
        sourceType: ChatSourceTypeEnum.app,
        ...appIdentity,
        status: SandboxInstanceStatusEnum.running,
        lastActiveAt: oldDate,
        createdAt: oldDate
      },
      {
        provider: 'sealosdevbox',
        sourceType: ChatSourceTypeEnum.app,
        ...deletingIdentity,
        status: SandboxInstanceStatusEnum.deleting,
        lastActiveAt: oldDate,
        createdAt: oldDate
      },
      {
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        userId: ChatSourceTypeEnum.skillEdit,
        sandboxId: skillSandboxId,
        status: SandboxInstanceStatusEnum.stopped,
        lastActiveAt: oldDate,
        createdAt: oldDate
      }
    ]);

    // 未有 migration succeeded 记录时，非 deleting 的 v2 记录必须触发阻断
    await expect(
      hasPendingLegacySandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appIdentity.sourceId,
        userId: appIdentity.userId
      })
    ).resolves.toBe(true);
    await expect(
      hasPendingLegacySandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appIdentity.sourceId,
        userId: 'other-user'
      })
    ).resolves.toBe(false);
    await expect(
      hasPendingLegacySandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: deletingIdentity.sourceId,
        userId: deletingIdentity.userId
      })
    ).resolves.toBe(false);
    await expect(
      hasPendingLegacySandboxInstance({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId
      })
    ).resolves.toBe(true);

    // migration 状态非 succeeded（如 failed/running）时仍阻断
    await migrationStateCol.insertOne({
      _id: sandboxMigrationId as never,
      status: SystemMigrationStatusEnum.failed
    });
    await expect(
      hasPendingLegacySandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appIdentity.sourceId,
        userId: appIdentity.userId
      })
    ).resolves.toBe(true);

    // migration succeeded 后，即便 v2 尚未清理，v3 删除后重建也应放行
    await migrationStateCol.updateOne(
      { _id: sandboxMigrationId as never },
      { $set: { status: SystemMigrationStatusEnum.succeeded } }
    );
    await expect(
      hasPendingLegacySandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appIdentity.sourceId,
        userId: appIdentity.userId
      })
    ).resolves.toBe(false);
    await expect(
      hasPendingLegacySandboxInstance({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId
      })
    ).resolves.toBe(false);

    // v2 只读按 sandboxId 查询仅返回 v2 记录，供孤儿容器保护
    const legacyDocs = await findLegacySandboxInstancesBySandboxIds([
      appIdentity.sandboxId,
      skillSandboxId,
      `${prefix}missing`
    ]);
    expect(legacyDocs.map((item) => item.sandboxId).sort()).toEqual(
      [appIdentity.sandboxId, skillSandboxId].sort()
    );
    expect(
      (await findLegacySandboxInstanceBySandboxId({ sandboxId: skillSandboxId }))?.status
    ).toBe(SandboxInstanceStatusEnum.stopped);
    expect(
      await findLegacySandboxInstanceBySandboxId({ sandboxId: `${prefix}missing` })
    ).toBeNull();
  });
});
