import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authDatasetFileKey: vi.fn(),
  authDataset: vi.fn(),
  readDatasetSourceRawText: vi.fn(),
  rawText2Chunks: vi.fn(),
  replaceS3KeyToPreviewUrl: vi.fn((value: string) => value)
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/file', () => ({
  authDatasetFileKey: mocks.authDatasetFileKey
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mocks.authDataset
}));

vi.mock('@fastgpt/service/core/dataset/read', () => ({
  readDatasetSourceRawText: mocks.readDatasetSourceRawText,
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
  getLLMMaxChunkSize: vi.fn(() => 1000)
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  replaceS3KeyToPreviewUrl: mocks.replaceS3KeyToPreviewUrl
}));

import handler from '@/pages/api/core/dataset/file/getPreviewChunks';

const datasetId = '507f1f77bcf86cd799439011';
const previewHandler = handler as unknown as (req: ApiRequestProps) => Promise<unknown>;

const callHandler = (body: Record<string, unknown>) =>
  previewHandler({
    body
  } as ApiRequestProps);

describe('getPreviewChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authDatasetFileKey.mockResolvedValue({
      tmbId: 'tmb-a',
      isRoot: false
    });
    mocks.authDataset.mockResolvedValue({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      dataset: {
        agentModel: 'gpt',
        vectorModel: 'embedding'
      }
    });
    mocks.readDatasetSourceRawText.mockResolvedValue({
      rawText: 'hello'
    });
    mocks.rawText2Chunks.mockResolvedValue([
      {
        q: 'hello',
        a: ''
      }
    ]);
  });

  it('rejects a local file key that is not under the target dataset before auth or read', async () => {
    await expect(
      callHandler({
        type: DatasetSourceReadTypeEnum.fileLocal,
        datasetId,
        overlapRatio: 0.2,
        sourceId: 'dataset/507f1f77bcf86cd799439099/secret.pdf'
      })
    ).rejects.toBe(CommonErrEnum.unAuthFile);

    expect(mocks.authDatasetFileKey).not.toHaveBeenCalled();
    expect(mocks.authDataset).not.toHaveBeenCalled();
    expect(mocks.readDatasetSourceRawText).not.toHaveBeenCalled();
  });

  it('previews a local file key under the target dataset', async () => {
    await expect(
      callHandler({
        type: DatasetSourceReadTypeEnum.fileLocal,
        datasetId,
        overlapRatio: 0.2,
        sourceId: `dataset/${datasetId}/demo.pdf`
      })
    ).resolves.toMatchObject({
      total: 1
    });

    expect(mocks.authDatasetFileKey).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: `dataset/${datasetId}/demo.pdf`
      })
    );
    expect(mocks.readDatasetSourceRawText).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId,
        sourceId: `dataset/${datasetId}/demo.pdf`
      })
    );
  });
});
