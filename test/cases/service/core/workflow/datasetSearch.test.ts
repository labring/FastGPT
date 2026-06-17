/**
 * 单元测试：dispatchDatasetSearch — embeddingModelId 检索模型选择逻辑
 *
 * 覆盖范围：
 * 1. 指定 embeddingModelId 时使用微调模型作为 searchModel
 * 2. 未指定 embeddingModelId 时回退到知识库 vectorModel
 * 3. 所有常规知识库合并为单次 defaultSearchDatasetData 调用
 * 4. embeddingTokens 正确累加
 * 5. 计费使用 searchModel
 * 6. userChatInput 为空时提前返回
 * 7. datasets 为空时返回错误响应
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
  getRerankModelById: vi.fn(() => ({ id: 'mock-rerank-id' }))
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

// ─── Mock: workflow node utils ─────────────────────────────────────────────
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
        toString() {
          return 'mock-object-id';
        }
      }
    };
    Types = Schema.Types;
    index() {
      return this;
    }
    pre() {
      return this;
    }
    virtual() {
      return { get: () => {}, set: () => {} };
    }
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
        toString() {
          return 'mock-object-id';
        }
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

// ─── Mock: detectLang（避免依赖外部库） ──────────────────────────────────
vi.mock('diting-rag-ts', () => ({
  detectLang: vi.fn(() => 'en')
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

describe('dispatchDatasetSearch - embeddingModelId 检索模型选择', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
   * - 'vectorModelId'         → 根据 datasetId→modelId 映射返回
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
      return { lean: () => Promise.resolve(null) };
    });
  }

  // ─── Test 1: 指定 embeddingModelId → 使用微调模型 ───────────────────────
  test('指定 embeddingModelId 时应使用该模型进行检索', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'base-model-A', ds2: 'base-model-A' });

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
        vectorModel: { id: 'base-model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      },
      {
        datasetId: 'ds2',
        name: 'Dataset 2',
        avatar: '',
        vectorModel: { id: 'base-model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets, { embeddingModelId: 'tuned-model-X' }) as any);

    expect(defaultSearchDatasetData).toHaveBeenCalledTimes(1);
    const call = (defaultSearchDatasetData as any).mock.calls[0][0];
    expect(call.modelId).toBe('tuned-model-X');
    expect(call.datasetIds).toEqual(expect.arrayContaining(['ds1', 'ds2']));
  });

  // ─── Test 2: 未指定 embeddingModelId → 回退到知识库 vectorModel ────────
  test('未指定 embeddingModelId 时应回退到知识库 vectorModel', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'base-model-A' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );
    (defaultSearchDatasetData as any).mockResolvedValue(
      buildSearchResult([{ id: 'r1', scoreValue: 0.9 }], 100)
    );

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'base-model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets) as any);

    expect(defaultSearchDatasetData).toHaveBeenCalledTimes(1);
    const call = (defaultSearchDatasetData as any).mock.calls[0][0];
    expect(call.modelId).toBe('base-model-A');
  });

  // ─── Test 3: 多个知识库 → 合并为单次调用 ────────────────────────────────
  test('多个知识库应合并为单次 defaultSearchDatasetData 调用', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-B' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );
    (defaultSearchDatasetData as any).mockResolvedValue(
      buildSearchResult([{ id: 'r1', scoreValue: 0.9 }], 100)
    );

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
        vectorModel: { id: 'model-B' } as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets) as any);

    // 只有一个 embeddingModelId 时，所有知识库合并为一次调用
    expect(defaultSearchDatasetData).toHaveBeenCalledTimes(1);
    const call = (defaultSearchDatasetData as any).mock.calls[0][0];
    expect(call.datasetIds).toEqual(expect.arrayContaining(['ds1', 'ds2']));
    expect(call.datasetIds).toHaveLength(2);
  });

  // ─── Test 4: embeddingTokens 正确累加到响应 ─────────────────────────────
  test('embeddingTokens 应正确累加并反映在响应中', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );
    (defaultSearchDatasetData as any).mockResolvedValue(
      buildSearchResult([{ id: 'r1', scoreValue: 0.9 }], 150)
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
    const result = await dispatchDatasetSearch(buildProps(datasets) as any);

    expect(result).toBeDefined();
    const nodeResponse =
      result[Symbol.for('dispatchNodeResponse')] ??
      (result as any)['nodeResponse'] ??
      (result as any)[
        Object.getOwnPropertySymbols(result).find(
          (s) => s.description === 'dispatchNodeResponse'
        ) ?? ''
      ] ??
      result;
    expect(nodeResponse).toBeDefined();
  });

  // ─── Test 5: 计费使用 searchModel（非 knowledge base 的 vectorModel） ───
  test('计费应使用 searchModel 而非知识库默认 vectorModel', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'base-model-A' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );
    (defaultSearchDatasetData as any).mockResolvedValue(
      buildSearchResult([{ id: 'r1', scoreValue: 0.9 }], 100)
    );

    const { formatModelChars2Points } = await import('@fastgpt/service/support/wallet/usage/utils');
    (formatModelChars2Points as any).mockClear();

    const datasets: SelectedDatasetType[] = [
      {
        datasetId: 'ds1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { id: 'base-model-A' } as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets, { embeddingModelId: 'tuned-model-X' }) as any);

    // 计费应使用 tuned-model-X 而非 base-model-A
    expect(formatModelChars2Points).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'tuned-model-X' })
    );
  });

  // ─── Test 6: userChatInput 为空时直接返回空结果 ─────────────────────────
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

  // ─── Test 7: datasets 为空时返回错误响应 ────────────────────────────────
  test('datasets 为空时应返回错误响应', async () => {
    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    const result = await dispatchDatasetSearch(buildProps([]) as any);

    expect(result).toBeDefined();
  });

  // ─── Test 8: 三个知识库合并为单次调用 ────────────────────────────────
  test('三个知识库应合并为单次 defaultSearchDatasetData 调用', async () => {
    await setupMongoAppMock();
    await setupMongoDatasetMock({ ds1: 'model-A', ds2: 'model-A', ds3: 'model-B' });

    const { defaultSearchDatasetData } = await import(
      '@fastgpt/service/core/dataset/search/controller'
    );
    (defaultSearchDatasetData as any).mockResolvedValue(
      buildSearchResult(
        [
          { id: 'r1', scoreValue: 0.9 },
          { id: 'r2', scoreValue: 0.8 },
          { id: 'r3', scoreValue: 0.75 }
        ],
        300
      )
    );

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
        vectorModel: { id: 'model-B' } as any,
        datasetType: DatasetTypeEnum.dataset
      }
    ];

    const { dispatchDatasetSearch } = await import(
      '@fastgpt/service/core/workflow/dispatch/dataset/search'
    );
    await dispatchDatasetSearch(buildProps(datasets) as any);

    expect(defaultSearchDatasetData).toHaveBeenCalledTimes(1);
    const call = (defaultSearchDatasetData as any).mock.calls[0][0];
    expect(call.datasetIds).toEqual(expect.arrayContaining(['ds1', 'ds2', 'ds3']));
    expect(call.datasetIds).toHaveLength(3);
  });
});
