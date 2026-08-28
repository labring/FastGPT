import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// 被测对象: runFullTextMigration(migration.ts)  等级: 3-High
// provider 由 MIGRATION_VECTOR_TYPE 控制(getVectorType mock 读取),默认 milvus。
// 迁移为旧表 modeldata 纯拷贝:modeldata 存在且有数据 → 拷贝到 modeldata_v2;
// modeldata 缺失/为空(Milvus 数据已不在)→ 报错引导走 rebuildEmbedding。
// mock 注入 milvus client + mongo schema,覆盖公共语义(续跑/自愈/取消/并发/计数校验等)。

const mockClient = {
  query: vi.fn(),
  queryIterator: vi.fn(),
  upsert: vi.fn(),
  dropCollection: vi.fn(),
  releaseCollection: vi.fn(),
  loadCollectionSync: vi.fn(),
  describeCollection: vi.fn(),
  describeIndex: vi.fn(),
  hasCollection: vi.fn(),
  getLoadState: vi.fn(),
  flush: vi.fn(),
  getVersion: vi.fn()
};

const mockFind = vi.hoisted(() => vi.fn());
const mockDataTextDeleteMany = vi.hoisted(() => vi.fn());
const mockLogFindOne = vi.hoisted(() => vi.fn());
const mockLogCreate = vi.hoisted(() => vi.fn());
const mockLogUpdateOne = vi.hoisted(() => vi.fn());
const mockFailedBulkWrite = vi.hoisted(() => vi.fn());
const mockFailedFind = vi.hoisted(() => vi.fn());
const mockFailedDeleteMany = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: { find: mockFind }
}));
vi.mock('@fastgpt/service/core/dataset/data/dataTextSchema', () => ({
  MongoDatasetDataText: { deleteMany: mockDataTextDeleteMany }
}));
vi.mock('@fastgpt/service/core/dataset/fullText/schema', () => ({
  MongoFullTextMigrationLog: {
    findOne: mockLogFindOne,
    create: mockLogCreate,
    updateOne: mockLogUpdateOne
  },
  MongoFullTextMigrationFailed: {
    bulkWrite: mockFailedBulkWrite,
    find: mockFailedFind,
    deleteMany: mockFailedDeleteMany
  }
}));
// 覆盖 test/mocks/common/vector.ts 的全局 constants mock,用真实模块 + MILVUS_ADDRESS stub;
// getVectorType 由 MIGRATION_VECTOR_TYPE 控制(运行时切换 milvus/pg)。
// importOriginal 展开的 orig 里 getDatasetVectorTableName 仍引用原版 getVectorType(与 mock 覆盖解耦),
// 需一并按 provider 覆盖,否则能力探测会指向旧表 modeldata。
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@fastgpt/service/common/vectorDB/constants')>();
  return {
    ...orig,
    MILVUS_ADDRESS: 'http://localhost:19530',
    getVectorType: () => (process.env.MIGRATION_VECTOR_TYPE === 'milvus' ? 'milvus' : 'pg'),
    getDatasetVectorTableName: () =>
      process.env.MIGRATION_VECTOR_TYPE === 'milvus' ? 'modeldata_v2' : 'modeldata'
  };
});
// retryFn 重试 3 次(每次 delay 500ms)会使失败路径慢且脆弱;此处 mock 成直通,只保留调用(不重试)。
vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@fastgpt/global/common/system/utils')>();
  return {
    ...orig,
    retryFn: <T>(fn: () => Promise<T>): Promise<T> => fn()
  };
});

import { runFullTextMigration } from '@fastgpt/service/core/dataset/fullText/migration';

const originalVectorType = process.env.MIGRATION_VECTOR_TYPE;
const setVectorType = (t: 'milvus' | 'pg') => {
  process.env.MIGRATION_VECTOR_TYPE = t;
};

// 源读:query 负责 count(*) 与自愈 id in [...] 回读,queryIterator 负责全量遍历
const mockSourceQuery = (rows: any[], count?: number) => {
  mockClient.query.mockImplementation(({ output_fields }: { output_fields: string[] }) => {
    if (output_fields.includes('count(*)')) {
      return Promise.resolve({ data: [{ 'count(*)': count ?? rows.length }] });
    }
    return Promise.resolve({ data: rows });
  });
};

// queryIterator 返回 SDK 异步迭代器(按主键递增分页);mockIter 构造按批 yield 的 async iterable
const mockIter = (...batches: any[][]) => ({
  [Symbol.asyncIterator]: async function* () {
    for (const b of batches) yield b;
  }
});

const mockSourceIterator = (...batches: any[][]) => {
  mockClient.queryIterator.mockResolvedValue(mockIter(...batches));
};

beforeEach(() => {
  setVectorType('milvus');
  mockClient.query.mockReset();
  mockClient.queryIterator.mockReset();
  mockClient.upsert.mockReset().mockResolvedValue({ status: { error_code: 'Success' } });
  mockClient.dropCollection.mockReset().mockResolvedValue({});
  mockClient.releaseCollection.mockReset().mockResolvedValue({});
  mockClient.loadCollectionSync.mockReset();
  mockClient.describeCollection.mockReset().mockResolvedValue({
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
  mockClient.describeIndex.mockReset().mockResolvedValue({
    index_descriptions: [{ field_name: 'sparse', params: [{ key: 'metric_type', value: 'BM25' }] }]
  });
  mockClient.hasCollection.mockReset().mockResolvedValue({ value: true });
  mockClient.getLoadState.mockReset().mockResolvedValue({ state: 'LoadStateLoaded' });
  mockClient.flush.mockReset().mockResolvedValue({});
  mockClient.getVersion.mockReset().mockResolvedValue({ version: 'v2.5.16' });
  mockFind.mockReset().mockResolvedValue([]);
  mockDataTextDeleteMany.mockReset().mockResolvedValue({ deletedCount: 0 });
  mockLogFindOne.mockReset().mockResolvedValue(null);
  mockLogCreate.mockReset().mockResolvedValue({});
  mockLogUpdateOne.mockReset().mockResolvedValue({});
  mockFailedBulkWrite.mockReset().mockResolvedValue({});
  // 自愈代码调用 find({migrationId}).lean(),mock 需返回 query 形状(find 链式 lean)
  mockFailedFind.mockReset().mockImplementation(() => ({
    lean: vi.fn().mockResolvedValue([])
  }));
  mockFailedDeleteMany.mockReset().mockResolvedValue({ deletedCount: 0 });
});

afterEach(() => {
  process.env.MIGRATION_VECTOR_TYPE = originalVectorType;
});

describe('runFullTextMigration', () => {
  // 源行归属字段在 dataset_data 中是 ObjectId,fetchDataDocs 经 ObjectId.isValid 过滤后才会
  // 作为 $in 条件;测试夹具必须用合法 24 位 hex,否则行会被当作非法归属跳过。
  const TEAM_ID = '64b6d2f8a6b3c1d4e5f6a7b1';
  const DATASET_ID = '64b6d2f8a6b3c1d4e5f6a7b2';
  const COLLECTION_ID = '64b6d2f8a6b3c1d4e5f6a7b3';
  const DATA_ID = '68ad85a7463006c963799a05';
  const makeSourceRow = (id: string) => ({
    id,
    vector: [0.1],
    teamId: TEAM_ID,
    datasetId: DATASET_ID,
    collectionId: COLLECTION_ID,
    createTime: 1
  });
  const makeDataDoc = (indexes: any[]) => ({
    _id: DATA_ID,
    teamId: TEAM_ID,
    datasetId: DATASET_ID,
    collectionId: COLLECTION_ID,
    indexes
  });

  // ==================== 引擎守卫 ====================
  it('TC-15.1 rejects non-milvus vector store', async () => {
    setVectorType('pg');
    await expect(
      runFullTextMigration({ batchSize: 500, client: mockClient } as never)
    ).rejects.toThrow(/milvus/i);
  });

  // ==================== 旧表缺失/为空 → 引导 rebuildEmbedding ====================
  it('TC-15.20 rejects when old modeldata is missing (Milvus data gone) and hints rebuildEmbedding', async () => {
    mockClient.hasCollection.mockResolvedValue({ value: false });
    await expect(
      runFullTextMigration({ batchSize: 500, client: mockClient } as never)
    ).rejects.toThrow(/rebuildEmbedding/);
    expect(mockClient.queryIterator).not.toHaveBeenCalled();
    expect(mockLogCreate).not.toHaveBeenCalled();
  });

  it('TC-15.21 rejects when old modeldata is empty and hints rebuildEmbedding', async () => {
    mockClient.hasCollection.mockResolvedValue({ value: true });
    mockSourceQuery([], 0);
    await expect(
      runFullTextMigration({ batchSize: 500, client: mockClient } as never)
    ).rejects.toThrow(/rebuildEmbedding/);
  });

  // ==================== 正常迁移(纯拷贝) ====================
  it('TC-15.2 resumes from log cursor without creating new log and reaches done', async () => {
    // 断点续跑:findOne 返回 cancelled 日志,从 log.cursor='5' 续跑,不新建日志;
    // 续跑必须续起日志计数,否则最终 processed+skipped 与 sourceCount 对不上
    mockLogFindOne.mockResolvedValue({
      migrationId: 'm1',
      newEngine: 'milvus',
      status: 'cancelled',
      cursor: '5',
      processedCount: 5,
      skippedCount: 0,
      failedCount: 0
    });
    const remaining = [makeSourceRow('6'), makeSourceRow('7'), makeSourceRow('8')];
    mockSourceQuery(remaining, 8);
    mockSourceIterator(remaining);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '6' }, { dataId: '7' }, { dataId: '8' }])]);
    const res = await runFullTextMigration({
      batchSize: 500,
      resumeMigrationId: 'm1',
      client: mockClient
    } as never);
    expect(mockLogCreate).not.toHaveBeenCalled();
    expect(mockClient.queryIterator).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.stringContaining('(id > 5)') })
    );
    expect(res.status).toBe('done');
    expect(res.sourceCount).toBe(8);
    expect(res.processedCount).toBe(8);
  });

  it('TC-15.3 upserts target rows idempotently by PK', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hello' }])]);
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(mockFind).toHaveBeenCalledWith(
      {
        teamId: { $in: [TEAM_ID] },
        datasetId: { $in: [DATASET_ID] },
        collectionId: { $in: [COLLECTION_ID] },
        'indexes.dataId': { $in: ['1'] }
      },
      { _id: 1, teamId: 1, datasetId: 1, collectionId: 1, indexes: 1 }
    );
    expect(mockClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        collection_name: 'modeldata_v2',
        data: expect.arrayContaining([expect.objectContaining({ id: 1, text: 'hello' })])
      })
    );
    expect(res.processedCount).toBe(1);
    expect(res.status).toBe('done');
  });

  it('TC-15.4 skips orphan rows without matching dataset_data', async () => {
    mockSourceQuery([makeSourceRow('orphan-1')]);
    mockSourceIterator([makeSourceRow('orphan-1')]);
    mockFind.mockResolvedValue([]);
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(mockClient.upsert).not.toHaveBeenCalled();
    expect(res.skippedCount).toBe(1);
    expect(res.status).toBe('done');
  });

  it('TC-15.16 imageEmbedding keeps vector but writes empty BM25 text', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([
      makeDataDoc([{ dataId: '1', text: 'https://img.example.com/a.png', type: 'imageEmbedding' }])
    ]);
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    const upsertData = mockClient.upsert.mock.calls[0][0].data[0];
    expect(upsertData.id).toBe(1);
    expect(upsertData.text).toBe('');
    expect(res.processedCount).toBe(1);
    expect(res.status).toBe('done');
  });

  it('TC-15.8 truncates multi-byte text to VarChar byte limit on upsert', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: '中'.repeat(30000) }])]);
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    const upsertData = mockClient.upsert.mock.calls[0][0].data[0];
    expect(Buffer.byteLength(upsertData.text, 'utf8')).toBeLessThanOrEqual(65535);
    expect(upsertData.text).toBe('中'.repeat(21845)); // 21845*3 = 65535,完整中文字符
    expect(res.processedCount).toBe(1);
  });

  it('TC-15.9 skips source rows with invalid ownership instead of aborting', async () => {
    const validRow = makeSourceRow('1');
    const emptyOwnerRow = {
      id: '2',
      vector: [0.1],
      teamId: '',
      datasetId: '',
      collectionId: '',
      createTime: 1
    };
    mockSourceQuery([validRow, emptyOwnerRow], 2);
    mockSourceIterator([validRow, emptyOwnerRow]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hi' }])]);
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: { $in: [TEAM_ID] } }),
      expect.any(Object)
    );
    expect(res.processedCount).toBe(1);
    expect(res.skippedCount).toBe(1);
    expect(res.status).toBe('done');
  });

  it('TC-15.5 drops modeldata and clears dataset_data_texts when removeOld', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hello' }])]);
    const res = await runFullTextMigration({
      batchSize: 500,
      removeOld: true,
      client: mockClient
    } as never);
    expect(mockClient.releaseCollection).toHaveBeenCalledWith({ collection_name: 'modeldata' });
    expect(mockClient.dropCollection).toHaveBeenCalledWith({ collection_name: 'modeldata' });
    expect(mockDataTextDeleteMany).toHaveBeenCalledWith({});
    expect(res.status).toBe('done');
  });

  it('TC-15.6 releases modeldata after success without removeOld', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hello' }])]);
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(mockClient.releaseCollection).toHaveBeenCalledWith({ collection_name: 'modeldata' });
    expect(mockClient.dropCollection).not.toHaveBeenCalled();
    expect(mockDataTextDeleteMany).not.toHaveBeenCalled();
    expect(res.status).toBe('done');
  });

  it('TC-15.6a never releases modeldata_v2', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hello' }])]);
    await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(mockClient.releaseCollection).toHaveBeenCalledWith({ collection_name: 'modeldata' });
    expect(mockClient.releaseCollection).not.toHaveBeenCalledWith({
      collection_name: 'modeldata_v2'
    });
    // 集合已加载:ensureCollectionLoaded 不触发 loadCollectionSync
    expect(mockClient.loadCollectionSync).not.toHaveBeenCalled();
  });

  it('TC-15.17 fails when actual target count is below processed', async () => {
    // 完成条件实际校验目标表数量:modeldata 源 1 行但 modeldata_v2 实际 0 行 → failed(不能只信 processed)
    let countCalls = 0;
    mockClient.query.mockImplementation(({ output_fields }: { output_fields: string[] }) => {
      if (output_fields.includes('count(*)')) {
        countCalls++;
        return Promise.resolve({ data: [{ 'count(*)': countCalls === 1 ? 1 : 0 }] });
      }
      return Promise.resolve({ data: [] });
    });
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hello' }])]);
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(res.status).toBe('failed');
    expect(res.targetCount).toBe(0);
    expect(res.error).toMatch(/target\(0\) < processed\(1\)/);
  });

  it('TC-15.7 dryRun returns stats without writing', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    const res = await runFullTextMigration({
      batchSize: 500,
      dryRun: true,
      client: mockClient
    } as never);
    expect(res.status).toBe('dry-run');
    expect(mockClient.upsert).not.toHaveBeenCalled();
    expect(mockClient.queryIterator).not.toHaveBeenCalled();
    expect(mockLogCreate).not.toHaveBeenCalled();
    expect(res.sourceCount).toBe(1);
  });

  it('TC-15.10 self-heals failed rows from failed table at the end', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hello' }])]);
    // 主循环 upsert 失败一次(落失败表),自愈重试成功
    mockClient.upsert
      .mockRejectedValueOnce(new Error('temporary milvus failure'))
      .mockResolvedValue({ status: { error_code: 'Success' } });
    mockFailedFind.mockImplementation(() => ({
      lean: vi
        .fn()
        .mockResolvedValue([{ migrationId: 'm1', dataId: '1', error: 'temporary milvus failure' }])
    }));
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(mockFailedBulkWrite).toHaveBeenCalled();
    expect(mockFailedDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ dataId: { $in: ['1'] } })
    );
    expect(res.status).toBe('done');
    expect(res.processedCount).toBe(1);
    expect(res.failedCount).toBe(0);
  });

  it('TC-15.11 cancels at batch boundary when the client disconnect signal is set', async () => {
    mockSourceQuery([makeSourceRow('1')], 2);
    mockSourceIterator([makeSourceRow('1')], [makeSourceRow('2')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hello' }])]);
    mockLogFindOne.mockResolvedValueOnce(null);
    let check = 0;
    const signal = {
      get cancelled() {
        return ++check >= 2;
      }
    };
    const res = await runFullTextMigration({ batchSize: 500, signal, client: mockClient } as never);
    expect(res.status).toBe('cancelled');
    expect(res.processedCount).toBe(1);
    expect(mockClient.upsert).toHaveBeenCalledTimes(1);
    expect(mockClient.releaseCollection).not.toHaveBeenCalled();
    expect(mockFailedFind).not.toHaveBeenCalled();
    expect(mockLogUpdateOne).toHaveBeenCalledWith(
      { migrationId: expect.any(String) },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'cancelled' }) })
    );
  });

  it('TC-15.12 rejects a new run while another migration is running', async () => {
    mockSourceQuery([], 10);
    mockLogFindOne.mockResolvedValue({
      migrationId: 'running-1',
      newEngine: 'milvus',
      status: 'running'
    });
    await expect(
      runFullTextMigration({ batchSize: 500, client: mockClient } as never)
    ).rejects.toThrow(/already running/);
    expect(mockClient.queryIterator).not.toHaveBeenCalled();
    expect(mockClient.upsert).not.toHaveBeenCalled();
  });

  it('TC-15.13 rejects resuming a log that is still running', async () => {
    mockSourceQuery([], 1);
    mockLogFindOne.mockResolvedValue({
      migrationId: 'm1',
      newEngine: 'milvus',
      status: 'running',
      cursor: '5',
      processedCount: 5,
      skippedCount: 0,
      failedCount: 0
    });
    await expect(
      runFullTextMigration({ batchSize: 500, resumeMigrationId: 'm1', client: mockClient } as never)
    ).rejects.toThrow(/still running/);
    expect(mockClient.queryIterator).not.toHaveBeenCalled();
  });

  it('TC-15.15 takes over a stale running log left by a server restart', async () => {
    mockLogFindOne.mockResolvedValue({
      migrationId: 'm1',
      newEngine: 'milvus',
      status: 'running',
      cursor: '5',
      processedCount: 5,
      skippedCount: 0,
      failedCount: 0,
      updatedAt: new Date(Date.now() - 10 * 60 * 1000)
    });
    const remaining = [makeSourceRow('6'), makeSourceRow('7'), makeSourceRow('8')];
    mockSourceQuery(remaining, 8);
    mockSourceIterator(remaining);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '6' }, { dataId: '7' }, { dataId: '8' }])]);
    const res = await runFullTextMigration({
      batchSize: 500,
      resumeMigrationId: 'm1',
      client: mockClient
    } as never);
    expect(res.status).toBe('done');
    expect(res.processedCount).toBe(8);
    expect(mockClient.queryIterator).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.stringContaining('(id > 5)') })
    );
  });

  // ==================== upsert 状态拆分(Fix 2) ====================
  it('TC-15.18 treats non-SUCCESS upsert status as a failed batch', async () => {
    mockSourceQuery([makeSourceRow('1')]);
    mockSourceIterator([makeSourceRow('1')]);
    mockFind.mockResolvedValue([makeDataDoc([{ dataId: '1', text: 'hello' }])]);
    // 服务端错误不 reject:upsert resolve 但 status.error_code != Success → 整批失败落失败表
    mockClient.upsert.mockResolvedValue({ status: { error_code: 'Fail', reason: 'OOM' } });
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(res.processedCount).toBe(0);
    expect(res.failedCount).toBe(1);
    expect(res.status).toBe('failed');
    expect(mockFailedBulkWrite).toHaveBeenCalled();
  });

  it('TC-15.19 splits partial upsert failures by err_index', async () => {
    mockSourceQuery([makeSourceRow('1'), makeSourceRow('2')]);
    mockSourceIterator([makeSourceRow('1'), makeSourceRow('2')]);
    mockFind.mockResolvedValue([
      makeDataDoc([
        { dataId: '1', text: 'hello' },
        { dataId: '2', text: 'world' }
      ])
    ]);
    // 主循环:行 2 部分失败(err_index=[1])→ 计 failed 并落失败表;自愈重试成功
    mockClient.upsert
      .mockResolvedValueOnce({ status: { error_code: 'Success' }, succ_index: [0], err_index: [1] })
      .mockResolvedValue({ status: { error_code: 'Success' } });
    mockFailedFind.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue([{ migrationId: 'm1', dataId: '2', error: 'batch fail' }])
    }));
    const res = await runFullTextMigration({ batchSize: 500, client: mockClient } as never);
    expect(res.processedCount).toBe(2);
    expect(res.failedCount).toBe(0);
    expect(res.status).toBe('done');
    expect(mockFailedBulkWrite).toHaveBeenCalled();
    expect(mockFailedDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ dataId: { $in: ['2'] } })
    );
  });

  // ==================== 并发防护索引兜底(Fix 3) ====================
  it('TC-15.22 rejects duplicate running log on create (TOCTOU backstop)', async () => {
    mockSourceQuery([], 10);
    // 预检通过(无 running),create 命中唯一部分索引重复键 → 转成并发拒绝
    mockLogFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ migrationId: 'running-1', newEngine: 'milvus', status: 'running' });
    mockLogCreate.mockRejectedValue({ code: 11000 });
    await expect(
      runFullTextMigration({ batchSize: 500, client: mockClient } as never)
    ).rejects.toThrow(/Migration already running \(running-1\)/);
    expect(mockClient.queryIterator).not.toHaveBeenCalled();
    expect(mockClient.upsert).not.toHaveBeenCalled();
  });
});
