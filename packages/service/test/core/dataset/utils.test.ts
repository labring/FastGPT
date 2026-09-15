import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDatasetImageIndexCapability,
  getDatasetImageTrainingMode
} from '@fastgpt/service/core/dataset/utils';
import {
  matchDatasetDataMarkdownImages,
  matchDatasetDataMarkdownImageUrls,
  uniqueDatasetDataMarkdownImageUrls
} from '@fastgpt/service/core/dataset/data/utils';
import {
  createOrGetCollectionTags,
  getTrainingModeByCollection,
  validateAndNormalizeTagValue,
  validateDatasetTagValue
} from '@fastgpt/service/core/dataset/collection/utils';
import {
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

const mockMongoDatasetCollectionTagsFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionTagsFindOne = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionTagsCreate = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionTagsUpdateOne = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionTagsLegacyFind = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/tag/schema', () => ({
  MongoDatasetCollectionTags: {
    find: mockMongoDatasetCollectionTagsLegacyFind
  }
}));

vi.mock('@fastgpt/service/core/dataset/tag/schemaV2', () => ({
  MongoDatasetCollectionTagsV2: {
    find: mockMongoDatasetCollectionTagsFind,
    findOne: (...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockMongoDatasetCollectionTagsFindOne(...args))
    }),
    create: mockMongoDatasetCollectionTagsCreate,
    updateOne: mockMongoDatasetCollectionTagsUpdateOne
  }
}));

describe('matchDatasetDataMarkdownImageUrls', () => {
  it('应提取统一的 markdown 图片节点结构', async () => {
    const result = matchDatasetDataMarkdownImages(
      '文字 ![猫]( dataset/team/cat.png ) 和 ![dog](https://example.com/dog.png)'
    );

    expect(result).toEqual([
      {
        raw: '![猫]( dataset/team/cat.png )',
        alt: '猫',
        url: 'dataset/team/cat.png',
        index: expect.any(Number)
      },
      {
        raw: '![dog](https://example.com/dog.png)',
        alt: 'dog',
        url: 'https://example.com/dog.png',
        index: expect.any(Number)
      }
    ]);
  });

  it('应提取 markdown 图片 URL 并忽略普通链接', async () => {
    const result = matchDatasetDataMarkdownImageUrls(
      '![a](dataset/team/a.png) [普通链接](https://example.com) ![b](https://img.test/b.jpg)'
    );

    expect(result).toEqual(['dataset/team/a.png', 'https://img.test/b.jpg']);
  });

  it('应从多个文本字段按首次出现顺序去重图片 URL', async () => {
    const result = uniqueDatasetDataMarkdownImageUrls([
      'new ![a](dataset/team/a.png) ![a again](dataset/team/a.png)',
      undefined,
      'old ![b](https://example.com/b.jpg)'
    ]);

    expect(result).toEqual(['dataset/team/a.png', 'https://example.com/b.jpg']);
  });
});

describe('getDatasetImageTrainingMode', () => {
  it('有 VLM 且是图片数据时应走 imageParse', async () => {
    expect(
      getDatasetImageTrainingMode({
        supportVlm: true,
        supportImageIndex: true,
        imageId: 'dataset/team/image.png',
        hasMarkdownImages: false
      })
    ).toBe(TrainingModeEnum.imageParse);
  });

  it('有图片索引能力且正文有 markdown 图片时应走 image', async () => {
    expect(
      getDatasetImageTrainingMode({
        supportVlm: false,
        supportImageIndex: true,
        hasMarkdownImages: true
      })
    ).toBe(TrainingModeEnum.image);
  });

  it('没有图片索引能力时应回退 chunk', async () => {
    expect(
      getDatasetImageTrainingMode({
        supportVlm: false,
        supportImageIndex: false,
        hasMarkdownImages: true
      })
    ).toBe(TrainingModeEnum.chunk);
  });
});

describe('getTrainingModeByCollection', () => {
  beforeEach(() => {
    global.feConfigs = {
      ...global.feConfigs,
      isPlus: true
    };
  });

  it('图片自动索引有 VLM 或原生 embedding 图片索引能力时进入 image 队列', async () => {
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        imageIndex: true,
        supportImageIndex: true
      })
    ).toBe(TrainingModeEnum.image);

    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        imageIndex: true,
        supportImageIndex: false
      })
    ).toBe(TrainingModeEnum.chunk);
  });
});

describe('getDatasetImageIndexCapability', () => {
  const visionEmbeddingModel: EmbeddingSystemModelDataType = {
    modelId: '507f1f77bcf86cd799439011',
    provider: 'test',
    model: 'vision-embedding-model',
    name: 'vision-embedding-model',
    type: ModelTypeEnum.embedding,
    scope: 'system' as const,
    isActive: true,
    config: {
      defaultToken: 512,
      maxToken: 8192,
      weight: 0,
      vision: true
    }
  };
  const datasetVlmModel: LLMSystemModelDataType = {
    modelId: '507f1f77bcf86cd799439012',
    provider: 'test',
    model: 'dataset-vlm-model',
    name: 'dataset-vlm-model',
    type: ModelTypeEnum.llm,
    scope: 'system' as const,
    isActive: true,
    config: {
      maxContext: 32000,
      maxResponse: 4000,
      quoteMaxToken: 16000,
      vision: true
    }
  };

  it('未配置 VLM 时不应自动回退到默认 VLM', async () => {
    const result = getDatasetImageIndexCapability({
      vectorModel: visionEmbeddingModel
    });

    expect(result.supportVlm).toBe(false);
    expect(result.supportImageEmbedding).toBe(true);
    expect(result.supportImageIndex).toBe(true);
    expect(result.availableVlmModel).toBeUndefined();
  });

  it('配置 VLM 时应同时返回 VLM 和多模态索引能力', async () => {
    const result = getDatasetImageIndexCapability({
      vectorModel: visionEmbeddingModel,
      vlmModel: datasetVlmModel
    });

    expect(result.supportVlm).toBe(true);
    expect(result.supportImageEmbedding).toBe(true);
    expect(result.supportImageIndex).toBe(true);
    expect(result.availableVlmModel?.model).toBe('dataset-vlm-model');
  });
});

describe('validateDatasetTagValue', () => {
  it.each([
    ['string', 'value', 'value', undefined],
    ['array', ['a'], ['a'], undefined],
    ['number', '1.25', 1.25, undefined],
    ['datetime', '1704067200000', 1704067200000, undefined],
    ['string', 1, 1, DatasetErrEnum.tagValueInvalid],
    ['array', ['a'.repeat(257)], ['a'.repeat(257)], DatasetErrEnum.arrayTagValueInvalid],
    ['number', 'abc', 'abc', DatasetErrEnum.tagValueInvalid],
    ['datetime', Number.MAX_VALUE, Number.MAX_VALUE, DatasetErrEnum.tagValueDatetimeInvalid]
  ])('validates and normalizes %s values', (tagType, value, normalized, error) => {
    expect(validateAndNormalizeTagValue({ tagType: tagType as any, value: value as any })).toEqual({
      value: normalized,
      ...(error ? { error } : {})
    });
    expect(validateDatasetTagValue({ tagType: tagType as any, value: value as any })).toBe(error);
  });
});

describe('createOrGetCollectionTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });
    mockMongoDatasetCollectionTagsFindOne.mockResolvedValue(null);
    mockMongoDatasetCollectionTagsCreate.mockResolvedValue([]);
    mockMongoDatasetCollectionTagsLegacyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });
    mockMongoDatasetCollectionTagsUpdateOne.mockResolvedValue({ acknowledged: true });
  });

  it('returns without database work when tags are absent or empty', async () => {
    await expect(
      createOrGetCollectionTags({ tags: undefined, datasetId: 'ds-1', teamId: 'team-1' })
    ).resolves.toBeUndefined();
    await expect(
      createOrGetCollectionTags({ tags: [], datasetId: 'ds-1', teamId: 'team-1' })
    ).resolves.toEqual([]);
    expect(mockMongoDatasetCollectionTagsFind).not.toHaveBeenCalled();
  });

  it('creates the migration carrier on demand for legacy string names', async () => {
    mockMongoDatasetCollectionTagsLegacyFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'legacy-1', tag: 'preset-option' }])
    });
    mockMongoDatasetCollectionTagsCreate.mockResolvedValue([
      {
        _id: 'default-tag-id',
        toObject: () => ({ _id: 'default-tag-id' })
      }
    ]);

    const result = await createOrGetCollectionTags({
      tags: ['safety'],
      datasetId: 'ds-1',
      teamId: 'team-1'
    });

    expect(result).toEqual([{ tagId: 'default-tag-id', value: ['safety'] }]);
    expect(mockMongoDatasetCollectionTagsCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          tag: 'default_tag',
          options: ['preset-option'],
          fromMigration: true
        })
      ],
      expect.any(Object)
    );
    expect(mockMongoDatasetCollectionTagsUpdateOne).toHaveBeenCalledWith(
      { _id: 'default-tag-id', teamId: 'team-1', datasetId: 'ds-1' },
      { $addToSet: { options: { $each: ['safety'] } } },
      expect.any(Object)
    );
  });

  it('handles mixed legacy and typed inputs with normalization and deduplication', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'tag-id', tag: 'score', tagType: 'number' }])
    });
    mockMongoDatasetCollectionTagsFindOne.mockResolvedValue({ _id: 'default-tag-id' });

    const result = await createOrGetCollectionTags({
      tags: [' legacy ', 'legacy', { tag: ' score ', value: '2' }],
      datasetId: 'ds-1',
      teamId: 'team-1'
    });

    expect(result).toEqual([
      { tagId: 'default-tag-id', value: ['legacy'] },
      { tagId: 'tag-id', value: 2 }
    ]);
    expect(mockMongoDatasetCollectionTagsUpdateOne).toHaveBeenCalledWith(
      { _id: 'default-tag-id', teamId: 'team-1', datasetId: 'ds-1' },
      { $addToSet: { options: { $each: ['legacy'] } } },
      expect.any(Object)
    );
  });

  it('handles an object input named default_tag as a normal typed tag', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { _id: 'ordinary-default-tag-id', tag: 'default_tag', tagType: 'string' }
        ])
    });

    await expect(
      createOrGetCollectionTags({
        tags: [{ tag: 'default_tag', value: 'ordinary value' }],
        datasetId: 'ds-1',
        teamId: 'team-1'
      })
    ).resolves.toEqual([{ tagId: 'ordinary-default-tag-id', value: 'ordinary value' }]);
    expect(mockMongoDatasetCollectionTagsFindOne).not.toHaveBeenCalled();
    expect(mockMongoDatasetCollectionTagsCreate).not.toHaveBeenCalled();
  });

  it('rejects missing tags and conflicting duplicate values', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });
    await expect(
      createOrGetCollectionTags({
        tags: [{ tag: 'missing', value: 'A' }],
        datasetId: 'ds-1',
        teamId: 'team-1'
      })
    ).rejects.toBe(DatasetErrEnum.tagNotExist);

    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'tag-id', tag: 'tag', tagType: 'string' }])
    });
    await expect(
      createOrGetCollectionTags({
        tags: [
          { tag: 'tag', value: 'A' },
          { tag: 'tag', value: 'B' }
        ],
        datasetId: 'ds-1',
        teamId: 'team-1'
      })
    ).rejects.toBe(DatasetErrEnum.tagValueInvalid);
  });
});
