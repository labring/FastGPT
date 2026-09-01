import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FullTextSearchProps } from '@fastgpt/service/common/vectorDB/type';
import { assertFullTextCapability } from '@fastgpt/service/common/vectorDB/milvus/fullText';
import {
  FULL_TEXT_OVER_FETCH_FACTOR,
  FULL_TEXT_OVER_FETCH_MAX
} from '@fastgpt/service/common/vectorDB/milvus/fullTextConfig';

const mockSearch = vi.fn();
const mockDescribeCollection = vi.fn();
const mockFind = vi.hoisted(() => vi.fn());

// 覆盖 constants:stub MILVUS_ADDRESS,避免 getClient() 因未配置而 reject
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@fastgpt/service/common/vectorDB/constants')>();
  return {
    ...orig,
    MILVUS_ADDRESS: 'http://localhost:19530'
  };
});

// 单表无冗余 dataId:search 按向量 id 反查 MongoDatasetData.indexes[].dataId
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: { find: mockFind }
}));

// 注:计划原样使用 vi.fn(() => ({...})),vitest 4 中 new 一个带箭头函数实现的 mock 会抛
// "not a constructor";改用可构造 class 提供相同的 search/describeCollection 桩。
vi.mock('@zilliz/milvus2-sdk-node', () => ({
  FunctionType: { BM25: 'BM25' },
  MilvusClient: class {
    connectPromise: Promise<void> = Promise.resolve();
    search = mockSearch;
    describeCollection = mockDescribeCollection;
  }
}));

import { getMilvusFullTextStore } from '@fastgpt/service/common/vectorDB/milvus/fullText';

const props: FullTextSearchProps = {
  teamId: 'team1',
  datasetIds: ['ds1'],
  query: '全文检索',
  limit: 10,
  forbidCollectionIdList: ['col2'],
  filterCollectionIdList: ['col1', 'col2']
};

beforeEach(() => {
  mockSearch.mockReset();
  mockSearch.mockResolvedValue({ results: [] });
  mockFind.mockReset().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
});

describe('MilvusFullTextStore.search', () => {
  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (正常场景) mock client.search 返回向量 id 行, 期望: 按向量 id 反查 dataId 归一化为 FullTextSearchItem[], 反查未命中的回落自身
  it('TC-6.1 normalizes rows to dataId/collectionId/score', async () => {
    mockSearch.mockResolvedValue({
      results: [
        {
          score: 0.9,
          id: '1234567890123456',
          collectionId: 'col1'
        },
        { score: 0.8, id: '2234567890123456', collectionId: 'col1' }
      ]
    });
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: '68ad85a7463006c963799a05', indexes: [{ dataId: '1234567890123456' }] },
        { _id: '68ad85a7463006c963799a06', indexes: [{ dataId: '2234567890123456' }] }
      ])
    });
    const items = await getMilvusFullTextStore().search(props);
    // 反查查询带本批行 teamId/datasetId/collectionId(复合索引 {teamId,datasetId,collectionId,'indexes.dataId'} 完整前缀)以命中索引;
    // 投影返回完整 indexes(不用 $elemMatch:Mongo 投影 $elemMatch 只返回每个 doc 第一个匹配项,会丢多向量映射)
    expect(mockFind).toHaveBeenCalledWith(
      {
        teamId: 'team1',
        datasetId: { $in: ['ds1'] },
        collectionId: { $in: ['col1'] },
        'indexes.dataId': { $in: ['1234567890123456', '2234567890123456'] }
      },
      { _id: 1, indexes: 1 }
    );
    expect(items).toEqual([
      { dataId: '68ad85a7463006c963799a05', collectionId: 'col1', score: 0.9 },
      { dataId: '68ad85a7463006c963799a06', collectionId: 'col1', score: 0.8 }
    ]);
  });

  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (异常场景) 反查未命中(孤儿向量/数据已删), 期望: 跳过该向量, 不占用去重预算
  it('TC-6.1b skips orphan vectors without reverse lookup', async () => {
    mockSearch.mockResolvedValue({
      results: [
        { score: 0.9, id: '1234567890123456', collectionId: 'col1' },
        { score: 0.8, id: '2234567890123456', collectionId: 'col1' }
      ]
    });
    mockFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { _id: '68ad85a7463006c963799a05', indexes: [{ dataId: '1234567890123456' }] }
        ])
    });
    const items = await getMilvusFullTextStore().search(props);
    // 只返回能反查到 dataset_data 的结果,孤儿向量不回落自身 id 填充预算
    expect(items).toHaveLength(1);
    expect(items[0].dataId).toBe('68ad85a7463006c963799a05');
  });

  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (异常场景) filterCollectionIdList 与 forbidCollectionIdList 交集后过滤为空, 期望: 直接返回 [] 不查库
  it('TC-6.2 returns empty without querying when filter list collapses', async () => {
    const items = await getMilvusFullTextStore().search({
      ...props,
      forbidCollectionIdList: ['col1', 'col2'],
      filterCollectionIdList: ['col1']
    });
    expect(items).toEqual([]);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (边界值) query 长度超过 MILVUS_QUERY_MAX_LENGTH, 期望: search 传入截断后的文本
  it('TC-6.3 truncates long queries', async () => {
    await getMilvusFullTextStore().search({ ...props, query: 'x'.repeat(5000) });
    const arg = mockSearch.mock.calls[0][0];
    expect(arg.data[0].length).toBe(4000);
  });

  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (正常场景) 任意合法 props, 期望: client.search 收到 anns_field='sparse'、params.BM25、output_fields 含 id 与 collectionId
  it('TC-6.4 passes sparse anns_field and BM25 params', async () => {
    await getMilvusFullTextStore().search(props);
    const arg = mockSearch.mock.calls[0][0];
    expect(arg.anns_field).toBe('sparse');
    expect(arg.params).toEqual({ metric_type: 'BM25' });
    expect(arg.output_fields).toEqual(['id', 'collectionId']);
  });

  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (正常场景) 一条数据可产出多条向量(Q/A/摘要/自定义索引), 期望: over-fetch 后按 dataId 去重,
  // 同一条数据只返回一条, 结果不同 dataId 补足到 limit(不足时返回已有)
  it('TC-6.6 over-fetches and dedups vectors to distinct dataIds', async () => {
    mockSearch.mockResolvedValue({
      results: [
        { score: 0.9, id: '1', collectionId: 'c1' },
        { score: 0.8, id: '2', collectionId: 'c1' },
        { score: 0.7, id: '3', collectionId: 'c1' },
        { score: 0.6, id: '4', collectionId: 'c1' }
      ]
    });
    // 向量 1/2/3 同属 dataA, 向量 4 属 dataB
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'dataA', indexes: [{ dataId: '1' }, { dataId: '2' }, { dataId: '3' }] },
        { _id: 'dataB', indexes: [{ dataId: '4' }] }
      ])
    });
    const items = await getMilvusFullTextStore().search({ ...props, limit: 3 });
    // limit=3 但仅 2 条不同数据:去重后返回 2 条, 且保留各自最高分
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ dataId: 'dataA', collectionId: 'c1', score: 0.9 });
    expect(items[1]).toEqual({ dataId: 'dataB', collectionId: 'c1', score: 0.6 });
  });

  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (边界值) 首轮整批向量仍属同一条数据(去重后不足 limit), 期望: 第二轮一次取满 over-fetch 上限兜底(无 offset)
  it('TC-6.7 fetches full over-fetch budget when first batch under-fills', async () => {
    // limit=3,首轮取 limit*FACTOR 条向量(需 == fetchBatch 才触发第二轮);全部同属 dataA
    const fetchBatch = 3 * FULL_TEXT_OVER_FETCH_FACTOR;
    mockSearch
      .mockResolvedValueOnce({
        results: Array.from({ length: fetchBatch }, (_, i) => ({
          score: 0.9 - i * 0.01,
          id: String(i + 1),
          collectionId: 'c1'
        }))
      })
      .mockResolvedValueOnce({ results: [] });
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'dataA',
          indexes: Array.from({ length: fetchBatch }, (_, i) => ({ dataId: String(i + 1) }))
        }
      ])
    });
    const items = await getMilvusFullTextStore().search({ ...props, limit: 3 });
    // 首轮取满 fetchBatch(limit*FACTOR) 但去重仍不足 limit -> 第二轮一次取满 FULL_TEXT_OVER_FETCH_MAX 兜底,
    // 不依赖 Milvus search offset 分页(各版本对 offset 支持不一致);第二轮空结果停止
    expect(mockSearch).toHaveBeenCalledTimes(2);
    const secondCall = mockSearch.mock.calls[1][0];
    expect(secondCall.limit).toBe(FULL_TEXT_OVER_FETCH_MAX);
    expect(secondCall.offset).toBeUndefined();
    expect(items).toHaveLength(1);
    expect(items[0].dataId).toBe('dataA');
  });

  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (正常场景) 首轮全部向量同属一条数据, 期望: 第二轮取满上限后按 dataId 去重凑足 limit 条不同数据
  it('TC-6.9 second over-fetch batch tops up distinct dataIds to limit', async () => {
    const fetchBatch = 3 * FULL_TEXT_OVER_FETCH_FACTOR;
    mockSearch
      .mockResolvedValueOnce({
        results: Array.from({ length: fetchBatch }, (_, i) => ({
          score: 0.9 - i * 0.01,
          id: String(i + 1),
          collectionId: 'c1'
        }))
      })
      .mockResolvedValueOnce({
        results: [
          { score: 0.8, id: '101', collectionId: 'c1' },
          { score: 0.7, id: '102', collectionId: 'c1' }
        ]
      });
    // 首轮向量 1..limit*FACTOR 同属 dataA;101/102 分属 dataB/dataC。mockFind 忽略查询参数返回全量文档,
    // processBatch 内部按各自批次的 vectorIdSet 过滤,首轮只映射 dataA,第二轮映射 dataB/dataC。
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'dataA',
          indexes: Array.from({ length: fetchBatch }, (_, i) => ({ dataId: String(i + 1) }))
        },
        { _id: 'dataB', indexes: [{ dataId: '101' }] },
        { _id: 'dataC', indexes: [{ dataId: '102' }] }
      ])
    });
    const items = await getMilvusFullTextStore().search({ ...props, limit: 3 });
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(items.map((i) => i.dataId).sort()).toEqual(['dataA', 'dataB', 'dataC']);
  });

  // 被测函数: MilvusFullTextStore.search  等级: 3-High
  // (边界值) CJK 每字符 3 字节, 期望: 查询按 UTF-8 字节截断, 不超字节上限
  it('TC-6.3b truncates multi-byte CJK query by bytes', async () => {
    await getMilvusFullTextStore().search({ ...props, query: '中'.repeat(2000) });
    const arg = mockSearch.mock.calls[0][0];
    expect(Buffer.byteLength(arg.data[0], 'utf8')).toBeLessThanOrEqual(4000);
    expect(arg.data[0]).toBe('中'.repeat(1333)); // 1333*3 = 3999 <= 4000
  });
});

describe('assertFullTextCapability', () => {
  // 被测函数: assertFullTextCapability  等级: 3-High
  // (异常场景) describeCollection 返回缺 sparse/text 字段的 schema, 期望: 抛 /full-text unsupported/
  it('TC-6.5 throws when sparse/text missing', async () => {
    mockDescribeCollection.mockResolvedValue({ schema: { fields: [{ name: 'id' }] } });
    await expect(
      assertFullTextCapability({ describeCollection: mockDescribeCollection } as never)
    ).rejects.toThrow(/full-text unsupported/);
  });

  // 被测函数: assertFullTextCapability  等级: 3-High
  // 合法能力形状:text 带 analyzer + sparse 字段 + BM25 function + sparse 索引 metric=BM25
  const validClient = () => ({
    describeCollection: vi.fn().mockResolvedValue({
      schema: {
        fields: [
          { name: 'id' },
          {
            name: 'text',
            type_params: [{ key: 'analyzer_params', value: '{"tokenizer":"standard"}' }]
          },
          { name: 'sparse' }
        ],
        functions: [
          {
            name: 'text_bm25_emb',
            type: 'BM25',
            input_field_names: ['text'],
            output_field_names: ['sparse']
          }
        ]
      }
    }),
    describeIndex: vi.fn().mockResolvedValue({
      index_descriptions: [
        { field_name: 'sparse', params: [{ key: 'metric_type', value: 'BM25' }] }
      ]
    })
  });

  // (正常场景) 三类配置齐全, 期望: 通过,且 describeIndex 被核验
  it('TC-6.5e passes when function, analyzer and BM25 index present', async () => {
    const client = validClient();
    await expect(assertFullTextCapability(client as never)).resolves.toBeUndefined();
    expect(client.describeIndex).toHaveBeenCalledWith(
      expect.objectContaining({ index_name: 'sparse_BM25' })
    );
  });

  // (异常场景) text/sparse 字段都在但无 BM25 function(旧集合/手工建), 期望: 抛 /full-text unsupported/
  it('TC-6.5b throws when BM25 function missing', async () => {
    const client = validClient();
    client.describeCollection.mockResolvedValue({
      schema: {
        fields: [
          { name: 'id' },
          { name: 'text', type_params: [{ key: 'analyzer_params', value: '{}' }] },
          { name: 'sparse' }
        ],
        functions: []
      }
    });
    await expect(assertFullTextCapability(client as never)).rejects.toThrow(
      /full-text unsupported/
    );
    expect(client.describeIndex).not.toHaveBeenCalled();
  });

  // (异常场景) text 字段未配置 analyzer, 期望: 抛 /full-text unsupported/
  it('TC-6.5f throws when text has no analyzer', async () => {
    const client = validClient();
    client.describeCollection.mockResolvedValue({
      schema: {
        fields: [{ name: 'id' }, { name: 'text' }, { name: 'sparse' }],
        functions: [
          {
            name: 'text_bm25_emb',
            type: 'BM25',
            input_field_names: ['text'],
            output_field_names: ['sparse']
          }
        ]
      }
    });
    await expect(assertFullTextCapability(client as never)).rejects.toThrow(
      /full-text unsupported/
    );
  });

  // (异常场景) sparse 索引 metric 非 BM25, 期望: 抛 /metric is not BM25/
  it('TC-6.5c throws when sparse index metric is not BM25', async () => {
    const client = validClient();
    client.describeIndex.mockResolvedValue({
      index_descriptions: [
        { field_name: 'sparse', params: [{ key: 'metric_type', value: 'IVF_FLAT' }] }
      ]
    });
    await expect(assertFullTextCapability(client as never)).rejects.toThrow(/metric is not BM25/);
  });

  // (异常场景) sparse 索引缺失, 期望: 抛 /sparse index missing or metric is not BM25/
  it('TC-6.5d throws when sparse index missing', async () => {
    const client = validClient();
    client.describeIndex.mockResolvedValue({ index_descriptions: [] });
    await expect(assertFullTextCapability(client as never)).rejects.toThrow(
      /sparse index missing or metric is not BM25/
    );
  });
});
