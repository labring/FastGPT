import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/create';
import { authEvaluationDatasetDataCreate } from '@fastgpt/service/core/evaluation/common';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';

vi.mock('@fastgpt/service/core/evaluation/common');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    create: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn()
  },
  EvalDatasetCollectionName: 'eval_dataset_collections'
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';

const mockAuthEvaluationDatasetDataCreate = vi.mocked(authEvaluationDatasetDataCreate);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);

describe('EvalDatasetData Create API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const mockDataId = '65f5b5b5b5b5b5b5b5b5b5b6';

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthEvaluationDatasetDataCreate.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    // Mock collection exists
    mockMongoEvalDatasetCollection.findOne.mockResolvedValue({
      _id: validCollectionId,
      name: 'Test Collection',
      teamId: validTeamId
    } as any);

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback({} as any);
    });

    mockMongoEvalDatasetData.create.mockResolvedValue([{ _id: mockDataId }] as any);
  });

  describe('Parameter Validation', () => {
    it('should reject when collectionId is missing', async () => {
      const req = {
        body: {
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'collectionId is required and must be a string'
      );
    });

    it('should reject when collectionId is not a string', async () => {
      const req = {
        body: {
          collectionId: 123,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'collectionId is required and must be a string'
      );
    });

    it('should reject when userInput is missing', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'userInput is required and must be a non-empty string'
      );
    });

    it('should reject when userInput is empty string', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: '',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'userInput is required and must be a non-empty string'
      );
    });

    it('should reject when userInput is only whitespace', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: '   ',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'userInput is required and must be a non-empty string'
      );
    });

    it('should reject when userInput is not a string', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 123,
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'userInput is required and must be a non-empty string'
      );
    });

    it('should reject when expectedOutput is missing', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'expectedOutput is required and must be a non-empty string'
      );
    });

    it('should reject when expectedOutput is empty string', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: ''
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'expectedOutput is required and must be a non-empty string'
      );
    });

    it('should reject when expectedOutput is only whitespace', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: '   '
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'expectedOutput is required and must be a non-empty string'
      );
    });

    it('should reject when expectedOutput is not a string', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 123
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'expectedOutput is required and must be a non-empty string'
      );
    });

    it('should reject when actualOutput is not a string', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          actualOutput: 123
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'actualOutput must be a string if provided'
      );
    });

    it('should reject when context is not an array', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          context: 'not an array'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'context must be an array of strings if provided'
      );
    });

    it('should reject when context contains non-string items', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          context: ['valid', 123, 'also valid']
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'context must be an array of strings if provided'
      );
    });

    it('should reject when retrievalContext is not an array', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          retrievalContext: 'not an array'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'retrievalContext must be an array of strings if provided'
      );
    });

    it('should reject when retrievalContext contains non-string items', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          retrievalContext: ['valid', 123, 'also valid']
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'retrievalContext must be an array of strings if provided'
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataCreate with correct parameters', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      await handler_test(req as any);

      expect(mockAuthEvaluationDatasetDataCreate).toHaveBeenCalledWith(validCollectionId, {
        req,
        authToken: true,
        authApiKey: true
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthEvaluationDatasetDataCreate.mockRejectedValue(authError);

      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Collection Validation', () => {
    it('should reject when collection does not exist', async () => {
      // Mock collection not found
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);

      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(
        'Dataset collection not found or access denied'
      );
    });

    it('should reject when collection belongs to different team', async () => {
      // Mock collection not found (same as collection not existing for this team)
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);

      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(
        'Dataset collection not found or access denied'
      );
    });
  });

  describe('Data Creation', () => {
    it('should create data with required fields only', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
      expect(mockMongoEvalDatasetData.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
            [EvalDatasetDataKeyEnum.ActualOutput]: '',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            createFrom: EvalDatasetDataCreateFromEnum.manual
          }
        ],
        { session: {}, ordered: true }
      );
      expect(result).toBe(mockDataId);
    });

    it('should create data with all optional fields', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          actualOutput: 'Actual output',
          expectedOutput: 'Test output',
          context: ['Context 1', 'Context 2'],
          retrievalContext: ['Retrieval 1', 'Retrieval 2']
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
            [EvalDatasetDataKeyEnum.ActualOutput]: 'Actual output',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
            [EvalDatasetDataKeyEnum.Context]: ['Context 1', 'Context 2'],
            [EvalDatasetDataKeyEnum.RetrievalContext]: ['Retrieval 1', 'Retrieval 2'],
            createFrom: EvalDatasetDataCreateFromEnum.manual
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should trim whitespace from userInput and expectedOutput', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: '  Test input  ',
          expectedOutput: '  Test output  '
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
            [EvalDatasetDataKeyEnum.ActualOutput]: '',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            createFrom: EvalDatasetDataCreateFromEnum.manual
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should trim whitespace from actualOutput', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          actualOutput: '  Actual output  ',
          expectedOutput: 'Test output'
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
            [EvalDatasetDataKeyEnum.ActualOutput]: 'Actual output',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            createFrom: EvalDatasetDataCreateFromEnum.manual
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should handle empty actualOutput', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          actualOutput: '',
          expectedOutput: 'Test output'
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
            [EvalDatasetDataKeyEnum.ActualOutput]: '',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            createFrom: EvalDatasetDataCreateFromEnum.manual
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should handle empty context array', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          context: []
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
            [EvalDatasetDataKeyEnum.ActualOutput]: '',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            createFrom: EvalDatasetDataCreateFromEnum.manual
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should handle empty retrievalContext array', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          retrievalContext: []
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
            [EvalDatasetDataKeyEnum.ActualOutput]: '',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            createFrom: EvalDatasetDataCreateFromEnum.manual
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should return data ID as string', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDataId);
      expect(typeof result).toBe('string');
    });

    it('should propagate database creation errors', async () => {
      // Reset auth mock to succeed for this test
      mockAuthEvaluationDatasetDataCreate.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId
      });

      const dbError = new Error('Database connection failed');
      mockMongoSessionRun.mockRejectedValue(dbError);

      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long userInput', async () => {
      const longInput = 'a'.repeat(10000);
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: longInput,
          expectedOutput: 'Test output'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDataId);
    });

    it('should handle very long expectedOutput', async () => {
      const longOutput = 'a'.repeat(10000);
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: longOutput
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDataId);
    });

    it('should handle special characters in inputs', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input with 特殊字符 and émojis 🚀',
          expectedOutput: 'Test output with 特殊字符 and émojis 🎯'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDataId);
    });

    it('should handle newlines and tabs in inputs', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input\nwith\tnewlines\tand\ttabs',
          expectedOutput: 'Test output\nwith\tnewlines\tand\ttabs'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDataId);
    });

    it('should handle large context arrays', async () => {
      const largeContext = Array.from({ length: 100 }, (_, i) => `Context item ${i}`);
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          context: largeContext
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDataId);
    });

    it('should handle large retrievalContext arrays', async () => {
      const largeRetrievalContext = Array.from({ length: 100 }, (_, i) => `Retrieval item ${i}`);
      const req = {
        body: {
          collectionId: validCollectionId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          retrievalContext: largeRetrievalContext
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDataId);
    });
  });
});
