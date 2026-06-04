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

type EmptyQuery = Record<string, never>;

describe('training error list test', () => {
  it('should return final error list in collection scope', async () => {
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
        retryCount: 0,
        errorMsg: 'chunk first in insert order',
        chunkIndex: 0
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.parse,
        retryCount: 0,
        errorMsg: 'parse should sort before chunk',
        chunkIndex: 9
      },
      ...[...Array(10).keys()].map((i) => ({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.chunk,
        retryCount: 0,
        errorMsg: 'test',
        chunkIndex: i
      })),
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.parse,
        retryCount: 3,
        errorMsg: 'temporary failed'
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.qa,
        retryCount: 0,
        errorMsg: '   '
      }
    ]);

    const res = await Call<getTrainingErrorBody, EmptyQuery, getTrainingErrorResponse>(handler, {
      auth: root,
      body: {
        collectionId: collection._id,
        pageSize: 10,
        offset: 0
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(12);
    expect(res.data.list.length).toBe(10);
    expect(
      res.data.list.map((item) => ('mode' in item ? item.mode : undefined)).slice(0, 2)
    ).toEqual([TrainingModeEnum.parse, TrainingModeEnum.chunk]);
    expect(res.data.list.every((item) => 'mode' in item)).toBe(true);
  });

  it('should reject dataset scope request', async () => {
    const root = await getRootUser();
    const res = await Call<getTrainingErrorBody, EmptyQuery, getTrainingErrorResponse>(handler, {
      auth: root,
      body: {
        datasetId: '507f1f77bcf86cd799439012',
        pageSize: 10,
        offset: 0
      } as any
    });

    expect(res.code).not.toBe(200);
  });
});
