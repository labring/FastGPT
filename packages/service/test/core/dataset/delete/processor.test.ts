import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import {
  datasetDeleteMQService,
  datasetSyncMQService,
  s3FileDeleteMQService
} from '@fastgpt/dal/redis/bullmq';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
const { executeS3DeleteJob } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/queue/delete')
>('@fastgpt/service/common/s3/queue/delete');

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

describe('deleteTeamAllDatasets', () => {
  it('queues every dataset tree and cleans images after the team record is gone', async () => {
    const user = await getUser('team-image-cleanup');
    const folder = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'folder',
      type: DatasetTypeEnum.folder
    });
    const child = await createDatasetCollectionFixture({ user });
    const independent = await createDatasetCollectionFixture({ user });
    await MongoDataset.updateOne({ _id: child.dataset._id }, { parentId: folder._id });
    const contexts = [child, independent];
    const bucket = new S3PrivateBucket();
    const originalBuckets = global.s3BucketMap;
    const enqueue = vi
      .spyOn(s3FileDeleteMQService, 'addJob')
      .mockRejectedValue(new Error('queue offline'));
    // scheduler 与队列是外部 Redis 边界，数据库删除使用真实 Mongo 事务。
    const removeScheduler = vi
      .spyOn(datasetSyncMQService, 'removeScheduler')
      .mockResolvedValue(true);
    const addJob = vi.mocked(datasetDeleteMQService.getQueue().add);
    addJob.mockClear();
    global.s3BucketMap = { [S3Buckets.private]: bucket };
    try {
      const images = contexts.map(({ scope }) => {
        const prefix = `dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/`;
        return {
          prefix: `dataset/${scope.datasetId}/`,
          key: `${prefix}file/${'f'.repeat(32)}.png`,
          legacyKey: `dataset/${scope.datasetId}/file/${'e'.repeat(32)}.pdf`
        };
      });
      for (const [index, { scope }] of contexts.entries()) {
        await MongoDatasetCollection.updateOne(
          { _id: scope.collectionId },
          {
            chunkImagePrefixId: scope.collectionId
          }
        );
        await bucket.client.uploadObject({ key: images[index].key, body: Buffer.from('fixture') });
        await bucket.client.uploadObject({
          key: images[index].legacyKey,
          body: Buffer.from('old source file')
        });
      }

      await deleteTeamAllDatasets(user.teamId);
      const jobs = addJob.mock.calls
        .filter(([name]) => name === 'delete_dataset')
        .map(([, data]) => data);
      expect(jobs.map(({ datasetId }) => String(datasetId)).sort()).toEqual(
        [String(folder._id), independent.scope.datasetId].sort()
      );
      expect(
        await MongoDataset.countDocuments({ teamId: user.teamId, deleteTime: { $ne: null } })
      ).toBe(3);
      expect(await MongoS3TTL.countDocuments()).toBe(0);

      // 账号/团队元数据被删除后，Dataset 和 S3 worker 仍须仅依靠任务范围继续执行。
      await MongoTeam.deleteOne({ _id: user.teamId });
      for (const data of jobs)
        await expect(
          datasetDeleteProcessor({ data } as Parameters<typeof datasetDeleteProcessor>[0])
        ).rejects.toThrow('queue offline');
      // 未确认目录入队前保留软删除的库文档；无需在 TTL 中登记业务清理记录。
      expect(await MongoDataset.countDocuments({ teamId: user.teamId })).toBe(3);
      expect(await MongoDatasetCollection.countDocuments({ teamId: user.teamId })).toBe(0);
      expect(await MongoS3TTL.countDocuments()).toBe(0);
      enqueue.mockClear().mockResolvedValue(undefined);
      for (const data of jobs)
        await datasetDeleteProcessor({ data } as Parameters<typeof datasetDeleteProcessor>[0]);
      expect(await MongoDataset.countDocuments({ teamId: user.teamId })).toBe(0);
      expect(enqueue).toHaveBeenCalledTimes(3);
      for (const { prefix, key } of images) {
        expect(enqueue).toHaveBeenCalledWith({ bucketName: S3Buckets.private, prefix });
        expect(await bucket.client.getObjectMetadata({ key })).toBeTruthy();
      }
      for (const [job] of enqueue.mock.calls) await executeS3DeleteJob(job);
      for (const { key, legacyKey } of images) {
        await expect(bucket.client.getObjectMetadata({ key })).rejects.toThrow();
        await expect(bucket.client.getObjectMetadata({ key: legacyKey })).rejects.toThrow();
      }
      expect(await MongoS3TTL.countDocuments()).toBe(0);
    } finally {
      global.s3BucketMap = originalBuckets;
      enqueue.mockRestore();
      removeScheduler.mockRestore();
    }
  });
});
