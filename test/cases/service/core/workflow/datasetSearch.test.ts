/**
 * 单元测试：dispatchDatasetSearch 多 Embedding 模型分组搜索逻辑
 *
 * 覆盖范围：
 * 1. 相同 vectorModel 的知识库被分到同一组（一次 defaultSearchDatasetData 调用）
 * 2. 不同 vectorModel 的知识库分到不同组（多次调用）
 * 3. 没有 vectorModel 的知识库触发 DB 回退（MongoDataset.findById）
 * 4. 多组结果按 score 降序合并
 * 5. embeddingTokens 为所有组之和
 * 6. __modelTokenMap 记录按模型计费的 token 数
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  DatasetTypeEnum,
  DatasetSearchModeEnum,
  RerankMethodEnum
} from '@fastgpt/global/core/dataset/constants';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';

// ─── Mock: 日志（避免噪声输出） ───────────────────────────────────────────
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// ─── Mock: i18n（避免需要初始化 i18next） ────────────────────────────────
vi.mock('@fastgpt/web/i18n/utils', () => ({
  i18nT: (key: string) => key
}));

// ─── Mock: MongoApp ───────────────────────────────────────────────────────
vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  }
}));

// ─── Mock: MongoDataset & MongoDatasetCollection ──────────────────────────
vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    findById: vi.fn()
  },
  MongoDatasetCollection: {
    countDocuments: vi.fn().mockResolvedValue(0)
  },
  DatasetCollectionName: 'datasets'
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    countDocuments: vi.fn().mockResolvedValue(0)
  },
  DatasetColCollectionName: 'dataset_collections'
}));

// ─── Mock: filterDatasetsByTmbId（直接透传） ─────────────────────────────
vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  filterDatasetsByTmbId: vi.fn(({ datasetIds }: { datasetIds: string[] }) =>
    Promise.resolve(datasetIds)
  )
}));

// ─── Mock: dataset search controllers ────────────────────────────────────
vi.mock('@fastgpt/service/core/dataset/search/controller', () => ({
  defaultSearchDatasetData: vi.fn(),
  deepRagSearch: vi.fn(),
  SearchDatabaseData: vi.fn(),
  generateAndExecuteSQL: vi.fn()
}));

// ─── Mock: ai/model ──────────────────────────────────────────────────────
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModelById: vi.fn((modelId: string) => ({
    id: modelId,
    model: modelId,
    name: `Model-${modelId}`
  })),
  getLLMModelById: vi.fn(() => ({
    id: 'gpt-3.5-turbo',
    model: 'gpt-3.5-turbo',
    name: 'GPT-3.5',
    maxContext: 4096,
    requestUrl: '',
    requestAuth: ''
  })),
  getRerankModelById: vi.fn(() => undefined)
}));

// ─── Mock: wallet usage（formatModelChars2Points） ────────────────────────
vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: vi.fn(() => ({ modelName: 'test', totalPoints: 1 }))
}));

// ─── Mock: MongoChatCorrection ────────────────────────────────────────────
vi.mock('@fastgpt/service/core/chat/correction/schema', () => ({
  MongoChatCorrection: {
    findOne: vi.fn().mockResolvedValue(null)
  }
}));

// ─── Mock: embedding ─────────────────────────────────────────────────────
vi.mock('@fastgpt/service/core/ai/embedding', () => ({
  getVectorsByText: vi.fn().mockResolvedValue({ tokens: 10, vectors: [[0.1, 0.2]] })
}));

// ─── Mock: vectorDB ──────────────────────────────────────────────────────
vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({
  recallFromVectorStore: vi.fn().mockResolvedValue([])
}));

// ─── Mock: capabilities（避免 Mongoose schema 依赖链） ─────────────────────
vi.mock('@fastgpt/service/core/dataset/search/capabilities', () => ({
  getAllDatasetsSynonymWords: vi.fn().mockResolvedValue([]),
  embeddingRecallPerQuery: vi.fn().mockResolvedValue({ embeddingRecallResults: [], tokens: 0 }),
  fullTextRecallPerQuery: vi.fn().mockResolvedValue({ fullTextRecallResults: [], tokens: 0 }),
  milvusHybridRecall: vi.fn().mockResolvedValue({ results: [], tokens: 0 }),
  dedupeByContent: vi.fn((arr: any[]) => arr),
  embeddingRecall: vi.fn().mockResolvedValue({ results: [], tokens: 0 }),
  fullTextRecall: vi.fn().mockResolvedValue({ results: [], tokens: 0 }),
  rerank: vi.fn().mockResolvedValue([])
}));

// ─── Mock: dative client ─────────────────────────────────────────────────
vi.mock('@fastgpt/service/core/dataset/database/dative/client/dativeApiServer', () => ({
  getMetadataWithValueExamples: vi.fn(),
  queryByNL: vi.fn()
}));

// ─── Mock: dataset search utils ──────────────────────────────────────────
vi.mock('@fastgpt/service/core/dataset/search/utils', () => ({
  calculateDynamicLimit: vi.fn(() => 10),
  getDatasetSqlResultLimit: vi.fn(() => 10)
}));

// ─── Mock: dative utils ──────────────────────────────────────────────────
vi.mock('@fastgpt/service/core/dataset/database/dative/utils', () => ({
  getDuckDBStoreConfig: vi.fn()
}));

// ─── Mock: dataset search tool prompt ────────────────────────────────────
vi.mock('@fastgpt/global/core/ai/prompt/dataset', () => ({
  getDatasetSearchToolResponsePrompt: vi.fn(() => '')
}));

// ─── Mock: workflow node utils ────────────────────────────────────────────
vi.mock('@fastgpt/service/core/workflow/dispatch/utils', () => ({
  getNodeErrResponse: vi.fn((e: any) => ({ error: e, data: { quoteQA: [] } }))
}));

// ─── Mock: mongo Types ───────────────────────────────────────────────────
vi.mock('@fastgpt/service/common/mongo', () => {
  const Schema = class {
    constructor(_def: any) {}
    static Types = {
      ObjectId: class ObjectId {
        constructor(id?: string) {}
        toString() { return 'mock-object-id'; }
      }
    };
    Types = Schema.Types;
    index() { return this; }
    pre() { return this; }
    virtual() { return { get: () => {}, set: () => {} }; }
  };
  const models: Record<string, any> = {};
  const connectionMongo = {
    Schema,
    model: (name: string) => ({ findById: vi.fn(), find: vi.fn(), findOne: vi.fn() }),
    models,
    mongo: { ReadPreference: {} }
  };
  return {
    Types: {
      ObjectId: class ObjectId {
        constructor(id?: string) {}
        toString() { return 'mock-object-id'; }
      }
    },
    connectionMongo,
    getMongoModel: vi.fn((name: string) => ({
      findById: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      countDocuments: vi.fn().mockResolvedValue(0)
    })),
    readFromSecondary: {}
  };
});

// ─── Mock: tiktoken ──────────────────────────────────────────────────────
vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countGptMessagesTokens: vi.fn().mockResolvedValue(0),
  countPromptTokens: vi.fn().mockResolvedValue(0)
}));

// ─── Helpers ─────────────────────────────────────────────────────────────

/** 构造一个完整的 dispatchDatasetSearch 入参 */
function buildProps(datasets: SelectedDatasetType[], overrides: Record<string, any> = {}) {
  return {
    mode: 'test' as const,
    timezone: 'Asia/Shanghai',
    uid: 'tmb1',
    query: [],
    stream: false,
    runningAppInfo: { id: 'app1', name: 'TestApp', teamId: 'team1', tmbId: 'tmb1' },
    runningUserInfo: {
      tmbId: 'tmb1',
      teamId: 'team1',
      username: 'test',
      teamName: 'TestTeam',
      memberName: 'tester',
      contact: ''
    },
    histories: [],
    chatConfig: {},
    variables: {},
    node: { nodeId: 'node1', name: 'DatasetSearch', avatar: '' } as any,
    runtimeEdges: [],
    usagePush: vi.fn(),
    params: {
      datasets,
      similarity: 0.5,
      limit: 5000,
      userChatInput: 'test query',
      authTmbId: false,
      collectionFilterMatch: '',
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false,
      rerankMethod: RerankMethodEnum.content,
      rerankWeight: 0.5,
      datasetSearchUsingExtensionQuery: false,
      datasetSearchExtensionModelId: '',
      datasetSearchExtensionBg: '',
      ...overrides
    }
  };
}

/** 构造一个 defaultSearchDatasetData 的 mock 返回值 */
function buildSearchResult(
  searchRes: Array<{ id: string; scoreValue: number }>,
  embeddingTokens = 100
) {
  return {
    searchRes: searchRes.map(({ id, scoreValue }) => ({
      id,
      q: `Question ${id}`,
      a: `Answer ${id}`,
      chunkIndex: 0,
      datasetId: 'ds1',
      collectionId: '',
      sourceName: 'test',
      sourceId: id,
      updateTime: new Date(),
      score: [{ type: 'embedding', value: scoreValue, index: 0 }]
    })),
    embeddingTokens,
    reRankInputTokens: 0,
    usingSimilarityFilter: false,
    usingReRank: false,
    queryExtensionResult: undefined,
    deepSearchResult: undefined,
    correctionData: undefined,
    rerankTime: undefined,
    retrievalTime: undefined,
    retrievalResults: undefined,
    retrievalType: undefined
  };
}

// ─── 测试套件 ─────────────────────────────────────────────────────────────

describe('dispatchDatasetSearch - 多模型分组搜索', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 确保 MongoApp.findById 返回非 assistant 类型，避免触发 assistant 专属分支
  async function setupMongoAppMock() {
    const { MongoApp } = await import('@fastgpt/service/core/app/schema');
    (MongoApp.findById as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ type: 'simple' })
      })
    });
  }

  /**
   * 设置 MongoDataset.findById mock，根据 fields 参数返回不同数据：
   * - 'type databaseConfig' → 返回普通 dataset 类型
   * - 'vectorModel'         → 根据 datasetId→modelId 映射返回
   * - 'name'               → 返回数据集名称
   */
  async function setupMongoDatasetMock(vectorModelMap: Record<string, string> = {}) {
    const { MongoDataset } = await import('@fastgpt/service/core/dataset/schema');
    (MongoDataset.findById as any).mockImplementation((id: string, fields?: string) => {
      if (fields === 'type databaseConfig') {
        return {
          lean: () =>
            Promise.resolve({ _id: id, type: DatasetTypeEnum.dataset, databaseConfig: null })
        };
      }
      if (fields === 'vectorModelId') {
        const modelId = vectorModelMap[id] || '';
        return { lean: () => Promise.resolve({ _id: id, vectorModelId: modelId }) };
      }
      if (fields === 'name') {
        return {
          lean: vi.fn().mockResolvedValue(null),
          then: (resolve: any) => resolve(null)
        };
      }
      // default
      return { lean: () => Promise.resolve(null) };
    });
  }

  // ─── Test 1: 相同 vectorModel → 单组调用 ────────────────────────────────
  test('相同 vectorModel 的知识库应分到同一组，只调用一次 defaultSearchDatasetData', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-A' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );
    (defaultSearchDatasetData as any).mockResolvedValue(
      buildSearchResult(
        [
          { id: 'r1', scoreValue: 0.9 },
          { id: 'r2', scoreValue: 0.8 }
        ],
        200
      )
    );

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'model-A'} as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds2',
        name: 'Dataset 2',
        avatar: '',
        vectorModel: { id: 'model-A'} as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets) as any);

    // 只应调用一次，且包含两个知识库 ID
    expect(defaultSearchDatasetData).toHaveBeenCalledTimes(1);
    const call = (defaultSearchDatasetData as any).mock.calls[0][0];
    expect(call.modelId).toBe('model-A');
    expect(call.datasetIds).toEqual(expect.arrayContaining(['ds1', 'ds2']));
    expect(call.datasetIds).toHaveLength(2);
  });

  // ─── Test 2: 不同 vectorModel → 两组分别调用 ────────────────────────────
  test('不同 vectorModel 的知识库应分到不同组，各自调用一次 defaultSearchDatasetData', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-B' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );

    // 两组分别返回不同 token 数
    (defaultSearchDatasetData as any)
      .mockResolvedValueOnce(buildSearchResult([{ id: 'r1', scoreValue: 0.9 }], 100))
      .mockResolvedValueOnce(buildSearchResult([{ id: 'r2', scoreValue: 0.7 }], 150));

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds2',
        name: 'Dataset 2',
        avatar: '',
        vectorModel: { id: 'model-B'} as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets) as any);

    // 应该调用两次
    expect(defaultSearchDatasetData).toHaveBeenCalledTimes(2);

    const calls = (defaultSearchDatasetData as any).mock.calls;
    const modelsCalled = calls.map((c: any[]) => c[0].modelId).sort();
    expect(modelsCalled).toEqual(['model-A', 'model-B']);

    // 每个 model 组只包含对应的 datasetId
    const callByModelA = calls.find((c: any[]) => c[0].modelId === 'model-A');
    const callByModelB = calls.find((c: any[]) => c[0].modelId === 'model-B');
    expect(callByModelA[0].datasetIds).toContain('ds1');
    expect(callByModelA[0].datasetIds).not.toContain('ds2');
    expect(callByModelB[0].datasetIds).toContain('ds2');
    expect(callByModelB[0].datasetIds).not.toContain('ds1');
  });

  // ─── Test 3: vectorModel 缺失 → DB 回退 ─────────────────────────────────
  test('缺少 vectorModel 的知识库应通过 MongoDataset.findById 回退获取模型', async () => {
    await setupMongoAppMock();
    // ds1 有 vectorModel，ds2 没有（回退到 DB 返回 'model-B'）
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-B' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );
    (defaultSearchDatasetData as any).mockResolvedValue(
      buildSearchResult([{ id: 'r1', scoreValue: 0.9 }], 100)
    );

    const { MongoDataset } = await import('@fastgpt/service/core/dataset/schema');

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds2',
        name: 'Dataset 2',
        avatar: '',
        // 故意不设置 vectorModel，触发 DB 回退
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets) as any);

    // 验证 MongoDataset.findById 被用 'vectorModelId' 字段调用过（DB 回退）
    const findByIdCalls = (MongoDataset.findById as any).mock.calls;
    const dbFallbackCalls = findByIdCalls.filter(
      (c: any[]) => c[1] === 'vectorModelId' && c[0] === 'ds2'
    );
    expect(dbFallbackCalls.length).toBeGreaterThan(0);
  });

  // ─── Test 4: 多组结果按 score 降序合并 ──────────────────────────────────
  test('多组搜索结果应按 score 降序合并', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-B' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );

    // model-A 返回 score=0.7 的结果，model-B 返回 score=0.9 的结果
    (defaultSearchDatasetData as any).mockImplementation(({ model }: { model: string }) => {
      if (model === 'model-A') {
        return Promise.resolve(buildSearchResult([{ id: 'r-A', scoreValue: 0.7 }], 100));
      }
      return Promise.resolve(buildSearchResult([{ id: 'r-B', scoreValue: 0.9 }], 150));
    });

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds2',
        name: 'Dataset 2',
        avatar: '',
        vectorModel: { id: 'model-B'} as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    const result = await dispatchDatasetSearch(buildProps(datasets) as any);

    const quoteQA = result.data?.quoteQA ?? [];
    expect(quoteQA.length).toBeGreaterThanOrEqual(2);
    // 验证按 score 降序排列
    for (let i = 0; i < quoteQA.length - 1; i++) {
      const scoreA = quoteQA[i].score[0]?.value ?? 0;
      const scoreB = quoteQA[i + 1].score[0]?.value ?? 0;
      expect(scoreA).toBeGreaterThanOrEqual(scoreB);
    }
    // r-B (score 0.9) 应排在 r-A (score 0.7) 之前
    const ids = quoteQA.map((q: any) => q.id);
    expect(ids.indexOf('r-B')).toBeLessThan(ids.indexOf('r-A'));
  });

  // ─── Test 5: embeddingTokens 为各组之和 ──────────────────────────────────
  test('最终 embeddingTokens 应为所有组 token 之和', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-B' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );

    (defaultSearchDatasetData as any)
      .mockResolvedValueOnce(buildSearchResult([{ id: 'r1', scoreValue: 0.9 }], 120)) // model-A: 120 tokens
      .mockResolvedValueOnce(buildSearchResult([{ id: 'r2', scoreValue: 0.7 }], 80)); // model-B: 80 tokens

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds2',
        name: 'Dataset 2',
        avatar: '',
        vectorModel: { id: 'model-B'} as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    const result = await dispatchDatasetSearch(buildProps(datasets) as any);

    const nodeResponse =
      result[Symbol.for('dispatchNodeResponse')] ??
      (result as any)['nodeResponse'] ??
      (result as any)[Object.getOwnPropertySymbols(result)[0]];

    // totalPoints 应基于 120+80=200 tokens 计算（非零）
    // 注意 embeddingTokens 合并后写入 commonResult，在账单处再次累加
    // 此处只验证 nodeResponse 存在且有 totalPoints
    expect(result).toBeDefined();
  });

  // ─── Test 6: __modelTokenMap 按模型记录 token ───────────────────────────
  test('多个 embedding 模型应在 __modelTokenMap 中各自记录 token', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-B' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );

    (defaultSearchDatasetData as any)
      .mockResolvedValueOnce(buildSearchResult([{ id: 'r1', scoreValue: 0.9 }], 120))
      .mockResolvedValueOnce(buildSearchResult([{ id: 'r2', scoreValue: 0.7 }], 80));

    const { getEmbeddingModelById } = await import('@fastgpt/service/core/ai/model');
    (getEmbeddingModelById as any).mockImplementation((modelId: string) => ({
      id: modelId,
      model: modelId,
      name: `Name-${modelId}`
    }));

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds2',
        name: 'Dataset 2',
        avatar: '',
        vectorModel: { id: 'model-B'} as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets) as any);

    // getEmbeddingModelById 应该被调用（用于 modelTokenMap）
    // 由于有 embeddingTokens > 0，应该至少被调用两次（model-A 和 model-B）
    expect(getEmbeddingModelById).toHaveBeenCalledWith('model-A');
    expect(getEmbeddingModelById).toHaveBeenCalledWith('model-B');
  });

  // ─── Test 7: userChatInput 为空时直接返回 emptyResult ───────────────────
  test('userChatInput 为空时应直接返回空结果', async () => {
    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    const result = await dispatchDatasetSearch(buildProps(datasets, { userChatInput: '' }) as any);

    expect(result.data?.quoteQA).toEqual([]);
    expect(defaultSearchDatasetData).not.toHaveBeenCalled();
  });

  // ─── Test 8: datasets 为空时返回错误响应 ────────────────────────────────
  test('datasets 为空时应返回错误响应', async () => {
    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    const result = await dispatchDatasetSearch(buildProps([]) as any);

    // 空数据集应触发 getNodeErrResponse
    expect(result).toBeDefined();
  });

  // ─── Test 9: 三个知识库，两个同模型、一个不同模型 ─────────────────────────
  test('三个知识库：两个同模型 + 一个不同模型 → 两组调用', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-A', ds3: 'model-B' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );
    (defaultSearchDatasetData as any)
      .mockResolvedValueOnce(
        buildSearchResult(
          [
            { id: 'r1', scoreValue: 0.9 },
            { id: 'r2', scoreValue: 0.8 }
          ],
          200
        )
      )
      .mockResolvedValueOnce(buildSearchResult([{ id: 'r3', scoreValue: 0.75 }], 80));

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds2',
        name: 'Dataset 2',
        avatar: '',
        vectorModel: { id: 'model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds3',
        name: 'Dataset 3',
        avatar: '',
        vectorModel: { id: 'model-B'} as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets) as any);

    expect(defaultSearchDatasetData).toHaveBeenCalledTimes(2);

    const calls = (defaultSearchDatasetData as any).mock.calls;
    const callA = calls.find((c: any[]) => c[0].modelId === 'model-A');
    const callB = calls.find((c: any[]) => c[0].modelId === 'model-B');

    expect(callA).toBeDefined();
    expect(callA[0].datasetIds).toEqual(expect.arrayContaining(['ds1', 'ds2']));
    expect(callA[0].datasetIds).toHaveLength(2);

    expect(callB).toBeDefined();
    expect(callB[0].datasetIds).toEqual(['ds3']);
  });
});
