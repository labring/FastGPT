import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/update';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authEvalDataset } from '@fastgpt/service/support/permission/evaluation/auth';
import { authEvaluationDatasetDataUpdateById } from '@fastgpt/service/core/evaluation/common';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import {
  removeEvalDatasetDataQualityJobsRobust,
  addEvalDatasetDataQualityJob
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { addLog } from '@fastgpt/service/common/system/log';

vi.mock('@fastgpt/service/support/permission/user/auth');
// Mock the evaluation permissions
vi.mock('@fastgpt/service/support/permission/evaluation/auth', () => ({
  authEvalDataset: vi.fn()
}));
vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationDatasetDataUpdateById: vi.fn()
}));
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    findById: vi.fn(() => ({
      select: vi.fn(() => ({
        lean: vi.fn()
      })),
      session: vi.fn()
    })),
    updateOne: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn()
  },
  EvalDatasetCollectionName: 'eval_dataset_collections'
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataQualityMq', () => ({
  removeEvalDatasetDataQualityJobsRobust: vi.fn(),
  addEvalDatasetDataQualityJob: vi.fn()
}));
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn()
  }
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

const mockAuthUserPer = vi.mocked(authUserPer);
const mockAuthEvalDataset = vi.mocked(authEvalDataset);
const mockAuthEvaluationDatasetDataUpdateById = vi.mocked(authEvaluationDatasetDataUpdateById);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockRemoveEvalDatasetDataQualityJobsRobust = vi.mocked(
  removeEvalDatasetDataQualityJobsRobust
);
const mockAddEvalDatasetDataQualityJob = vi.mocked(addEvalDatasetDataQualityJob);
const mockAddLog = vi.mocked(addLog);

describe('EvalDatasetData Update API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validDataId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b6';

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthEvaluationDatasetDataUpdateById.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      collectionId: validCollectionId
    });

    mockAuthUserPer.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    mockAuthEvalDataset.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      dataset: { _id: validCollectionId, teamId: validTeamId },
      isOwner: true
    } as any);

    const mockExistingData = {
      _id: validDataId,
      datasetId: validCollectionId,
      [EvalDatasetDataKeyEnum.UserInput]: 'Old input',
      [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Old output'
    };

    // Mock for authentication pattern: findById().select().lean()
    const mockSelectChain = {
      lean: vi.fn().mockResolvedValue({ datasetId: validCollectionId })
    };
    const mockFindByIdChain = {
      select: vi.fn(() => mockSelectChain),
      session: vi.fn().mockResolvedValue(mockExistingData)
    };
    mockMongoEvalDatasetData.findById.mockReturnValue(mockFindByIdChain as any);

    mockMongoEvalDatasetCollection.findOne.mockReturnValue({
      session: vi.fn().mockResolvedValue({
        _id: validCollectionId,
        teamId: validTeamId
      })
    } as any);

    mockMongoEvalDatasetData.updateOne.mockResolvedValue({ acknowledged: true } as any);

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback({} as any);
    });

    mockRemoveEvalDatasetDataQualityJobsRobust.mockResolvedValue(true);
    mockAddEvalDatasetDataQualityJob.mockResolvedValue({} as any);
  });

  describe('Parameter Validation', () => {
    it('should reject when dataId is missing', async () => {
      const req = {
        body: {
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });

    it('should reject when dataId is not a string', async () => {
      const req = {
        body: {
          dataId: 123,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });

    it('should reject when userInput is missing', async () => {
      const req = {
        body: {
          dataId: validDataId,
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'userInput is required and must be a non-empty string'
      );
    });

    it('should reject when userInput is empty string', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: '',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'userInput is required and must be a non-empty string'
      );
    });

    it('should reject when userInput is only whitespace', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: '   ',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'userInput is required and must be a non-empty string'
      );
    });

    it('should reject when userInput is not a string', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 123,
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'userInput is required and must be a non-empty string'
      );
    });

    it('should reject when expectedOutput is missing', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'expectedOutput is required and must be a non-empty string'
      );
    });

    it('should reject when expectedOutput is empty string', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: '',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'expectedOutput is required and must be a non-empty string'
      );
    });

    it('should reject when expectedOutput is only whitespace', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: '   ',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'expectedOutput is required and must be a non-empty string'
      );
    });

    it('should reject when expectedOutput is not a string', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 123,
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'expectedOutput is required and must be a non-empty string'
      );
    });

    it('should reject when actualOutput is not a string', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          actualOutput: 123,
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'actualOutput must be a string if provided'
      );
    });

    it('should reject when context is not an array', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          context: 'not an array',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'context must be an array of strings if provided'
      );
    });

    it('should reject when context contains non-string items', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          context: ['valid', 123, 'also valid'],
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'context must be an array of strings if provided'
      );
    });

    it('should reject when retrievalContext is not an array', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          retrievalContext: 'not an array',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'retrievalContext must be an array of strings if provided'
      );
    });

    it('should reject when retrievalContext contains non-string items', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          retrievalContext: ['valid', 123, 'also valid'],
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'retrievalContext must be an array of strings if provided'
      );
    });

    it('should reject when enableQualityEvaluation is missing', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'enableQualityEvaluation is required and must be a boolean'
      );
    });

    it('should reject when enableQualityEvaluation is not a boolean', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: 'true'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'enableQualityEvaluation is required and must be a boolean'
      );
    });

    it('should reject when enableQualityEvaluation is true but qualityEvaluationModel is missing', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: true
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'qualityEvaluationModel is required when enableQualityEvaluation is true'
      );
    });

    it('should reject when enableQualityEvaluation is true but qualityEvaluationModel is not a string', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: true,
          qualityEvaluationModel: 123
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'qualityEvaluationModel is required when enableQualityEvaluation is true'
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataUpdateById with correct parameters', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(validDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(authError);

      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(authError);
    });
  });

  describe('Data Validation', () => {
    it('should reject when dataset data does not exist', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue('evaluationDatasetDataNotFound');

      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual('evaluationDatasetDataNotFound');
    });

    it('should reject when collection does not exist', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        'evaluationDatasetCollectionNotFound'
      );

      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual('evaluationDatasetCollectionNotFound');
    });

    it('should reject when collection belongs to different team', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        'evaluationDatasetCollectionNotFound'
      );

      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual('evaluationDatasetCollectionNotFound');
    });
  });

  describe('Data Update', () => {
    it('should update data with required fields only', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
      expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
        { _id: validDataId },
        {
          [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          updateTime: expect.any(Date)
        },
        { session: {} }
      );
      expect(result).toBe('success');
    });

    it('should update data with all optional fields', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          actualOutput: 'Actual output',
          expectedOutput: 'Test output',
          context: ['Context 1', 'Context 2'],
          retrievalContext: ['Retrieval 1', 'Retrieval 2'],
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
        { _id: validDataId },
        {
          [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
          [EvalDatasetDataKeyEnum.ActualOutput]: 'Actual output',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
          [EvalDatasetDataKeyEnum.Context]: ['Context 1', 'Context 2'],
          [EvalDatasetDataKeyEnum.RetrievalContext]: ['Retrieval 1', 'Retrieval 2'],
          updateTime: expect.any(Date)
        },
        { session: {} }
      );
    });

    it('should trim whitespace from userInput and expectedOutput', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: '  Test input  ',
          expectedOutput: '  Test output  ',
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
        { _id: validDataId },
        {
          [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          updateTime: expect.any(Date)
        },
        { session: {} }
      );
    });

    it('should trim whitespace from actualOutput', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          actualOutput: '  Actual output  ',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
        { _id: validDataId },
        {
          [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
          [EvalDatasetDataKeyEnum.ActualOutput]: 'Actual output',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          updateTime: expect.any(Date)
        },
        { session: {} }
      );
    });

    it('should handle empty actualOutput', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          actualOutput: '',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
        { _id: validDataId },
        {
          [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          updateTime: expect.any(Date)
        },
        { session: {} }
      );
    });

    it('should handle undefined actualOutput', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
        { _id: validDataId },
        {
          [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          updateTime: expect.any(Date)
        },
        { session: {} }
      );
    });

    it('should handle empty context array', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          context: [],
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
        { _id: validDataId },
        {
          [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          updateTime: expect.any(Date)
        },
        { session: {} }
      );
    });

    it('should handle empty retrievalContext array', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          retrievalContext: [],
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
        { _id: validDataId },
        {
          [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
          [EvalDatasetDataKeyEnum.ActualOutput]: '',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
          [EvalDatasetDataKeyEnum.Context]: [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: [],
          updateTime: expect.any(Date)
        },
        { session: {} }
      );
    });

    it('should propagate database update errors', async () => {
      const dbError = new Error('Database update failed');
      mockMongoSessionRun.mockRejectedValue(dbError);

      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });
  });

  describe('Quality Evaluation', () => {
    it('should not trigger quality evaluation when disabled', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
      expect(mockAddEvalDatasetDataQualityJob).not.toHaveBeenCalled();
      expect(mockAddLog.info).not.toHaveBeenCalled();
    });

    it('should trigger quality evaluation when enabled', async () => {
      const qualityEvaluationModel = 'gpt-4';
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: true,
          qualityEvaluationModel
        }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalledWith([validDataId], {
        forceCleanActiveJobs: true,
        retryDelay: 200
      });
      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: validDataId,
        evalModel: qualityEvaluationModel
      });
      expect(mockAddLog.info).toHaveBeenCalledWith(
        'Quality evaluation task enqueued successfully',
        {
          dataId: validDataId,
          evalModel: qualityEvaluationModel,
          teamId: validTeamId
        }
      );
    });

    it('should handle quality evaluation job removal failure gracefully', async () => {
      const qualityEvaluationModel = 'gpt-4';
      const jobError = new Error('Failed to remove job');
      mockRemoveEvalDatasetDataQualityJobsRobust.mockRejectedValue(jobError);

      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: true,
          qualityEvaluationModel
        }
      };

      const result = await handler_test(req as any);

      expect(mockAddLog.error).toHaveBeenCalledWith('Failed to manage quality evaluation task', {
        dataId: validDataId,
        evalModel: qualityEvaluationModel,
        teamId: validTeamId,
        error: jobError
      });
      expect(result).toBe('success');
    });

    it('should handle quality evaluation job addition failure gracefully', async () => {
      const qualityEvaluationModel = 'gpt-4';
      const jobError = new Error('Failed to add job');
      mockAddEvalDatasetDataQualityJob.mockRejectedValue(jobError);

      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: true,
          qualityEvaluationModel
        }
      };

      const result = await handler_test(req as any);

      expect(mockAddLog.error).toHaveBeenCalledWith('Failed to manage quality evaluation task', {
        dataId: validDataId,
        evalModel: qualityEvaluationModel,
        teamId: validTeamId,
        error: jobError
      });
      expect(result).toBe('success');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long userInput', async () => {
      const longInput = 'a'.repeat(10000);
      const req = {
        body: {
          dataId: validDataId,
          userInput: longInput,
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle very long expectedOutput', async () => {
      const longOutput = 'a'.repeat(10000);
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: longOutput,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle special characters in inputs', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input with 特殊字符 and émojis 🚀',
          expectedOutput: 'Test output with 特殊字符 and émojis 🎯',
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle newlines and tabs in inputs', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input\nwith\tnewlines\tand\ttabs',
          expectedOutput: 'Test output\nwith\tnewlines\tand\ttabs',
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle large context arrays', async () => {
      const largeContext = Array.from({ length: 100 }, (_, i) => `Context item ${i}`);
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          context: largeContext,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle large retrievalContext arrays', async () => {
      const largeRetrievalContext = Array.from({ length: 100 }, (_, i) => `Retrieval item ${i}`);
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          retrievalContext: largeRetrievalContext,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle MongoDB ObjectId-like strings for dataId', async () => {
      const objectIdLikeDataId = '507f1f77bcf86cd799439011';
      // Reset auth mock to work with new dataId
      mockAuthEvaluationDatasetDataUpdateById.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId,
        collectionId: validCollectionId
      });

      const req = {
        body: {
          dataId: objectIdLikeDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(objectIdLikeDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
    });

    it('should handle quality evaluation with different models', async () => {
      const testCases = ['gpt-4', 'claude-3', 'gemini-pro'];

      for (const model of testCases) {
        const req = {
          body: {
            dataId: validDataId,
            userInput: 'Test input',
            expectedOutput: 'Test output',
            enableQualityEvaluation: true,
            qualityEvaluationModel: model
          }
        };

        await handler_test(req as any);

        expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
          dataId: validDataId,
          evalModel: model
        });
      }
    });
  });

  describe('Return Value', () => {
    it('should return success string', async () => {
      const req = {
        body: {
          dataId: validDataId,
          userInput: 'Test input',
          expectedOutput: 'Test output',
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(typeof result).toBe('string');
    });
  });
});
