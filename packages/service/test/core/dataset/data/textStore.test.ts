import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// 被测对象: textStore.ts(getFullTextStore / MongoFullTextStore)  等级: 3-High
// getFullTextStore() 为模块级单例缓存(ISSUE-005),每个用例先 vi.resetModules() 重载模块、
// 再设 TEXT_STORE_VECTOR_TYPE 后重新 import,保证分发行为可独立断言。
// 全文后端跟随向量库 provider:milvus → BM25;其他(pg 等)→ Mongo $text。

const mockAggregate = vi.hoisted(() => vi.fn());
const mockBulkWrite = vi.hoisted(() => vi.fn());
const mockDeleteMany = vi.hoisted(() => vi.fn());
const mockJiebaSplit = vi.hoisted(() => vi.fn());
const mockFind = vi.hoisted(() => vi.fn());
const mockReadSession = vi.hoisted(() => vi.fn());
const mockLean = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/data/dataTextSchema', () => ({
  MongoDatasetDataText: {
    aggregate: mockAggregate,
    find: mockFind,
    bulkWrite: mockBulkWrite,
    deleteMany: mockDeleteMany
  }
}));
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {}
}));
vi.mock('@fastgpt/service/common/vectorDB/milvus/fullText', () => ({
  getMilvusFullTextStore: () => ({ isMilvus: true })
}));
// 分词只在 Mongo 全文实现内部发生:mock 掉 jiebaSplit,避免加载原生词典(慢/脆弱)
vi.mock('@fastgpt/service/common/string/jieba/index', () => ({
  jiebaSplit: mockJiebaSplit
}));
// 覆盖 test/mocks/common/vector.ts 的全局 constants mock(其缺 getVectorType 导出),
// 用真实模块 + TEXT_STORE_VECTOR_TYPE 控制 provider 分发(ISSUE-005)。
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@fastgpt/service/common/vectorDB/constants')>();
  return {
    ...orig,
    getVectorType: () => (process.env.TEXT_STORE_VECTOR_TYPE === 'milvus' ? 'milvus' : 'pg')
  };
});

const originalVectorType = process.env.TEXT_STORE_VECTOR_TYPE;

// 每次重新加载 textStore 模块(单例缓存随之重置),并设 provider 类型
const loadTextStore = async (engine: 'mongo' | 'milvus') => {
  vi.resetModules();
  process.env.TEXT_STORE_VECTOR_TYPE = engine === 'milvus' ? 'milvus' : 'pg';
  const mod = await import('@fastgpt/service/core/dataset/data/textStore');
  return mod;
};

beforeEach(() => {
  mockAggregate.mockReset();
  mockAggregate.mockResolvedValue([
    { dataId: '68ad85a7463006c963799a05', collectionId: 'col1', score: 2.5 }
  ]);
  mockBulkWrite.mockReset().mockResolvedValue({});
  mockFind.mockReset().mockReturnValue({ session: mockReadSession });
  mockReadSession.mockReset().mockReturnValue({ lean: mockLean });
  mockLean.mockReset().mockResolvedValue([]);
  // deleteMany 返回 Query,链式 .maxTimeMS() 需可调用并返回 thenable
  mockDeleteMany
    .mockReset()
    .mockReturnValue({ maxTimeMS: vi.fn().mockResolvedValue({ deletedCount: 1 }) });
  mockJiebaSplit.mockReset().mockResolvedValue('token');
});
afterEach(() => {
  process.env.TEXT_STORE_VECTOR_TYPE = originalVectorType;
});

describe('textStore', () => {
  it('skips identical stored tokens only inside the supplied transaction', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const session = { inTransaction: () => true } as never;
    const item = {
      dataId: 'd1',
      teamId: 't1',
      datasetId: 'ds1',
      collectionId: 'c1',
      fullText: 'new source text',
      skipUnchanged: true
    };
    mockLean.mockResolvedValue([{ ...item, fullTextToken: 'token' }]);

    await new MongoFullTextStore().write([item], session);

    expect(mockJiebaSplit).toHaveBeenCalledWith({ text: 'new source text' });
    expect(mockFind).toHaveBeenCalledWith(
      { dataId: { $in: ['d1'] } },
      'dataId teamId datasetId collectionId fullTextToken'
    );
    expect(mockReadSession).toHaveBeenCalledWith(session);
    expect(mockBulkWrite).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'changed tokens', stored: { fullTextToken: 'old token' } },
    { name: 'missing tokens', stored: {} },
    { name: 'different team', stored: { teamId: 'other', fullTextToken: 'token' } },
    { name: 'different dataset', stored: { datasetId: 'other', fullTextToken: 'token' } },
    { name: 'different collection', stored: { collectionId: 'other', fullTextToken: 'token' } }
  ])('writes when the stored record has $name', async ({ stored }) => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const session = { inTransaction: () => true } as never;
    const item = {
      dataId: 'd1',
      teamId: 't1',
      datasetId: 'ds1',
      collectionId: 'c1',
      fullText: 'target',
      skipUnchanged: true
    };
    mockLean.mockResolvedValue([{ ...item, ...stored }]);

    await new MongoFullTextStore().write([item], session);

    expect(mockBulkWrite).toHaveBeenCalledExactlyOnceWith(
      [
        {
          updateOne: {
            filter: { dataId: 'd1' },
            update: {
              $set: {
                dataId: 'd1',
                teamId: 't1',
                datasetId: 'ds1',
                collectionId: 'c1',
                fullTextToken: 'token'
              }
            },
            upsert: true
          }
        }
      ],
      { ordered: false, session }
    );
  });

  it('writes only changed and missing records in a mixed batch', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const session = { inTransaction: () => true } as never;
    const items = ['same', 'changed', 'missing'].map((dataId) => ({
      dataId,
      teamId: 't1',
      datasetId: 'ds1',
      collectionId: 'c1',
      fullText: 'target',
      skipUnchanged: true
    }));
    mockLean.mockResolvedValue([
      { ...items[0], fullTextToken: 'token' },
      { ...items[1], fullTextToken: 'old token' }
    ]);

    await new MongoFullTextStore().write(items, session);

    expect(
      mockBulkWrite.mock.calls[0][0].map(
        (operation: { updateOne: { filter: { dataId: string } } }) =>
          operation.updateOne.filter.dataId
      )
    ).toEqual(['changed', 'missing']);
  });

  it.each([undefined, { inTransaction: () => false }])(
    'does not compare outside a transaction',
    async (session) => {
      const { MongoFullTextStore } = await loadTextStore('mongo');
      await new MongoFullTextStore().write(
        [
          {
            dataId: 'd1',
            teamId: 't1',
            datasetId: 'ds1',
            collectionId: 'c1',
            fullText: 'target',
            skipUnchanged: true
          }
        ],
        session as never
      );
      expect(mockFind).not.toHaveBeenCalled();
      expect(mockBulkWrite).toHaveBeenCalledTimes(1);
    }
  );

  it('does not perform comparison reads for ordinary writes', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    await new MongoFullTextStore().write(
      [
        {
          dataId: 'd1',
          teamId: 't1',
          datasetId: 'ds1',
          collectionId: 'c1',
          fullText: 'target'
        }
      ],
      { inTransaction: () => true } as never
    );
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockBulkWrite).toHaveBeenCalledTimes(1);
  });

  it('propagates comparison failures without writing', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    mockLean.mockRejectedValue(new Error('read failed'));
    await expect(
      new MongoFullTextStore().write(
        [
          {
            dataId: 'd1',
            teamId: 't1',
            datasetId: 'ds1',
            collectionId: 'c1',
            fullText: 'target',
            skipUnchanged: true
          }
        ],
        { inTransaction: () => true } as never
      )
    ).rejects.toThrow('read failed');
    expect(mockBulkWrite).not.toHaveBeenCalled();
  });

  it('TC-7.1 FullTextStore interface exposes search + write/delete', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const mongo: InstanceType<typeof MongoFullTextStore> = new MongoFullTextStore();
    expect(typeof mongo.search).toBe('function');
    expect(typeof mongo.write).toBe('function');
    expect(typeof mongo.deleteByDataId).toBe('function');
    expect(typeof mongo.deleteByDatasetIds).toBe('function');
    expect(typeof mongo.deleteByCollectionIds).toBe('function');
  });

  it('TC-7.2 dispatches to milvus store when provider=milvus', async () => {
    const { getFullTextStore } = await loadTextStore('milvus');
    expect((getFullTextStore() as any).isMilvus).toBe(true);
  });

  it('TC-7.3 dispatches to mongo store when provider!=milvus', async () => {
    const { getFullTextStore } = await loadTextStore('mongo');
    const store = getFullTextStore();
    expect((store as any).isMilvus).toBeUndefined();
  });

  it('TC-7.4 mongo search normalizes aggregate rows', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const store = new MongoFullTextStore();
    const items = await store.search({
      teamId: '68ad85a7463006c963799a05',
      datasetIds: ['68ad85a7463006c963799a05'],
      query: 'q',
      limit: 10,
      forbidCollectionIdList: []
    });
    expect(items).toEqual([
      {
        dataId: '68ad85a7463006c963799a05',
        collectionId: 'col1',
        score: 2.5
      }
    ]);
  });

  it('TC-7.5 write tokenizes fullText internally and upserts by dataId with session', async () => {
    mockJiebaSplit.mockResolvedValue('token d1');
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const store = new MongoFullTextStore();
    const session = { sessionId: 's1' } as never;
    await store.write(
      [
        { dataId: 'd1', teamId: 't1', datasetId: 'ds1', collectionId: 'c1', fullText: 'q a' },
        { dataId: 'd2', teamId: 't1', datasetId: 'ds1', collectionId: 'c1', fullText: 'q b' }
      ],
      session
    );
    // 分词发生在 Mongo 全文实现内部,入参为原始文本,落库字段为 fullTextToken
    expect(mockJiebaSplit).toHaveBeenCalledTimes(2);
    expect(mockJiebaSplit).toHaveBeenCalledWith({ text: 'q a' });
    expect(mockBulkWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: { dataId: 'd1' },
            update: { $set: expect.objectContaining({ fullTextToken: 'token d1' }) },
            upsert: true
          })
        }),
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: { dataId: 'd2' },
            upsert: true
          })
        })
      ]),
      { ordered: false, session }
    );
  });

  it('TC-7.6 deleteByDataId forwards session', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const store = new MongoFullTextStore();
    const session = { sessionId: 's1' } as never;
    await store.deleteByDataId('d1', session);
    expect(mockDeleteMany).toHaveBeenCalledWith({ dataId: 'd1' }, { session });
  });

  it('TC-7.7 deleteByDatasetIds deletes per datasetId with session and timeout', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const store = new MongoFullTextStore();
    const session = { sessionId: 's1' } as never;
    await store.deleteByDatasetIds({ teamId: 't1', datasetIds: ['ds1', 'ds2'] }, session);
    expect(mockDeleteMany).toHaveBeenNthCalledWith(
      1,
      { teamId: 't1', datasetId: 'ds1' },
      { session }
    );
    expect(mockDeleteMany).toHaveBeenNthCalledWith(
      2,
      { teamId: 't1', datasetId: 'ds2' },
      { session }
    );
    expect(mockDeleteMany.mock.results[0].value.maxTimeMS).toHaveBeenCalledWith(300000);
  });

  it('TC-7.8 deleteByCollectionIds forwards session', async () => {
    const { MongoFullTextStore } = await loadTextStore('mongo');
    const store = new MongoFullTextStore();
    const session = { sessionId: 's1' } as never;
    await store.deleteByCollectionIds(
      { teamId: 't1', datasetIds: ['ds1'], collectionIds: ['c1'] },
      session
    );
    expect(mockDeleteMany).toHaveBeenCalledWith(
      { teamId: 't1', datasetId: { $in: ['ds1'] }, collectionId: { $in: ['c1'] } },
      { session }
    );
  });
});
