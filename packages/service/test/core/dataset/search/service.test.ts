import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetSearchInput } from '@fastgpt/global/core/dataset/search/type';
import type { DatasetSearchProps } from '../../../../core/dataset/search/type';
import type { ModelHandle } from '../../../../core/ai/model/catalog/handle';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  readable: vi.fn(),
  authorizedModels: vi.fn(),
  assertModels: vi.fn(),
  recall: vi.fn(),
  signImage: vi.fn(),
  vlm: vi.fn()
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetByTmbId: mocks.auth
}));
vi.mock('@fastgpt/service/support/permission/collection/auth', () => ({
  resolveReadableCollectionIds: mocks.readable
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  getAuthorizedModelIds: mocks.authorizedModels,
  assertAuthModels: mocks.assertModels
}));
vi.mock('@fastgpt/service/core/dataset/search', () => ({ defaultSearchDatasetData: mocks.recall }));
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({ createExternalUrl: mocks.signImage })
}));
vi.mock('@fastgpt/service/core/dataset/search/vlm', () => ({
  findFirstDatasetSearchVlmModel: mocks.vlm
}));

import { search } from '../../../../core/dataset/search/service';

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
const getModelData = vi.fn((_reference: { modelId?: string }, options: { type: string }) =>
  options.type === 'embedding' ? embedding : options.type === 'rerank' ? rerank : llm
);
const handle = { getModelData } as unknown as ModelHandle;

const run = (
  params: DatasetSearchInput = { scope: { datasetIds: ids }, query: { text: 'question' } },
  overrides: Partial<DatasetSearchProps> = {}
) => {
  const deps = {
    getModelHandle: vi.fn(async () => handle),
    beforeSearch: vi.fn(async () => {}),
    onUsage: vi.fn<DatasetSearchProps['deps']['onUsage']>(async () => {}),
    onSearched: vi.fn(async () => {})
  };
  return { deps, promise: search({ params, context: { actor }, deps, ...overrides }) };
};

beforeEach(() => {
  vi.clearAllMocks();
  global.feConfigs.isPlus = false;
  mocks.auth.mockImplementation(async ({ datasetId }) => ({
    dataset: {
      _id: datasetId,
      teamId: actor.teamId,
      name: datasetId,
      type: 'dataset',
      vectorModelId: embedding.modelId
    }
  }));
  mocks.readable.mockResolvedValue(undefined);
  mocks.authorizedModels.mockResolvedValue(new Set([rerank.modelId, llm.modelId]));
  mocks.assertModels.mockResolvedValue(undefined);
  mocks.signImage.mockResolvedValue({ url: 'https://files.example.com/signed' });
  mocks.vlm.mockReturnValue(undefined);
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
  getModelData.mockImplementation((_reference, options) =>
    options.type === 'embedding' ? embedding : options.type === 'rerank' ? rerank : llm
  );
});

describe('member knowledge search orchestration', () => {
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

  it.each([
    { teamId: 'other-team', type: 'dataset' },
    { teamId: actor.teamId, type: 'folder' }
  ])('rejects invalid resource scope even for a root actor', async (dataset) => {
    mocks.auth.mockResolvedValue({ dataset });
    await expect(
      run(undefined, { context: { actor: { ...actor, isRoot: true } } }).promise
    ).rejects.toBeDefined();
    expect(mocks.recall).not.toHaveBeenCalled();
  });

  it('rejects incompatible vector models while allowing full-text joint retrieval', async () => {
    getModelData.mockImplementation((reference, options) =>
      options.type === 'embedding'
        ? { ...embedding, modelId: reference.modelId ?? embedding.modelId }
        : llm
    );
    mocks.auth.mockImplementation(async ({ datasetId }) => ({
      dataset: { _id: datasetId, teamId: actor.teamId, type: 'dataset', vectorModelId: datasetId }
    }));
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
    global.feConfigs.isPlus = true;
    await run(params).promise;
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
    mocks.vlm.mockReturnValue(llm);
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
    const usage = deps.onUsage.mock.calls[0]?.[0];
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
        deps: { getModelHandle: async () => handle, beforeSearch, onUsage: async () => {} }
      }).promise
    ).rejects.toThrow('limit reached');
    expect(mocks.recall).not.toHaveBeenCalled();
    await expect(
      run(undefined, {
        deps: {
          getModelHandle: async () => handle,
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
});
