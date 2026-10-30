import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetSearchInput } from '@fastgpt/global/core/dataset/search/type';
import { DatasetSearchParamsSchema } from '@fastgpt/global/core/dataset/search/type';
import type { DatasetSearchProps } from '../../../../core/dataset/search/type';
import { search } from '../../../../core/dataset/search/service';

// 仅替换显式端口；导入搜索编排不需要 mock 权限、数据库、模型目录或存储模块。
const mocks = {
  auth: vi.fn(),
  readable: vi.fn(),
  models: vi.fn(),
  recall: vi.fn(),
  signImage: vi.fn()
};

const actor = {
  teamId: '507f1f77bcf86cd799439001',
  tmbId: '507f1f77bcf86cd799439002',
  isRoot: false
};
const ids = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];
const embedding = {
  provider: 'test',
  model: 'embed',
  name: 'Embedding',
  modelId: 'embedding-model',
  scope: 'system' as const,
  type: ModelTypeEnum.embedding,
  config: { defaultToken: 512, maxToken: 8192, weight: 0 }
};
const llm = {
  provider: 'test',
  model: 'llm',
  name: 'LLM',
  modelId: 'llm-model',
  scope: 'system' as const,
  type: ModelTypeEnum.llm,
  config: { maxContext: 32000, maxResponse: 4000, quoteMaxToken: 16000 }
};
const rerank = {
  provider: 'test',
  model: 'rerank',
  name: 'Rerank',
  modelId: 'rerank-model',
  scope: 'system' as const,
  type: ModelTypeEnum.rerank,
  config: {}
};
const run = (
  params: DatasetSearchInput = { scope: { datasetIds: ids }, query: { text: 'question' } },
  overrides: {
    params?: DatasetSearchProps['params'];
    context?: Partial<DatasetSearchProps['context']>;
    deps?: Partial<DatasetSearchProps['deps']>;
  } = {}
) => {
  const deps = {
    permissions: { loadReadableDataset: mocks.auth, resolveReadableCollectionIds: mocks.readable },
    resolveModels: mocks.models,
    images: {
      isAuthorizedKey: ({ key, teamId }: { key: string; teamId: string }) =>
        key.startsWith(`temp/${teamId}/`),
      createQueryUrl: mocks.signImage
    },
    recall: mocks.recall,
    beforeSearch: vi.fn(async () => {}),
    onUsage: vi.fn<DatasetSearchProps['deps']['onUsage']>(async () => {}),
    onSearched: vi.fn(async () => {}),
    ...overrides.deps
  };
  return {
    deps,
    promise: search({
      params: overrides.params ?? DatasetSearchParamsSchema.parse(params),
      context: { actor, capabilities: { metadataFilter: false }, ...overrides.context },
      deps
    })
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  global.feConfigs.isPlus = false;
  mocks.auth.mockImplementation(async ({ datasetId }) => ({
    _id: datasetId,
    teamId: actor.teamId,
    name: datasetId,
    type: 'dataset',
    vectorModelId: embedding.modelId
  }));
  mocks.readable.mockResolvedValue(undefined);
  mocks.models.mockImplementation(async ({ datasets, rerank: rerankConfig, queryExtension }) => ({
    embeddings: datasets.map(() => embedding),
    rerank: rerankConfig.enabled ? rerank : undefined,
    queryExtension: queryExtension.enabled ? llm : undefined
  }));
  mocks.signImage.mockResolvedValue('https://files.example.com/signed');
  mocks.recall.mockImplementation(async (params) => ({
    searchRes: [],
    embeddingTokens: 10,
    reRankInputTokens: 0,
    searchMode: params.searchMode,
    limit: params.limit,
    similarity: params.similarity,
    usingReRank: false,
    usingSimilarityFilter: true
  }));
});

describe('member knowledge search orchestration', () => {
  it('keeps normalized legacy numeric options independent from the new HTTP contract', async () => {
    const params = DatasetSearchParamsSchema.parse({
      scope: { datasetIds: ids },
      query: { text: 'q' }
    });
    params.result = { maxTokens: 0.5, similarity: -1 };
    params.retrieval.embeddingWeight = 1.25;
    await run(undefined, { params }).promise;
    expect(mocks.recall).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 0.5, similarity: -1, embeddingWeight: 1.25 })
    );
  });

  it('authorizes every distinct dataset, applies collection permissions and invokes business hooks once', async () => {
    mocks.readable.mockResolvedValue(['readable-collection']);
    const { deps, promise } = run({
      scope: { datasetIds: [ids[0], ids[0], ids[1]] },
      query: { text: ' question ' }
    });
    const result = await promise;
    expect(mocks.auth.mock.calls.map(([params]) => params.datasetId)).toEqual(ids);
    expect(mocks.recall).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetIds: ids,
        textQueries: ['question'],
        readableCollectionIdList: ['readable-collection'],
        limit: 5000,
        similarity: 0
      })
    );
    expect(deps.beforeSearch).toHaveBeenCalledTimes(1);
    expect(deps.onUsage).toHaveBeenCalledExactlyOnceWith({
      items: [
        {
          phase: 'embedding',
          model: embedding,
          inputTokens: 10,
          outputTokens: 0,
          usedUserOpenAIKey: false
        }
      ]
    });
    expect(deps.onSearched).toHaveBeenCalledTimes(1);
    expect(result.meta).toMatchObject({
      searchMode: 'embedding',
      maxTokens: 5000,
      usingSimilarityFilter: true
    });
  });

  it('does not execute or bill when any requested dataset is inaccessible', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('access denied'));
    const { deps, promise } = run();
    await expect(promise).rejects.toThrow('access denied');
    expect(deps.beforeSearch).not.toHaveBeenCalled();
    expect(mocks.recall).not.toHaveBeenCalled();
    expect(deps.onUsage).not.toHaveBeenCalled();
  });

  it('rejects unauthorized auxiliary models before policies, retrieval and billing', async () => {
    mocks.models.mockRejectedValueOnce(new Error('model access denied'));
    const { deps, promise } = run({
      scope: { datasetIds: ids },
      query: { text: 'q' },
      rerank: { enabled: true },
      queryExtension: { enabled: true }
    });
    await expect(promise).rejects.toThrow('model access denied');
    expect(mocks.models).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        rerank: { enabled: true, weight: 0.5 },
        queryExtension: { enabled: true, background: '' }
      })
    );
    expect(deps.beforeSearch).not.toHaveBeenCalled();
    expect(mocks.recall).not.toHaveBeenCalled();
    expect(deps.onUsage).not.toHaveBeenCalled();
  });

  it.each([
    { teamId: 'other-team', type: 'dataset' },
    { teamId: actor.teamId, type: 'folder' }
  ])('rejects invalid resource scope even for a root actor', async (dataset) => {
    mocks.auth.mockResolvedValue(dataset);
    await expect(
      run(undefined, { context: { actor: { ...actor, isRoot: true } } }).promise
    ).rejects.toBeDefined();
    expect(mocks.recall).not.toHaveBeenCalled();
  });

  it('rejects incompatible vector models while allowing full-text joint retrieval', async () => {
    mocks.models.mockResolvedValue({
      embeddings: [embedding, { ...embedding, modelId: 'different-model' }]
    });
    await expect(run().promise).rejects.toThrow('相同的向量模型');
    expect(mocks.recall).not.toHaveBeenCalled();
    await run({
      scope: { datasetIds: ids },
      query: { text: 'question' },
      retrieval: { mode: DatasetSearchModeEnum.fullTextRecall }
    }).promise;
    expect(mocks.recall).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign image keys before signing and supports image-only searches', async () => {
    await expect(
      run({ scope: { datasetIds: ids }, query: { imageKeys: ['temp/other-team/query.png'] } })
        .promise
    ).rejects.toThrow('当前团队');
    expect(mocks.signImage).not.toHaveBeenCalled();
    await run({
      scope: { datasetIds: ids },
      query: { imageKeys: [`temp/${actor.teamId}/query.png`] }
    }).promise;
    expect(mocks.recall).toHaveBeenCalledWith(
      expect.objectContaining({
        textQueries: [],
        imageQueries: ['https://files.example.com/signed']
      })
    );
  });

  it('serializes validated filters and refuses unsupported filters instead of expanding the search scope', async () => {
    const params: DatasetSearchInput = {
      scope: {
        datasetIds: ids,
        filter: {
          tags: {
            and: [
              { tag: 'version', op: '$eq', value: 1 },
              { tag: 'missing', op: '$empty' }
            ],
            or: [{ tag: 'name', op: '$contains', value: 'text' }]
          },
          collectionIds: [ids[0]],
          createTime: { gte: '2026-01-01T00:00:00Z' }
        }
      },
      query: { text: 'q' }
    };
    await expect(run(params).promise).rejects.toThrow('不支持');
    // 全局开关关闭时，显式能力仍能完整传到召回适配器。
    await run(params, { context: { capabilities: { metadataFilter: true } } }).promise;
    expect(mocks.recall.mock.calls[0][0].metadataFilterEnabled).toBe(true);
    expect(JSON.parse(mocks.recall.mock.calls[0][0].collectionFilterMatch)).toEqual({
      collectionIds: [ids[0]],
      createTime: { $gte: '2026-01-01T00:00:00Z' },
      tags: {
        $and: [{ version: { $eq: 1 } }, { missing: { $empty: true } }],
        $or: [{ name: { $contains: 'text' } }]
      }
    });
  });

  it('accounts for every actually executed model phase without calculating monetary amounts', async () => {
    mocks.models.mockResolvedValue({
      embeddings: [embedding, embedding],
      rerank,
      queryExtension: llm,
      imageCaption: llm
    });
    mocks.recall.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 10,
      reRankInputTokens: 20,
      searchMode: 'mixedRecall',
      limit: 1000,
      similarity: 0,
      usingReRank: true,
      usingSimilarityFilter: true,
      queryExtensionResult: {
        inputTokens: 30,
        outputTokens: 40,
        embeddingTokens: 50,
        usedUserOpenAIKey: true
      },
      imageCaptionResult: { inputTokens: 60, outputTokens: 70, usedUserOpenAIKey: false }
    });
    const { deps, promise } = run({
      scope: { datasetIds: ids },
      query: { text: 'q' },
      rerank: { enabled: true, modelId: rerank.modelId, weight: 0 },
      queryExtension: { enabled: true, modelId: llm.modelId }
    });
    expect((await promise).meta.queryExtensionModelId).toBe(llm.modelId);
    const usage = vi.mocked(deps.onUsage).mock.calls[0]?.[0];
    expect(usage).toHaveProperty(
      'items',
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'queryExtension',
          inputTokens: 30,
          outputTokens: 40,
          usedUserOpenAIKey: true
        }),
        expect.objectContaining({ phase: 'queryExtensionEmbedding', inputTokens: 50 }),
        expect.objectContaining({ phase: 'rerank', inputTokens: 20 }),
        expect.objectContaining({ phase: 'imageCaption', inputTokens: 60, outputTokens: 70 })
      ])
    );
  });

  it('propagates business policy and usage callback failures without rerunning retrieval', async () => {
    const beforeSearch = vi.fn(async () => {
      throw new Error('limit reached');
    });
    await expect(
      run(undefined, {
        deps: { beforeSearch, onUsage: async () => {} }
      }).promise
    ).rejects.toThrow('limit reached');
    expect(mocks.recall).not.toHaveBeenCalled();
    await expect(
      run(undefined, {
        deps: {
          beforeSearch: async () => {},
          onUsage: async () => {
            throw new Error('usage rejected');
          }
        }
      }).promise
    ).rejects.toThrow('usage rejected');
    expect(mocks.recall).toHaveBeenCalledTimes(1);
  });

  it('reports no fabricated usage for a zero-cost empty result', async () => {
    mocks.recall.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      searchMode: 'fullTextRecall',
      limit: 5000,
      similarity: 0,
      usingReRank: false,
      usingSimilarityFilter: false
    });
    const { deps, promise } = run();
    await promise;
    expect(deps.onUsage).toHaveBeenCalledExactlyOnceWith({ items: [] });
  });
  it('rejects empty scope and incomplete model adapters before retrieval', async () => {
    const params = DatasetSearchParamsSchema.parse({
      scope: { datasetIds: ids },
      query: { text: 'q' }
    });
    await expect(
      run(undefined, { params: { ...params, scope: { datasetIds: [] } } }).promise
    ).rejects.toThrow('不能为空');
    expect(mocks.auth).not.toHaveBeenCalled();
    mocks.models.mockResolvedValueOnce({ embeddings: [] });
    await expect(run().promise).rejects.toThrow('每个知识库');
    expect(mocks.recall).not.toHaveBeenCalled();
  });
});
