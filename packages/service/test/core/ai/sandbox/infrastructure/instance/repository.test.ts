import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  advanceSandboxOperation,
  claimAppSandboxMigrationTarget,
  claimSkillSandboxMigrationTarget,
  claimSandboxOperation,
  completeSandboxOperation,
  createSandboxProvisioningInstance,
  createSandboxResourcesToArchiveCursor,
  deleteClaimedSandboxRecord,
  findInactiveRunningSandboxResources,
  findSandboxInstanceBySource,
  markSandboxOperationFailed,
  touchRunningSandboxInstance,
  type SandboxResourceDoc
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum
} from '@fastgpt/service/core/ai/sandbox/type';

const prefix = 'lifecycle-repository-';
const oldDate = new Date('2025-01-01T00:00:00.000Z');

const createAppIdentity = () => ({
  sourceId: `${prefix}app-${getNanoid()}`,
  userId: `${prefix}user-${getNanoid()}`,
  sandboxId: `${prefix}${getNanoid()}`
});

const collectArchiveCursor = async (inactiveBefore: Date) => {
  const cursor = createSandboxResourcesToArchiveCursor({ inactiveBefore });
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
  });

  it('creates one provisioning claim and never upserts a running record', async () => {
    const identity = createAppIdentity();
    const first = await createSandboxProvisioningInstance({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      metadata: { teamId: 'team-1' }
    });
    const duplicate = await createSandboxProvisioningInstance({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity
    });

    expect(first.created).toBe(true);
    expect(first.instance).toMatchObject({
      status: SandboxInstanceStatusEnum.provisioning,
      metadata: { operation: { type: SandboxOperationTypeEnum.provision, phase: 'claimed' } }
    });
    expect(duplicate.created).toBe(false);
    expect(duplicate.instance?._id.toString()).toBe(first.instance?._id.toString());
    await expect(
      touchRunningSandboxInstance({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...identity
      })
    ).resolves.toBeNull();
    expect(await MongoSandboxInstance.countDocuments({ sandboxId: identity.sandboxId })).toBe(1);
  });

  it('publishes provisioning only for the current operation token', async () => {
    const identity = createAppIdentity();
    const { instance } = await createSandboxProvisioningInstance({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity
    });
    const operationId = instance!.metadata!.operation!.id;

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
    ).resolves.not.toHaveProperty('metadata.operation');
  });

  it('touches only the matching published identity and preserves metadata', async () => {
    const identity = createAppIdentity();
    const { instance } = await createSandboxProvisioningInstance({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      metadata: { teamId: 'team-1' }
    });
    await completeSandboxOperation({
      resource: instance!,
      operationId: instance!.metadata!.operation!.id,
      fromStatus: SandboxInstanceStatusEnum.provisioning,
      status: SandboxInstanceStatusEnum.running
    });

    await expect(
      touchRunningSandboxInstance({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        metadata: { volumeEnabled: true }
      })
    ).resolves.toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      metadata: { teamId: 'team-1', volumeEnabled: true }
    });

    await expect(
      touchRunningSandboxInstance({
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        userId: 'another-user'
      })
    ).resolves.toBeNull();
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
    const operationId = claimed!.metadata!.operation!.id;

    await expect(
      advanceSandboxOperation({
        resource: claimed!,
        operationId,
        status: SandboxInstanceStatusEnum.stopping,
        phase: 'providerStopped'
      })
    ).resolves.toMatchObject({ metadata: { operation: { phase: 'providerStopped' } } });
    await markSandboxOperationFailed({
      resource: claimed!,
      operationId,
      status: SandboxInstanceStatusEnum.stopping,
      error: 'provider timeout'
    });
    await expect(MongoSandboxInstance.findById(claimed!._id).lean()).resolves.toMatchObject({
      status: SandboxInstanceStatusEnum.stopping,
      metadata: { operation: { error: 'provider timeout' } }
    });
    const failed = await MongoSandboxInstance.findById(claimed!._id).lean<SandboxResourceDoc>();
    const retried = await claimSandboxOperation({
      resource: failed!,
      status: SandboxInstanceStatusEnum.stopping,
      type: SandboxOperationTypeEnum.stop
    });
    expect(retried?.metadata?.operation).toMatchObject({
      phase: 'providerStopped',
      type: SandboxOperationTypeEnum.stop,
      previousStatus: SandboxInstanceStatusEnum.running
    });
    expect(retried?.metadata?.operation?.id).not.toBe(operationId);
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
        operationId: retried!.metadata!.operation!.id,
        fromStatus: SandboxInstanceStatusEnum.stopping,
        status: SandboxInstanceStatusEnum.stopped
      })
    ).resolves.toMatchObject({ status: SandboxInstanceStatusEnum.stopped });
  });

  it('claims a migration target, replaces its old token and publishes it', async () => {
    const identity = createAppIdentity();
    const first = await claimAppSandboxMigrationTarget({
      provider: 'opensandbox',
      ...identity,
      metadata: { teamId: 'team-1' }
    });
    const second = await claimAppSandboxMigrationTarget({
      provider: 'opensandbox',
      ...identity
    });

    expect(first).toMatchObject({ status: SandboxInstanceStatusEnum.legacyMigrating });
    expect(second?.metadata?.operation?.id).not.toBe(first?.metadata?.operation?.id);

    await expect(
      completeSandboxOperation({
        resource: second!,
        operationId: first!.metadata!.operation!.id,
        fromStatus: SandboxInstanceStatusEnum.legacyMigrating,
        status: SandboxInstanceStatusEnum.running
      })
    ).resolves.toBeNull();
    await expect(
      completeSandboxOperation({
        resource: second!,
        operationId: second!.metadata!.operation!.id,
        fromStatus: SandboxInstanceStatusEnum.legacyMigrating,
        status: SandboxInstanceStatusEnum.running
      })
    ).resolves.toMatchObject({ status: SandboxInstanceStatusEnum.running });
  });

  it('does not reclaim a fresh migration operation before the isolation window', async () => {
    const identity = createAppIdentity();
    await claimAppSandboxMigrationTarget({
      provider: 'opensandbox',
      ...identity
    });

    await expect(
      claimAppSandboxMigrationTarget({
        provider: 'opensandbox',
        ...identity,
        reclaimHeartbeatBefore: new Date(0)
      })
    ).resolves.toBeNull();
  });

  it('fences any previous operation before deleting its record', async () => {
    const identity = createAppIdentity();
    const migrating = await claimAppSandboxMigrationTarget({
      provider: 'opensandbox',
      ...identity
    });
    const deleting = await claimSandboxOperation({
      resource: migrating!,
      status: SandboxInstanceStatusEnum.deleting,
      type: SandboxOperationTypeEnum.delete
    });

    await expect(
      deleteClaimedSandboxRecord({
        resource: deleting!,
        operationId: migrating!.metadata!.operation!.id
      })
    ).resolves.toMatchObject({ deletedCount: 0 });
    await expect(
      deleteClaimedSandboxRecord({
        resource: deleting!,
        operationId: deleting!.metadata!.operation!.id
      })
    ).resolves.toMatchObject({ deletedCount: 1 });
  });

  it('only returns stable running and stopped records to automatic jobs', async () => {
    const runningIdentity = createAppIdentity();
    const stoppedIdentity = createAppIdentity();
    const migratingIdentity = createAppIdentity();
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
    await claimAppSandboxMigrationTarget({ provider: 'opensandbox', ...migratingIdentity });

    expect(
      (await findInactiveRunningSandboxResources(new Date())).map((item) => item.sandboxId)
    ).toContain(runningIdentity.sandboxId);
    expect((await collectArchiveCursor(new Date())).map((item) => item.sandboxId)).toContain(
      stoppedIdentity.sandboxId
    );
    expect(
      (await findInactiveRunningSandboxResources(new Date())).map((item) => item.sandboxId)
    ).not.toContain(migratingIdentity.sandboxId);
  });

  it('claims and publishes a Skill migration target with the fixed logical user', async () => {
    const sourceId = `${prefix}skill-${getNanoid()}`;
    const sandboxId = `${prefix}${getNanoid()}`;
    const claimed = await claimSkillSandboxMigrationTarget({
      provider: 'opensandbox',
      sandboxId,
      sourceId,
      metadata: { teamId: 'team-1' }
    });

    expect(claimed).toMatchObject({
      sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId,
      userId: ChatSourceTypeEnum.skillEdit,
      status: SandboxInstanceStatusEnum.legacyMigrating
    });
    await completeSandboxOperation({
      resource: claimed!,
      operationId: claimed!.metadata!.operation!.id,
      fromStatus: SandboxInstanceStatusEnum.legacyMigrating,
      status: SandboxInstanceStatusEnum.running
    });
    await expect(
      findSandboxInstanceBySource({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId,
        userId: ChatSourceTypeEnum.skillEdit
      })
    ).resolves.toMatchObject({
      sandboxId,
      userId: ChatSourceTypeEnum.skillEdit,
      status: SandboxInstanceStatusEnum.running
    });
  });
});
