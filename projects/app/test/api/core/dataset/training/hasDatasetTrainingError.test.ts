import handler, {
  type hasDatasetTrainingErrorQuery,
  type hasDatasetTrainingErrorResponse
} from '@/pages/api/core/dataset/training/hasDatasetTrainingError';
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

type EmptyBody = Record<string, never>;

describe('dataset training error existence test', () => {
  it('should only report final or blocked training errors', async () => {
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

    await MongoDatasetTraining.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.chunk,
        retryCount: 3,
        errorMsg: 'temporary failed',
        chunkIndex: 0
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.qa,
        retryCount: 0,
        errorMsg: '   ',
        chunkIndex: 1
      }
    ]);

    const noFinalErrorRes = await Call<
      EmptyBody,
      hasDatasetTrainingErrorQuery,
      hasDatasetTrainingErrorResponse
    >(handler, {
      auth: root,
      query: {
        datasetId: dataset._id
      }
    });

    expect(noFinalErrorRes.code).toBe(200);
    expect(noFinalErrorRes.data.hasError).toBe(false);

    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.parse,
      retryCount: 0,
      errorMsg: 'parse failed',
      chunkIndex: 2
    });

    const finalErrorRes = await Call<
      EmptyBody,
      hasDatasetTrainingErrorQuery,
      hasDatasetTrainingErrorResponse
    >(handler, {
      auth: root,
      query: {
        datasetId: dataset._id
      }
    });

    expect(finalErrorRes.code).toBe(200);
    expect(finalErrorRes.data.hasError).toBe(true);
  });
});
