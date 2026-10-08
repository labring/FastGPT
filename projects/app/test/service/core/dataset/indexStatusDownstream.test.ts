import { getModelTestDefaults } from '@test/modelCache';
import { preCreateDatasetDataAndPushToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

// 全局 S3 mock 未覆盖集合删除用到的批量删除接口，这里补齐。
vi.mock('@fastgpt/service/common/s3/sources/dataset', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/common/s3/sources/dataset')>();
  return {
    ...actual,
    getS3DatasetSource: () => ({
      deleteDatasetFilesByKeys: vi.fn().mockResolvedValue(undefined),
      deleteDatasetFileByKey: vi.fn().mockResolvedValue(undefined),
      getFileMetadata: vi.fn().mockResolvedValue(undefined)
    })
  };
});
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

import trainingDetailHandler from '@/pages/api/core/dataset/collection/trainingDetail';

const createContext = async () => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    name: 'index status contract'
  });
  const collection = await MongoDatasetCollection.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    name: 'collection',
    type: DatasetCollectionTypeEnum.file
  });

  const createData = async ({
    indexStatus,
    text,
    withFullText = false
  }: {
    indexStatus?: DatasetDataIndexStatusEnum;
    text: string;
    withFullText?: boolean;
  }) => {
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: text,
      indexes: [],
      ...(indexStatus && { indexStatus })
    });
    if (withFullText) {
      await MongoDatasetDataText.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: data._id,
        fullTextToken: text
      });
    }
    return data;
  };

  return { root, dataset, collection, createData };
};

describe('indexStatus downstream contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** DS-12 / UI-08：trainedCount 只统计已索引（含无状态）数据。 */
  it('counts only indexed data in trainedCount while dataAmount stays complete', async () => {
    const { root, collection, createData } = await createContext();
    await createData({ text: 'indexing chunk', indexStatus: DatasetDataIndexStatusEnum.indexing });
    await createData({ text: 'indexed chunk', indexStatus: DatasetDataIndexStatusEnum.indexed });
    await createData({ text: 'legacy chunk' });

    const res = await Call(trainingDetailHandler, {
      auth: root,
      query: { collectionId: String(collection._id) }
    });

    expect(res.code).toBe(200);
    // 已训练数只包含 indexed 与无状态历史数据。
    expect(res.data.trainedCount).toBe(2);
    // 数据量不做状态过滤，解析后立即计入。
    expect(await MongoDatasetData.countDocuments({ collectionId: collection._id })).toBe(3);
  });

  /** 待索引数据在索引完成前不会向全文索引表写入记录。 */
  it('does not have full-text index records before indexing completes', async () => {
    const { root, dataset, collection } = await createContext();
    const result = await mongoSessionRun((session) =>
      preCreateDatasetDataAndPushToTrainingQueue({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: String(dataset._id),
        collectionId: String(collection._id),
        vectorModel: getModelTestDefaults().embedding!,
        data: [{ q: 'retrieval isolation keyword' }],
        billId: 'pre-create-isolation',
        session
      })
    );
    expect(result.dataIds).toHaveLength(1);
    expect(await MongoDatasetData.findById(result.dataIds[0]).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
    expect(
      await MongoDatasetTraining.countDocuments({ dataId: result.dataIds[0], mode: 'index' })
    ).toBe(1);
    expect(await MongoDatasetDataText.countDocuments({ dataId: result.dataIds[0] })).toBe(0);
  });

  /** DS-18 / CP-10：集合删除按 collectionId 清理，不做状态筛选。 */
  it('cleans pending index data and in-flight tasks on collection delete', async () => {
    const { root, dataset, collection, createData } = await createContext();
    const indexing = await createData({
      text: 'pending chunk',
      indexStatus: DatasetDataIndexStatusEnum.indexing,
      withFullText: true
    });
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      mode: 'index',
      billId: 'bill-id',
      dataId: indexing._id,
      retryCount: 5
    });

    const fullCollection = await MongoDatasetCollection.findById(collection._id).lean();
    await mongoSessionRun(async (session) => {
      await delCollection({
        collections: [fullCollection as any],
        session,
        delImg: false,
        delFile: false
      });
    });

    expect(await MongoDatasetData.countDocuments({ collectionId: collection._id })).toBe(0);
    expect(await MongoDatasetTraining.countDocuments({ collectionId: collection._id })).toBe(0);
    expect(await MongoDatasetDataText.countDocuments({ collectionId: collection._id })).toBe(0);
  });
});
