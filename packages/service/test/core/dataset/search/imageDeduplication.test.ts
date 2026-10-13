import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionTypeEnum,
  DatasetSearchModeEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  EmbeddingModelDataType,
  RerankModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import type { SearchDatasetDataProps } from '@fastgpt/service/core/dataset/search/type';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';

const { getVectorsMock, recallMock, rerankMock, previewMock } = vi.hoisted(() => ({
  getVectorsMock: vi.fn(),
  recallMock: vi.fn(),
  rerankMock: vi.fn(),
  previewMock: vi.fn()
}));

// 模型、向量引擎和对象存储无需外部凭据；过滤、Mongo 回查、融合和最终格式化保持真实。
vi.mock('@fastgpt/service/core/ai/embedding', () => ({ getVectors: getVectorsMock }));
vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({
  recallFromVectorStore: recallMock
}));
vi.mock('@fastgpt/service/core/ai/rerank', () => ({ reRankRecall: rerankMock }));
vi.mock('@fastgpt/service/common/s3/accessLink', () => ({
  createS3DownloadAccessUrls: previewMock
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokensBatch: async (prompts: string[]) => prompts.map((prompt) => prompt.length)
}));

import { searchDatasetData } from '@fastgpt/service/core/dataset/search/defaultRecall';

const model: EmbeddingModelDataType = {
  modelId: '507f1f77bcf86cd799439017',
  provider: 'openai',
  model: 'image-embedding',
  name: 'Image Embedding',
  type: ModelTypeEnum.embedding,
  scope: ModelScopeEnum.system,
  isActive: true,
  config: { defaultToken: 100, maxToken: 100, weight: 0, vision: true }
};
const rerankModel: RerankModelDataType = {
  modelId: '507f1f77bcf86cd799439018',
  provider: 'openai',
  model: 'rerank',
  name: 'Rerank',
  type: ModelTypeEnum.rerank,
  scope: ModelScopeEnum.system,
  isActive: true,
  config: {}
};

type StoredCandidate = {
  q?: string;
  a?: string;
  image?: string;
  score?: number;
};

/** 创建真实 Mongo 图片/文本块，沿实际默认搜索链路回查并输出预览。 */
const arrangeSearch = async (candidates: StoredCandidate[]) => {
  const teamId = new Types.ObjectId().toString();
  const tmbId = new Types.ObjectId().toString();
  const dataset = await MongoDataset.create({
    teamId,
    tmbId,
    name: 'Image catalogue',
    type: DatasetTypeEnum.dataset
  });
  const datasetId = String(dataset._id);
  const collection = await MongoDatasetCollection.create({
    teamId,
    tmbId,
    datasetId,
    name: 'Catalogue source',
    type: DatasetCollectionTypeEnum.file,
    fileId: 'catalogue-file'
  });
  const collectionId = String(collection._id);
  const rows = await MongoDatasetData.create(
    candidates.map((item, index) => ({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: item.q ?? 'A red handbag',
      a: item.a ?? '',
      imageId: item.image ? `dataset/${datasetId}/${item.image}` : undefined,
      indexes: [{ dataId: `vector-${index}`, text: `catalogue-${index}` }],
      chunkIndex: index,
      metadata: { page: index + 1 }
    }))
  );
  const hits = candidates.map((item, index) => ({
    id: `vector-${index}`,
    collectionId,
    score: item.score ?? 0.99 - index * 0.05
  }));
  recallMock.mockResolvedValue({ results: hits });

  return {
    datasetId,
    collectionId,
    rows,
    hits,
    search: (overrides: Partial<SearchDatasetDataProps> = {}) =>
      searchDatasetData({
        histories: [],
        teamId,
        datasetIds: [datasetId],
        model,
        textQueries: ['handbag'],
        reRankQuery: 'handbag',
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 1,
        usingReRank: false,
        limit: 5000,
        ...overrides
      })
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  getVectorsMock.mockImplementation(async ({ inputs }: { inputs: unknown[] }) => ({
    tokens: 7,
    vectors: inputs.map((_, index) => [index, 0.1])
  }));
  previewMock.mockImplementation(async (items: { objectKey: string }[]) =>
    items.map(({ objectKey }) => `https://files.test/${objectKey}`)
  );
});

describe.sequential('default search image deduplication with real Mongo hydration', () => {
  it('returns both preview URLs for different images with the same caption', async () => {
    const { search, rows, datasetId, collectionId } = await arrangeSearch([
      { image: 'front.png' },
      { image: 'back.png' }
    ]);

    const result = await search();

    expect(result.searchRes.map((item) => item.id)).toEqual(rows.map((row) => String(row._id)));
    expect(result.searchRes.map((item) => item.imagePreivewUrl)).toEqual([
      `https://files.test/dataset/${datasetId}/front.png`,
      `https://files.test/dataset/${datasetId}/back.png`
    ]);
    expect(result.searchRes[1]).toMatchObject({
      q: `![A red handbag](https://files.test/dataset/${datasetId}/back.png)`,
      datasetId,
      collectionId,
      sourceName: 'Catalogue source',
      sourceId: 'catalogue-file',
      metadata: { page: 2 }
    });
    expect(result.searchRes.every((item) => !('imageId' in item))).toBe(true);
    expect(result.embeddingTokens).toBe(7);
    expect(previewMock).toHaveBeenCalledTimes(1);
  });

  it('retains uncaptained images during pure image search', async () => {
    const { search, rows, datasetId } = await arrangeSearch([
      { image: 'first.png', q: '' },
      { image: 'second.png', q: '' }
    ]);

    const result = await search({
      textQueries: [],
      reRankQuery: '',
      imageQueries: ['data:image/png;base64,YQ==']
    });

    expect(getVectorsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [{ type: 'image', input: 'data:image/png;base64,YQ==' }]
      })
    );
    expect(result.searchRes.map((item) => item.id)).toEqual(rows.map((row) => String(row._id)));
    expect(result.searchRes.map((item) => item.q)).toEqual([
      `![](https://files.test/dataset/${datasetId}/first.png)`,
      `![](https://files.test/dataset/${datasetId}/second.png)`
    ]);
  });

  it('retains distinct images returned by text and image query paths together', async () => {
    const { search, rows, hits } = await arrangeSearch([
      { image: 'front.png' },
      { image: 'back.png' }
    ]);
    recallMock.mockImplementation(async ({ vector }: { vector: number[] }) => ({
      results: [hits[vector[0]]]
    }));

    const result = await search({ imageQueries: ['data:image/png;base64,YQ=='] });

    expect(result.searchRes.map((item) => item.id)).toEqual(rows.map((row) => String(row._id)));
    expect(recallMock).toHaveBeenCalledTimes(2);
    expect(result.searchRes.every((item) => item.imagePreivewUrl)).toBe(true);
  });

  it('returns one result when repeated chunks represent the same image and caption', async () => {
    const { search, rows, datasetId } = await arrangeSearch([
      { image: 'same.png' },
      { image: 'same.png', q: 'A red, handbag!' }
    ]);

    const result = await search();

    expect(result.searchRes.map((item) => item.id)).toEqual([String(rows[0]._id)]);
    expect(
      previewMock.mock.calls[0][0].map((item: { objectKey: string }) => item.objectKey)
    ).toEqual([`dataset/${datasetId}/same.png`]);
    expect(result.searchRes[0].metadata).toEqual({ page: 1 });
  });

  it('preserves text-only deduplication while keeping an image with identical text', async () => {
    const { search, rows } = await arrangeSearch([
      {},
      { q: 'A red, handbag!' },
      { image: 'photo.png' }
    ]);

    const result = await search();

    expect(result.searchRes.map((item) => item.id)).toEqual([
      String(rows[0]._id),
      String(rows[2]._id)
    ]);
    expect(result.searchRes[0].q).toBe('A red handbag');
    expect(result.searchRes[0].imagePreivewUrl).toBeUndefined();
    expect(result.searchRes[1].imagePreivewUrl).toContain('photo.png');
  });

  it('sends different same-caption image candidates to rerank', async () => {
    const { search, rows } = await arrangeSearch([{ image: 'front.png' }, { image: 'back.png' }]);
    rerankMock.mockResolvedValue({
      inputTokens: 12,
      results: [
        { id: String(rows[1]._id), score: 0.95 },
        { id: String(rows[0]._id), score: 0.9 }
      ]
    });

    const result = await search({ usingReRank: true, rerankModel, rerankWeight: 1 });

    expect(rerankMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: rows.map((row) => ({ id: String(row._id), text: 'A red handbag' }))
      })
    );
    expect(result.searchRes.map((item) => item.id)).toEqual([
      String(rows[1]._id),
      String(rows[0]._id)
    ]);
    expect(result.usingReRank).toBe(true);
    expect(result.reRankInputTokens).toBe(12);
  });

  it('keeps both images when rerank fails and falls back to recall ordering', async () => {
    const { search, rows } = await arrangeSearch([{ image: 'front.png' }, { image: 'back.png' }]);
    rerankMock.mockRejectedValue(new Error('rerank unavailable'));

    const result = await search({ usingReRank: true, rerankModel });

    expect(result.searchRes.map((item) => item.id)).toEqual(rows.map((row) => String(row._id)));
    expect(result.usingReRank).toBe(false);
    expect(result.reRankInputTokens).toBe(0);
  });

  it('does not let a low-scoring image eliminate a different high-scoring image', async () => {
    const { search, rows, datasetId } = await arrangeSearch([
      { image: 'low.png', score: 0.2 },
      { image: 'high.png', score: 0.9 }
    ]);

    const result = await search({ similarity: 0.5 });

    expect(result.searchRes.map((item) => item.id)).toEqual([String(rows[1]._id)]);
    expect(result.usingSimilarityFilter).toBe(true);
    expect(
      previewMock.mock.calls[0][0].map((item: { objectKey: string }) => item.objectKey)
    ).toEqual([`dataset/${datasetId}/high.png`]);
  });

  it('applies the existing token cutoff before signing image previews', async () => {
    const { search, rows, datasetId } = await arrangeSearch([
      { image: 'front.png' },
      { image: 'back.png' }
    ]);

    const result = await search({ limit: 1 });

    expect(result.searchRes.map((item) => item.id)).toEqual([String(rows[0]._id)]);
    expect(
      previewMock.mock.calls[0][0].map((item: { objectKey: string }) => item.objectKey)
    ).toEqual([`dataset/${datasetId}/front.png`]);
  });

  it('preserves multiple captions for the same image while signing its key once', async () => {
    const { search, rows, datasetId } = await arrangeSearch([
      { image: 'same.png' },
      { image: 'same.png', q: 'Two internal compartments' }
    ]);

    const result = await search();

    expect(result.searchRes.map((item) => item.id)).toEqual(rows.map((row) => String(row._id)));
    expect(result.searchRes[1].q).toContain('Two internal compartments');
    expect(
      previewMock.mock.calls[0][0].map((item: { objectKey: string }) => item.objectKey)
    ).toEqual([`dataset/${datasetId}/same.png`]);
  });

  it('handles HTTP image identities without creating dataset preview aliases', async () => {
    const { search, rows } = await arrangeSearch([{ image: 'first.png' }, { image: 'second.png' }]);
    const urls = ['https://images.test/photo.png?v=1', 'https://images.test/photo.png?v=2'];
    await Promise.all(
      rows.map((row, index) =>
        MongoDatasetData.updateOne({ _id: row._id }, { imageId: urls[index] })
      )
    );

    const result = await search();

    expect(result.searchRes.map((item) => item.imagePreivewUrl)).toEqual(urls);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('deduplicates repeated hits for one data row across multiple queries', async () => {
    const { search, rows } = await arrangeSearch([{ image: 'first.png' }, { image: 'second.png' }]);

    const result = await search({ textQueries: ['handbag', 'bag'] });

    expect(result.searchRes.map((item) => item.id)).toEqual(rows.map((row) => String(row._id)));
    expect(result.embeddingTokens).toBe(7);
    expect(recallMock).toHaveBeenCalledTimes(2);
    expect(previewMock).toHaveBeenCalledTimes(1);
  });
});
