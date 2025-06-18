import handler, {
  type updateTrainingDataBody,
  type updateTrainingDataResponse
} from '@/pages/api/core/dataset/training/updateTrainingData';
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

describe('update training data test', () => {
  it('should update training data', async () => {
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
      mode: TrainingModeEnum.chunk
    });

    const res = await Call<updateTrainingDataBody, {}, updateTrainingDataResponse>(handler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: trainingData._id,
        q: 'test',
        a: 'test',
        chunkIndex: 1
      }
    });

    const updatedTrainingData = await MongoDatasetTraining.findOne({
      teamId: root.teamId,
      datasetId: dataset._id,
      _id: trainingData._id
    });

    expect(res.code).toBe(200);
    expect(updatedTrainingData?.q).toBe('test');
    expect(updatedTrainingData?.a).toBe('test');
    expect(updatedTrainingData?.chunkIndex).toBe(1);
  });
});
