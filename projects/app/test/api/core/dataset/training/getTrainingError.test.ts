import handler, {
  type getTrainingErrorBody,
  type getTrainingErrorResponse
} from '@/pages/api/core/dataset/training/getTrainingError';
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

describe('training error list test', () => {
  it('should return training error list', async () => {
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
    await MongoDatasetTraining.create(
      [...Array(10).keys()].map((i) => ({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        mode: TrainingModeEnum.chunk,
        errorMsg: 'test'
      }))
    );

    const res = await Call<getTrainingErrorBody, {}, getTrainingErrorResponse>(handler, {
      auth: root,
      body: {
        collectionId: collection._id,
        pageSize: 10,
        offset: 0
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(10);
    expect(res.data.list.length).toBe(10);
  });
});
