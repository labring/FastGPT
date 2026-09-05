import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import { Types } from '@fastgpt/service/common/mongo';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';

const mockQueryExtension = vi.hoisted(() => vi.fn());
const mockGetImageBase64 = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/ai/functions/queryExtension', () => ({
  queryExtension: mockQueryExtension
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBase64: mockGetImageBase64
}));

import {
  computeFilterIntersection,
  datasetSearchQueryExtension,
  isValidImageEmbeddingSource,
  mergeDatasetSynonymQueryMatches,
  normalizeImageToBase64,
  standardizeDatasetSearchQueries
} from '../../../../core/dataset/search/utils';

const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;
const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

beforeEach(() => {
  serviceEnv.DATASET_SYNONYM_ENABLED = true;
});

afterEach(() => {
  serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
});

describe('mergeDatasetSynonymQueryMatches', () => {
  const baseMatch = {
    mappingId: '68ee0bd23d17260b7829b137',
    datasetId: '68ee0bd23d17260b7829b138',
    fileVersion: 1,
    matchedTerm: '苹果手机',
    standardizedTerm: 'iPhone',
    preserveOriginal: false,
    order: 0
  };

  it('replaces a unique standard term directly', () => {
    expect(
      mergeDatasetSynonymQueryMatches({
        query: '苹果手机怎么退款',
        matches: [baseMatch]
      })
    ).toBe('iPhone怎么退款');
  });

  it('preserves the source term and appends all cross-dataset standards', () => {
    expect(
      mergeDatasetSynonymQueryMatches({
        query: '苹果手机怎么退款',
        matches: [
          { ...baseMatch, standardizedTerm: 'Apple Phone', order: 1 },
          { ...baseMatch, standardizedTerm: 'iPhone', order: 0 }
        ]
      })
    ).toBe('苹果手机 iPhone Apple Phone怎么退款');
  });

  it('preserves the source term when a match requests expansion', () => {
    expect(
      mergeDatasetSynonymQueryMatches({
        query: 'Use AI',
        matches: [
          {
            ...baseMatch,
            matchedTerm: 'AI',
            standardizedTerm: 'Artificial Intelligence',
            preserveOriginal: true
          }
        ]
      })
    ).toBe('Use AI Artificial Intelligence');
  });
});

describe('standardizeDatasetSearchQueries', () => {
  it('returns original queries without reading synonym configs when disabled', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    const findConfig = vi.spyOn(MongoDatasetSynonym, 'findOne');

    await expect(
      standardizeDatasetSearchQueries({
        teamId: 'team-id',
        datasetIds: ['dataset-id'],
        queries: ['original query']
      })
    ).resolves.toEqual(['original query']);
    expect(findConfig).not.toHaveBeenCalled();
  });

  it('always preserves the original query for eventual-consistency rebuilds', async () => {
    const teamId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const synonym = await MongoDatasetSynonym.create({
      teamId,
      datasetId,
      version: 1,
      enabled: true
    });
    await MongoDatasetSynonymMapping.create({
      logicalMappingId: new Types.ObjectId(),
      teamId,
      datasetId,
      synonymFileId: synonym._id,
      fileVersion: 1,
      standardizedTerm: '退款',
      normalizedStandardizedTerm: '退款',
      synonymTerms: ['退钱'],
      normalizedSynonymTerms: ['退钱'],
      allTerms: '退款 退钱',
      fingerprint: 'refund'
    });

    await expect(
      standardizeDatasetSearchQueries({
        teamId: String(teamId),
        datasetIds: [String(datasetId)],
        queries: ['怎么退钱']
      })
    ).resolves.toEqual(['怎么退钱 退款']);
  });
});

describe('normalizeImageToBase64', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should keep image url unchanged when base64 conversion is disabled', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;

    const result = await normalizeImageToBase64('https://example.com/image.png');

    expect(result).toBe('https://example.com/image.png');
    expect(mockGetImageBase64).not.toHaveBeenCalled();
  });

  it('should keep internal object keys unchanged when base64 conversion is disabled', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;

    const keys = ['dataset/team/file.png', 'temp/team/file.png', 'chat/app/user/chat/file.png'];

    await expect(Promise.all(keys.map((key) => normalizeImageToBase64(key)))).resolves.toEqual([
      'dataset/team/file.png',
      'temp/team/file.png',
      'chat/app/user/chat/file.png'
    ]);
    expect(mockGetImageBase64).not.toHaveBeenCalled();
  });

  it('should convert image url to base64 when base64 conversion is enabled', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
    mockGetImageBase64.mockResolvedValue({
      completeBase64: 'data:image/png;base64,converted'
    });

    const result = await normalizeImageToBase64('https://example.com/image.png');

    expect(result).toBe('data:image/png;base64,converted');
    expect(mockGetImageBase64).toHaveBeenCalledWith('https://example.com/image.png');
  });

  it('should treat internal object keys as plain inputs when base64 conversion is enabled', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
    mockGetImageBase64.mockResolvedValue({
      completeBase64: 'data:image/png;base64,converted'
    });

    const result = await normalizeImageToBase64('dataset/team/file.png');

    expect(result).toBe('data:image/png;base64,converted');
    expect(mockGetImageBase64).toHaveBeenCalledWith('dataset/team/file.png');
  });

  it('should keep data image unchanged regardless of base64 conversion flag', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;

    const result = await normalizeImageToBase64('data:image/png;base64,input');

    expect(result).toBe('data:image/png;base64,input');
    expect(mockGetImageBase64).not.toHaveBeenCalled();
  });
});

describe('isValidImageEmbeddingSource', () => {
  it('should accept model-readable image sources', () => {
    expect(isValidImageEmbeddingSource('data:image/png;base64,input')).toBe(true);
    expect(isValidImageEmbeddingSource('dataset/team/file.png')).toBe(true);
    expect(isValidImageEmbeddingSource('temp/team/file.png')).toBe(true);
    expect(isValidImageEmbeddingSource('chat/app/user/file.png')).toBe(true);
    expect(isValidImageEmbeddingSource('https://example.com/file.png')).toBe(true);
  });

  it('should reject empty or local non-url image sources', () => {
    expect(isValidImageEmbeddingSource('')).toBe(false);
    expect(isValidImageEmbeddingSource('/local/file.png')).toBe(false);
  });
});

describe('computeFilterIntersection', () => {
  it('should return undefined when every filter is absent', () => {
    expect(computeFilterIntersection([])).toBeUndefined();
    expect(computeFilterIntersection([undefined, undefined])).toBeUndefined();
  });

  it('should compute intersection while ignoring absent filters', () => {
    expect(
      computeFilterIntersection([['tag_1', 'tag_2', 'tag_3'], undefined, ['tag_2', 'tag_3']])
    ).toEqual(['tag_2', 'tag_3']);
  });

  it('should return empty array when active filters have no overlap', () => {
    expect(computeFilterIntersection([['tag_1', 'tag_2'], ['tag_3'], ['tag_4']])).toEqual([]);
  });
});

describe('datasetSearchQueryExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should treat combined text queries as one plain query string', async () => {
    mockQueryExtension.mockResolvedValue({
      rawQuery: 'first\nsecond',
      extensionQueries: ['first extension', 'second extension'],
      llmModel: 'mock-llm',
      embeddingModel: 'mock-embedding',
      requestId: 'req-1',
      seconds: 1,
      inputTokens: 10,
      outputTokens: 5,
      usedUserOpenAIKey: false,
      embeddingTokens: 6
    });

    const result = await datasetSearchQueryExtension({
      query: 'first\nsecond',
      llmModel: 'mock-llm',
      embeddingModel: 'mock-embedding',
      histories: []
    });

    expect(mockQueryExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'first\nsecond'
      })
    );
    expect(result.searchQueries).toEqual(['first\nsecond', 'first extension', 'second extension']);
    expect(result.reRankQuery).toBe('first\nsecond\nfirst extension\nsecond extension');
  });

  it('should not parse json-like query strings as pre-expanded query arrays', async () => {
    mockQueryExtension.mockResolvedValue({
      rawQuery: '["first","second"]',
      extensionQueries: ['first extension'],
      llmModel: 'mock-llm',
      embeddingModel: 'mock-embedding',
      requestId: 'req-1',
      seconds: 1,
      inputTokens: 10,
      outputTokens: 5,
      usedUserOpenAIKey: false,
      embeddingTokens: 6
    });

    const result = await datasetSearchQueryExtension({
      query: '["first","second"]',
      llmModel: 'mock-llm',
      embeddingModel: 'mock-embedding',
      histories: []
    });

    expect(mockQueryExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '["first","second"]'
      })
    );
    expect(result.searchQueries).toEqual(['["first","second"]', 'first extension']);
  });

  it('should ignore blank extension queries before recall', async () => {
    mockQueryExtension.mockResolvedValue({
      rawQuery: 'first',
      extensionQueries: ['  ', 'first extension', '\n'],
      llmModel: 'mock-llm',
      embeddingModel: 'mock-embedding',
      requestId: 'req-1',
      seconds: 1,
      inputTokens: 10,
      outputTokens: 5,
      usedUserOpenAIKey: false,
      embeddingTokens: 6
    });

    const result = await datasetSearchQueryExtension({
      query: 'first',
      llmModel: 'mock-llm',
      embeddingModel: 'mock-embedding',
      histories: []
    });

    expect(result.searchQueries).toEqual(['first', 'first extension']);
    expect(result.reRankQuery).toBe('first\nfirst extension');
  });

  it('should apply synonyms to recall queries without changing the rerank query', async () => {
    const teamId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const synonym = await MongoDatasetSynonym.create({
      teamId,
      datasetId,
      version: 1,
      enabled: true
    });
    await MongoDatasetSynonymMapping.create({
      logicalMappingId: new Types.ObjectId(),
      teamId,
      datasetId,
      synonymFileId: synonym._id,
      fileVersion: 1,
      standardizedTerm: '退款',
      normalizedStandardizedTerm: '退款',
      synonymTerms: ['退钱'],
      normalizedSynonymTerms: ['退钱'],
      allTerms: '退款 退钱',
      fingerprint: 'refund'
    });

    const result = await datasetSearchQueryExtension({
      query: '怎么退钱',
      teamId: String(teamId),
      datasetIds: [String(datasetId)]
    });

    expect(result.searchQueries).toEqual(['怎么退钱 退款']);
    expect(result.reRankQuery).toBe('怎么退钱');
  });
});
