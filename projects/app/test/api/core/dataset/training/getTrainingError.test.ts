import handler, {
  type getTrainingErrorBody,
  type getTrainingErrorResponse
} from '@/pages/api/core/dataset/training/getTrainingError';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { datasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';
import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it } from 'vitest';

type EmptyQuery = Record<string, never>;

describe('training error list test', () => {
  beforeEach(() => {
    const previousStrictQuery = connectionMongo.get('strictQuery') ?? false;
    connectionMongo.set('strictQuery', 'throw');
    return () => {
      connectionMongo.set('strictQuery', previousStrictQuery);
    };
  });

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
    await collection.updateOne({
      $set: {
        training: {
          status: 'active',
          usageId: String(new Types.ObjectId()),
          revision: 1,
          parse: { status: 'error', errorMsg: 'parse should sort before rebuild' }
        }
      }
    });
    await MongoDatasetData.insertMany(
      Array.from({ length: 11 }, (_, chunkIndex) => ({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        indexStatus: DatasetDataIndexStageEnum.rebuildIndexRunning,
        indexError: true,
        indexErrorMsg: 'test',
        chunkIndex
      }))
    );

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
    ).toEqual([TrainingModeEnum.parse, TrainingModeEnum.rebuildIndex]);
    expect(res.data.list.every((item) => 'mode' in item)).toBe(true);
    expect(res.data.list[0]._id).toBe(String(collection._id));
  });

  it('reports unfinished parse, QA and index work as blocked while the collection is unpaid', async () => {
    const { root, collection, scope } = await createDatasetCollectionFixture();
    await collection.updateOne({
      $set: {
        training: {
          status: 'paused_unpaid',
          pausedAt: new Date(),
          usageId: String(new Types.ObjectId()),
          revision: 1,
          parse: { status: 'active' }
        }
      }
    });
    const [[qa], data] = await Promise.all([
      datasetQaTrainingService.createMany({
        items: [
          {
            teamId: String(scope.teamId),
            tmbId: String(scope.tmbId),
            datasetId: String(scope.datasetId),
            collectionId: String(scope.collectionId),
            q: 'QA source',
            status: 'active'
          }
        ]
      }),
      MongoDatasetData.create({
        ...scope,
        q: 'Pending data',
        indexStatus: DatasetDataIndexStageEnum.index
      })
    ]);

    const res = await Call<getTrainingErrorBody, EmptyQuery, getTrainingErrorResponse>(handler, {
      auth: root,
      body: { collectionId: scope.collectionId, pageSize: 10, offset: 0 }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(3);
    expect(res.data.list).toMatchObject([
      { _id: scope.collectionId, mode: TrainingModeEnum.parse },
      { _id: String(qa._id), mode: TrainingModeEnum.qa },
      { _id: String(data._id), mode: TrainingModeEnum.index }
    ]);
    for (const item of res.data.list) {
      expect(new Date(item.lockTime).toISOString()).toBe('2050-01-01T00:00:00.000Z');
      expect(item.errorMsg).toBe(i18nT('common:code_error.team_error.ai_points_not_enough'));
    }
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
