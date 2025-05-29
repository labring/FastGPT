import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDatasetTrainingMongoWatch,
  startTrainingQueue
} from '@/service/core/dataset/training/utils';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateVector } from '@/service/core/dataset/queues/generateVector';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

vi.mock('@/service/core/dataset/queues/generateQA', () => ({
  generateQA: vi.fn()
}));

vi.mock('@/service/core/dataset/queues/generateVector', () => ({
  generateVector: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: {
    watch: vi.fn().mockReturnValue({
      on: vi.fn()
    })
  }
}));

describe('dataset training utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDatasetTrainingMongoWatch', () => {
    it('should setup mongo watch and handle qa mode', () => {
      const mockOn = vi.fn();
      vi.mocked(MongoDatasetTraining.watch).mockReturnValue({
        on: mockOn
      });

      createDatasetTrainingMongoWatch();

      expect(MongoDatasetTraining.watch).toHaveBeenCalled();
      expect(mockOn).toHaveBeenCalledWith('change', expect.any(Function));

      // Simulate change event for QA mode
      const changeHandler = mockOn.mock.calls[0][1];
      changeHandler({
        operationType: 'insert',
        fullDocument: {
          mode: TrainingModeEnum.qa
        }
      });

      expect(generateQA).toHaveBeenCalled();
      expect(generateVector).not.toHaveBeenCalled();
    });

    it('should handle chunk mode', () => {
      const mockOn = vi.fn();
      vi.mocked(MongoDatasetTraining.watch).mockReturnValue({
        on: mockOn
      });

      createDatasetTrainingMongoWatch();

      const changeHandler = mockOn.mock.calls[0][1];
      changeHandler({
        operationType: 'insert',
        fullDocument: {
          mode: TrainingModeEnum.chunk
        }
      });

      expect(generateVector).toHaveBeenCalled();
      expect(generateQA).not.toHaveBeenCalled();
    });

    it('should ignore non-insert operations', () => {
      const mockOn = vi.fn();
      vi.mocked(MongoDatasetTraining.watch).mockReturnValue({
        on: mockOn
      });

      createDatasetTrainingMongoWatch();

      const changeHandler = mockOn.mock.calls[0][1];
      changeHandler({
        operationType: 'update',
        fullDocument: {
          mode: TrainingModeEnum.qa
        }
      });

      expect(generateQA).not.toHaveBeenCalled();
      expect(generateVector).not.toHaveBeenCalled();
    });
  });

  describe('startTrainingQueue', () => {
    beforeEach(() => {
      global.systemEnv = {
        qaMaxProcess: 3
      };
    });

    it('should start single process by default', () => {
      startTrainingQueue();

      expect(generateQA).toHaveBeenCalledTimes(1);
      expect(generateVector).toHaveBeenCalledTimes(1);
    });

    it('should start max processes when fast mode enabled', () => {
      startTrainingQueue(true);

      expect(generateQA).toHaveBeenCalledTimes(3);
      expect(generateVector).toHaveBeenCalledTimes(3);
    });

    it('should use default max process when not configured', () => {
      global.systemEnv = undefined;

      startTrainingQueue(true);

      expect(generateQA).toHaveBeenCalledTimes(10);
      expect(generateVector).toHaveBeenCalledTimes(10);
    });
  });
});
