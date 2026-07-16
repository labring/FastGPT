import type { ApiRequestProps } from '@fastgpt/next/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authDataset: vi.fn(),
  rawText2Chunks: vi.fn(),
  replaceS3KeyToPreviewUrl: vi.fn((value: string) => value)
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mocks.authDataset
}));

vi.mock('@fastgpt/service/core/dataset/read', () => ({
  rawText2Chunks: mocks.rawText2Chunks
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModel: vi.fn(() => ({})),
  getLLMModel: vi.fn(() => ({}))
}));

vi.mock('@fastgpt/global/core/dataset/training/utils', () => ({
  computedCollectionChunkSettings: vi.fn(() => ({
    chunkTriggerType: 'minSize',
    chunkTriggerMinSize: 100,
    chunkSize: 500,
    paragraphChunkDeep: 1,
    paragraphChunkMinSize: 100,
    chunkSplitter: ''
  })),
  getLLMMaxChunkSize: vi.fn(() => 1000),
  minChunkSize: 64,
  maxPreviewChunkCount: 50_000
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  replaceS3KeyToPreviewUrl: mocks.replaceS3KeyToPreviewUrl
}));

import handler from '@/pages/api/core/dataset/file/getRawTextPreviewChunks';

const datasetId = '507f1f77bcf86cd799439011';
const previewHandler = handler as unknown as (req: ApiRequestProps) => Promise<unknown>;

const callHandler = (body: Record<string, unknown>) =>
  previewHandler({
    body
  } as ApiRequestProps);

describe('getRawTextPreviewChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authDataset.mockResolvedValue({
      dataset: {
        agentModel: 'gpt',
        vectorModel: 'embedding'
      }
    });
    mocks.rawText2Chunks.mockResolvedValue([
      {
        q: 'hello',
        a: ''
      }
    ]);
  });

  it('previews frontend raw text through backend chunking', async () => {
    await expect(
      callHandler({
        datasetId,
        rawText: 'hello world',
        overlapRatio: 0.2,
        chunkSize: 500,
        chunkSplitter: ''
      })
    ).resolves.toEqual({
      chunks: [
        {
          q: 'hello',
          a: ''
        }
      ],
      total: 1
    });

    expect(mocks.authDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId
      })
    );
    expect(mocks.rawText2Chunks).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: 'hello world',
        chunkSize: 500,
        overlapRatio: 0.2,
        maxChunks: 50_000
      })
    );
  });

  it('stops before chunking when dataset write permission is denied', async () => {
    mocks.authDataset.mockRejectedValueOnce(new Error('forbidden'));

    await expect(
      callHandler({
        datasetId,
        rawText: 'hello world',
        overlapRatio: 0.2,
        chunkSize: 500
      })
    ).rejects.toThrow('forbidden');

    expect(mocks.rawText2Chunks).not.toHaveBeenCalled();
  });

  it.each(['|', 'prefix|', '|suffix', 'prefix||suffix'])(
    'rejects empty custom chunk separators: %s',
    async (chunkSplitter) => {
      await expect(
        callHandler({
          datasetId,
          rawText: 'hello world',
          overlapRatio: 0.2,
          chunkSize: 500,
          chunkSplitter
        })
      ).rejects.toBeDefined();

      expect(mocks.authDataset).not.toHaveBeenCalled();
      expect(mocks.rawText2Chunks).not.toHaveBeenCalled();
    }
  );

  it.each([
    { overlapRatio: -0.1, chunkSize: 500 },
    { overlapRatio: 0.41, chunkSize: 500 },
    { overlapRatio: 1, chunkSize: 500 },
    { overlapRatio: 0.2, chunkSize: 63 },
    { overlapRatio: 0.2, chunkSize: 64.5 }
  ])('rejects unsafe numeric chunk settings: %o', async (settings) => {
    await expect(
      callHandler({
        datasetId,
        rawText: 'hello world',
        ...settings
      })
    ).rejects.toBeDefined();

    expect(mocks.authDataset).not.toHaveBeenCalled();
    expect(mocks.rawText2Chunks).not.toHaveBeenCalled();
  });
});
