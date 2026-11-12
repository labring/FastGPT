import { describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  OwnerRoleVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { updateCollectionCollaboratorsWithAuth } from '@fastgpt/service/support/permission/collection/collaborator';

/** 建一个托管 dataset 及其 collection，并写入一条现有 ACL 用于观察是否被改写。 */
const createManagedCollection = async ({
  permissionSync
}: {
  permissionSync: boolean;
}) => {
  const teamId = String(new Types.ObjectId());
  const tmbId = String(new Types.ObjectId());
  const dataset = await MongoDataset.create({
    teamId,
    tmbId,
    name: 'collaborator-guard',
    type: DatasetTypeEnum.dataset,
    collectionPermissionEnabled: true,
    apiDatasetServer: {
      apiServer: { baseUrl: 'https://example.com' },
      permissionSync
    }
  });
  const collection = await MongoDatasetCollection.create({
    teamId,
    datasetId: dataset._id,
    tmbId,
    name: 'file',
    type: DatasetCollectionTypeEnum.file,
    inheritPermission: false
  });
  await MongoResourcePermission.create({
    teamId,
    resourceType: PerResourceTypeEnum.collection,
    resourceId: String(collection._id),
    tmbId,
    permission: OwnerRoleVal
  });
  return { teamId, tmbId, datasetId: String(dataset._id), collection };
};

describe('updateCollectionCollaboratorsWithAuth permission sync guard', () => {
  it('rejects collaborator writes on a managed dataset without touching ACL', async () => {
    const { teamId, tmbId, datasetId, collection } = await createManagedCollection({
      permissionSync: true
    });
    const authorize = vi.fn();

    await expect(
      updateCollectionCollaboratorsWithAuth({
        collection: {
          _id: String(collection._id),
          type: collection.type,
          teamId,
          parentId: null,
          datasetId,
          tmbId,
          inheritPermission: false
        },
        collaborators: [],
        authorize
      })
    ).rejects.toBe(DatasetErrEnum.permissionSyncManaged);

    expect(authorize).not.toHaveBeenCalled();
    const rows = await MongoResourcePermission.find({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: String(collection._id)
    }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].permission).toBe(OwnerRoleVal);
  });

  it('still allows collaborator writes on a manually enabled dataset', async () => {
    const { teamId, tmbId, datasetId, collection } = await createManagedCollection({
      permissionSync: false
    });

    const result = await updateCollectionCollaboratorsWithAuth({
      collection: {
        _id: String(collection._id),
        type: collection.type,
        teamId,
        parentId: null,
        datasetId,
        tmbId,
        inheritPermission: false
      },
      collaborators: [{ tmbId, permission: OwnerRoleVal }],
      authorize: vi.fn()
    });

    expect(result.updated).toBe(false);
  });
});
