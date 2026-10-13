import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  advanceSandboxOperation,
  claimSandboxOperation,
  completeSandboxOperation,
  createSandboxProvisioningInstance,
  createSandboxResourcesToArchiveCursor,
  deleteClaimedSandboxRecord,
  findInactiveRunningSandboxResources,
  markSandboxOperationFailed,
  switchArchivedSandboxProvider,
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
  });

  it('creates one provisioning claim and never upserts a running record', async () => {
    const identity = createAppIdentity();
    const first = await createSandboxProvisioningInstance({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      teamId: 'team-1'
    });
    const duplicate = await createSandboxProvisioningInstance({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity
    });

    expect(first.created).toBe(true);
    expect(first.instance).toMatchObject({
      status: SandboxInstanceStatusEnum.provisioning,
      operation: { type: SandboxOperationTypeEnum.provision, phase: 'claimed' }
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
      provider: 'opensandbox',
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
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...identity
      })
    ).resolves.toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      teamId: 'team-1'
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
        provider: 'opensandbox',
        sourceType: ChatSourceTypeEnum.app,
        ...identity,
        expectedWorkspaceClaimName: 'fastgpt-session-stale-generation'
      })
    ).resolves.toBeNull();
    await expect(
      touchRunningSandboxInstance({
        provider: 'opensandbox',
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

  it('switches provider only while the record remains archived and operation-free', async () => {
    const identity = createAppIdentity();
    const archived = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      ...identity,
      status: SandboxInstanceStatusEnum.archived,
      lastActiveAt: oldDate,
      createdAt: oldDate
    });
    const resource = archived.toObject() as SandboxResourceDoc;

    await expect(
      switchArchivedSandboxProvider({
        resource,
        provider: 'sealosdevbox',
        image: { repository: 'registry.example.com/sandbox', tag: 'v2' }
      })
    ).resolves.toMatchObject({
      provider: 'sealosdevbox',
      status: SandboxInstanceStatusEnum.archived,
      image: { repository: 'registry.example.com/sandbox', tag: 'v2' }
    });
    await expect(
      switchArchivedSandboxProvider({
        resource,
        provider: 'sealosdevbox',
        image: { repository: 'registry.example.com/sandbox', tag: 'v2' }
      })
    ).resolves.toBeNull();
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
});
