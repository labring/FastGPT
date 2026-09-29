import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseApiInput: vi.fn(),
  authDatasetCollection: vi.fn(),
  checkDatasetIndexLimit: vi.fn(),
  getModelHandle: vi.fn(),
  getTrainingModeByCollection: vi.fn(),
  getDatasetImageIndexCapability: vi.fn(),
  pushDataListToTrainingQueue: vi.fn(),
  createTrainingUsage: vi.fn(),
  mongoSessionRun: vi.fn((fn: any) => fn({}))
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/common/zod/requestParseError', () => ({
  parseApiInput: mocks.parseApiInput
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: mocks.authDatasetCollection
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: mocks.checkDatasetIndexLimit
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: mocks.getModelHandle
}));

vi.mock('@fastgpt/service/core/dataset/collection/utils', () => ({
  getTrainingModeByCollection: mocks.getTrainingModeByCollection
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  getDatasetImageIndexCapability: mocks.getDatasetImageIndexCapability,
  predictDataLimitLength: () => 1
}));

vi.mock('@fastgpt/service/core/dataset/training/controller', () => ({
  pushDataListToTrainingQueue: mocks.pushDataListToTrainingQueue
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createTrainingUsage: mocks.createTrainingUsage
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.mongoSessionRun
}));

import handler from '@/pages/api/core/dataset/data/pushData';

describe('pushData imageId authorization', () => {
  const datasetId = '507f1f77bcf86cd799439011';
  const collectionId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authDatasetCollection.mockResolvedValue({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      collection: {
        _id: collectionId,
        datasetId,
        name: 'test-coll',
        dataset: { _id: datasetId }
      }
    });
    mocks.getModelHandle.mockResolvedValue({
      getEmbeddingModelData: vi.fn(() => ({ modelId: 'vec-model' })),
      getLLMModelData: vi.fn(() => ({ modelId: 'agent-model' })),
      getVlmModelData: vi.fn()
    });
    mocks.getDatasetImageIndexCapability.mockReturnValue({
      supportImageIndex: false
    });
    mocks.getTrainingModeByCollection.mockReturnValue('chunk');
    mocks.createTrainingUsage.mockResolvedValue({ usageId: 'usage-1' });
    mocks.pushDataListToTrainingQueue.mockResolvedValue({ insertLen: 1 });
  });

  it('accepts data with valid imageId belonging to collection dataset', async () => {
    mocks.parseApiInput.mockReturnValue({
      body: {
        collectionId,
        data: [{ q: 'q', a: 'a', imageId: `dataset/${datasetId}/valid.png` }]
      }
    });

    const res = await (handler as any)({} as any);
    expect(res).toEqual({ insertLen: 1 });
    expect(mocks.pushDataListToTrainingQueue).toHaveBeenCalled();
  });

  it('rejects data with imageId belonging to another dataset', async () => {
    mocks.parseApiInput.mockReturnValue({
      body: {
        collectionId,
        data: [{ q: 'q', a: 'a', imageId: 'dataset/507f1f77bcf86cd799439099/foreign.png' }]
      }
    });

    await expect((handler as any)({} as any)).rejects.toBe('Invalid dataset file key');
    expect(mocks.pushDataListToTrainingQueue).not.toHaveBeenCalled();
  });
});
