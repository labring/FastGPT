import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockAggregate = vi.hoisted(() => vi.fn());
const mockBulkWrite = vi.hoisted(() => vi.fn());
const mockDeleteMany = vi.hoisted(() => vi.fn());
const mockJiebaSplit = vi.hoisted(() => vi.fn());
const mockSearchSqlFullText = vi.hoisted(() => vi.fn());
const mockMilvusSearch = vi.hoisted(() => vi.fn());
const fullTextConfig = vi.hoisted(() => ({
  compatibility: true
}));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...actual,
    serviceEnv: {
      ...actual.serviceEnv,
      get TMP_MIGRATE_FULL_TEXT() {
        return fullTextConfig.compatibility;
      }
    }
  };
});

vi.mock('@fastgpt/service/core/dataset/data/dataTextSchema', () => ({
  MongoDatasetDataText: {
    aggregate: mockAggregate,
    bulkWrite: mockBulkWrite,
    deleteMany: mockDeleteMany
  }
}));
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {}
}));
vi.mock('@fastgpt/service/common/string/jieba/index', () => ({
  jiebaSplit: mockJiebaSplit
}));
vi.mock('@fastgpt/service/core/dataset/fullText/store', () => ({
  searchNativeFullText: mockSearchSqlFullText
}));
vi.mock('@fastgpt/service/common/vectorDB/milvus/fullText', () => ({
  getMilvusFullTextStore: () => ({ isMilvus: true, search: mockMilvusSearch })
}));
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@fastgpt/service/common/vectorDB/constants')>();
  return {
    ...orig,
    getVectorType: () =>
      (process.env.TEXT_STORE_VECTOR_TYPE as
        | 'milvus'
        | 'pg'
        | 'oceanbase'
        | 'seekdb'
        | 'opengauss') ?? 'pg'
  };
});

const originalVectorType = process.env.TEXT_STORE_VECTOR_TYPE;

const loadTextStore = async (provider: 'milvus' | 'pg' | 'oceanbase' | 'seekdb' | 'opengauss') => {
  vi.resetModules();
  process.env.TEXT_STORE_VECTOR_TYPE = provider;
  return import('@fastgpt/service/core/dataset/data/textStore');
};

beforeEach(() => {
  fullTextConfig.compatibility = true;
  mockAggregate
    .mockReset()
    .mockResolvedValue([{ dataId: '68ad85a7463006c963799a05', collectionId: 'col1', score: 1.5 }]);
  mockBulkWrite.mockReset().mockResolvedValue({});
  mockDeleteMany
    .mockReset()
    .mockReturnValue({ maxTimeMS: vi.fn().mockResolvedValue({ deletedCount: 1 }) });
  mockJiebaSplit.mockReset().mockResolvedValue('token');
  mockSearchSqlFullText
    .mockReset()
    .mockResolvedValue([{ dataId: '68ad85a7463006c963799a05', collectionId: 'col1', score: 2.5 }]);
  mockMilvusSearch.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  process.env.TEXT_STORE_VECTOR_TYPE = originalVectorType;
});

describe('textStore', () => {
  it('TC-7.1 MongoFullTextStore and NativeFullTextStore expose search + compatibility write/delete', async () => {
    const { MongoFullTextStore, NativeFullTextStore } = await loadTextStore('pg');
    const mongo = new MongoFullTextStore();
    const sqlStore = new NativeFullTextStore();
    expect(typeof mongo.search).toBe('function');
    expect(typeof mongo.write).toBe('function');
    expect(typeof mongo.deleteByDataId).toBe('function');
    expect(typeof mongo.deleteByDatasetIds).toBe('function');
    expect(typeof mongo.deleteByCollectionIds).toBe('function');
    expect(sqlStore).toBeInstanceOf(MongoFullTextStore);
  });

  it('TC-7.2 dispatches to milvus store when provider=milvus', async () => {
    const { getFullTextStore } = await loadTextStore('milvus');
    expect((getFullTextStore() as any).isMilvus).toBe(true);
  });

  it.each(['pg', 'oceanbase', 'seekdb', 'opengauss'] as const)(
    'TC-7.3 keeps %s on Mongo until the compatibility flag is removed',
    async (provider) => {
      const { getFullTextStore, NativeFullTextStore } = await loadTextStore(provider);
      const store = getFullTextStore();
      expect(store).toBeInstanceOf(NativeFullTextStore);
      expect(getFullTextStore()).toBe(store);

      const props = {
        teamId: '68ad85a7463006c963799a05',
        datasetIds: ['68ad85a7463006c963799a05'],
        query: 'q',
        limit: 10,
        forbidCollectionIdList: []
      };

      await store.search(props);
      expect(mockSearchSqlFullText).not.toHaveBeenCalled();
      mockAggregate.mockClear();
      fullTextConfig.compatibility = false;

      const nativeItems = await store.search(props);
      expect(mockSearchSqlFullText).toHaveBeenCalledExactlyOnceWith(props);
      expect(mockAggregate).not.toHaveBeenCalled();
      expect(nativeItems).toEqual([
        {
          dataId: '68ad85a7463006c963799a05',
          collectionId: 'col1',
          score: 2.5
        }
      ]);

      fullTextConfig.compatibility = true;
      mockAggregate.mockClear();
      mockSearchSqlFullText.mockClear();
      await store.search(props);
      expect(mockAggregate).toHaveBeenCalledOnce();
      expect(mockSearchSqlFullText).not.toHaveBeenCalled();
    }
  );

  it('TC-7.4 write tokenizes fullText internally and upserts by dataId with session', async () => {
    mockJiebaSplit.mockResolvedValue('token d1');
    const { NativeFullTextStore } = await loadTextStore('pg');
    const store = new NativeFullTextStore();
    const session = { sessionId: 's1' } as never;
    await store.write(
      [
        { dataId: 'd1', teamId: 't1', datasetId: 'ds1', collectionId: 'c1', fullText: 'q a' },
        { dataId: 'd2', teamId: 't1', datasetId: 'ds1', collectionId: 'c1', fullText: 'q b' }
      ],
      session
    );
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

  it('TC-7.5 deleteByDataId, deleteByDatasetIds and deleteByCollectionIds forward session', async () => {
    const { NativeFullTextStore } = await loadTextStore('pg');
    const store = new NativeFullTextStore();
    const session = { sessionId: 's1' } as never;
    await store.deleteByDataId('d1', session);
    expect(mockDeleteMany).toHaveBeenCalledWith({ dataId: 'd1' }, { session });

    mockDeleteMany.mockClear();
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

    mockDeleteMany.mockClear();
    await store.deleteByCollectionIds(
      { teamId: 't1', datasetIds: ['ds1'], collectionIds: ['c1'] },
      session
    );
    expect(mockDeleteMany).toHaveBeenCalledWith(
      { teamId: 't1', datasetId: { $in: ['ds1'] }, collectionId: { $in: ['c1'] } },
      { session }
    );
  });

  it('skips Mongo compatibility writes and deletes when native reads disable dual write', async () => {
    const { getFullTextStore } = await loadTextStore('pg');
    fullTextConfig.compatibility = false;
    const store = getFullTextStore();
    await store.write([
      { dataId: 'd', teamId: 't', datasetId: 'ds', collectionId: 'c', fullText: 'text' }
    ]);
    await store.deleteByDataId('d');
    await store.deleteByDatasetIds({ teamId: 't', datasetIds: ['ds'] });
    await store.deleteByCollectionIds({ teamId: 't', datasetIds: ['ds'], collectionIds: ['c'] });
    expect(mockJiebaSplit).not.toHaveBeenCalled();
    expect(mockBulkWrite).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();

    await store.search({
      teamId: 't',
      datasetIds: ['ds'],
      query: 'q',
      limit: 10,
      forbidCollectionIdList: []
    });
    expect(mockSearchSqlFullText).toHaveBeenCalledOnce();
    expect(mockAggregate).not.toHaveBeenCalled();
  });
});
