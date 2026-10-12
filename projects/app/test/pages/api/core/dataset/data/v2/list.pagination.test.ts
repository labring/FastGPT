import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { GetDatasetDataListResponse } from '@fastgpt/global/openapi/core/dataset/data/api';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';

const ids = vi.hoisted(() => ({
  teamId: '68ad85a7463006c963799a01',
  tmbId: '68ad85a7463006c963799a02',
  datasetId: '68ad85a7463006c963799a05',
  collectionId: '68ad85a7463006c963799a06'
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: vi.fn(async () => ({
    teamId: ids.teamId,
    collection: { _id: ids.collectionId, datasetId: ids.datasetId }
  }))
}));

import handler from '@/pages/api/core/dataset/data/v2/list';

/** 调用真实路由和 Mongo 查询；只固定已授权身份，不替代分页或数据库行为。 */
const listData = async (pagination: {
  pageSize?: number;
  pageNum?: number;
  offset?: number;
  searchText?: string;
}) =>
  (await handler({
    body: { collectionId: ids.collectionId, ...pagination },
    query: {}
  } as ApiRequestProps)) as GetDatasetDataListResponse;

describe('dataset data list pagination', () => {
  beforeEach(async () => {
    await MongoDatasetData.create([
      ...Array.from({ length: 65 }, (_, index) => ({
        ...ids,
        q: `record ${index + 1}`,
        a: '',
        chunkIndex: index + 1
      })),
      {
        ...ids,
        collectionId: '68ad85a7463006c963799a07',
        q: 'record 10',
        a: '',
        chunkIndex: 0
      }
    ]);
  });

  it('honors offset with the default page size when pageSize is omitted', async () => {
    const result = await listData({ offset: 10 });
    expect(result.total).toBe(65);
    expect(result.list).toHaveLength(10);
    expect(result.list[0]?.q).toBe('record 11');
    expect(result.list.at(-1)?.q).toBe('record 20');
  });

  it('honors pageNum with the default page size when pageSize is omitted', async () => {
    const result = await listData({ pageNum: 2 });
    expect(result.total).toBe(65);
    expect(result.list).toHaveLength(10);
    expect(result.list[0]?.q).toBe('record 11');
    expect(result.list.at(-1)?.q).toBe('record 20');
  });

  it('uses the first page when all pagination fields are omitted', async () => {
    const result = await listData({});
    expect(result.total).toBe(65);
    expect(result.list).toHaveLength(10);
    expect(result.list[0].q).toBe('record 1');
    expect(result.list.at(-1)?.q).toBe('record 10');
  });

  it('returns an empty page past the last record while preserving the total', async () => {
    const result = await listData({ offset: 65 });
    expect(result.total).toBe(65);
    expect(result.list).toEqual([]);
  });

  it('applies the default-size offset after filtering within the collection', async () => {
    const result = await listData({ offset: 1, searchText: 'record 1' });
    expect(result.total).toBe(11);
    expect(result.list.map((item) => item.q)).toEqual([
      'record 10',
      'record 11',
      'record 12',
      'record 13',
      'record 14',
      'record 15',
      'record 16',
      'record 17',
      'record 18',
      'record 19'
    ]);
  });
  it('keeps the existing page size below the cap', async () => {
    const result = await listData({ pageSize: 15, pageNum: 2 });
    expect(result.total).toBe(65);
    expect(result.list).toHaveLength(15);
    expect(result.list[0].q).toBe('record 16');
    expect(result.list.at(-1)?.q).toBe('record 30');
  });

  it('preserves an explicit offset with an explicit page size', async () => {
    const result = await listData({ pageSize: 30, offset: 30 });
    expect(result.total).toBe(65);
    expect(result.list).toHaveLength(30);
    expect(result.list[0].q).toBe('record 31');
    expect(result.list.at(-1)?.q).toBe('record 60');
  });
});
