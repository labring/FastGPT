import handler, {
  type deleteTrainingDataBody,
  type deleteTrainingDataResponse
} from '@/pages/api/core/dataset/training/deleteTrainingData';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { mockVectorDelete, resetVectorMocks } from '@test/mocks/common/vector';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { serviceEnv } from '@fastgpt/service/env';
import { getRootUser } from '@test/datas/users';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { Call } from '@test/utils/request';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

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
    const trainingData = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.rebuildIndex
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

    const deletedTrainingData = await MongoDatasetTraining.findOne({
      teamId: root.teamId,
      datasetId: dataset._id,
      _id: trainingData._id
    });

    expect(res.code).toBe(200);
    expect(deletedTrainingData).toBeNull();
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
    const foreignTrainingData = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: foreignDataset._id,
      collectionId: foreignCollection._id,
      billId: 'test',
      mode: TrainingModeEnum.rebuildIndex
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

    const existingTrainingData = await MongoDatasetTraining.findById(foreignTrainingData._id);

    expect(res.code).toBe(200);
    expect(existingTrainingData).toBeTruthy();
  });

  it.each([
    DatasetDataIndexStatusEnum.rebuildIndexRunning,
    DatasetDataIndexStatusEnum.rebuildIndexFailed,
    DatasetDataIndexStatusEnum.rebuildSynonymRunning,
    DatasetDataIndexStatusEnum.rebuildSynonymFailed
  ])(
    'deletes original data and indexes when deleting a rebuild task with data status %s',
    async (indexStatus) => {
      Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: true });
      const { root, dataset, collection } = await createDatasetCollectionFixture();
      const data = await MongoDatasetData.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        q: 'rebuild',
        indexStatus,
        indexes: [
          { type: DatasetDataIndexTypeEnum.default, text: 'saved index', dataId: 'old-vector' }
        ],
        synonymRebuildingVersion: 2
      });
      const training = await MongoDatasetTraining.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: [
          DatasetDataIndexStatusEnum.rebuildSynonymRunning,
          DatasetDataIndexStatusEnum.rebuildSynonymFailed
        ].includes(indexStatus)
          ? TrainingModeEnum.rebuildSynonym
          : TrainingModeEnum.rebuildIndex,
        dataId: data._id
      });

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
        body: { collectionId: collection._id, dataId: training._id }
      });
      expect(failed.code).not.toBe(200);
      expect(await MongoDatasetTraining.findById(training._id)).not.toBeNull();
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
        body: { collectionId: collection._id, dataId: training._id }
      });

      expect(res.code).toBe(200);
      await expect(MongoDatasetTraining.findById(training._id)).resolves.toBeNull();
      await expect(MongoDatasetData.findById(data._id)).resolves.toBeNull();
      await expect(MongoDatasetDataText.findOne({ dataId: data._id })).resolves.toBeNull();
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: String(root.teamId),
        idList: ['old-vector']
      });

      // 重复删除同一个任务幂等，不再次清理向量。
      const repeated = await Call(handler, {
        auth: root,
        body: { collectionId: collection._id, dataId: training._id }
      });
      expect(repeated.code).toBe(200);
      expect(mockVectorDelete).toHaveBeenCalledTimes(1);
    }
  );
  it.each([TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym, TrainingModeEnum.index])(
    'preserves foreign data referenced by a %s training task',
    async (mode) => {
      const root = await getRootUser();
      const dataset = await MongoDataset.create({
        name: 'scope',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      });
      const [collection, foreignCollection] = await MongoDatasetCollection.create(
        ['scope', 'foreign'].map((name) => ({
          name,
          type: DatasetCollectionTypeEnum.file,
          teamId: root.teamId,
          tmbId: root.tmbId,
          datasetId: dataset._id
        }))
      );
      const data = await MongoDatasetData.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: foreignCollection._id,
        q: 'foreign data',
        indexes: [],
        indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning,
        synonymRebuildingVersion: 2
      });
      const training = await MongoDatasetTraining.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode,
        dataId: data._id
      });
      const res = await Call(handler, {
        auth: root,
        body: { collectionId: collection._id, dataId: training._id }
      });
      expect(res.code).toBe(200);
      await expect(MongoDatasetTraining.findById(training._id)).resolves.toBeNull();
      expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
        q: 'foreign data',
        indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning,
        synonymRebuildingVersion: 2
      });
      expect(mockVectorDelete).not.toHaveBeenCalled();
    }
  );

  it('keeps initial-training data when cancelling an index task', async () => {
    const { root, dataset, collection } = await createDatasetCollectionFixture();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'initial data',
      indexes: [],
      indexStatus: DatasetDataIndexStatusEnum.indexing,
      synonymRebuildingVersion: 2
    });
    const training = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.index,
      dataId: data._id
    });
    const res = await Call(handler, {
      auth: root,
      body: { collectionId: collection._id, dataId: training._id }
    });
    expect(res.code).toBe(200);
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      q: 'initial data',
      indexStatus: DatasetDataIndexStatusEnum.error
    });
    expect(await MongoDatasetData.findById(data._id).lean()).toHaveProperty(
      'synonymRebuildingVersion',
      2
    );
    expect(mockVectorDelete).not.toHaveBeenCalled();
  });
});
