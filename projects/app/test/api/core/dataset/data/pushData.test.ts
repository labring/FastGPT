import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  uploadImage2S3Bucket: vi.fn(),
  mongoSessionRun: vi.fn((fn: any) => fn({}))
}));

vi.mock('@fastgpt/service/common/s3/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/s3/utils')>()),
  uploadImage2S3Bucket: mocks.uploadImage2S3Bucket
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

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
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
    mocks.uploadImage2S3Bucket.mockImplementation(async (_bucket, { uploadKey }) => uploadKey);
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
      getModelData: vi.fn(
        (_ref: unknown, options?: { type?: string; vision?: boolean; optional?: boolean }) => {
          if (options?.vision) return undefined;
          if (options?.type === 'embedding') return { modelId: 'vec-model' };
          return { modelId: 'agent-model' };
        }
      )
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

  it.each(['index', 'qa'])('normalizes inline images before %s training', async (mode) => {
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1kAAAAASUVORK5CYII=';
    const data = [
      { q: `question ![pixel](${image})`, a: `answer ![pixel](${image})`, chunkIndex: 7 }
    ];
    mocks.getTrainingModeByCollection.mockReturnValue(mode);
    mocks.parseApiInput.mockReturnValue({ body: { collectionId, data } });

    await (handler as any)({});

    const queue =
      mode === 'qa'
        ? mocks.pushDataListToTrainingQueue
        : mocks.preCreateDatasetDataAndPushToTrainingQueue;
    const queuedData = queue.mock.calls[0][0].data;
    expect(queuedData).toHaveLength(1);
    expect(queuedData[0].chunkIndex).toBe(7);
    expect(queuedData[0].q).not.toContain('base64,');
    expect(queuedData[0].a).not.toContain('base64,');
    expect(queuedData[0].q).toContain(`dataset/${datasetId}/`);
    expect(mocks.uploadImage2S3Bucket).toHaveBeenCalledTimes(1);
    expect(data[0].q).toContain('base64,');
  });

  it('does not upload images before authorization and quota checks pass', async () => {
    mocks.parseApiInput.mockReturnValue({ body: { collectionId, data: [{ q: 'q' }] } });
    mocks.authDatasetCollection.mockRejectedValueOnce(new Error('unauthorized'));
    await expect((handler as any)({})).rejects.toThrow('unauthorized');
    expect(mocks.uploadImage2S3Bucket).not.toHaveBeenCalled();

    mocks.checkDatasetIndexLimit.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect((handler as any)({})).rejects.toThrow('quota exceeded');
    expect(mocks.uploadImage2S3Bucket).not.toHaveBeenCalled();
  });

  it('reuses converted data when the training transaction is retried', async () => {
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1kAAAAASUVORK5CYII=';
    mocks.parseApiInput.mockReturnValue({
      body: { collectionId, data: [{ q: `q ![pixel](${image})` }] }
    });
    mocks.mongoSessionRun.mockImplementationOnce(async (fn) => {
      await fn({});
      return fn({});
    });
    await (handler as any)({});
    expect(mocks.preCreateDatasetDataAndPushToTrainingQueue).toHaveBeenCalledTimes(2);
    expect(mocks.uploadImage2S3Bucket).toHaveBeenCalledTimes(1);
    const calls = mocks.preCreateDatasetDataAndPushToTrainingQueue.mock.calls;
    expect(calls[0][0].data).toEqual(calls[1][0].data);
  });

  it('does not create training usage or queue entries when image upload fails', async () => {
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1kAAAAASUVORK5CYII=';
    mocks.parseApiInput.mockReturnValue({
      body: { collectionId, data: [{ q: `q ![pixel](${image})` }] }
    });
    mocks.uploadImage2S3Bucket.mockRejectedValueOnce(new Error('upload failed'));
    await expect((handler as any)({})).rejects.toThrow('upload failed');
    expect(mocks.createTrainingUsage).not.toHaveBeenCalled();
    expect(mocks.preCreateDatasetDataAndPushToTrainingQueue).not.toHaveBeenCalled();
    expect(mocks.pushDataListToTrainingQueue).not.toHaveBeenCalled();
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
