import { serviceEnv } from '@fastgpt/service/env';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import updateHandler from '@/pages/api/core/dataset/update';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import {
  DatasetCollectionTypeEnum,
  DatasetTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { UpdateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { RebuildEmbeddingBodySchema } from '@fastgpt/global/openapi/core/dataset/training/api';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getCachedSystemModelHandle } from '@fastgpt/service/core/ai/model/catalog/cache';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { enableDatasetCollectionPermissions } from '@fastgpt/service/support/permission/collection/enable';
import {
  createResourceDefaultCollaborators,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { getFakeUsers } from '@test/datas/users';
import { getModelTestDefaults, setModelTestSnapshot } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';

/** Snapshot ACL rows in a stable order so assertions compare exact permission sets. */
const toPermissionRows = (collaborators: { tmbId?: unknown; permission: number }[]) =>
  collaborators
    .map((collaborator) => ({
      tmbId: String(collaborator.tmbId),
      permission: collaborator.permission
    }))
    .sort((a, b) => a.tmbId.localeCompare(b.tmbId));

/** Materialize the owner snapshot of a freshly created dataset, same as the production create flow. */
const createDatasetWithOwnerSnapshot = async ({
  teamId,
  tmbId,
  name,
  type
}: {
  teamId: string;
  tmbId: string;
  name: string;
  type: DatasetTypeEnum;
}) => {
  const dataset = await MongoDataset.create({ teamId, tmbId, name, type });
  await mongoSessionRun((session) =>
    createResourceDefaultCollaborators({
      resource: {
        _id: String(dataset._id),
        type: dataset.type,
        teamId: String(dataset.teamId)
      },
      resourceType: PerResourceTypeEnum.dataset,
      tmbId: String(dataset.tmbId),
      session
    })
  );
  return dataset;
};

/** Replace a dataset ACL snapshot with the given full collaborator list. */
const setDatasetCollaborators = async ({
  datasetId,
  teamId,
  type,
  collaborators
}: {
  datasetId: string;
  teamId: string;
  type: string;
  collaborators: { tmbId: string; permission: number }[];
}) => {
  await mongoSessionRun(async (session) => {
    await updateResourceCollaborators({
      resource: { _id: datasetId, type, teamId },
      resourceModel: MongoDataset,
      resourceType: PerResourceTypeEnum.dataset,
      oldCollaborators: await getResourceOwnedClbs({
        teamId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      }),
      newCollaborators: collaborators,
      session
    });
  });
};

describe('update dataset', () => {
  it.each(['legacy', 'id', 'invalid-id', 'invalid-name', 'clear-id', 'clear-legacy'] as const)(
    'resolves legacy model updates without overriding canonical selections (%s)',
    async (mode) => {
      const owner = (await getFakeUsers(1)).members[0];
      const previousModels = getCachedSystemModelHandle()!.getAllModels();
      const llm = getModelTestDefaults().llm!;
      setModelTestSnapshot({
        models: previousModels.map((model) =>
          model.modelId === llm.modelId
            ? { ...llm, config: { ...llm.config, vision: true } }
            : model
        )
      });
      try {
        const dataset = await MongoDataset.create({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          name: 'legacy-update',
          type: DatasetTypeEnum.dataset,
          agentModelId: 'original-agent',
          vlmModelId: 'original-vlm',
          vlmModel: 'original-name'
        });
        const body: UpdateDatasetBody = {
          id: String(dataset._id),
          agentModel: llm.model,
          vlmModel: llm.model
        };
        if (mode === 'id') {
          Object.assign(body, {
            agentModelId: llm.modelId,
            vlmModelId: llm.modelId,
            agentModel: 'missing-legacy',
            vlmModel: 'missing-legacy'
          });
        } else if (mode === 'invalid-id') {
          body.agentModelId = 'missing-id';
        } else if (mode === 'invalid-name') {
          body.agentModel = 'missing-legacy';
        } else if (mode === 'clear-id') {
          body.vlmModelId = null;
        } else if (mode === 'clear-legacy') {
          body.vlmModel = '';
        }
        const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
          auth: owner,
          body
        });
        const updated = await MongoDataset.findById(dataset._id).lean();
        if (mode === 'invalid-id' || mode === 'invalid-name') {
          expect(res.code).not.toBe(200);
          expect(updated).toMatchObject({
            agentModelId: 'original-agent',
            vlmModelId: 'original-vlm'
          });
        } else {
          expect(res.code).toBe(200);
          expect(updated?.agentModelId).toBe(llm.modelId);
          if (mode === 'clear-id' || mode === 'clear-legacy') {
            expect(updated).not.toHaveProperty('vlmModelId');
            expect(updated).not.toHaveProperty('vlmModel');
          } else {
            expect(updated?.vlmModelId).toBe(llm.modelId);
          }
        }
      } finally {
        setModelTestSnapshot({ models: previousModels });
      }
    }
  );

  it.each([null, '', '   '])(
    'clears only the VLM including its legacy field (%s)',
    async (vlmModelId) => {
      const users = await getFakeUsers(1);
      const owner = users.members[0];
      const dataset = await MongoDataset.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'clear-vlm',
        type: DatasetTypeEnum.dataset,
        agentModelId: 'preserve-agent',
        vectorModelId: 'preserve-vector',
        vlmModelId: 'deleted-vlm',
        vlmModel: 'old-vision'
      });
      const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
        auth: owner,
        body: { id: String(dataset._id), vlmModelId }
      });
      expect(res.code).toBe(200);
      const updated = await MongoDataset.findById(dataset._id).lean();
      expect(updated).not.toHaveProperty('vlmModelId');
      expect(updated).not.toHaveProperty('vlmModel');
      expect(updated).toMatchObject({
        agentModelId: 'preserve-agent',
        vectorModelId: 'preserve-vector'
      });
    }
  );

  it('leaves VLM references untouched when the update omits the field', async () => {
    const users = await getFakeUsers(1);
    const owner = users.members[0];
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'keep',
      type: DatasetTypeEnum.dataset,
      vlmModelId: 'original-id',
      vlmModel: 'original-name'
    });
    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), name: 'renamed' }
    });
    expect(res.code).toBe(200);
    expect(await MongoDataset.findById(dataset._id).lean()).toMatchObject({
      vlmModelId: 'original-id',
      vlmModel: 'original-name'
    });
  });

  it.each([null, '', '   '])('rejects clearing text and embedding models (%s)', async (modelId) => {
    const users = await getFakeUsers(1);
    const owner = users.members[0];
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'required-model',
      type: DatasetTypeEnum.dataset,
      agentModelId: 'original-agent'
    });
    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), agentModelId: modelId } as any
    });
    expect(res.code).not.toBe(200);
    expect(await MongoDataset.findById(dataset._id).lean()).toMatchObject({
      agentModelId: 'original-agent'
    });
    expect(
      RebuildEmbeddingBodySchema.safeParse({
        datasetId: String(dataset._id),
        vectorModelId: modelId
      }).success
    ).toBe(false);
  });
  beforeEach(async () => {
    // Clean up any datasets created during tests
    await MongoDataset.deleteMany({});
  });

  it('should return 200 when update dataset with token auth', async () => {
    const users = await getFakeUsers(1);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamDatasetCreatePermissionVal
    });

    // Create a dataset via raw Mongo for testing update
    const dataset = await MongoDataset.create({
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      name: 'old-name',
      type: DatasetTypeEnum.dataset,
      updateTime: new Date('2026-01-01T00:00:00.000Z')
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: users.members[0],
      body: {
        id: String(dataset._id),
        name: 'updated-name'
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updatedDataset = await MongoDataset.findById(dataset._id).lean();
    expect(updatedDataset?.name).toBe('updated-name');
    expect(updatedDataset?.updateTime.getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00.000Z').getTime()
    );
  });

  it('should return 200 when update dataset with API Key auth (#7006)', async () => {
    const users = await getFakeUsers(1);

    // Create a dataset
    const dataset = await MongoDataset.create({
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      name: 'old-name',
      type: DatasetTypeEnum.dataset
    });

    // Verify authType is not apikey - this test ensures authApiKey flag is respected
    // by the parseHeaderCert mock which grants access based on the auth object
    const apikeyAuth = {
      ...users.members[0],
      authType: 'apikey' as const,
      apikey: 'test-api-key'
    };

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: apikeyAuth,
      body: {
        id: String(dataset._id),
        name: 'updated-by-apikey'
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
  });

  it('keeps an independent dataset isolated when moved into a shared folder', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'target-folder',
      type: DatasetTypeEnum.folder
    });
    await setDatasetCollaborators({
      datasetId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const dataset = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'independent-dataset',
      type: DatasetTypeEnum.dataset
    });
    await MongoDataset.updateOne({ _id: dataset._id }, { inheritPermission: false });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), parentId: String(target._id) }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    // 移动不改变自身继承状态：独立态移动后仍独立
    const updated = await MongoDataset.findById(dataset._id).lean();
    expect(String(updated?.parentId)).toBe(String(target._id));
    expect(updated?.inheritPermission).toBe(false);
    // 独立态移动不合并目标父级：快照保持不变
    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(dataset._id),
        resourceType: PerResourceTypeEnum.dataset
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );
  });

  it('merges the target folder collaborators when an inheriting dataset is moved', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'target-folder',
      type: DatasetTypeEnum.folder
    });
    await setDatasetCollaborators({
      datasetId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const dataset = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'inheriting-dataset',
      type: DatasetTypeEnum.dataset
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), parentId: String(target._id) }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    const updated = await MongoDataset.findById(dataset._id).lean();
    expect(String(updated?.parentId)).toBe(String(target._id));
    expect(updated?.inheritPermission).toBe(true);
    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(dataset._id),
        resourceType: PerResourceTypeEnum.dataset
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ])
    );
  });

  it.each([null, ''])(
    'keeps an independent dataset isolated when moved back to the dataset root (%s) and enforces team create permission',
    async (rootParentId) => {
      const { owner, members } = await getFakeUsers(1);
      const member = members[0];
      const teamId = String(owner.teamId);

      const folder = await createDatasetWithOwnerSnapshot({
        teamId,
        tmbId: String(owner.tmbId),
        name: 'folder',
        type: DatasetTypeEnum.folder
      });
      await setDatasetCollaborators({
        datasetId: String(folder._id),
        teamId,
        type: folder.type,
        collaborators: [
          { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
          { tmbId: String(member.tmbId), permission: OwnerRoleVal }
        ]
      });
      const dataset = await createDatasetWithOwnerSnapshot({
        teamId,
        tmbId: String(owner.tmbId),
        name: 'independent-dataset',
        type: DatasetTypeEnum.dataset
      });
      await setDatasetCollaborators({
        datasetId: String(dataset._id),
        teamId,
        type: dataset.type,
        collaborators: [
          { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
          { tmbId: String(member.tmbId), permission: ReadRoleVal }
        ]
      });
      await MongoDataset.updateOne(
        { _id: dataset._id },
        { parentId: String(folder._id), inheritPermission: false }
      );

      const denied = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
        auth: member,
        body: { id: String(dataset._id), parentId: rootParentId }
      });
      expect(denied.code).not.toBe(200);

      const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
        auth: owner,
        body: { id: String(dataset._id), parentId: rootParentId }
      });

      expect(res.error).toBeUndefined();
      expect(res.code).toBe(200);
      const updated = await MongoDataset.findById(dataset._id).lean();
      expect(updated?.parentId ?? null).toBeNull();
      expect(updated?.inheritPermission).toBe(false);
      await expect(
        getResourceOwnedClbs({
          teamId,
          resourceId: String(dataset._id),
          resourceType: PerResourceTypeEnum.dataset
        }).then(toPermissionRows)
      ).resolves.toEqual(
        toPermissionRows([
          { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
          { tmbId: String(member.tmbId), permission: ReadRoleVal }
        ])
      );
    }
  );

  it('rebases nested Dataset folder paths when an independent folder moves to root', async () => {
    const { owner } = await getFakeUsers(1);
    const rootFolder = await MongoDataset.create({
      name: 'root-folder',
      type: DatasetTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const movingFolder = await MongoDataset.create({
      name: 'moving-folder',
      type: DatasetTypeEnum.folder,
      parentId: rootFolder._id,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      inheritPermission: false,
      ancestorIds: [rootFolder._id]
    });
    const childFolder = await MongoDataset.create({
      name: 'child-folder',
      type: DatasetTypeEnum.folder,
      parentId: movingFolder._id,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      ancestorIds: [rootFolder._id, movingFolder._id]
    });
    const leaf = await MongoDataset.create({
      name: 'leaf-dataset',
      type: DatasetTypeEnum.dataset,
      parentId: childFolder._id,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    const response = await Call(updateHandler, {
      auth: owner,
      body: { id: String(movingFolder._id), parentId: null }
    });
    expect(response.error).toBeUndefined();
    expect(await MongoDataset.findById(movingFolder._id).lean()).toMatchObject({
      parentId: null,
      ancestorIds: []
    });
    const updatedChildFolder = await MongoDataset.findById(childFolder._id).lean();
    expect(String(updatedChildFolder?.parentId)).toBe(String(movingFolder._id));
    expect(updatedChildFolder?.ancestorIds?.map(String)).toEqual([String(movingFolder._id)]);
    expect(await MongoDataset.findById(leaf._id).lean()).not.toHaveProperty('ancestorIds');
  });

  it('rebases inherited Dataset folder paths when a folder moves under another tree', async () => {
    const { owner } = await getFakeUsers(1);
    const teamId = String(owner.teamId);
    const createFolder = (name: string) =>
      createDatasetWithOwnerSnapshot({
        teamId,
        tmbId: String(owner.tmbId),
        name,
        type: DatasetTypeEnum.folder
      });
    const targetRoot = await createFolder('target-root');
    const targetParent = await createFolder('target-parent');
    await MongoDataset.updateOne(
      { _id: targetParent._id },
      { $set: { parentId: targetRoot._id, ancestorIds: [targetRoot._id] } }
    );
    const sourceRoot = await createFolder('source-root');
    const movingFolder = await createFolder('moving-folder');
    await MongoDataset.updateOne(
      { _id: movingFolder._id },
      { $set: { parentId: sourceRoot._id, ancestorIds: [sourceRoot._id] } }
    );
    const descendant = await createFolder('descendant-folder');
    await MongoDataset.updateOne(
      { _id: descendant._id },
      { $set: { parentId: movingFolder._id, ancestorIds: [sourceRoot._id, movingFolder._id] } }
    );

    const response = await Call(updateHandler, {
      auth: owner,
      body: { id: String(movingFolder._id), parentId: String(targetParent._id) }
    });
    expect(response.error).toBeUndefined();

    const moved = await MongoDataset.findById(movingFolder._id).lean();
    const movedDescendant = await MongoDataset.findById(descendant._id).lean();
    expect(moved?.ancestorIds?.map(String)).toEqual([
      String(targetRoot._id),
      String(targetParent._id)
    ]);
    expect(movedDescendant?.ancestorIds?.map(String)).toEqual([
      String(targetRoot._id),
      String(targetParent._id),
      String(movingFolder._id)
    ]);
    expect(String(movedDescendant?.parentId)).toBe(String(movingFolder._id));
  });

  it('does not re-materialize collection permissions when an independent dataset is moved', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'shared-folder',
      type: DatasetTypeEnum.folder
    });
    await setDatasetCollaborators({
      datasetId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const dataset = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'independent-dataset',
      type: DatasetTypeEnum.dataset
    });
    await MongoDataset.updateOne({ _id: dataset._id }, { inheritPermission: false });
    const collection = await MongoDatasetCollection.create({
      teamId,
      tmbId: String(owner.tmbId),
      datasetId: String(dataset._id),
      name: 'file',
      type: DatasetCollectionTypeEnum.file
    });
    await enableDatasetCollectionPermissions({ teamId, datasetId: String(dataset._id) });

    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(collection._id),
        resourceType: PerResourceTypeEnum.collection
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), parentId: String(target._id) }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    // 独立态 dataset 的有效 clbs 未变，collection 快照无需（也不应）重物化
    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(collection._id),
        resourceType: PerResourceTypeEnum.collection
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );
  });

  it('re-materializes collection permissions when the dataset is moved', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    // Target folder is readable by a team member, so the dataset ACL changes on move
    const target = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'shared-folder',
      type: DatasetTypeEnum.folder
    });
    await setDatasetCollaborators({
      datasetId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    // Root dataset with one root collection, collection permissions enabled
    const dataset = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'dataset',
      type: DatasetTypeEnum.dataset
    });
    const collection = await MongoDatasetCollection.create({
      teamId,
      tmbId: String(owner.tmbId),
      datasetId: String(dataset._id),
      name: 'file',
      type: DatasetCollectionTypeEnum.file
    });
    await enableDatasetCollectionPermissions({ teamId, datasetId: String(dataset._id) });

    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(collection._id),
        resourceType: PerResourceTypeEnum.collection
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), parentId: String(target._id) }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    // Dataset effective clbs changed, so the root collection snapshot is re-materialized in the same move
    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(collection._id),
        resourceType: PerResourceTypeEnum.collection
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([
        { tmbId: String(member.tmbId), permission: ReadRoleVal },
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal }
      ])
    );
  });

  it('does not touch training jobs when updating dataset models', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const llm = getModelTestDefaults().llm!;
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'model-update-dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: 'original-agent'
    });

    const fixedLockTime = new Date('2026-05-01T12:00:00Z');
    const trainingJob = await MongoDatasetTraining.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id,
      collectionId: new Types.ObjectId(),
      billId: 'bill-1',
      mode: TrainingModeEnum.qa,
      retryCount: 1,
      lockTime: fixedLockTime
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), agentModelId: llm.modelId }
    });

    expect(res.code).toBe(200);

    const savedDataset = await MongoDataset.findById(dataset._id).lean();
    expect(savedDataset?.agentModelId).toBe(llm.modelId);

    const afterJob = await MongoDatasetTraining.findById(trainingJob._id).lean();
    expect(afterJob?.retryCount).toBe(1);
    expect(afterJob?.lockTime.toISOString()).toBe(fixedLockTime.toISOString());
  });

  it('write 协作者不能更新知识库信息，manage 可以', async () => {
    const { owner, members } = await getFakeUsers(2);
    const [writeMember, manageMember] = members;
    const teamId = String(owner.teamId);
    const dataset = await createDatasetWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'update-permission-dataset',
      type: DatasetTypeEnum.dataset
    });
    await setDatasetCollaborators({
      datasetId: String(dataset._id),
      teamId,
      type: dataset.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(writeMember.tmbId), permission: WriteRoleVal },
        { tmbId: String(manageMember.tmbId), permission: ManageRoleVal }
      ]
    });

    const denied = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: writeMember,
      body: { id: String(dataset._id), name: 'renamed-by-write' }
    });
    expect(denied.code).not.toBe(200);
    expect((await MongoDataset.findById(dataset._id).lean())?.name).toBe(
      'update-permission-dataset'
    );

    const allowed = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: manageMember,
      body: { id: String(dataset._id), name: 'renamed-by-manage' }
    });
    expect(allowed.code).toBe(200);
    expect((await MongoDataset.findById(dataset._id).lean())?.name).toBe('renamed-by-manage');
  });
});

describe('update dataset audit', () => {
  /**
   * 审计是 fire-and-forget 写入，接口返回时可能还没落库；
   * 这里轮询到期望条数再断言，避免用 sleep 固定等待导致偶发失败。
   */
  const waitForAuditLogs = async (teamId: string, expected: number) => {
    for (let i = 0; i < 50; i++) {
      const logs = await MongoTeamAudit.find({
        teamId,
        event: DatasetAuditEventEnum.DATASET_CONFIG_UPDATE
      })
        .sort({ _id: 1 })
        .lean();
      if (logs.length >= expected) return logs;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return [];
  };

  const readAuditLogs = async (teamId: string) =>
    MongoTeamAudit.find({ teamId, event: DatasetAuditEventEnum.DATASET_CONFIG_UPDATE })
      .sort({ _id: 1 })
      .lean();

  it('writes one audit log per changed config item', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'audit-old-name',
      intro: 'old intro',
      type: DatasetTypeEnum.dataset
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: {
        id: String(dataset._id),
        name: 'audit-new-name',
        intro: 'new intro'
      }
    });

    expect(res.code).toBe(200);

    const logs = await waitForAuditLogs(owner.teamId, 2);
    expect(logs).toHaveLength(2);

    // 每个配置项单独成条，字段名走 i18n key，值保留「旧 → 新」可比对文本
    expect(logs.map((log) => log.metadata?.changeItem)).toEqual([
      'account_team:dataset_config_item_name',
      'account_team:dataset_config_item_intro'
    ]);
    expect(logs[0].metadata).toMatchObject({
      datasetName: 'audit-new-name',
      oldValue: 'audit-old-name',
      newValue: 'audit-new-name'
    });
    expect(logs[1].metadata).toMatchObject({
      oldValue: 'old intro',
      newValue: 'new intro'
    });
    expect(String(logs[0].tmbId)).toBe(owner.tmbId);
  });

  it('does not write audit logs when submitted values equal the stored ones', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'unchanged-name',
      intro: 'unchanged intro',
      type: DatasetTypeEnum.dataset
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: {
        id: String(dataset._id),
        name: 'unchanged-name',
        intro: 'unchanged intro'
      }
    });

    expect(res.code).toBe(200);
    // 前端回传原值不应产生噪声日志
    expect(await readAuditLogs(owner.teamId)).toHaveLength(0);
  });

  it('writes model display names instead of raw model ids', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const previousModels = getCachedSystemModelHandle()!.getAllModels();
    const llm = getModelTestDefaults().llm!;
    // 造一个带自定义展示名的模型目录条目，验证审计写的是 name 而不是 modelId
    const customModel = {
      ...llm,
      modelId: new Types.ObjectId().toHexString(),
      model: 'audit-custom-model',
      name: '审计用自定义模型'
    };
    setModelTestSnapshot({ models: [...previousModels, customModel] });
    try {
      const dataset = await MongoDataset.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'audit-model-name',
        type: DatasetTypeEnum.dataset,
        agentModelId: llm.modelId
      });

      const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
        auth: owner,
        body: {
          id: String(dataset._id),
          agentModelId: customModel.modelId
        }
      });

      expect(res.code).toBe(200);

      const logs = await waitForAuditLogs(owner.teamId, 1);
      expect(logs).toHaveLength(1);
      expect(logs[0].metadata?.changeItem).toBe('account_team:dataset_config_item_agentModel');
      // 审计展示的是模型名，不能出现一串 ObjectId
      expect(logs[0].metadata?.newValue).toBe('审计用自定义模型');
      expect(logs[0].metadata?.oldValue).toBe(llm.name);
      expect(JSON.stringify(logs[0].metadata)).not.toContain(customModel.modelId);
      expect(JSON.stringify(logs[0].metadata)).not.toContain(llm.modelId);
    } finally {
      setModelTestSnapshot({ models: previousModels });
    }
  });

  it('logs agent and VLM model changes when distinct IDs share one display name', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const previousModels = getCachedSystemModelHandle()!.getAllModels();
    const llm = getModelTestDefaults().llm!;
    const sharedName = '审核用同名模型';
    const oldModel = {
      ...llm,
      modelId: new Types.ObjectId().toHexString(),
      model: 'audit-old-model',
      name: sharedName,
      config: { ...llm.config, vision: true }
    };
    const newModel = {
      ...llm,
      modelId: new Types.ObjectId().toHexString(),
      model: 'audit-new-model',
      name: sharedName,
      config: { ...llm.config, vision: true }
    };
    setModelTestSnapshot({ models: [...previousModels, oldModel, newModel] });

    try {
      const dataset = await MongoDataset.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'audit-same-model-name',
        type: DatasetTypeEnum.dataset,
        agentModelId: oldModel.modelId,
        vlmModelId: oldModel.modelId
      });

      const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
        auth: owner,
        body: {
          id: String(dataset._id),
          agentModelId: newModel.modelId,
          vlmModelId: newModel.modelId
        }
      });

      expect(res.code).toBe(200);

      const logs = await waitForAuditLogs(owner.teamId, 2);
      expect(logs).toHaveLength(2);
      expect(logs.map((log) => log.metadata?.changeItem)).toEqual([
        'account_team:dataset_config_item_agentModel',
        'account_team:dataset_config_item_vlmModel'
      ]);
      expect(logs.map((log) => [log.metadata?.oldValue, log.metadata?.newValue])).toEqual([
        [sharedName, sharedName],
        [sharedName, sharedName]
      ]);
      expect(JSON.stringify(logs)).not.toContain(oldModel.modelId);
      expect(JSON.stringify(logs)).not.toContain(newModel.modelId);
    } finally {
      setModelTestSnapshot({ models: previousModels });
    }
  });

  it('never leaks a raw model id when the stored model no longer exists', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const previousModels = getCachedSystemModelHandle()!.getAllModels();
    const llm = getModelTestDefaults().llm!;
    const deletedModelId = new Types.ObjectId().toHexString();

    // 模拟「原模型已被删除」的历史知识库：库里只剩一串 modelId
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'audit-deleted-model',
      type: DatasetTypeEnum.dataset,
      agentModelId: deletedModelId
    });

    try {
      const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
        auth: owner,
        body: { id: String(dataset._id), agentModelId: llm.modelId }
      });

      expect(res.code).toBe(200);

      const logs = await waitForAuditLogs(owner.teamId, 1);
      expect(logs).toHaveLength(1);
      // 旧值查不到模型时退回占位 i18n key（由前端按语言翻译），而不是把 ObjectId 写进日志
      expect(logs[0].metadata?.oldValue).toBe('common:UnKnow');
      expect(logs[0].metadata?.newValue).toBe(llm.name);
      expect(JSON.stringify(logs[0].metadata)).not.toContain(deletedModelId);
    } finally {
      setModelTestSnapshot({ models: previousModels });
    }
  });

  it('records a VLM clear with its old display name and an empty new value', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const previousModels = getCachedSystemModelHandle()!.getAllModels();
    const llm = getModelTestDefaults().llm!;
    const visionModel = {
      ...llm,
      modelId: new Types.ObjectId().toHexString(),
      model: 'audit-clear-vlm',
      name: '可读图片模型',
      config: { ...llm.config, vision: true }
    };
    setModelTestSnapshot({ models: [...previousModels, visionModel] });

    try {
      const dataset = await MongoDataset.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'audit-clear-vlm',
        type: DatasetTypeEnum.dataset,
        vlmModelId: visionModel.modelId,
        vlmModel: visionModel.model
      });

      const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
        auth: owner,
        body: { id: String(dataset._id), vlmModelId: null }
      });

      expect(res.code).toBe(200);
      const logs = await waitForAuditLogs(owner.teamId, 1);
      expect(logs).toHaveLength(1);
      expect(logs[0].metadata).toMatchObject({
        changeItem: 'account_team:dataset_config_item_vlmModel',
        oldValue: '可读图片模型',
        newValue: '-'
      });
      expect(JSON.stringify(logs[0].metadata)).not.toContain(visionModel.modelId);

      const updatedDataset = await MongoDataset.findById(dataset._id).lean();
      expect(updatedDataset).not.toHaveProperty('vlmModelId');
      expect(updatedDataset).not.toHaveProperty('vlmModel');
    } finally {
      setModelTestSnapshot({ models: previousModels });
    }
  });

  it('splits object config into changed fields instead of dumping raw json', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'audit-website',
      type: DatasetTypeEnum.websiteDataset,
      websiteConfig: {
        url: 'https://doc.example.com/guide',
        selector: 'body'
      }
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: {
        id: String(dataset._id),
        websiteConfig: {
          url: 'https://doc.example.com/guide',
          selector: '#content'
        }
      }
    });

    expect(res.code).toBe(200);

    const logs = await waitForAuditLogs(owner.teamId, 1);
    // 只有真正变化的字段进日志：url 未变不记录，selector 变化单独一条
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({
      changeItem: 'account_team:dataset_config_item_websiteConfig · selector',
      oldValue: 'body',
      newValue: '#content'
    });
    // 子文档 _id（Buffer）不能出现在展示文本里
    expect(JSON.stringify(logs[0].metadata)).not.toContain('buffer');
  });

  it('uses persisted partial API server updates for audits and logs only credential rotations', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const baseUrl = 'https://api.example.com';
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'audit-partial-api-config',
      type: DatasetTypeEnum.apiDataset,
      apiDatasetServer: {
        apiServer: {
          baseUrl,
          authorization: 'Bearer old-secret',
          basePath: '/v1'
        }
      }
    });

    // API update expands only submitted leaf fields; omitted credentials and basePath stay intact.
    const partialRes = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), apiDatasetServer: { apiServer: { baseUrl } } }
    });
    expect(partialRes.code).toBe(200);
    expect(await readAuditLogs(owner.teamId)).toHaveLength(0);
    expect((await MongoDataset.findById(dataset._id).lean())?.apiDatasetServer).toEqual({
      apiServer: { baseUrl, authorization: 'Bearer old-secret', basePath: '/v1' }
    });

    const rotateRes = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: {
        id: String(dataset._id),
        apiDatasetServer: { apiServer: { baseUrl, authorization: 'Bearer new-secret' } }
      }
    });
    expect(rotateRes.code).toBe(200);

    const logs = await waitForAuditLogs(owner.teamId, 1);
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({
      changeItem: 'account_team:dataset_config_item_apiDatasetServer · apiServer.authorization',
      oldValue: '[REDACTED]',
      newValue: '[REDACTED]'
    });
    expect(JSON.stringify(logs)).not.toContain('old-secret');
    expect(JSON.stringify(logs)).not.toContain('new-secret');
    expect((await MongoDataset.findById(dataset._id).lean())?.apiDatasetServer).toEqual({
      apiServer: { baseUrl, authorization: 'Bearer new-secret', basePath: '/v1' }
    });

    const unchangedRes = await Call<UpdateDatasetBody, Record<string, never>, string>(
      updateHandler,
      {
        auth: owner,
        body: {
          id: String(dataset._id),
          apiDatasetServer: { apiServer: { baseUrl, authorization: 'Bearer new-secret' } }
        }
      }
    );
    expect(unchangedRes.code).toBe(200);
    expect(await readAuditLogs(owner.teamId)).toHaveLength(1);
  });

  it('redacts credentials inside source configuration from audit logs', async () => {
    const owner = (await getFakeUsers(1)).members[0];
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'audit-secret',
      type: DatasetTypeEnum.apiDataset
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: {
        id: String(dataset._id),
        apiDatasetServer: {
          apiServer: {
            baseUrl: 'https://api.example.com',
            authorization: 'Bearer secret-token'
          }
        }
      }
    });

    expect(res.code).toBe(200);

    const logs = await waitForAuditLogs(owner.teamId, 2);
    // 对象型配置拆成叶子字段：baseUrl 与 authorization 各一条
    expect(logs.map((log) => log.metadata?.changeItem)).toEqual([
      'account_team:dataset_config_item_apiDatasetServer · apiServer.baseUrl',
      'account_team:dataset_config_item_apiDatasetServer · apiServer.authorization'
    ]);
    // 凭据字段必须以脱敏形式落库，不能被原文写入操作日志
    expect(JSON.stringify(logs)).not.toContain('secret-token');
    expect(logs[1].metadata?.newValue).toBe('[REDACTED]');
  });
});

it('rejects moving a leaf beneath another leaf without changing its parent', async () => {
  const { owner } = await getFakeUsers(1);
  const props = { teamId: owner.teamId, tmbId: owner.tmbId, type: DatasetTypeEnum.dataset };
  const target = await MongoDataset.create({ ...props, name: 'leaf-target' });
  const source = await MongoDataset.create({ ...props, name: 'source' });
  const res = await Call(updateHandler, {
    auth: owner,
    body: { id: String(source._id), parentId: String(target._id) }
  });
  expect(res.error).toBe(CommonErrEnum.invalidParams);
  expect((await MongoDataset.findById(source._id).lean())?.parentId).toBeNull();
});

describe('configured move depth', () => {
  it('enforces configured depth for Dataset moves', async () => {
    const folderType = DatasetTypeEnum.folder;
    const { owner } = await getFakeUsers(1);
    const scope = { teamId: owner.teamId, tmbId: owner.tmbId };
    const targets: string[] = [];
    for (let i = 0; i < serviceEnv.MAX_FOLDER_DEPTH; i++) {
      const folder = await MongoDataset.create({
        ...scope,
        name: `target-${i}`,
        type: folderType,
        parentId: targets.at(-1) ?? null,
        ancestorIds: [...targets]
      });
      targets.push(String(folder._id));
    }
    const oldParent = await MongoDataset.create({ ...scope, name: 'old-parent', type: folderType });
    const moving = await MongoDataset.create({
      ...scope,
      name: 'moving',
      type: folderType,
      parentId: oldParent._id,
      ancestorIds: [oldParent._id],
      inheritPermission: false
    });
    const child = await MongoDataset.create({
      ...scope,
      name: 'child',
      type: folderType,
      parentId: moving._id,
      ancestorIds: [oldParent._id, moving._id],
      inheritPermission: false
    });
    const snapshot = () =>
      MongoDataset.find({ _id: { $in: [moving._id, child._id] } })
        .select('_id parentId ancestorIds')
        .sort('_id')
        .lean();
    const before = await snapshot();
    const move = (id: string, parentId: string | null) =>
      Call(updateHandler, { auth: owner, body: { id: String(id), parentId } });
    const denied = await move(String(moving._id), targets.at(-2)!);
    expect(denied.error).toBe(CommonErrEnum.folderMoveDepthLimit);
    expect(await snapshot()).toEqual(before);

    const parentIds = targets.slice(0, -2);
    const moved = await move(String(moving._id), parentIds.at(-1) ?? null);
    expect(moved.code).toBe(200);
    expect((await MongoDataset.findById(moving._id).lean())?.ancestorIds.map(String)).toEqual(
      parentIds
    );
    expect((await MongoDataset.findById(child._id).lean())?.ancestorIds.map(String)).toEqual([
      ...parentIds,
      String(moving._id)
    ]);
    const leaf = await MongoDataset.create({
      ...scope,
      name: 'leaf-at-limit',
      type: DatasetTypeEnum.dataset,
      inheritPermission: false
    });
    expect((await move(String(leaf._id), targets.at(-1)!)).code).toBe(200);
    expect(String((await MongoDataset.findById(leaf._id).lean())?.parentId)).toBe(targets.at(-1));
  });
});
