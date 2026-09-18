import updateHandler from '@/pages/api/core/dataset/update';
import type { UpdateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  createResourceDefaultCollaborators,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { enableDatasetCollectionPermissions } from '@fastgpt/service/support/permission/collection/enable';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach } from 'vitest';
import { RebuildEmbeddingBodySchema } from '@fastgpt/global/openapi/core/dataset/training/api';
import { getModelTestDefaults, setModelTestSnapshot } from '@test/modelCache';
import { getCachedModelHandle } from '@fastgpt/service/core/ai/config/handle';

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
      const previousModels = getCachedModelHandle()!.getAllModels();
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

  it('merges the target folder collaborators and forces inheritance when a dataset is moved', async () => {
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
    // Moving is itself a grant: the dataset always ends up inheriting from its new parent
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      parentId: String(target._id),
      inheritPermission: true
    });
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
});
