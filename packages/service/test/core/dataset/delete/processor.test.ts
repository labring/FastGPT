import { describe, expect, it, vi } from 'vitest';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { datasetDeleteProcessor } from '@fastgpt/service/core/dataset/delete/processor';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getUser } from '@test/datas/users';

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    deleteDatasetFilesByPrefix: vi.fn()
  })
}));

describe('datasetDeleteProcessor', () => {
  it('deletes permissions for the dataset and all its children', async () => {
    const user = await getUser('dataset-delete-permission');
    const otherTeamUser = await getUser('dataset-delete-permission-other-team');
    const deleteTime = new Date();

    const rootDataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'root folder',
      type: DatasetTypeEnum.folder,
      deleteTime
    });
    const childDataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      parentId: rootDataset._id,
      name: 'child dataset',
      type: DatasetTypeEnum.dataset,
      deleteTime
    });
    const retainedDataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'retained dataset',
      type: DatasetTypeEnum.dataset
    });
    const otherTeamDataset = await MongoDataset.create({
      teamId: otherTeamUser.teamId,
      tmbId: otherTeamUser.tmbId,
      name: 'other team dataset',
      type: DatasetTypeEnum.dataset,
      deleteTime
    });

    await MongoDatasetCollectionTags.insertOne({
      teamId: user.teamId,
      datasetId: childDataset._id,
      tag: 'legacy-child-tag'
    });
    await MongoDatasetCollectionTagsV2.insertMany([
      {
        teamId: user.teamId,
        datasetId: rootDataset._id,
        tag: 'root-v2-tag',
        tagType: 'string'
      },
      {
        teamId: user.teamId,
        datasetId: childDataset._id,
        tag: 'child-v2-tag',
        tagType: 'string'
      },
      {
        teamId: user.teamId,
        datasetId: retainedDataset._id,
        tag: 'retained-v2-tag-1',
        tagType: 'string'
      },
      {
        teamId: user.teamId,
        datasetId: retainedDataset._id,
        tag: 'retained-v2-tag-2',
        tagType: 'string'
      },
      {
        teamId: otherTeamUser.teamId,
        datasetId: rootDataset._id,
        tag: 'other-team-same-dataset-id',
        tagType: 'string'
      },
      {
        teamId: otherTeamUser.teamId,
        datasetId: otherTeamDataset._id,
        tag: 'other-team-dataset-tag',
        tagType: 'string'
      }
    ]);

    await MongoResourcePermission.insertMany([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: rootDataset._id,
        permission: OwnerRoleVal
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: childDataset._id,
        permission: ReadRoleVal
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: retainedDataset._id,
        permission: OwnerRoleVal
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: rootDataset._id,
        permission: OwnerRoleVal
      },
      {
        teamId: otherTeamUser.teamId,
        tmbId: otherTeamUser.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: rootDataset._id,
        permission: OwnerRoleVal
      }
    ]);

    await datasetDeleteProcessor({
      data: {
        teamId: user.teamId,
        datasetId: String(rootDataset._id)
      }
    } as never);

    expect(
      await MongoDatasetCollectionTags.countDocuments({
        teamId: user.teamId,
        datasetId: childDataset._id
      })
    ).toBe(0);
    expect(
      await MongoDatasetCollectionTagsV2.countDocuments({
        teamId: user.teamId,
        datasetId: { $in: [rootDataset._id, childDataset._id] }
      })
    ).toBe(0);
    expect(
      await MongoDatasetCollectionTagsV2.countDocuments({
        teamId: user.teamId,
        datasetId: retainedDataset._id
      })
    ).toBe(2);
    expect(
      await MongoDatasetCollectionTagsV2.countDocuments({
        teamId: otherTeamUser.teamId,
        datasetId: rootDataset._id
      })
    ).toBe(1);
    expect(
      await MongoDatasetCollectionTagsV2.countDocuments({
        teamId: otherTeamUser.teamId,
        datasetId: otherTeamDataset._id
      })
    ).toBe(1);

    expect(
      await MongoResourcePermission.countDocuments({
        teamId: user.teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: { $in: [rootDataset._id, childDataset._id] }
      })
    ).toBe(0);
    expect(
      await MongoResourcePermission.countDocuments({
        teamId: user.teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: retainedDataset._id
      })
    ).toBe(1);
    expect(
      await MongoResourcePermission.countDocuments({
        teamId: user.teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: rootDataset._id
      })
    ).toBe(1);
    expect(
      await MongoResourcePermission.countDocuments({
        teamId: otherTeamUser.teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: rootDataset._id
      })
    ).toBe(1);

    expect(
      await MongoDataset.countDocuments({ _id: { $in: [rootDataset._id, childDataset._id] } })
    ).toBe(0);
    expect(await MongoDataset.countDocuments({ _id: retainedDataset._id })).toBe(1);
  });

  it('deletes a dataset without v2 tags', async () => {
    const user = await getUser('dataset-delete-no-v2-tags');
    const dataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'dataset without v2 tags',
      type: DatasetTypeEnum.dataset,
      deleteTime: new Date()
    });

    await datasetDeleteProcessor({
      data: {
        teamId: user.teamId,
        datasetId: String(dataset._id)
      }
    } as never);

    expect(await MongoDataset.countDocuments({ _id: dataset._id })).toBe(0);
    expect(
      await MongoDatasetCollectionTagsV2.countDocuments({
        teamId: user.teamId,
        datasetId: dataset._id
      })
    ).toBe(0);
  });
});
