import type { ApiRequestProps } from '@fastgpt/next/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authDataset: vi.fn(),
  getDatasetSyncDatasetStatus: vi.fn(),
  getEmbeddingModel: vi.fn(),
  getLLMModel: vi.fn(),
  getVlmModel: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mocks.authDataset
}));

vi.mock('@fastgpt/service/core/dataset/datasetSync', () => ({
  getDatasetSyncDatasetStatus: mocks.getDatasetSyncDatasetStatus
}));

vi.mock('@fastgpt/service/core/ai/model/cache', () => ({
  getEmbeddingModel: mocks.getEmbeddingModel,
  getLLMModel: mocks.getLLMModel,
  getVlmModel: mocks.getVlmModel
}));

vi.mock('@fastgpt/global/core/dataset/apiDataset/utils', () => ({
  filterApiDatasetServerPublicData: (value: unknown) => value
}));

import handler from '@/pages/api/core/dataset/detail';

const datasetId = '507f1f77bcf86cd799439011';
const detailHandler = handler as unknown as (req: ApiRequestProps) => Promise<unknown>;

const callHandler = () =>
  detailHandler({
    query: { id: datasetId }
  } as unknown as ApiRequestProps);

describe('dataset detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatasetSyncDatasetStatus.mockResolvedValue({
      status: 'active',
      errorMsg: undefined
    });
  });

  it('keeps unresolved model references empty instead of applying defaults', async () => {
    mocks.authDataset.mockResolvedValue({
      dataset: {
        _id: datasetId,
        vectorModelId: '507f1f77bcf86cd799439012',
        agentModelId: '507f1f77bcf86cd799439013',
        vlmModelId: '507f1f77bcf86cd799439014'
      },
      permission: { hasReadPer: true }
    });
    mocks.getEmbeddingModel.mockReturnValue(undefined);
    mocks.getLLMModel.mockReturnValue(undefined);
    mocks.getVlmModel.mockReturnValue(undefined);

    await expect(callHandler()).resolves.toEqual(
      expect.objectContaining({
        vectorModel: undefined,
        agentModel: undefined,
        vlmModel: undefined
      })
    );

    expect(mocks.getEmbeddingModel).toHaveBeenCalledWith('507f1f77bcf86cd799439012');
    expect(mocks.getLLMModel).toHaveBeenCalledWith('507f1f77bcf86cd799439013');
    expect(mocks.getVlmModel).toHaveBeenCalledWith('507f1f77bcf86cd799439014');
  });

  it('returns resolved models and skips VLM lookup when no VLM is configured', async () => {
    const vectorModel = { id: 'embedding-model' };
    const agentModel = { id: 'llm-model' };
    mocks.authDataset.mockResolvedValue({
      dataset: {
        _id: datasetId,
        vectorModelId: vectorModel.id,
        agentModelId: agentModel.id,
        vlmModelId: ''
      },
      permission: { hasReadPer: true }
    });
    mocks.getEmbeddingModel.mockReturnValue(vectorModel);
    mocks.getLLMModel.mockReturnValue(agentModel);

    await expect(callHandler()).resolves.toEqual(
      expect.objectContaining({
        vectorModel,
        agentModel,
        vlmModel: undefined
      })
    );

    expect(mocks.getVlmModel).not.toHaveBeenCalled();
  });
});
