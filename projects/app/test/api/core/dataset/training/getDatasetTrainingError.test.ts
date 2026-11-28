import handler, {
  type getDatasetTrainingErrorBody,
  type getDatasetTrainingErrorResponse
} from '@/pages/api/core/dataset/training/getDatasetTrainingError';
import hasErrorHandler from '@/pages/api/core/dataset/training/hasDatasetTrainingError';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { DatasetTrainingErrorPaginationLimits } from '@fastgpt/global/openapi/core/dataset/training/api';
import { PaginationPageSizeLimit } from '@fastgpt/global/openapi/api';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { datasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { getFakeUsers, getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

type EmptyQuery = Record<string, never>;

describe('dataset training error list test', () => {
  it('applies collection read permissions to error presence, totals and both pages', async () => {
    const {
      owner,
      members: [reader]
    } = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'Collection error permissions',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      vectorModel: 'test',
      agentModel: 'test',
      collectionPermissionEnabled: true
    });
    const datasetId = String(dataset._id);
    const scope = { teamId: owner.teamId, tmbId: owner.tmbId, datasetId };
    const [restricted, readable] = await MongoDatasetCollection.create(
      ['Restricted', 'Readable'].map((name) => ({
        ...scope,
        name,
        type: DatasetCollectionTypeEnum.file,
        inheritPermission: false
      }))
    );
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: owner.teamId,
        resourceId: dataset._id,
        tmbId: reader.tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: owner.teamId,
        resourceId: readable._id,
        tmbId: reader.tmbId,
        permission: ReadPermissionVal
      }
    ]);

    const createError = (collectionId: string, q: string) =>
      MongoDatasetData.create({
        ...scope,
        collectionId,
        q,
        indexStatus: DatasetDataIndexStageEnum.rebuildIndexRunning,
        indexError: true,
        indexErrorMsg: 'Rebuild failed'
      });
    await createError(String(restricted._id), 'Restricted source');
    const errors = await Call(handler, { auth: reader, body: { datasetId } });
    expect(errors).toMatchObject({ code: 200, data: { total: 0, list: [] } });
    expect(await Call(hasErrorHandler, { auth: reader, query: { datasetId } })).toMatchObject({
      code: 200,
      data: { hasError: false }
    });

    await createError(String(readable._id), 'Readable source');
    const page = (collectionId?: string) =>
      Call(handler, { auth: reader, body: { datasetId, collectionId, offset: 0, pageSize: 1 } });

    const expected = {
      code: 200,
      data: {
        total: 1,
        list: [
          { collection: { collectionId: String(readable._id) }, items: [{ q: 'Readable source' }] }
        ]
      }
    };
    expect(await page()).toMatchObject(expected);
    expect(await page(String(readable._id))).toMatchObject(expected);
    expect((await page(String(restricted._id))).code).not.toBe(200);
  });

  it('returns draft indexes for initial failures and saved indexes for rebuild failures', async () => {
    const { root, scope } = await createDatasetCollectionFixture();
    const draftIndexes = [
      { type: DatasetDataIndexTypeEnum.custom, text: 'Custom index draft' },
      { type: DatasetDataIndexTypeEnum.question, text: 'Generated question draft' }
    ];
    const builtIndex = { type: DatasetDataIndexTypeEnum.custom, text: 'Indexed text' };
    const [initialError, rebuildError] = await MongoDatasetData.create([
      {
        ...scope,
        q: 'First index',
        indexStatus: DatasetDataIndexStageEnum.index,
        indexError: true,
        indexErrorMsg: 'Embedding failed',
        draftIndexes
      },
      {
        ...scope,
        q: 'Rebuild',
        indexStatus: DatasetDataIndexStageEnum.rebuildIndexRunning,
        indexError: true,
        indexErrorMsg: 'Rebuild failed',
        indexes: [{ ...builtIndex, dataId: 'saved-vector' }]
      }
    ]);
    const res = await Call<
      getDatasetTrainingErrorBody,
      EmptyQuery,
      getDatasetTrainingErrorResponse
    >(handler, { auth: root, body: { datasetId: scope.datasetId } });

    expect(res.code).toBe(200);
    const items = res.data.list[0].items;
    expect(items.find(({ _id }) => _id === String(initialError._id))?.indexes).toEqual(
      draftIndexes
    );
    expect(items.find(({ _id }) => _id === String(rebuildError._id))?.indexes).toEqual([
      builtIndex
    ]);
  });

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

    const scope = { teamId: root.teamId, tmbId: root.tmbId, datasetId: dataset._id };
    await fileCollection.updateOne({
      $set: {
        training: {
          status: 'active',
          usageId: String(new Types.ObjectId()),
          revision: 1,
          parse: { status: 'error', errorMsg: 'file parse error' }
        }
      }
    });
    await MongoDatasetData.create({
      ...scope,
      collectionId: fileCollection._id,
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexRunning,
      indexError: true,
      indexErrorMsg: 'file error',
      chunkIndex: 2
    });
    await datasetQaTrainingService.createMany({
      items: [
        {
          teamId: String(scope.teamId),
          tmbId: String(scope.tmbId),
          datasetId: String(scope.datasetId),
          collectionId: String(fileCollection._id),
          q: 'pending',
          status: 'active'
        },
        {
          teamId: String(scope.teamId),
          tmbId: String(scope.tmbId),
          datasetId: String(scope.datasetId),
          collectionId: String(linkCollection._id),
          q: 'source',
          status: 'error',
          errorMsg: 'link error'
        }
      ]
    });

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
    expect(firstPageRes.data.list[0].items[0]._id).toBe(String(fileCollection._id));

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
    expect(loadMoreRes.data.list[0].items[0].mode).toBe(TrainingModeEnum.rebuildIndex);
  });

  it('uses the common default and returns more than 20 collections when requested', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collections = await MongoDatasetCollection.insertMany(
      Array.from({ length: 21 }, (_, index) => ({
        name: `error-${index}`,
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id
      }))
    );
    await datasetQaTrainingService.createMany({
      items: collections.map((collection) => ({
        teamId: String(root.teamId),
        tmbId: String(root.tmbId),
        datasetId: String(dataset._id),
        collectionId: String(collection._id),
        q: 'source',
        status: 'error' as const,
        errorMsg: 'training failed',
        chunkIndex: 0
      }))
    });

    const defaultPage = await Call<
      getDatasetTrainingErrorBody,
      EmptyQuery,
      getDatasetTrainingErrorResponse
    >(handler, { auth: root, body: { datasetId: dataset._id } });
    expect(defaultPage.code).toBe(200);
    expect(defaultPage.data.total).toBe(21);
    expect(defaultPage.data.list).toHaveLength(20);

    const largerPage = await Call<
      getDatasetTrainingErrorBody,
      EmptyQuery,
      getDatasetTrainingErrorResponse
    >(handler, {
      auth: root,
      body: { datasetId: dataset._id, pageSize: PaginationPageSizeLimit + 1, offset: 0 }
    });
    expect(largerPage.code).toBe(200);
    expect(largerPage.data.total).toBe(21);
    expect(largerPage.data.list).toHaveLength(21);
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
    }
  ])('should reject $name before querying Mongo', async ({ body }) => {
    const res = await Call<any, EmptyQuery, getDatasetTrainingErrorResponse>(handler, {
      body
    });

    expect(res.code).not.toBe(200);
    expect(res.error).toBeInstanceOf(ApiRequestInputParseError);
  });
});
