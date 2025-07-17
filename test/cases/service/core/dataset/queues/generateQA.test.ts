import { vi, describe, it, expect, beforeEach } from 'vitest';
import { generateQA, reduceQueue, formatSplitText } from '@/service/core/dataset/queues/generateQA';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from '@/service/core/dataset/queues/utils';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { countGptMessagesTokens, countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { addMinutes } from 'date-fns';

vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: {
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
    findByIdAndDelete: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/config', () => ({
  createChatCompletion: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/training/controller', () => ({
  pushDataListToTrainingQueue: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  pushLLMTrainingUsage: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn()
}));

vi.mock('@fastgpt/service/worker/function', () => ({
  text2Chunks: vi.fn()
}));

vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: vi.fn()
}));

vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countGptMessagesTokens: vi.fn().mockResolvedValue(100),
  countPromptTokens: vi.fn().mockResolvedValue(50)
}));

vi.mock('@fastgpt/service/common/bullmq', () => ({
  delay: vi.fn().mockResolvedValue(undefined)
}));

describe('generateQA', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.qaQueueLen = 0;
    global.systemEnv = { qaMaxProcess: 10 };
  });

  it('should not process when queue is full', async () => {
    global.qaQueueLen = 10;
    await generateQA();
    expect(MongoDatasetTraining.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('should handle empty training data', async () => {
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(null)
    } as any);
    await generateQA();
    expect(global.qaQueueLen).toBe(0);
  });

  it('should handle database error', async () => {
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValueOnce(new Error('DB Error'))
    } as any);
    await generateQA();
    expect(global.qaQueueLen).toBe(0);
  });

  it('should handle missing dataset or collection', async () => {
    const mockData = {
      _id: 'testId',
      q: 'test question'
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(mockData)
    } as any);

    await generateQA();
    expect(MongoDatasetTraining.deleteOne).toHaveBeenCalledWith({ _id: 'testId' });
  });

  it('should handle insufficient team points', async () => {
    const mockData = {
      _id: 'testId',
      teamId: 'team1',
      dataset: { agentModel: 'test' },
      collection: {},
      q: 'test'
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(mockData)
    } as any);
    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValueOnce(false);

    await generateQA();
    expect(checkTeamAiPointsAndLock).toHaveBeenCalledWith('team1');
  });

  it('should handle error in processing training data and update errorMsg', async () => {
    const mockData = {
      _id: 'testId',
      teamId: 'team1',
      datasetId: 'dataset1',
      collectionId: 'collection1',
      q: 'test question',
      chunkIndex: 1,
      billId: 'bill1',
      tmbId: 'tmb1',
      dataset: {
        vectorModel: 'vector1',
        agentModel: 'agent1',
        vlmModel: 'vlm1'
      },
      collection: {
        qaPrompt: 'test prompt'
      }
    };

    let firstCall = true;
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockImplementation(
      () =>
        ({
          populate: vi.fn().mockReturnThis(),
          lean: vi.fn().mockImplementation(() => {
            if (firstCall) {
              firstCall = false;
              return Promise.resolve(mockData);
            }
            return Promise.resolve(null);
          })
        }) as any
    );

    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValue(true);
    vi.mocked(getLLMModel).mockReturnValue({ model: 'testModel', provider: 'test' } as any);
    vi.mocked(createChatCompletion).mockRejectedValue(new Error('LLM Error'));

    await generateQA();
    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      { _id: 'testId' },
      { errorMsg: expect.any(String) }
    );
  });
});

describe('reduceQueue', () => {
  beforeEach(() => {
    global.qaQueueLen = 0;
  });

  it('should reduce queue and return true when empty', () => {
    global.qaQueueLen = 1;
    expect(reduceQueue()).toBe(true);
    expect(global.qaQueueLen).toBe(0);
  });

  it('should reduce queue and return false when not empty', () => {
    global.qaQueueLen = 2;
    expect(reduceQueue()).toBe(false);
    expect(global.qaQueueLen).toBe(1);
  });

  it('should handle negative queue length', () => {
    global.qaQueueLen = -1;
    expect(reduceQueue()).toBe(true);
    expect(global.qaQueueLen).toBe(0);
  });
});

describe('formatSplitText', () => {
  it('should format QA pairs correctly', async () => {
    const answer = 'Q1: Test question\nA1: Test answer\nQ2: Question 2\nA2: Answer 2';
    const mockLLMModel = { model: 'test-model', maxContext: 4000 };

    const result = await formatSplitText({
      answer,
      rawText: 'original text',
      llmModel: mockLLMModel as any
    });

    expect(result).toEqual([
      { q: 'Test question', a: 'Test answer\n' },
      { q: 'Question 2', a: 'Answer 2' }
    ]);
  });

  it('should handle empty QA result by splitting raw text', async () => {
    const chunks = ['chunk1', 'chunk2'];
    vi.mocked(text2Chunks).mockResolvedValueOnce({ chunks } as any);
    const mockLLMModel = { model: 'test-model', maxContext: 4000 };

    const result = await formatSplitText({
      answer: 'invalid format',
      rawText: 'original text',
      llmModel: mockLLMModel as any
    });

    expect(result).toEqual([
      { q: 'chunk1', a: '' },
      { q: 'chunk2', a: '' }
    ]);
  });

  it('should handle QA pairs with extra whitespace', async () => {
    const answer = 'Q1:   Test question  \nA1:  Test answer  \n';
    const mockLLMModel = { model: 'test-model', maxContext: 4000 };

    const result = await formatSplitText({
      answer,
      rawText: 'original text',
      llmModel: mockLLMModel as any
    });

    expect(result).toEqual([{ q: 'Test question  ', a: 'Test answer  \n' }]);
  });
});
