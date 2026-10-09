import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

const mocks = vi.hoisted(() => ({
  parseApiInput: vi.fn(),
  authDatasetCollection: vi.fn(),
  checkDatasetIndexLimit: vi.fn(),
  getSystemModelHandle: vi.fn(),
  getTeamModelHandle: vi.fn(),
  getTrainingModeByCollection: vi.fn(),
  getDatasetImageIndexCapability: vi.fn(),
  pushDataListToTrainingQueue: vi.fn(),
  preCreateDatasetDataAndPushToTrainingQueue: vi.fn(),
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
  getSystemModelHandle: mocks.getSystemModelHandle,
  getTeamModelHandle: mocks.getSystemModelHandle
}));

vi.mock('@fastgpt/service/core/dataset/collection/utils', () => ({
  getTrainingModeByCollection: mocks.getTrainingModeByCollection
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  getDatasetImageIndexCapability: mocks.getDatasetImageIndexCapability,
  predictDataLimitLength: () => 1
}));

vi.mock('@fastgpt/service/core/dataset/training/controller', () => ({
  pushDataListToTrainingQueue: mocks.pushDataListToTrainingQueue,
  preCreateDatasetDataAndPushToTrainingQueue: mocks.preCreateDatasetDataAndPushToTrainingQueue
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
    mocks.getSystemModelHandle.mockResolvedValue({
      getEmbeddingModelData: vi.fn(() => ({ modelId: 'vec-model' })),
      getLLMModelData: vi.fn(() => ({ modelId: 'agent-model' })),
      getVlmModelData: vi.fn()
    });
    mocks.getDatasetImageIndexCapability.mockReturnValue({
      supportImageIndex: false
    });
    mocks.getTrainingModeByCollection.mockReturnValue('index');
    mocks.createTrainingUsage.mockResolvedValue({ usageId: 'usage-1' });
    mocks.pushDataListToTrainingQueue.mockResolvedValue({
      insertLen: 1,
      dataIds: ['507f1f77bcf86cd799439031']
    });
    mocks.preCreateDatasetDataAndPushToTrainingQueue.mockResolvedValue({
      insertLen: 1,
      dataIds: ['507f1f77bcf86cd799439031']
    });
  });

  it('accepts data with valid imageId belonging to collection dataset', async () => {
    mocks.parseApiInput.mockReturnValue({
      body: {
        collectionId,
        data: [{ q: 'q', a: 'a', imageId: `dataset/${datasetId}/valid.png` }]
      }
    });

    const res = await (handler as any)({} as any);
    expect(res).toEqual({ insertLen: 1, dataIds: ['507f1f77bcf86cd799439031'] });
    expect(mocks.preCreateDatasetDataAndPushToTrainingQueue).toHaveBeenCalled();
  });

  it('accepts data without imageId', async () => {
    mocks.parseApiInput.mockReturnValue({
      body: {
        collectionId,
        data: [{ q: 'q', a: 'a' }]
      }
    });

    const res = await (handler as any)({} as any);
    expect(res).toEqual({ insertLen: 1, dataIds: ['507f1f77bcf86cd799439031'] });
    expect(mocks.preCreateDatasetDataAndPushToTrainingQueue).toHaveBeenCalled();
  });

  it('rejects data with imageId belonging to another dataset', async () => {
    mocks.parseApiInput.mockReturnValue({
      body: {
        collectionId,
        data: [{ q: 'q', a: 'a', imageId: 'dataset/507f1f77bcf86cd799439099/foreign.png' }]
      }
    });

    await expect((handler as any)({} as any)).rejects.toBe(CommonErrEnum.unAuthFileKey);
    expect(mocks.pushDataListToTrainingQueue).not.toHaveBeenCalled();
    expect(mocks.preCreateDatasetDataAndPushToTrainingQueue).not.toHaveBeenCalled();
  });

  it.each([
    ['temp key', 'temp/team-a/file.png'],
    ['chat key', 'chat/team-a/chat-a/file.png'],
    ['external URL', 'https://example.com/file.png'],
    ['empty key', '']
  ])('rejects data with %s as imageId', async (_label, imageId) => {
    mocks.parseApiInput.mockReturnValue({
      body: {
        collectionId,
        data: [{ q: 'q', a: 'a', imageId }]
      }
    });

    await expect((handler as any)({} as any)).rejects.toBe(CommonErrEnum.unAuthFileKey);
    expect(mocks.pushDataListToTrainingQueue).not.toHaveBeenCalled();
    expect(mocks.preCreateDatasetDataAndPushToTrainingQueue).not.toHaveBeenCalled();
  });

  it('routes to pushDataListToTrainingQueue when collection mode is qa', async () => {
    mocks.getTrainingModeByCollection.mockReturnValue('qa');
    mocks.parseApiInput.mockReturnValue({
      body: {
        collectionId,
        data: [{ q: 'q', a: 'a' }]
      }
    });

    const res = await (handler as any)({} as any);
    expect(res).toEqual({ insertLen: 1, dataIds: ['507f1f77bcf86cd799439031'] });
    expect(mocks.pushDataListToTrainingQueue).toHaveBeenCalled();
    expect(mocks.preCreateDatasetDataAndPushToTrainingQueue).not.toHaveBeenCalled();
  });
});
