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
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { afterEach, describe, expect, it } from 'vitest';

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

describe('delete training data test', () => {
  afterEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  });

  it('should delete training data', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collection = await MongoDatasetCollection.create({
      name: 'test',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
    });
    const trainingData = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.chunk
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
      mode: TrainingModeEnum.chunk
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

  it('should allow deleting rebuild tasks through the existing training flow', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collection = await MongoDatasetCollection.create({
      name: 'test',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
    });
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'rebuild',
      indexes: [],
      synonymRebuildingVersion: 2
    });
    const training = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.chunk,
      dataId: data._id,
      synonymVersion: 2
    });

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
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.not.toHaveProperty(
      'synonymRebuildingVersion'
    );
  });
});
