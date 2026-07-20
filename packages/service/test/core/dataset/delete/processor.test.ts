import { describe, expect, it, vi } from 'vitest';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { datasetDeleteProcessor } from '@fastgpt/service/core/dataset/delete/processor';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
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
    const vectorModelId = '68a3e6ec86f02f2167bdf318';
    const agentModelId = '68a3e6ec86f02f2167bdf319';

    const rootDataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'root folder',
      type: DatasetTypeEnum.folder,
      vectorModelId,
      agentModelId,
      deleteTime
    });
    const childDataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      parentId: rootDataset._id,
      name: 'child dataset',
      type: DatasetTypeEnum.dataset,
      vectorModelId,
      agentModelId,
      deleteTime
    });
    const retainedDataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'retained dataset',
      type: DatasetTypeEnum.dataset,
      vectorModelId,
      agentModelId
    });

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
});
