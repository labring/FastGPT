import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { getRootUser } from '@test/datas/users';

const { mockAuthDatasetData } = vi.hoisted(() => ({ mockAuthDatasetData: vi.fn() }));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/permission/dataset/auth')>()),
  authDatasetData: mockAuthDatasetData
}));

import type { authDatasetData as mockedAuthDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import updateHandler from '@/pages/api/core/dataset/data/update';
import deleteHandler from '@/pages/api/core/dataset/data/delete';
import indexCreateHandler from '@/pages/api/core/dataset/data/index/create';
import indexUpdateHandler from '@/pages/api/core/dataset/data/index/update';
import indexDeleteHandler from '@/pages/api/core/dataset/data/index/delete';
import detailHandler from '@/pages/api/core/dataset/data/detail';
import getQuoteDataHandler from '@/pages/api/core/dataset/data/getQuoteData';

/** 建立真实的数据行，用于验证 authDatasetData 的状态判断本身。 */
const createData = async (indexStatus?: DatasetDataIndexStatusEnum) => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    name: 'write protection'
  });
  const collection = await MongoDatasetCollection.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    name: 'collection',
    type: DatasetCollectionTypeEnum.file
  });
  const data = await MongoDatasetData.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    q: 'chunk',
    indexes: [],
    ...(indexStatus && { indexStatus })
  });

  return { root, dataset, collection, data };
};

const buildAuthReq = (root: Awaited<ReturnType<typeof getRootUser>>) => ({
  req: {
    auth: {
      userId: String(root.userId),
      teamId: String(root.teamId),
      tmbId: String(root.tmbId),
      isRoot: true,
      authType: 'token'
    }
  }
});

/** 本组用例验证真实的状态判断，因此绕过上面的模块替换取原始实现。 */
const getRealAuthDatasetData = async () => {
  const actual = await vi.importActual<
    typeof import('@fastgpt/service/support/permission/dataset/auth')
  >('@fastgpt/service/support/permission/dataset/auth');
  return actual.authDatasetData;
};

describe('pending index data write protection', () => {
  let authDatasetData: typeof mockedAuthDatasetData;

  beforeEach(async () => {
    authDatasetData = (await getRealAuthDatasetData()) as typeof mockedAuthDatasetData;
  });

  it.each([DatasetDataIndexStatusEnum.indexing])(
    'rejects data-level writes for %s data',
    async (indexStatus) => {
      const { root, data } = await createData(indexStatus);

      await expect(
        authDatasetData({
          ...(buildAuthReq(root) as any),
          dataId: String(data._id),
          assertWritable: true
        })
      ).rejects.toBe('dataNotIndexed');
    }
  );

  it.each([DatasetDataIndexStatusEnum.indexed, undefined])(
    'allows data-level writes for %s data',
    async (indexStatus) => {
      const { root, data } = await createData(indexStatus);

      const result = await authDatasetData({
        ...(buildAuthReq(root) as any),
        dataId: String(data._id),
        assertWritable: true
      });

      expect(String(result.datasetData.id)).toBe(String(data._id));
      // 读取路径使用的字段完整，缺失状态不回填。
      expect(result.datasetData.indexStatus).toBe(indexStatus);
    }
  );

  /** DS-13：读接口不传 assertWritable，待索引数据仍可查看。 */
  it('keeps read access for pending index data', async () => {
    const { root, data } = await createData(DatasetDataIndexStatusEnum.indexing);

    const result = await authDatasetData({
      ...(buildAuthReq(root) as any),
      dataId: String(data._id)
    });

    expect(result.datasetData.q).toBe('chunk');
    expect(result.datasetData.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
  });

  /** DS-04：鉴权返回的白名单对象必须带上 indexStatus，否则列表与详情读不到状态。 */
  it('exposes indexStatus in the auth whitelist object', async () => {
    const { root, data } = await createData(DatasetDataIndexStatusEnum.indexing);

    const result = await authDatasetData({
      ...(buildAuthReq(root) as any),
      dataId: String(data._id)
    });

    expect(result.datasetData).toHaveProperty('indexStatus', DatasetDataIndexStatusEnum.indexing);
  });
});

describe('data API write protection wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 断言是否传入了写保护开关：两类接口返回不同的哨兵错误。
    mockAuthDatasetData.mockImplementation(async (args: { assertWritable?: boolean }) => {
      throw new Error(args.assertWritable ? 'WRITE_PATH' : 'READ_PATH');
    });
  });

  const dataId = '68ad85a7463006c963799a05';

  it.each([
    ['update', updateHandler, { body: { dataId, q: 'next question' } }],
    ['delete', deleteHandler, { query: { id: dataId } }],
    ['index/create', indexCreateHandler, { body: { dataId, type: 'custom', text: 'index' } }],
    [
      'index/update',
      indexUpdateHandler,
      { body: { dataId, indexDataId: 'vec_1', type: 'custom', text: 'index' } }
    ],
    ['index/delete', indexDeleteHandler, { body: { dataId, indexDataId: 'vec_1' } }]
  ])('enables write protection on data/%s', async (_name, handler, req) => {
    await expect((handler as any)({ ...req })).rejects.toThrow('WRITE_PATH');
    expect(mockAuthDatasetData).toHaveBeenCalledWith(
      expect.objectContaining({ dataId, assertWritable: true })
    );
  });

  it.each([
    ['detail', detailHandler, { query: { id: dataId } }],
    ['getQuoteData', getQuoteDataHandler, { body: { id: dataId } }]
  ])('does not enable write protection on data/%s', async (_name, handler, req) => {
    await expect((handler as any)({ ...req })).rejects.toThrow('READ_PATH');
    expect(mockAuthDatasetData).toHaveBeenCalledWith(
      expect.not.objectContaining({ assertWritable: true })
    );
  });
});
