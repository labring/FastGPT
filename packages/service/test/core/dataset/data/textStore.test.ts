import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockSearchSqlFullText = vi.hoisted(() => vi.fn());
const mockMilvusSearch = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/fullText/sql/store', () => ({
  searchSqlFullText: mockSearchSqlFullText
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
  mockSearchSqlFullText
    .mockReset()
    .mockResolvedValue([{ dataId: '68ad85a7463006c963799a05', collectionId: 'col1', score: 2.5 }]);
  mockMilvusSearch.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  process.env.TEXT_STORE_VECTOR_TYPE = originalVectorType;
});

describe('textStore', () => {
  it('TC-7.1 SqlFullTextStore exposes read-only search without legacy Mongo write/delete hooks', async () => {
    const { SqlFullTextStore } = await loadTextStore('pg');
    const sqlStore = new SqlFullTextStore();
    expect(typeof sqlStore.search).toBe('function');
    expect('write' in sqlStore).toBe(false);
    expect('deleteByDataId' in sqlStore).toBe(false);
  });

  it('TC-7.2 dispatches to milvus store when provider=milvus', async () => {
    const { getFullTextStore } = await loadTextStore('milvus');
    expect((getFullTextStore() as any).isMilvus).toBe(true);
  });

  it.each(['pg', 'oceanbase', 'seekdb', 'opengauss'] as const)(
    'TC-7.3 dispatches to SqlFullTextStore and delegates search when provider=%s',
    async (provider) => {
      const { getFullTextStore, SqlFullTextStore } = await loadTextStore(provider);
      const store = getFullTextStore();
      expect(store).toBeInstanceOf(SqlFullTextStore);
      expect(getFullTextStore()).toBe(store);

      const props = {
        teamId: '68ad85a7463006c963799a05',
        datasetIds: ['68ad85a7463006c963799a05'],
        query: 'q',
        limit: 10,
        forbidCollectionIdList: []
      };
      const items = await store.search(props);
      expect(mockSearchSqlFullText).toHaveBeenCalledExactlyOnceWith(props);
      expect(items).toEqual([
        {
          dataId: '68ad85a7463006c963799a05',
          collectionId: 'col1',
          score: 2.5
        }
      ]);
    }
  );
});
