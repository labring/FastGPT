import handler, {
  type getDatasetTrainingErrorBody,
  type getDatasetTrainingErrorResponse
} from '@/pages/api/core/dataset/training/getDatasetTrainingError';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetTrainingErrorPaginationLimits } from '@fastgpt/global/openapi/core/dataset/training/api';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

type EmptyQuery = Record<string, never>;

describe('dataset training error list test', () => {
  it('should paginate error collections and load more chunks inside one collection', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const [fileCollection, linkCollection] = await MongoDatasetCollection.create([
      {
        name: 'file',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        updateTime: new Date('2025-01-01')
      },
      {
        name: 'link',
        type: DatasetCollectionTypeEnum.link,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        rawLink: 'https://example.com',
        updateTime: new Date('2025-01-02')
      }
    ]);

    await MongoDatasetTraining.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: fileCollection._id,
        billId: 'test',
        mode: TrainingModeEnum.qa,
        retryCount: 3,
        errorMsg: 'temporary failed',
        chunkIndex: 0
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: fileCollection._id,
        billId: 'test',
        mode: TrainingModeEnum.chunk,
        retryCount: 0,
        errorMsg: 'file error',
        chunkIndex: 2
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: fileCollection._id,
        billId: 'test',
        mode: TrainingModeEnum.parse,
        retryCount: 0,
        errorMsg: 'file parse error',
        chunkIndex: 1
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: fileCollection._id,
        billId: 'test',
        mode: TrainingModeEnum.chunk,
        retryCount: 0,
        errorMsg: '   ',
        chunkIndex: 3
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: linkCollection._id,
        billId: 'test',
        mode: TrainingModeEnum.qa,
        retryCount: 0,
        errorMsg: 'link error',
        chunkIndex: 0
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: linkCollection._id,
        billId: 'test',
        mode: TrainingModeEnum.chunk,
        retryCount: 3,
        errorMsg: 'link chunk error',
        chunkIndex: 1
      }
    ]);

    const firstPageRes = await Call<
      getDatasetTrainingErrorBody,
      EmptyQuery,
      getDatasetTrainingErrorResponse
    >(handler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        pageSize: 1,
        offset: 0,
        itemPageSize: 1
      }
    });

    expect(firstPageRes.code).toBe(200);
    expect(firstPageRes.data.total).toBe(2);
    expect(firstPageRes.data.list).toHaveLength(1);
    expect(firstPageRes.data.list[0].collection.name).toBe('file');
    expect(firstPageRes.data.list[0].errorCount).toBe(2);
    expect(firstPageRes.data.list[0].hasMoreItems).toBe(true);
    expect(firstPageRes.data.list[0].items).toHaveLength(1);
    expect(firstPageRes.data.list[0].items[0].mode).toBe(TrainingModeEnum.parse);

    const secondPageRes = await Call<
      getDatasetTrainingErrorBody,
      EmptyQuery,
      getDatasetTrainingErrorResponse
    >(handler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        pageSize: 1,
        offset: 1,
        itemPageSize: 1
      }
    });

    expect(secondPageRes.code).toBe(200);
    expect(secondPageRes.data.total).toBe(2);
    expect(secondPageRes.data.list).toHaveLength(1);
    expect(secondPageRes.data.list[0].collection.name).toBe('link');
    expect(secondPageRes.data.list[0].errorCount).toBe(1);
    expect(secondPageRes.data.list[0].hasMoreItems).toBe(false);
    expect(secondPageRes.data.list[0].items[0].mode).toBe(TrainingModeEnum.qa);

    const loadMoreRes = await Call<
      getDatasetTrainingErrorBody,
      EmptyQuery,
      getDatasetTrainingErrorResponse
    >(handler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        collectionId: fileCollection._id,
        pageSize: 1,
        offset: 0,
        itemOffset: 1,
        itemPageSize: 1
      }
    });

    expect(loadMoreRes.code).toBe(200);
    expect(loadMoreRes.data.total).toBe(1);
    expect(loadMoreRes.data.list).toHaveLength(1);
    expect(loadMoreRes.data.list[0].collection.name).toBe('file');
    expect(loadMoreRes.data.list[0].errorCount).toBe(2);
    expect(loadMoreRes.data.list[0].hasMoreItems).toBe(false);
    expect(loadMoreRes.data.list[0].items).toHaveLength(1);
    expect(loadMoreRes.data.list[0].items[0].mode).toBe(TrainingModeEnum.chunk);
  });

  it.each([
    {
      name: 'invalid itemOffset',
      body: {
        datasetId: '507f1f77bcf86cd799439011',
        pageSize: 1,
        offset: 0,
        itemOffset: 'not-a-number',
        itemPageSize: 1
      }
    },
    {
      name: 'oversized itemPageSize',
      body: {
        datasetId: '507f1f77bcf86cd799439011',
        pageSize: 1,
        offset: 0,
        itemPageSize: DatasetTrainingErrorPaginationLimits.maxItemPageSize + 1
      }
    },
    {
      name: 'invalid pageSize',
      body: {
        datasetId: '507f1f77bcf86cd799439011',
        pageSize: 'not-a-number',
        offset: 0,
        itemPageSize: 1
      }
    },
    {
      name: 'oversized pageSize',
      body: {
        datasetId: '507f1f77bcf86cd799439011',
        pageSize: DatasetTrainingErrorPaginationLimits.maxPageSize + 1,
        offset: 0,
        itemPageSize: 1
      }
    }
  ])('should reject $name before querying Mongo', async ({ body }) => {
    const res = await Call<any, EmptyQuery, getDatasetTrainingErrorResponse>(handler, {
      body
    });

    expect(res.code).not.toBe(200);
    expect(res.error).toBeInstanceOf(ApiRequestInputParseError);
  });
});
