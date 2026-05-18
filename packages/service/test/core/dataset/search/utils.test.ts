import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';

const mockQueryExtension = vi.hoisted(() => vi.fn());
const mockGetImageBase64 = vi.hoisted(() => vi.fn());
const mockCreateExternalUrl = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/ai/functions/queryExtension', () => ({
  queryExtension: mockQueryExtension
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBase64: mockGetImageBase64
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    createExternalUrl: mockCreateExternalUrl
  })
}));

import {
  computeFilterIntersection,
  datasetSearchQueryExtension,
  normalizeImageToBase64
} from '../../../../core/dataset/search/utils';

const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;

afterEach(() => {
  serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
});

describe('normalizeImageToBase64', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
  });

  it('should keep image url unchanged when base64 conversion is disabled', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;

    const result = await normalizeImageToBase64('https://example.com/image.png');

    expect(result).toBe('https://example.com/image.png');
    expect(mockGetImageBase64).not.toHaveBeenCalled();
    expect(mockCreateExternalUrl).not.toHaveBeenCalled();
  });

  it('should convert internal object keys to temporary access url when base64 conversion is disabled', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;
    mockCreateExternalUrl.mockResolvedValue({
      url: 'https://file.fastgpt.io/file.png?token=mock'
    });

    const keys = ['dataset/team/file.png', 'temp/team/file.png', 'chat/app/user/chat/file.png'];

    await expect(Promise.all(keys.map((key) => normalizeImageToBase64(key)))).resolves.toEqual([
      'https://file.fastgpt.io/file.png?token=mock',
      'https://file.fastgpt.io/file.png?token=mock',
      'https://file.fastgpt.io/file.png?token=mock'
    ]);
    for (const key of keys) {
      expect(mockCreateExternalUrl).toHaveBeenCalledWith({
        key,
        expiredHours: 1
      });
    }
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
    expect(mockCreateExternalUrl).not.toHaveBeenCalled();
  });

  it('should convert object key to temporary access url when base64 conversion is enabled', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
    mockCreateExternalUrl.mockResolvedValue({
      url: 'https://file.fastgpt.io/dataset/team/file.png?token=mock'
    });

    const result = await normalizeImageToBase64('dataset/team/file.png');

    expect(result).toBe('https://file.fastgpt.io/dataset/team/file.png?token=mock');
    expect(mockCreateExternalUrl).toHaveBeenCalledWith({
      key: 'dataset/team/file.png',
      expiredHours: 1
    });
    expect(mockGetImageBase64).not.toHaveBeenCalled();
  });

  it('should keep data image unchanged regardless of base64 conversion flag', async () => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;

    const result = await normalizeImageToBase64('data:image/png;base64,input');

    expect(result).toBe('data:image/png;base64,input');
    expect(mockGetImageBase64).not.toHaveBeenCalled();
    expect(mockCreateExternalUrl).not.toHaveBeenCalled();
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
});
