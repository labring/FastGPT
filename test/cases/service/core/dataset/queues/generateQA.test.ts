import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateQA, reduceQueue, formatSplitText } from '@/service/core/dataset/queues/generateQA';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { text2Chunks } from '@fastgpt/service/worker/function';

vi.mock('@fastgpt/service/core/dataset/training/schema');
vi.mock('@fastgpt/service/core/ai/config');
vi.mock('@fastgpt/service/support/wallet/usage/controller');
vi.mock('@fastgpt/service/core/dataset/training/controller');
vi.mock('@fastgpt/service/worker/function');

describe('generateQA', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.qaQueueLen = 0;
    global.systemEnv = { qaMaxProcess: 10 };
  });

  it('should skip when queue is full', async () => {
    global.qaQueueLen = 10;
    await generateQA();
    expect(MongoDatasetTraining.findOneAndUpdate).not.toBeCalled();
  });

  it('should handle no available training data', async () => {
    vi.mocked(MongoDatasetTraining.findOneAndUpdate).mockResolvedValueOnce(null);
    await generateQA();
    expect(global.qaQueueLen).toBe(0);
  });
});

describe('reduceQueue', () => {
  beforeEach(() => {
    global.qaQueueLen = 0;
  });

  it('should reduce queue size and return true when queue becomes empty', () => {
    global.qaQueueLen = 1;
    expect(reduceQueue()).toBe(true);
    expect(global.qaQueueLen).toBe(0);
  });

  it('should not reduce below 0', () => {
    global.qaQueueLen = 0;
    expect(reduceQueue()).toBe(true);
    expect(global.qaQueueLen).toBe(0);
  });
});

describe('formatSplitText', () => {
  const mockLLMModel = {
    model: 'test-model',
    maxContext: 4000,
    name: 'Test Model',
    price: 0,
    defaultSystemRole: '',
    maxResponse: 4000,
    vision: false
  };

  it('should format QA pairs correctly', async () => {
    const answer = 'Q1: Test question 1\nA1: Test answer 1\nQ2: Test question 2\nA2: Test answer 2';
    const result = await formatSplitText({
      answer,
      rawText: 'original text',
      llmModel: mockLLMModel
    });

    expect(result).toEqual([
      { q: 'Test question 1', a: 'Test answer 1\n' },
      { q: 'Test question 2', a: 'Test answer 2' }
    ]);
  });

  it('should handle empty result by splitting raw text', async () => {
    const chunks = ['chunk1', 'chunk2'];
    vi.mocked(text2Chunks).mockResolvedValue({ chunks });

    const result = await formatSplitText({
      answer: 'invalid format',
      rawText: 'original text',
      llmModel: mockLLMModel
    });

    expect(result).toEqual([
      { q: 'chunk1', a: '' },
      { q: 'chunk2', a: '' }
    ]);
  });

  it('should handle answer with escaped newlines', async () => {
    const chunks = ['Question\nLine2'];
    vi.mocked(text2Chunks).mockResolvedValue({ chunks });

    const answer = 'invalid format with \\n';
    const result = await formatSplitText({
      answer,
      rawText: 'original text',
      llmModel: mockLLMModel
    });

    expect(result).toEqual([{ q: 'Question\nLine2', a: '' }]);
  });
});
