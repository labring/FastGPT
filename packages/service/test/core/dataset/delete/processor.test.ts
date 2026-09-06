import { afterEach, describe, expect, it, vi } from 'vitest';
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
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { DatasetSynonymSchemaVersion } from '@fastgpt/global/core/dataset/synonym';
import { Types } from '@fastgpt/service/common/mongo';
import { serviceEnv } from '@fastgpt/service/env';

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    deleteDatasetFilesByPrefix: vi.fn()
  })
}));

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

describe('datasetDeleteProcessor', () => {
  afterEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  });

  it('deletes permissions for the dataset and all its children', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
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
    const synonym = await MongoDatasetSynonym.create({
      teamId: user.teamId,
      datasetId: childDataset._id,
      version: 1,
      enabled: true,
      schemaVersion: DatasetSynonymSchemaVersion
    });
    await MongoDatasetSynonymMapping.create({
      logicalMappingId: new Types.ObjectId(),
      teamId: user.teamId,
      datasetId: childDataset._id,
      synonymFileId: synonym._id,
      fileVersion: 1,
      standardizedTerm: '退款',
      normalizedStandardizedTerm: '退款',
      synonymTerms: ['退钱'],
      normalizedSynonymTerms: ['退钱'],
      allTerms: '退款 退钱',
      fingerprint: 'refund'
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
    await expect(MongoDatasetSynonym.countDocuments({ datasetId: childDataset._id })).resolves.toBe(
      0
    );
    await expect(
      MongoDatasetSynonymMapping.countDocuments({ datasetId: childDataset._id })
    ).resolves.toBe(0);
  });
});
