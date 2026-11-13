import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  advanceSandboxOperation,
  claimSandboxOperation,
  completeSandboxOperation,
  countActiveSandboxInstances,
  createSandboxProvisioningInstance,
  deleteClaimedSandboxRecord,
  deleteUnprovisionedSandboxRecord,
  findExistingSandboxVolumeClaimNames,
  findInactiveRunningSandboxResources,
  findStaleSandboxOperations,
  markSandboxOperationFailed,
  touchRunningSandboxInstance,
  updateSandboxInstanceRecordBySandboxId,
  updateStoppedSandboxImage,
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

describe('sandbox instance lifecycle repository', () => {
  beforeAll(async () => {
    await MongoSandboxInstance.init();
  });

  beforeEach(async () => {
    await MongoSandboxInstance.deleteMany({ sandboxId: new RegExp(`^${prefix}`) });
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

  it('publishes provisioning only for the current operation token and enforces instanceId invariants', async () => {
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
        operationId,
        fromStatus: SandboxInstanceStatusEnum.provisioning,
        status: SandboxInstanceStatusEnum.running,
        touchActive: true
      })
    ).rejects.toThrow('Running status requires a non-empty instanceId');

    await expect(
      completeSandboxOperation({
        resource: instance!,
        operationId: 'stale-token',
        fromStatus: SandboxInstanceStatusEnum.provisioning,
        status: SandboxInstanceStatusEnum.running,
        set: { instanceId: 'remote-instance-1' },
        touchActive: true
      })
    ).resolves.toBeNull();

    await expect(
      completeSandboxOperation({
        resource: instance!,
        operationId,
        fromStatus: SandboxInstanceStatusEnum.provisioning,
        status: SandboxInstanceStatusEnum.running,
        set: { instanceId: 'remote-instance-1' },
        touchActive: true
      })
    ).resolves.toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'remote-instance-1'
    });

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
      status: SandboxInstanceStatusEnum.running,
      set: { instanceId: 'remote-instance-1' }
    });

    await expect(
      touchRunningSandboxInstance({
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        resourceLimits: { cpuCount: 2, memoryMiB: 2048 }
      })
    ).resolves.toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      teamId: 'team-1',
      resourceLimits: { cpuCount: 2, memoryMiB: 2048 }
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
          mountPath: '/workspace',
          readOnly: false
        }
      ]
    };
    const running = await MongoSandboxInstance.create({
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1',
      instanceId: 'remote-instance-1',
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

  it('advances, fails and completes a stop operation with CAS fencing and clears instanceId', async () => {
    const identity = createAppIdentity();
    const running = await MongoSandboxInstance.create({
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1',
      instanceId: 'remote-instance-1',
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
      type: SandboxOperationTypeEnum.stop
    });
    expect(retried?.operation?.id).not.toBe(operationId);
    await expect(
      completeSandboxOperation({
        resource: retried!,
        operationId: retried!.operation!.id,
        fromStatus: SandboxInstanceStatusEnum.stopping,
        status: SandboxInstanceStatusEnum.stopped,
        set: { instanceId: 'illegal-on-stop' }
      })
    ).rejects.toThrow('Stopped status must not keep an instanceId');
    await expect(
      completeSandboxOperation({
        resource: claimed!,
        operationId,
        fromStatus: SandboxInstanceStatusEnum.stopping,
        status: SandboxInstanceStatusEnum.stopped
      })
    ).resolves.toBeNull();
    const completed = await completeSandboxOperation({
      resource: retried!,
      operationId: retried!.operation!.id,
      fromStatus: SandboxInstanceStatusEnum.stopping,
      status: SandboxInstanceStatusEnum.stopped
    });
    expect(completed).toMatchObject({ status: SandboxInstanceStatusEnum.stopped });
    expect(completed?.instanceId).toBeUndefined();
  });

  it('updates image only while the record remains stopped and operation-free', async () => {
    const identity = createAppIdentity();
    const stopped = await MongoSandboxInstance.create({
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1',
      status: SandboxInstanceStatusEnum.stopped,
      lastActiveAt: oldDate,
      createdAt: oldDate
    });
    const resource = stopped.toObject() as SandboxResourceDoc;

    await expect(
      updateStoppedSandboxImage({
        resource,
        image: 'registry.example.com/sandbox:v2'
      })
    ).resolves.toMatchObject({
      status: SandboxInstanceStatusEnum.stopped,
      image: 'registry.example.com/sandbox:v2'
    });
  });

  it('fences any previous operation before deleting its record', async () => {
    const identity = createAppIdentity();
    const stable = await MongoSandboxInstance.create({
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1',
      instanceId: 'remote-instance-1',
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

  it('deletes unprovisioned record only while still in provisioning claimed phase with matching token', async () => {
    const firstIdentity = createAppIdentity();
    const { instance: unprovisioned } = await createSandboxProvisioningInstance({
      sourceType: ChatSourceTypeEnum.app,
      ...firstIdentity,
      teamId: 'team-1'
    });
    await expect(
      deleteUnprovisionedSandboxRecord({
        resource: unprovisioned!,
        operationId: 'wrong-token'
      })
    ).resolves.toMatchObject({ deletedCount: 0 });
    await expect(
      deleteUnprovisionedSandboxRecord({
        resource: unprovisioned!,
        operationId: unprovisioned!.operation!.id
      })
    ).resolves.toMatchObject({ deletedCount: 1 });

    const secondIdentity = createAppIdentity();
    const { instance: provisioned } = await createSandboxProvisioningInstance({
      sourceType: ChatSourceTypeEnum.app,
      ...secondIdentity,
      teamId: 'team-1'
    });
    await advanceSandboxOperation({
      resource: provisioned!,
      operationId: provisioned!.operation!.id,
      status: SandboxInstanceStatusEnum.provisioning,
      phase: 'providerEnsured'
    });
    await expect(
      deleteUnprovisionedSandboxRecord({
        resource: provisioned!,
        operationId: provisioned!.operation!.id
      })
    ).resolves.toMatchObject({ deletedCount: 0 });
  });

  it('only returns stable running records to inactive stop jobs', async () => {
    const runningIdentity = createAppIdentity();
    const stoppedIdentity = createAppIdentity();
    await MongoSandboxInstance.create([
      {
        sourceType: ChatSourceTypeEnum.app,
        ...runningIdentity,
        teamId: 'team-1',
        instanceId: 'remote-instance-1',
        status: SandboxInstanceStatusEnum.running,
        lastActiveAt: oldDate,
        createdAt: oldDate
      },
      {
        sourceType: ChatSourceTypeEnum.app,
        ...stoppedIdentity,
        teamId: 'team-1',
        status: SandboxInstanceStatusEnum.stopped,
        lastActiveAt: oldDate,
        createdAt: oldDate
      }
    ]);
    const inactiveRunning = (await findInactiveRunningSandboxResources(new Date())).map(
      (item) => item.sandboxId
    );
    expect(inactiveRunning).toContain(runningIdentity.sandboxId);
    expect(inactiveRunning).not.toContain(stoppedIdentity.sandboxId);
  });

  it('counts active instances across sources, with optional team filtering', async () => {
    const teamId = `${prefix}team-${getNanoid()}`;
    const otherTeamId = `${prefix}other-team-${getNanoid()}`;
    const fixtures = [
      {
        status: SandboxInstanceStatusEnum.provisioning,
        operationType: SandboxOperationTypeEnum.provision,
        teamId
      },
      { status: SandboxInstanceStatusEnum.running, instanceId: 'remote-1', teamId },
      {
        status: SandboxInstanceStatusEnum.stopping,
        operationType: SandboxOperationTypeEnum.stop,
        teamId
      },
      { status: SandboxInstanceStatusEnum.stopped, teamId },
      {
        status: SandboxInstanceStatusEnum.deleting,
        operationType: SandboxOperationTypeEnum.delete,
        teamId
      },
      { status: SandboxInstanceStatusEnum.running, instanceId: 'remote-2', teamId: otherTeamId }
    ] as const;
    const baseline = await countActiveSandboxInstances();
    await MongoSandboxInstance.create(
      fixtures.map((fixture, index) => ({
        sourceType: index % 2 ? ChatSourceTypeEnum.skillEdit : ChatSourceTypeEnum.app,
        ...createAppIdentity(),
        teamId: fixture.teamId,
        status: fixture.status,
        ...('instanceId' in fixture ? { instanceId: fixture.instanceId } : {}),
        lastActiveAt: oldDate,
        createdAt: oldDate,
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

    // 三种活跃状态（provisioning / running / stopping）计入配额；stopped 与 deleting 不占额。
    expect(await countActiveSandboxInstances()).toBe(baseline + 4);
    expect(await countActiveSandboxInstances({ teamId })).toBe(3);
    expect(await countActiveSandboxInstances({ teamId: otherTeamId })).toBe(1);
    expect(await countActiveSandboxInstances({ teamId: `${prefix}missing-team` })).toBe(0);
  });

  it('updates context.skillVersionId via dot-path and resolves existing claimNames via multikey index', async () => {
    const identity = createAppIdentity();
    const claimName = `fastgpt-session-${identity.sandboxId}-12345678`;
    await MongoSandboxInstance.create({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: identity.sourceId,
      userId: ChatSourceTypeEnum.skillEdit,
      sandboxId: identity.sandboxId,
      teamId: 'team-skill',
      instanceId: 'remote-skill-1',
      status: SandboxInstanceStatusEnum.running,
      storage: {
        volumes: [{ name: 'workspace', claimName, mountPath: '/workspace' }]
      },
      context: {
        skillVersionId: 'version-1'
      },
      lastActiveAt: oldDate,
      createdAt: oldDate
    });

    const updated = await updateSandboxInstanceRecordBySandboxId({
      sandboxId: identity.sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: identity.sourceId,
      userId: ChatSourceTypeEnum.skillEdit,
      touchActive: true,
      context: {
        skillVersionId: 'version-2'
      }
    });
    expect(updated?.context).toEqual({ skillVersionId: 'version-2' });

    const matchedClaims = await findExistingSandboxVolumeClaimNames([claimName, 'missing-claim']);
    expect([...matchedClaims]).toEqual([claimName]);
  });
});
