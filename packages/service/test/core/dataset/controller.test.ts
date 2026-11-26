import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  delDatasetRelevantData,
  dispatchDatasetStorageCleanup
} from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetQaTraining } from '@test/datas/datasetQaTraining';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import {
  getDatasetSynonymConfig,
  getDatasetSynonymMatcher
} from '@fastgpt/service/core/dataset/synonym/entity';
import { normalizeSynonymTerm } from '@fastgpt/service/core/dataset/synonym/utils';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { s3FileDeleteMQService } from '@fastgpt/dal/redis/bullmq';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { getS3ParsedPrefix } from '@fastgpt/service/common/s3/opaqueKey';
import { createDatasetCollectionFixture } from '@test/datas/dataset';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
const { executeS3DeleteJob } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/queue/delete')
>('@fastgpt/service/common/s3/queue/delete');

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;


/**
 * 构造「冬瓜 ← 枕瓜」词条的两个版本：version-1 是历史残留，version 是当前生效版本。
 */
const seedSynonymConfig = async ({
  teamId,
  datasetId,
  version = 2
}: {
  teamId: string;
  datasetId: string;
  version?: number;
}) => {
  const config = await MongoDatasetSynonym.create({ teamId, datasetId, version, enabled: true });
  await MongoDatasetSynonymMapping.create(
    [version - 1, version].map((fileVersion) => ({
      teamId,
      datasetId,
      synonymFileId: config._id,
      fileVersion,
      logicalMappingId: new Types.ObjectId(),
      standardizedTerm: '冬瓜',
      normalizedStandardizedTerm: normalizeSynonymTerm('冬瓜'),
      synonymTerms: ['枕瓜'],
      normalizedSynonymTerms: [normalizeSynonymTerm('枕瓜')],
      allTerms: '冬瓜 枕瓜',
      fingerprint: `v${fileVersion}`
    }))
  );
  return config;
};

it('rolls back collection, QA source and pending chunk deletion together', async () => {
  const teamId = new Types.ObjectId().toString();
  const datasetId = new Types.ObjectId().toString();
  const tmbId = new Types.ObjectId().toString();
  const collection = await MongoDatasetCollection.create({
    teamId,
    datasetId,
    tmbId,
    name: 'Deleting document',
    type: DatasetCollectionTypeEnum.virtual
  });
  const scope = { teamId, datasetId, tmbId, collectionId: collection._id };
  const qa = await MongoDatasetQaTraining.create({ ...scope, q: 'Pending QA source' });
  const chunk = await MongoDatasetData.create({
    ...scope,
    q: 'Pending index chunk',
    indexStatus: DatasetDataIndexStageEnum.index
  });
  const datasets = [{ _id: datasetId, teamId }];
  const failure = new Error('Dataset delete failed after cleaning its contents');

  await expect(
    mongoSessionRun(async (session) => {
      await delDatasetRelevantData({ datasets, session });
      throw failure;
    })
  ).rejects.toBe(failure);

  expect(await MongoDatasetCollection.exists({ _id: collection._id })).toBeTruthy();
  expect(await MongoDatasetQaTraining.exists({ _id: qa._id })).toBeTruthy();
  expect(await MongoDatasetData.exists({ _id: chunk._id })).toBeTruthy();

  await mongoSessionRun((session) => delDatasetRelevantData({ datasets, session }));

  expect(await MongoDatasetCollection.exists({ _id: collection._id })).toBeNull();
  expect(await MongoDatasetQaTraining.exists({ _id: qa._id })).toBeNull();
  expect(await MongoDatasetData.exists({ _id: chunk._id })).toBeNull();
});

describe('delDatasetRelevantData synonym retention', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
  });

  afterAll(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  });

  // 网站知识库改分块设置是「数据重建」而不是删除知识库：清理完旧分块后，
  // 重建出的分块仍要按同一份词表做 embedding/重排/引用注入，所以词表必须可用。
  it('keeps the active vocabulary readable and matchable after a web re-chunk cleanup', async () => {
    const teamId = new Types.ObjectId().toString();
    const datasetId = new Types.ObjectId().toString();
    const config = await seedSynonymConfig({ teamId, datasetId, version: 2 });

    await mongoSessionRun((session) =>
      delDatasetRelevantData(
        { datasets: [{ _id: datasetId, teamId }], session },
        { keepSynonyms: true }
      )
    );

    // 配置仍可读取，且版本未变化（重建后的分块写入仍以该版本为准）。
    const keptConfig = await getDatasetSynonymConfig({ teamId, datasetId });
    expect(keptConfig?._id.toString()).toBe(config._id.toString());
    expect(keptConfig?.version).toBe(2);

    // 当前版本的映射原地保留，历史版本残留被顺手回收。
    const remainingVersions = await MongoDatasetSynonymMapping.distinct('fileVersion', {
      teamId,
      datasetId
    });
    expect(remainingVersions).toEqual([2]);

    // 真实检索能力：matcher 仍能命中「枕瓜 → 冬瓜」。
    const matcher = await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: 2 });
    expect(matcher.hasMappings).toBe(true);
    expect(matcher.transform('问一下枕瓜排骨汤').usedMappings).toMatchObject([
      { matchedTerm: '枕瓜', standardizedTerm: '冬瓜' }
    ]);
  });

  it('still cascades the vocabulary when the dataset itself is deleted', async () => {
    const teamId = new Types.ObjectId().toString();
    const datasetId = new Types.ObjectId().toString();
    await seedSynonymConfig({ teamId, datasetId, version: 2 });

    // 先预热 matcher 缓存：删除路径必须同时失效缓存，否则同一 key 会继续命中旧词表。
    const warmMatcher = await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: 2 });
    expect(warmMatcher.hasMappings).toBe(true);

    await mongoSessionRun((session) =>
      delDatasetRelevantData({ datasets: [{ _id: datasetId, teamId }], session })
    );

    expect(await getDatasetSynonymConfig({ teamId, datasetId })).toBeNull();
    expect(await MongoDatasetSynonymMapping.countDocuments({ teamId, datasetId })).toBe(0);

    const matcher = await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: 2 });
    expect(matcher.hasMappings).toBe(false);
    expect(matcher.transform('问一下枕瓜排骨汤').usedMappings).toEqual([]);
  });
});

describe('delDatasetRelevantData', () => {
  it('rolls back collection and image rows together when clearing fails', async () => {
    const { scope } = await createDatasetCollectionFixture();
    const data = await MongoDatasetData.create({
      ...scope,
      q: 'retain on rollback',
      imageId: `dataset/${scope.datasetId}/file/${'2'.repeat(32)}.png`
    });
    await expect(
      mongoSessionRun(async (session) => {
        await delDatasetRelevantData({
          datasets: [{ _id: scope.datasetId, teamId: scope.teamId }],
          session
        });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await MongoDatasetCollection.findById(scope.collectionId)).toBeTruthy();
    expect(await MongoDatasetData.findById(data._id)).toBeTruthy();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
  });

  it('retries clearing old resources without deleting new resources in the retained dataset', async () => {
    const { scope } = await createDatasetCollectionFixture();
    const oldFile = `dataset/${scope.datasetId}/file/${'a'.repeat(32)}.pdf`;
    const oldImagePrefix = `dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/`;
    const oldKeys = [
      oldFile,
      `${getS3ParsedPrefix(oldFile)}${'b'.repeat(32)}.png`,
      `${oldImagePrefix}file/${'c'.repeat(32)}.png`,
      `dataset/${scope.datasetId}/file/${'1'.repeat(32)}.png`
    ];
    await MongoDatasetCollection.updateOne(
      { _id: scope.collectionId },
      {
        fileId: oldFile,
        chunkImagePrefixId: scope.collectionId
      }
    );
    const bucket = new S3PrivateBucket();
    const originalBuckets = global.s3BucketMap;
    const enqueue = vi
      .spyOn(s3FileDeleteMQService, 'addJob')
      .mockRejectedValue(new Error('queue offline'));
    global.s3BucketMap = { [S3Buckets.private]: bucket };
    try {
      await MongoDatasetData.create({ ...scope, q: 'old image', imageId: oldKeys[3] });
      for (const key of oldKeys)
        await bucket.client.uploadObject({ key, body: Buffer.from('old') });
      expect(
        (await MongoDatasetData.findOne({ collectionId: scope.collectionId }).lean())?.imageId
      ).toBe(oldKeys[3]);
      const cleanup = await mongoSessionRun((session) =>
        delDatasetRelevantData({
          datasets: [{ _id: scope.datasetId, teamId: scope.teamId }],
          session
        })
      );
      await expect(dispatchDatasetStorageCleanup(cleanup)).rejects.toThrow('queue offline');
      expect(await MongoDataset.findById(scope.datasetId)).toBeTruthy();
      expect(await MongoDatasetCollection.findById(scope.collectionId)).toBeNull();
      expect(await MongoS3TTL.countDocuments()).toBe(0);
      expect(cleanup).toEqual([
        { bucketName: S3Buckets.private, prefix: oldImagePrefix },
        { bucketName: S3Buckets.private, keys: [oldFile, oldKeys[3]] }
      ]);

      // 同库新集合可能在补投发生前已经写入。清空的删除范围不能扩大为整个 dataset/ 目录。
      const next = await MongoDatasetCollection.create({
        teamId: scope.teamId,
        tmbId: scope.tmbId,
        datasetId: scope.datasetId,
        type: 'file',
        name: 'new collection'
      });
      const newFile = `dataset/${scope.datasetId}/file/${'d'.repeat(32)}.pdf`;
      const newKeys = [
        newFile,
        `${getS3ParsedPrefix(newFile)}${'e'.repeat(32)}.png`,
        `dataset/${scope.datasetId}/chunk-images/${next._id}/file/${'f'.repeat(32)}.png`
      ];
      for (const key of newKeys)
        await bucket.client.uploadObject({ key, body: Buffer.from('new') });
      enqueue.mockClear().mockResolvedValue(undefined);
      // 本次调用方保留旧范围进行重试，不从已删除集合重新计算，也不使用 TTL 意图。
      await dispatchDatasetStorageCleanup(cleanup);
      expect(enqueue).toHaveBeenCalledTimes(2);
      for (const job of cleanup) await executeS3DeleteJob(job);
      for (const key of oldKeys)
        await expect(bucket.client.getObjectMetadata({ key })).rejects.toThrow();
      for (const key of newKeys)
        expect(await bucket.client.getObjectMetadata({ key })).toBeTruthy();
      expect(await MongoDatasetCollection.findById(next._id)).toBeTruthy();
      expect(await MongoS3TTL.countDocuments()).toBe(0);
    } finally {
      global.s3BucketMap = originalBuckets;
      enqueue.mockRestore();
    }
  });
});
