import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * provider 恒为 milvus:init 只创建 modeldata_v2,版本门禁 + 能力探测为硬要求。
 * 不再有 engine=mongo 分支。
 */
const mockCreateCollection = vi.fn();
const mockHasCollection = vi.fn();
const mockGetLoadState = vi.fn();
const mockLoadCollectionSync = vi.fn();
const mockDescribeCollection = vi.fn();
const mockDescribeIndex = vi.fn();
const mockGetVersion = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockSearch = vi.fn();
const mockQuery = vi.fn();

/**
 * 注:计划原样使用 vi.fn(() => ({...})),vitest 4 中 new 一个带箭头函数实现的 mock 会抛
 * "not a constructor";改用可构造 class 提供相同的 client 桩与常量。
 * 各 mock 方法在 beforeEach 重置,实例字段 listDatabases 始终返回 fastgpt db,跳过 createDatabase。
 */
vi.mock('@zilliz/milvus2-sdk-node', () => ({
  DataType: { Int64: 5, FloatVector: 101, VarChar: 21, SparseFloatVector: 104 },
  LoadState: { LoadStateNotExist: 'LoadStateNotExist', LoadStateNotLoad: 'LoadStateNotLoad' },
  FunctionType: { BM25: 'BM25' },
  MilvusClient: class {
    connectPromise = Promise.resolve();
    listDatabases = vi.fn(async () => ({ db_names: ['fastgpt'] }));
    useDatabase = vi.fn();
    createDatabase = vi.fn();
    hasCollection = mockHasCollection;
    createCollection = mockCreateCollection;
    getLoadState = mockGetLoadState;
    loadCollectionSync = mockLoadCollectionSync;
    describeCollection = mockDescribeCollection;
    describeIndex = mockDescribeIndex;
    getVersion = mockGetVersion;
    insert = mockInsert;
    delete = mockDelete;
    search = mockSearch;
    query = mockQuery;
  }
}));

// 覆盖 constants:注入 MILVUS_ADDRESS(避免 getClient reject);provider 恒为 milvus
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@fastgpt/service/common/vectorDB/constants')>();
  return {
    ...orig,
    MILVUS_ADDRESS: 'http://localhost:19530',
    getVectorType: () => 'milvus' as const,
    getDatasetVectorTableName: () => 'modeldata_v2'
  };
});

// 全局 test/mocks/common/vector.ts 会 mock MilvusCtrl,此处 unmock 拿真实实现(同 index.integration.test.ts)
vi.unmock('@fastgpt/service/common/vectorDB/milvus');

import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus/index';

beforeEach(() => {
  vi.resetModules();
  mockCreateCollection.mockReset();
  mockHasCollection.mockReset().mockResolvedValue({ value: false });
  mockGetLoadState.mockReset().mockResolvedValue({ state: 'LoadStateNotLoad' });
  mockLoadCollectionSync.mockReset();
  mockDescribeCollection.mockReset().mockResolvedValue({
    schema: {
      fields: [{ name: 'id' }, { name: 'text', analyzer_params: '{}' }, { name: 'sparse' }]
    },
    functions: [
      {
        name: 'text_bm25_emb',
        type: 'BM25',
        input_field_names: ['text'],
        output_field_names: ['sparse']
      }
    ]
  });
  mockDescribeIndex.mockReset().mockResolvedValue({
    index_descriptions: [{ field_name: 'sparse', params: [{ key: 'metric_type', value: 'BM25' }] }]
  });
  mockGetVersion.mockReset().mockResolvedValue({ version: 'v2.5.16' });
  mockInsert.mockReset().mockResolvedValue({ IDs: { str_id: { data: ['1'] } } });
  mockDelete.mockReset();
  mockSearch.mockReset().mockResolvedValue({ results: [] });
  mockQuery.mockReset().mockResolvedValue({ data: [] });
});

describe('MilvusCtrl', () => {
  // 被测函数: MilvusCtrl.init  等级: 3-High
  // (正常场景) hasCollection=false + 版本通过, 期望: 只创建 modeldata_v2(1 次), 含 functions/text/sparse
  it('TC-8.1 init creates only modeldata_v2 with BM25 function', async () => {
    const ctrl = new MilvusCtrl();
    await ctrl.init();
    expect(mockCreateCollection).toHaveBeenCalledTimes(1);
    const v2 = mockCreateCollection.mock.calls[0][0];
    expect(v2.collection_name).toBe('modeldata_v2');
    expect(v2.functions).toHaveLength(1);
    expect(v2.fields.map((f: any) => f.name)).toContain('sparse');
  });

  // 被测函数: MilvusCtrl.init  等级: 3-High
  // (异常场景) describeCollection 缺 sparse/text 字段, 期望: 能力探测抛 /full-text unsupported/
  it('TC-8.2 init probes capability and throws on missing sparse', async () => {
    mockDescribeCollection.mockResolvedValue({
      schema: { fields: [{ name: 'id' }] }
    });
    const ctrl = new MilvusCtrl();
    await expect(ctrl.init()).rejects.toThrow(/full-text unsupported/);
  });

  // 被测函数: MilvusCtrl.init  等级: 3-High
  // (异常场景) 版本低于 2.5.16, 期望: init 抛版本错误,且未创建任何集合(版本门禁在 ensureCollection 之前)
  it('TC-8.11 init rejects Milvus version below 2.5.16', async () => {
    mockGetVersion.mockResolvedValue({ version: 'v2.4.3' });
    const ctrl = new MilvusCtrl();
    await expect(ctrl.init()).rejects.toThrow(/Milvus version v2\.4\.3 is not supported/);
    expect(mockCreateCollection).not.toHaveBeenCalled();
  });

  // 被测函数: MilvusCtrl.init  等级: 3-High
  // (异常场景) 版本 2.5.0 满足 major/minor 但低于 2.5.16, 期望: 补丁级门禁拒绝(不能只比 major/minor)
  it('TC-8.11b init rejects Milvus v2.5.0 below the 2.5.16 patch gate', async () => {
    mockGetVersion.mockResolvedValue({ version: 'v2.5.0' });
    const ctrl = new MilvusCtrl();
    await expect(ctrl.init()).rejects.toThrow(/Milvus version v2\.5\.0 is not supported/);
    expect(mockCreateCollection).not.toHaveBeenCalled();
  });

  // 被测函数: MilvusCtrl.init  等级: 3-High
  // (异常场景) 版本无法解析, 期望: init 抛错终止启动
  it('TC-8.12 init rejects unparseable Milvus version', async () => {
    mockGetVersion.mockResolvedValue({ version: 'garbage' });
    const ctrl = new MilvusCtrl();
    await expect(ctrl.init()).rejects.toThrow(/Unable to parse Milvus version/);
    expect(mockCreateCollection).not.toHaveBeenCalled();
  });

  // 被测函数: MilvusCtrl.init  等级: 3-High
  // (异常场景) getVersion 请求失败, 期望: init 抛错终止启动
  it('TC-8.13 init rejects when getVersion fails', async () => {
    mockGetVersion.mockRejectedValue(new Error('connection refused'));
    const ctrl = new MilvusCtrl();
    await expect(ctrl.init()).rejects.toThrow(/Failed to get Milvus version/);
  });

  // 被测函数: MilvusCtrl.init  等级: 3-High
  // (异常场景) modeldata_v2 createCollection 抛错, 期望: init 抛错(创建/加载为硬要求,无 best-effort)
  it('TC-8.9 init hard-fails on modeldata_v2 create failure', async () => {
    mockCreateCollection.mockRejectedValueOnce(new Error('v2 create failed'));
    const ctrl = new MilvusCtrl();
    await expect(ctrl.init()).rejects.toThrow('v2 create failed');
  });

  // 被测函数: MilvusCtrl.insert  等级: 3-High
  // (正常场景) 带 texts, 期望: client.insert 收到 modeldata_v2、text 字段、id 为 Number(Int64)
  it('TC-8.3 insert carries text into modeldata_v2', async () => {
    const ctrl = new MilvusCtrl();
    await ctrl.insert({
      teamId: 't',
      datasetId: 'd',
      collectionId: 'c',
      vectors: [[0.1], [0.2]],
      texts: ['hello', 'world']
    });
    const arg = mockInsert.mock.calls[0][0];
    expect(arg.collection_name).toBe('modeldata_v2');
    expect(arg.data[0]).toMatchObject({
      text: 'hello'
    });
    expect(typeof arg.data[0].id).toBe('number');
  });

  // 被测函数: MilvusCtrl.insert  等级: 3-High
  // (异常场景) texts 与 vectors 长度不一致, 期望: 拒绝(避免向量/文本错位)
  it('TC-8.14 insert rejects texts/vectors length mismatch', async () => {
    const ctrl = new MilvusCtrl();
    await expect(
      ctrl.insert({
        teamId: 't',
        datasetId: 'd',
        collectionId: 'c',
        vectors: [[0.1], [0.2]],
        texts: ['hello']
      })
    ).rejects.toThrow(/texts length \(1\) does not match vectors length \(2\)/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // 被测函数: MilvusCtrl.insert  等级: 3-High
  // (异常场景) texts 为 undefined, 期望: 拒绝(Milvus 单表方案的 text 是 BM25 输入,不允许缺省)
  it('TC-8.15 insert rejects missing texts', async () => {
    const ctrl = new MilvusCtrl();
    await expect(
      ctrl.insert({
        teamId: 't',
        datasetId: 'd',
        collectionId: 'c',
        vectors: [[0.1]]
      })
    ).rejects.toThrow(/Milvus insert requires texts/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // 被测函数: MilvusCtrl.insert  等级: 3-High
  // (异常场景) 中文长文本(字节数超 VarChar 上限), 期望: text 按 UTF-8 字节截断后写入,
  // 字节数 ≤ 65535(不能用 JS 字符长度,中文 3 字节/字符)
  it('TC-8.10 insert truncates over-long multi-byte text to VarChar byte limit', async () => {
    const ctrl = new MilvusCtrl();
    await ctrl.insert({
      teamId: 't',
      datasetId: 'd',
      collectionId: 'c',
      vectors: [[0.1]],
      texts: ['中'.repeat(30000)] // 90000 字节 > 65535
    });
    const arg = mockInsert.mock.calls[0][0];
    expect(Buffer.byteLength(arg.data[0].text, 'utf8')).toBeLessThanOrEqual(65535);
    expect(arg.data[0].text).toBe('中'.repeat(21845)); // 21845*3 = 65535,完整中文字符
  });

  // 被测函数: MilvusCtrl.delete  等级: 3-High
  // (正常场景) idList, 期望: filter 含 (id in [1,2])(Int64 不加引号)
  it('TC-8.4 delete keeps numeric ids', async () => {
    const ctrl = new MilvusCtrl();
    await ctrl.delete({ teamId: 't', idList: ['1', '2'] });
    const arg = mockDelete.mock.calls[0][0];
    expect(arg.filter).toContain('(id in [1,2])');
  });

  // 被测函数: MilvusCtrl.delete  等级: 3-High
  // (正常场景) 单 id, 期望: filter 含 (id==1)(数字写法不加引号), 目标集合为 modeldata_v2
  it('TC-8.5 delete keeps numeric ids and targets modeldata_v2', async () => {
    const ctrl = new MilvusCtrl();
    await ctrl.delete({ teamId: 't', id: '1' });
    const arg = mockDelete.mock.calls[0][0];
    expect(arg.collection_name).toBe('modeldata_v2');
    expect(arg.filter).toContain('(id==1)');
  });

  // 被测函数: MilvusCtrl.embRecall  等级: 3-High
  // (正常场景) 期望: SDK 2.6 的 client.search 使用 data: [vector](非 vector 字段)
  it('TC-8.6 embRecall uses SDK 2.6 data field', async () => {
    const ctrl = new MilvusCtrl();
    await ctrl.embRecall({
      teamId: 't',
      datasetIds: ['d'],
      vector: [0.1, 0.2],
      limit: 10,
      forbidCollectionIdList: []
    });
    const arg = mockSearch.mock.calls[0][0];
    expect(arg.data).toEqual([[0.1, 0.2]]);
    // 主键不自动回填:output_fields 必须含 id,否则结果行解析不出 id
    expect(arg.output_fields).toEqual(['id', 'collectionId']);
  });

  // 被测函数: MilvusCtrl.getVectorDataByTime  等级: 3-High
  // (正常场景) 期望: client.query 的 output_fields 不含 dataId, 返回行不含 dataId, 目标集合 modeldata_v2
  it('TC-8.7 getVectorDataByTime reads v2 rows without dataId', async () => {
    mockQuery.mockResolvedValue({
      data: [{ id: '1', teamId: 't', datasetId: 'd' }]
    });
    const ctrl = new MilvusCtrl();
    const rows = await ctrl.getVectorDataByTime(new Date(0), new Date());
    expect(rows[0].id).toBe('1');
    expect('dataId' in rows[0]).toBe(false);
    const arg = mockQuery.mock.calls[0][0];
    expect(arg.collection_name).toBe('modeldata_v2');
    expect(arg.output_fields).not.toContain('dataId');
  });
});
