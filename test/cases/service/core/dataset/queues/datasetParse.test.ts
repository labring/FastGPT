import { describe, it, expect, vi, beforeEach } from 'vitest';
import { datasetParseQueue, requestLLMPargraph } from '@/service/core/dataset/queues/datasetParse';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { ParagraphChunkAIModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { checkTeamAiPointsAndLock } from '@/service/core/dataset/queues/utils';
import {
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum
} from '@fastgpt/global/core/dataset/constants';

// Patch: partial mock with importOriginal to avoid missing export error
vi.mock('@fastgpt/service/core/dataset/collection/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/collection/schema')>();
  return {
    ...actual,
    MongoDatasetCollection: {
      updateOne: vi.fn()
    }
  };
});

vi.mock('@fastgpt/service/core/dataset/training/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/training/schema')>();
  return {
    ...actual,
    MongoDatasetTraining: {
      findOneAndUpdate: vi.fn(),
      updateOne: vi.fn(),
      deleteOne: vi.fn()
    }
  };
});

vi.mock('@fastgpt/service/common/file/image/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/file/image/schema')>();
  return {
    ...actual,
    MongoImage: {
      updateMany: vi.fn()
    }
  };
});

vi.mock('@fastgpt/service/common/api/plusRequest');
vi.mock('@fastgpt/service/support/wallet/usage/controller');
vi.mock('@fastgpt/service/core/dataset/read');
vi.mock('@fastgpt/service/core/dataset/training/controller');
vi.mock('@/service/core/dataset/queues/utils');

// Patch: Mock checkDatasetIndexLimit directly at import time
vi.mock('@fastgpt/service/support/permission/teamLimit', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/teamLimit')>();
  return {
    ...actual,
    checkDatasetIndexLimit: vi.fn()
  };
});

describe('requestLLMPargraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.feConfigs = { isPlus: true };
  });

  it('should return original text when not plus mode', async () => {
    global.feConfigs = { isPlus: false };
    const result = await requestLLMPargraph({
      rawText: 'test text',
      model: 'gpt-3.5',
      billId: 'bill123',
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.force
    });

    expect(result).toEqual({
      resultText: 'test text',
      totalInputTokens: 0,
      totalOutputTokens: 0
    });
  });

  it('should return original text when paragraphChunkAIMode is forbid', async () => {
    const result = await requestLLMPargraph({
      rawText: 'test text',
      model: 'gpt-3.5',
      billId: 'bill123',
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.forbid
    });

    expect(result).toEqual({
      resultText: 'test text',
      totalInputTokens: 0,
      totalOutputTokens: 0
    });
  });

  it('should return original text when auto mode and markdown text', async () => {
    const result = await requestLLMPargraph({
      rawText: '# Title\nContent',
      model: 'gpt-3.5',
      billId: 'bill123',
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.auto
    });

    expect(result).toEqual({
      resultText: '# Title\nContent',
      totalInputTokens: 0,
      totalOutputTokens: 0
    });
  });

  it('should call API when force mode', async () => {
    const mockResponse = {
      resultText: 'processed text',
      totalInputTokens: 10,
      totalOutputTokens: 5
    };

    vi.mocked(POST).mockResolvedValue(mockResponse);

    const result = await requestLLMPargraph({
      rawText: 'test text',
      model: 'gpt-3.5',
      billId: 'bill123',
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.force
    });

    expect(POST).toHaveBeenCalledWith('/core/dataset/training/llmPargraph', {
      rawText: 'test text',
      model: 'gpt-3.5',
      billId: 'bill123'
    });

    expect(result).toEqual(mockResponse);
  });
});

describe('datasetParseQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle no tasks available', async () => {
    // Ensure .select is present to avoid TypeError
    const fakeFindOneAndUpdate = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnValue(null)
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValue(fakeFindOneAndUpdate as any);

    // Make sure .lean() returns null to simulate no tasks
    fakeFindOneAndUpdate.populate.mockReturnValue({ lean: () => null });

    const result = await datasetParseQueue();

    expect(result).toBeUndefined();
  });

  it('should handle team points check failure', async () => {
    const mockTraining = {
      teamId: 'team123',
      dataset: {},
      collection: {},
      lean: () => mockTraining
    };

    const fakeFindOneAndUpdate = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnValue({ lean: () => mockTraining })
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValue(fakeFindOneAndUpdate as any);
    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValue(false);

    const result = await datasetParseQueue();

    expect(result).toBeUndefined();
    expect(checkTeamAiPointsAndLock).toHaveBeenCalledWith('team123');
  });

  it('should process file type collection successfully and remove image ttl', async () => {
    const mockTraining = {
      _id: 'training123',
      teamId: 'team123',
      tmbId: 'tmb123',
      datasetId: 'dataset123',
      collectionId: 'collection123',
      billId: 'bill123',
      collection: {
        _id: 'collection123',
        teamId: 'team123',
        type: DatasetCollectionTypeEnum.file,
        fileId: 'file123',
        metadata: {
          relatedImgId: 'img123'
        },
        trainingType: 'chunk',
        paragraphChunkAIMode: ParagraphChunkAIModeEnum.auto,
        chunkTriggerType: 'type1',
        chunkTriggerMinSize: 10,
        chunkSize: 100,
        paragraphChunkDeep: 1,
        paragraphChunkMinSize: 5,
        chunkSplitter: undefined,
        customPdfParse: undefined,
        indexSize: 1,
        qaPrompt: 'prompt'
      },
      dataset: {
        _id: 'dataset123',
        agentModel: 'gpt-3.5',
        vectorModel: 'vector-model',
        vlmModel: 'vlm-model'
      },
      lean: () => mockTraining
    };

    const fakeFindOneAndUpdate = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnValue({ lean: () => mockTraining })
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValue(fakeFindOneAndUpdate as any);

    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValue(true);
    vi.mocked(readDatasetSourceRawText).mockResolvedValue({
      title: 'Test Title',
      rawText: 'Test content'
    });

    vi.mocked(POST).mockResolvedValue({
      resultText: 'Processed content',
      totalInputTokens: 10,
      totalOutputTokens: 5
    });

    // mock rawText2Chunks to return something
    const { rawText2Chunks } = await import('@fastgpt/service/core/dataset/read');
    (rawText2Chunks as unknown as { mockResolvedValue: any }).mockResolvedValue([
      { indexes: ['abc'] }
    ]);

    // mock checkDatasetIndexLimit to resolve
    const { checkDatasetIndexLimit } = await import(
      '@fastgpt/service/support/permission/teamLimit'
    );
    vi.mocked(checkDatasetIndexLimit).mockResolvedValue(undefined);

    vi.mocked(pushDataListToTrainingQueue).mockResolvedValue(undefined);

    await datasetParseQueue();

    expect(MongoDatasetCollection.updateOne).toHaveBeenCalledWith(
      { _id: 'collection123' },
      expect.objectContaining({
        name: 'Test Title'
      }),
      expect.any(Object)
    );

    expect(MongoImage.updateMany).toHaveBeenCalledWith(
      {
        teamId: 'team123',
        'metadata.relatedId': 'img123'
      },
      {
        $unset: { expiredTime: 1 }
      },
      expect.any(Object)
    );
  });

  it('should handle errors during processing', async () => {
    const mockTraining = {
      _id: 'training123',
      teamId: 'team123',
      tmbId: 'tmb123',
      datasetId: 'dataset123',
      collectionId: 'collection123',
      billId: 'bill123',
      dataset: {
        _id: 'dataset123',
        agentModel: 'gpt-3.5',
        vectorModel: 'vector-model',
        vlmModel: 'vlm-model'
      },
      collection: {
        _id: 'collection123',
        teamId: 'team123',
        type: DatasetCollectionTypeEnum.file,
        fileId: 'file123',
        metadata: {},
        trainingType: 'chunk',
        paragraphChunkAIMode: ParagraphChunkAIModeEnum.auto,
        chunkTriggerType: 'type1',
        chunkTriggerMinSize: 10,
        chunkSize: 100,
        paragraphChunkDeep: 1,
        paragraphChunkMinSize: 5,
        chunkSplitter: undefined,
        customPdfParse: undefined,
        indexSize: 1,
        qaPrompt: 'prompt'
      },
      lean: () => mockTraining
    };

    let called = false;
    const fakeFindOneAndUpdate = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockImplementation(() => {
        if (!called) {
          called = true;
          return { lean: () => mockTraining };
        }
        return { lean: () => null };
      })
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValue(fakeFindOneAndUpdate as any);

    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValue(true);

    // readDatasetSourceRawText throws
    vi.mocked(readDatasetSourceRawText).mockRejectedValue(new Error('Processing failed'));

    await datasetParseQueue();

    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      { _id: 'training123' },
      {
        errorMsg: 'Processing failed',
        lockTime: expect.any(Date)
      }
    );
  });

  it('should not call MongoImage.updateMany if relatedImgId is not present', async () => {
    const mockTraining = {
      _id: 'training456',
      teamId: 'team456',
      tmbId: 'tmb456',
      datasetId: 'dataset456',
      collectionId: 'collection456',
      billId: 'bill456',
      collection: {
        _id: 'collection456',
        teamId: 'team456',
        type: DatasetCollectionTypeEnum.file,
        fileId: 'file456',
        metadata: {},
        trainingType: 'chunk',
        paragraphChunkAIMode: ParagraphChunkAIModeEnum.auto,
        chunkTriggerType: 'type1',
        chunkTriggerMinSize: 10,
        chunkSize: 100,
        paragraphChunkDeep: 1,
        paragraphChunkMinSize: 5,
        chunkSplitter: undefined,
        customPdfParse: undefined,
        indexSize: 1,
        qaPrompt: 'prompt'
      },
      dataset: {
        _id: 'dataset456',
        agentModel: 'gpt-3.5',
        vectorModel: 'vector-model',
        vlmModel: 'vlm-model'
      },
      lean: () => mockTraining
    };

    const fakeFindOneAndUpdate = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnValue({ lean: () => mockTraining })
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValue(fakeFindOneAndUpdate as any);

    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValue(true);
    vi.mocked(readDatasetSourceRawText).mockResolvedValue({
      title: 'Test Title',
      rawText: 'Test content'
    });

    vi.mocked(POST).mockResolvedValue({
      resultText: 'Processed content',
      totalInputTokens: 10,
      totalOutputTokens: 5
    });

    // mock rawText2Chunks to return something
    const { rawText2Chunks } = await import('@fastgpt/service/core/dataset/read');
    (rawText2Chunks as unknown as { mockResolvedValue: any }).mockResolvedValue([
      { indexes: ['abc'] }
    ]);

    // mock checkDatasetIndexLimit to resolve
    const { checkDatasetIndexLimit } = await import(
      '@fastgpt/service/support/permission/teamLimit'
    );
    vi.mocked(checkDatasetIndexLimit).mockResolvedValue(undefined);

    vi.mocked(pushDataListToTrainingQueue).mockResolvedValue(undefined);

    await datasetParseQueue();

    expect(MongoImage.updateMany).not.toHaveBeenCalled();
  });

  it('should delete task if dataset or collection is missing', async () => {
    const mockTraining = {
      _id: 'training789',
      teamId: 'team789',
      dataset: null,
      collection: null,
      lean: () => mockTraining
    };

    const fakeFindOneAndUpdate = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnValue({ lean: () => mockTraining })
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValue(fakeFindOneAndUpdate as any);

    await datasetParseQueue();

    expect(MongoDatasetTraining.deleteOne).toHaveBeenCalledWith({ _id: 'training789' });
  });

  it('should delete task if sourceReadType is null', async () => {
    const mockTraining = {
      _id: 'training111',
      teamId: 'team111',
      tmbId: 'tmb111',
      datasetId: 'dataset111',
      collectionId: 'collection111',
      billId: 'bill111',
      collection: {
        _id: 'collection111',
        teamId: 'team111',
        type: 'unknown-type',
        metadata: {},
        trainingType: 'chunk',
        paragraphChunkAIMode: ParagraphChunkAIModeEnum.auto,
        chunkTriggerType: 'type1',
        chunkTriggerMinSize: 10,
        chunkSize: 100,
        paragraphChunkDeep: 1,
        paragraphChunkMinSize: 5,
        chunkSplitter: undefined,
        customPdfParse: undefined,
        indexSize: 1,
        qaPrompt: 'prompt'
      },
      dataset: {
        _id: 'dataset111',
        agentModel: 'gpt-3.5',
        vectorModel: 'vector-model',
        vlmModel: 'vlm-model'
      },
      lean: () => mockTraining
    };

    const fakeFindOneAndUpdate = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnValue({ lean: () => mockTraining })
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValue(fakeFindOneAndUpdate as any);

    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValue(true);

    await datasetParseQueue();

    expect(MongoDatasetTraining.deleteOne).toHaveBeenCalledWith({ _id: 'training111' });
  });

  it('should lock task if checkDatasetIndexLimit throws', async () => {
    const mockTraining = {
      _id: 'training222',
      teamId: 'team222',
      tmbId: 'tmb222',
      datasetId: 'dataset222',
      collectionId: 'collection222',
      billId: 'bill222',
      collection: {
        _id: 'collection222',
        teamId: 'team222',
        type: DatasetCollectionTypeEnum.file,
        fileId: 'file222',
        metadata: {},
        trainingType: 'chunk',
        paragraphChunkAIMode: ParagraphChunkAIModeEnum.auto,
        chunkTriggerType: 'type1',
        chunkTriggerMinSize: 10,
        chunkSize: 100,
        paragraphChunkDeep: 1,
        paragraphChunkMinSize: 5,
        chunkSplitter: undefined,
        customPdfParse: undefined,
        indexSize: 1,
        qaPrompt: 'prompt'
      },
      dataset: {
        _id: 'dataset222',
        agentModel: 'gpt-3.5',
        vectorModel: 'vector-model',
        vlmModel: 'vlm-model'
      },
      lean: () => mockTraining
    };

    const fakeFindOneAndUpdate = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnValue({ lean: () => mockTraining })
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValue(fakeFindOneAndUpdate as any);

    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValue(true);
    vi.mocked(readDatasetSourceRawText).mockResolvedValue({
      title: 'Test Title',
      rawText: 'Test content'
    });

    vi.mocked(POST).mockResolvedValue({
      resultText: 'Processed content',
      totalInputTokens: 10,
      totalOutputTokens: 5
    });

    // mock rawText2Chunks to return something
    const { rawText2Chunks } = await import('@fastgpt/service/core/dataset/read');
    (rawText2Chunks as unknown as { mockResolvedValue: any }).mockResolvedValue([
      { indexes: ['abc'] }
    ]);

    // mock checkDatasetIndexLimit to throw
    const { checkDatasetIndexLimit } = await import(
      '@fastgpt/service/support/permission/teamLimit'
    );
    vi.mocked(checkDatasetIndexLimit).mockRejectedValue(new Error('limit reached'));

    await datasetParseQueue();

    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      { _id: 'training222' },
      expect.objectContaining({
        errorMsg: 'limit reached',
        lockTime: expect.any(Date)
      })
    );
  });
});
