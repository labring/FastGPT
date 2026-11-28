import handler, {
  type deleteTrainingDataBody,
  type deleteTrainingDataResponse
} from '@/pages/api/core/dataset/training/deleteTrainingData';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { mockVectorDelete, resetVectorMocks } from '@test/mocks/common/vector';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { retryDocumentTrainingWork } from '@/service/core/dataset/training/documentActions';
import getErrorHandler from '@/pages/api/core/dataset/training/getTrainingError';
import { serviceEnv } from '@fastgpt/service/env';
import { getRootUser } from '@test/datas/users';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { Call } from '@test/utils/request';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.unmock('@fastgpt/service/support/user/audit/util');

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

const activeRound = () => ({
  status: 'active' as const,
  usageId: String(new Types.ObjectId()),
  revision: 1
});

describe('delete training data test', () => {
  beforeEach(() => {
    resetVectorMocks();
    mockVectorDelete.mockResolvedValue(undefined);
  });
  afterEach(() => {
    Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: originalDatasetSynonymEnabled });
  });

  it('should delete training data', async () => {
    const { root, dataset, collection } = await createDatasetCollectionFixture();
    await collection.updateOne({ $set: { training: activeRound() } });
    const trainingData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
    });

    const res = await Call<
      deleteTrainingDataBody,
      Record<string, never>,
      deleteTrainingDataResponse
    >(handler, {
      auth: root,
      body: {
        collectionId: collection._id,
        dataId: trainingData._id
      }
    });

    const deletedTrainingData = await MongoDatasetData.findOne({
      teamId: root.teamId,
      datasetId: dataset._id,
      _id: trainingData._id
    });

    expect(res.code).toBe(200);
    expect(deletedTrainingData).toBeNull();

    // 清理训练记录审计详细到集合，便于从日志反查到具体集合。
    await vi.waitFor(
      async () => {
        const logs = await MongoTeamAudit.find({
          teamId: root.teamId,
          event: 'dataset.training.record.delete'
        }).lean();
        expect(logs).toHaveLength(1);
        expect(logs[0].resources).toEqual([
          {
            type: 'collection',
            id: String(collection._id),
            name: collection.name,
            datasetId: dataset._id,
            collectionType: collection.type
          }
        ]);
        expect(logs[0].metadata).toEqual(
          expect.objectContaining({
            datasetName: dataset.name,
            collectionName: collection.name
          })
        );
      },
      { timeout: 5000 }
    );
  });

  it('should ignore legacy datasetId and only delete data from the authorized collection', async () => {
    const root = await getRootUser();
    const [dataset, foreignDataset] = await Promise.all([
      MongoDataset.create({
        name: 'test',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      }),
      MongoDataset.create({
        name: 'foreign',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      })
    ]);
    const [collection, foreignCollection] = await Promise.all([
      MongoDatasetCollection.create({
        name: 'test',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id
      }),
      MongoDatasetCollection.create({
        name: 'foreign',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: foreignDataset._id
      })
    ]);
    const foreignTrainingData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: foreignDataset._id,
      collectionId: foreignCollection._id,
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
    });

    const res = await Call<
      deleteTrainingDataBody,
      Record<string, never>,
      deleteTrainingDataResponse
    >(handler, {
      auth: root,
      body: {
        datasetId: foreignDataset._id,
        collectionId: collection._id,
        dataId: foreignTrainingData._id
      } as any
    });

    const existingTrainingData = await MongoDatasetData.findById(foreignTrainingData._id);

    expect(res.code).toBe(200);
    expect(existingTrainingData).toBeTruthy();
  });

  it.each([
    { indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending, indexError: false },
    { indexStatus: DatasetDataIndexStageEnum.rebuildIndexRunning, indexError: true },
    { indexStatus: DatasetDataIndexStageEnum.rebuildSynonymRunning, indexError: false },
    { indexStatus: DatasetDataIndexStageEnum.rebuildSynonymRunning, indexError: true }
  ])(
    'deletes original data and indexes when deleting a rebuild task with data status $indexStatus (failed: $indexError)',
    async ({ indexStatus, indexError }) => {
      Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: true });
      const { root, dataset, collection } = await createDatasetCollectionFixture();
      const data = await MongoDatasetData.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        q: 'rebuild',
        indexStatus,
        indexError,
        indexes: [
          { type: DatasetDataIndexTypeEnum.default, text: 'saved index', dataId: 'old-vector' }
        ],
        synonymRebuildingVersion: 2
      });
      await collection.updateOne({ $set: { training: activeRound() } });

      await MongoDatasetDataText.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: data._id,
        fullTextToken: 'saved index'
      });
      // 清理失败时 Mongo 事务回滚，保留任务和数据供用户再次处理。
      mockVectorDelete.mockRejectedValue(new Error('vector cleanup failed'));
      const failed = await Call(handler, {
        auth: root,
        body: { collectionId: collection._id, dataId: data._id }
      });
      expect(failed.code).not.toBe(200);
      expect(await MongoDatasetData.findById(data._id)).not.toBeNull();
      expect(await MongoDatasetDataText.findOne({ dataId: data._id })).not.toBeNull();
      expect(mockVectorDelete).toHaveBeenCalled();
      mockVectorDelete.mockResolvedValue(undefined);
      resetVectorMocks();

      const res = await Call<
        deleteTrainingDataBody,
        Record<string, never>,
        deleteTrainingDataResponse
      >(handler, {
        auth: root,
        body: { collectionId: collection._id, dataId: data._id }
      });

      expect(res.code).toBe(200);
      await expect(MongoDatasetData.findById(data._id)).resolves.toBeNull();
      await expect(MongoDatasetDataText.findOne({ dataId: data._id })).resolves.toBeNull();
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: String(root.teamId),
        idList: ['old-vector']
      });

      // 重复删除同一个任务幂等，不再次清理向量。
      const repeated = await Call(handler, {
        auth: root,
        body: { collectionId: collection._id, dataId: data._id }
      });
      expect(repeated.code).toBe(200);
      expect(mockVectorDelete).toHaveBeenCalledTimes(1);
    }
  );
  it('keeps initial-training data as terminal error, settles the round, and blocks batch retry', async () => {
    const { root, dataset, collection } = await createDatasetCollectionFixture();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'initial data',
      indexes: [],
      indexStatus: DatasetDataIndexStageEnum.index,
      indexError: true,
      indexErrorMsg: 'temporary failure',
      synonymRebuildingVersion: 2
    });
    const sibling = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'sibling data',
      indexes: [],
      indexStatus: DatasetDataIndexStageEnum.index
    });
    const round = activeRound();
    await collection.updateOne({ $set: { training: { ...round, runId: 'first-run' } } });
    const cancel = (dataId: string) =>
      Call(handler, { auth: root, body: { collectionId: collection._id, dataId } });

    expect(await cancel(String(data._id))).toMatchObject({ code: 200 });
    const cancelledData = await MongoDatasetData.findById(data._id).lean();
    expect(cancelledData).toMatchObject({
      q: 'initial data',
      indexStatus: DatasetDataIndexStatusEnum.error,
      indexErrorMsg: 'Training task deleted',
      synonymRebuildingVersion: 2
    });
    expect(cancelledData?.indexError).toBeUndefined();
    expect(mockVectorDelete).not.toHaveBeenCalled();

    // 仍有兄弟待处理分块时，本轮保持活跃并清除旧 runId。
    const withSibling = await MongoDatasetCollection.findById(collection._id).lean();
    expect(withSibling?.training).toMatchObject({ ...round, revision: 2 });
    expect(withSibling?.training).not.toHaveProperty('runId');

    // 已取消分块不再出现在训练错误列表，也不会被集合批量重试复活。
    const errorList = await Call(getErrorHandler, {
      auth: root,
      body: { collectionId: collection._id, pageNum: 1, pageSize: 20 }
    });
    expect(errorList.code).toBe(200);
    expect((errorList.data as any)?.list).toHaveLength(0);

    await retryDocumentTrainingWork({
      scope: {
        teamId: String(root.teamId),
        datasetId: String(dataset._id),
        collectionId: String(collection._id)
      }
    });
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.error,
      indexErrorMsg: 'Training task deleted'
    });

    // 另一轮 Worker 已领取同一文档中的其他分块，重复取消保持幂等且不干扰 runId。
    await collection.updateOne({
      $set: { 'training.runId': 'next-run' },
      $inc: { 'training.revision': 1 }
    });
    const beforeRepeat = await MongoDatasetCollection.findById(collection._id).lean();
    const writeAudit = vi.spyOn(MongoTeamAudit, 'create');
    try {
      expect(await cancel(String(data._id))).toMatchObject({ code: 200 });
      expect(await MongoDatasetCollection.findById(collection._id).lean()).toMatchObject({
        training: {
          ...round,
          runId: 'next-run',
          revision: beforeRepeat?.training?.revision
        }
      });
      expect(writeAudit).not.toHaveBeenCalled();
    } finally {
      writeAudit.mockRestore();
    }

    // 取消最后一个待处理分块后，本轮训练状态关账清空。
    expect(await cancel(String(sibling._id))).toMatchObject({ code: 200 });
    expect((await MongoDatasetCollection.findById(collection._id).lean())?.training).toBeUndefined();
  });
});
