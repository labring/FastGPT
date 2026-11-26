import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import {
  datasetDeleteProcessor,
  deleteTeamAllDatasets
} from '@fastgpt/service/core/dataset/delete/processor';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getUser } from '@test/datas/users';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { DatasetSynonymSchemaVersion } from '@fastgpt/global/core/dataset/synonym';
import { Types } from '@fastgpt/service/common/mongo';
import { serviceEnv } from '@fastgpt/service/env';
import { mockVectorDelete } from '@test/mocks/common/vector';

const mocks = vi.hoisted(() => ({ removeIndexes: vi.fn(), addDeleteJob: vi.fn() }));
vi.mock('@fastgpt/service/core/dataset/vectorData/service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  removeDatasetVectorIndexes: mocks.removeIndexes
}));
vi.mock('@fastgpt/service/core/dataset/delete/index', () => ({
  addDatasetDeleteJob: mocks.addDeleteJob
}));
vi.mock('@fastgpt/service/core/dataset/datasetSync', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  removeDatasetSyncJobScheduler: vi.fn(async () => {})
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    deleteDatasetFilesByPrefix: vi.fn()
  })
}));

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

describe('datasetDeleteProcessor', () => {
  beforeEach(() => {
    mocks.removeIndexes.mockReset().mockResolvedValue(undefined);
    mocks.addDeleteJob.mockReset().mockResolvedValue(undefined);
    mockVectorDelete.mockClear();
  });
  afterEach(() => {
    Reflect.set(serviceEnv, 'DATASET_SYNONYM_ENABLED', originalDatasetSynonymEnabled);
  });

  it('waits for index removal before deleting vectors or the dataset record', async () => {
    const user = await getUser('dataset-delete-index-order');
    const dataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'deleting',
      type: DatasetTypeEnum.dataset,
      deleteTime: new Date()
    });
    let release!: () => void;
    mocks.removeIndexes.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    const deleting = datasetDeleteProcessor({
      data: {
        teamId: user.teamId,
        datasetId: String(dataset._id)
      }
    } as never);
    try {
      await vi.waitFor(() => expect(mocks.removeIndexes).toHaveBeenCalledOnce());
      expect(await MongoDataset.findById(dataset._id).lean()).not.toBeNull();
      expect(mockVectorDelete).not.toHaveBeenCalled();
    } finally {
      release();
      await deleting;
    }
    expect(await MongoDataset.findById(dataset._id).lean()).toBeNull();
  });

  it('retains all deletion records on DROP failure and can finish the next attempt', async () => {
    const user = await getUser('dataset-delete-index-retry');
    const root = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'folder',
      type: DatasetTypeEnum.folder,
      deleteTime: new Date()
    });
    const child = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'child',
      parentId: root._id,
      type: DatasetTypeEnum.dataset,
      deleteTime: new Date()
    });
    await MongoDatasetCollectionTagsV2.create({
      teamId: user.teamId,
      datasetId: child._id,
      tag: 'keep-until-index-removed',
      tagType: 'string'
    });
    const job = { data: { teamId: user.teamId, datasetId: String(root._id) } } as never;
    mocks.removeIndexes.mockRejectedValueOnce(new Error('DROP connection lost'));
    await expect(datasetDeleteProcessor(job)).rejects.toThrow('DROP connection lost');
    expect(await MongoDataset.countDocuments({ _id: { $in: [root._id, child._id] } })).toBe(2);
    expect(await MongoDatasetCollectionTagsV2.countDocuments({ datasetId: child._id })).toBe(1);
    expect(mockVectorDelete).not.toHaveBeenCalled();
    await datasetDeleteProcessor(job);
    expect(await MongoDataset.countDocuments({ _id: { $in: [root._id, child._id] } })).toBe(0);
    expect(mocks.removeIndexes).toHaveBeenCalledTimes(2);
  });

  it('keeps unmarked datasets intact because the delete marker prevents later builds', async () => {
    const user = await getUser('dataset-delete-index-marker');
    const dataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'active',
      type: DatasetTypeEnum.dataset
    });
    await expect(
      datasetDeleteProcessor({
        data: {
          teamId: user.teamId,
          datasetId: String(dataset._id)
        }
      } as never)
    ).rejects.toThrow('marked for deletion');
    expect(mocks.removeIndexes).not.toHaveBeenCalled();
    expect(await MongoDataset.findById(dataset._id).lean()).not.toBeNull();
  });

  it('routes a team and its nested datasets through the same index removal barrier', async () => {
    const user = await getUser('team-delete-indexes');
    const root = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'folder',
      type: DatasetTypeEnum.folder
    });
    const child = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      parentId: root._id,
      name: 'child',
      type: DatasetTypeEnum.dataset
    });
    const standalone = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'standalone',
      type: DatasetTypeEnum.dataset
    });
    await deleteTeamAllDatasets(user.teamId);
    const jobs = mocks.addDeleteJob.mock.calls.map(([data]) => data);
    expect(jobs.map(({ datasetId }) => String(datasetId)).sort()).toEqual(
      [String(root._id), String(standalone._id)].sort()
    );
    expect(
      await MongoDataset.countDocuments({ teamId: user.teamId, deleteTime: { $ne: null } })
    ).toBe(3);
    for (const data of jobs) await datasetDeleteProcessor({ data } as never);
    expect(
      mocks.removeIndexes.mock.calls.flatMap(([scope]) => scope.datasetIds.map(String)).sort()
    ).toEqual([root, child, standalone].map((dataset) => String(dataset._id)).sort());
    expect(await MongoDataset.countDocuments({ teamId: user.teamId })).toBe(0);
  });

  it('deletes permissions for the dataset and all its children', async () => {
    Reflect.set(serviceEnv, 'DATASET_SYNONYM_ENABLED', false);
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
    await expect(MongoDatasetSynonym.countDocuments({ datasetId: childDataset._id })).resolves.toBe(
      0
    );
    await expect(
      MongoDatasetSynonymMapping.countDocuments({ datasetId: childDataset._id })
    ).resolves.toBe(0);
  });
});
