import handler, {
  type getTrainingDataDetailBody,
  type getTrainingDataDetailResponse
} from '@/pages/api/core/dataset/training/getTrainingDataDetail';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('get training data detail test', () => {
  it('should return training data detail', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId
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
      mode: TrainingModeEnum.chunk,
      q: 'test',
      a: 'test'
    });

    const res = await Call<getTrainingDataDetailBody, {}, getTrainingDataDetailResponse>(handler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: trainingData._id
      }
    });

    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data?._id).toStrictEqual(trainingData._id);
    expect(res.data?.datasetId).toStrictEqual(dataset._id);
    expect(res.data?.mode).toBe(TrainingModeEnum.chunk);
    expect(res.data?.q).toBe('test');
    expect(res.data?.a).toBe('test');
  });
});
