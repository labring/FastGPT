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
import { addLog } from '@fastgpt/service/common/system/log';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

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
const mockAddLog = vi.mocked(addLog);

describe('EvalDatasetData Update API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validDataId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b6';

  // Helper function to create base request
  const createBaseRequest = (overrides = {}) => ({
    body: {
      dataId: validDataId,
      userInput: 'Test input',
      expectedOutput: 'Test output',
      ...overrides
    }
  });

  // Helper function for validation test cases
  const testValidation = (
    description: string,
    bodyOverrides: any,
    expectedError: EvaluationErrEnum
  ) => {
    it(description, async () => {
      const req = createBaseRequest(bodyOverrides);
      await expect(handler_test(req as any)).rejects.toEqual(expectedError);
    });
  };

  // Helper function for testing multiple validation cases
  const testMultipleValidations = (
    cases: Array<{
      description: string;
      bodyOverrides: any;
      expectedError: EvaluationErrEnum;
    }>
  ) => {
    cases.forEach(({ description, bodyOverrides, expectedError }) => {
      testValidation(description, bodyOverrides, expectedError);
    });
  };

  // Helper function to verify database update calls
  const expectUpdateCall = (expectedUpdateFields: any) => {
    expect(mockMongoEvalDatasetData.updateOne).toHaveBeenCalledWith(
      { _id: validDataId },
      { $set: expectedUpdateFields },
      { session: {} }
    );
  };

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
  });

  describe('Parameter Validation', () => {
    describe('dataId validation', () => {
      testMultipleValidations([
        {
          description: 'should reject when dataId is missing',
          bodyOverrides: { dataId: undefined },
          expectedError: EvaluationErrEnum.datasetDataIdRequired
        },
        {
          description: 'should reject when dataId is not a string',
          bodyOverrides: { dataId: 123 },
          expectedError: EvaluationErrEnum.datasetDataIdRequired
        }
      ]);
    });

    describe('userInput validation', () => {
      testMultipleValidations([
        {
          description: 'should reject when userInput is missing',
          bodyOverrides: { userInput: undefined },
          expectedError: EvaluationErrEnum.datasetDataUserInputRequired
        },
        {
          description: 'should reject when userInput is empty string',
          bodyOverrides: { userInput: '' },
          expectedError: EvaluationErrEnum.datasetDataUserInputRequired
        },
        {
          description: 'should reject when userInput is only whitespace',
          bodyOverrides: { userInput: '   ' },
          expectedError: EvaluationErrEnum.datasetDataUserInputRequired
        },
        {
          description: 'should reject when userInput is not a string',
          bodyOverrides: { userInput: 123 },
          expectedError: EvaluationErrEnum.datasetDataUserInputRequired
        }
      ]);
    });

    describe('expectedOutput validation', () => {
      testMultipleValidations([
        {
          description: 'should reject when expectedOutput is missing',
          bodyOverrides: { expectedOutput: undefined },
          expectedError: EvaluationErrEnum.datasetDataExpectedOutputRequired
        },
        {
          description: 'should reject when expectedOutput is empty string',
          bodyOverrides: { expectedOutput: '' },
          expectedError: EvaluationErrEnum.datasetDataExpectedOutputRequired
        },
        {
          description: 'should reject when expectedOutput is only whitespace',
          bodyOverrides: { expectedOutput: '   ' },
          expectedError: EvaluationErrEnum.datasetDataExpectedOutputRequired
        },
        {
          description: 'should reject when expectedOutput is not a string',
          bodyOverrides: { expectedOutput: 123 },
          expectedError: EvaluationErrEnum.datasetDataExpectedOutputRequired
        }
      ]);
    });

    describe('Optional field validation', () => {
      testMultipleValidations([
        {
          description: 'should reject when actualOutput is not a string',
          bodyOverrides: { actualOutput: 123 },
          expectedError: EvaluationErrEnum.datasetDataActualOutputMustBeString
        },
        {
          description: 'should reject when context is not an array',
          bodyOverrides: { context: 'not an array' },
          expectedError: EvaluationErrEnum.datasetDataContextMustBeArrayOfStrings
        },
        {
          description: 'should reject when context contains non-string items',
          bodyOverrides: { context: ['valid', 123, 'also valid'] },
          expectedError: EvaluationErrEnum.datasetDataContextMustBeArrayOfStrings
        },
        {
          description: 'should reject when retrievalContext is not an array',
          bodyOverrides: { retrievalContext: 'not an array' },
          expectedError: EvaluationErrEnum.datasetDataRetrievalContextMustBeArrayOfStrings
        },
        {
          description: 'should reject when retrievalContext contains non-string items',
          bodyOverrides: { retrievalContext: ['valid', 123, 'also valid'] },
          expectedError: EvaluationErrEnum.datasetDataRetrievalContextMustBeArrayOfStrings
        },
        {
          description: 'should reject when qualityMetadata is not an object',
          bodyOverrides: { qualityMetadata: 'not an object' },
          expectedError: EvaluationErrEnum.datasetDataMetadataMustBeObject
        },
        {
          description: 'should reject when qualityMetadata is an array',
          bodyOverrides: { qualityMetadata: ['array'] },
          expectedError: EvaluationErrEnum.datasetDataMetadataMustBeObject
        },
        {
          description: 'should reject when qualityMetadata is null',
          bodyOverrides: { qualityMetadata: null },
          expectedError: EvaluationErrEnum.datasetDataMetadataMustBeObject
        }
      ]);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataUpdateById with correct parameters', async () => {
      const req = createBaseRequest();
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

      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toBe(authError);
    });
  });

  describe('Data Validation', () => {
    it('should reject when dataset data does not exist', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        EvaluationErrEnum.datasetDataNotFound
      );
      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toEqual(EvaluationErrEnum.datasetDataNotFound);
    });

    it('should reject when collection does not exist', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        EvaluationErrEnum.datasetCollectionNotFound
      );
      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionNotFound
      );
    });

    it('should reject when collection belongs to different team', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        EvaluationErrEnum.datasetCollectionNotFound
      );
      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionNotFound
      );
    });
  });

  describe('Data Update', () => {
    const createExpectedUpdateFields = (overrides = {}) => ({
      [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
      [EvalDatasetDataKeyEnum.ActualOutput]: '',
      [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
      [EvalDatasetDataKeyEnum.Context]: [],
      [EvalDatasetDataKeyEnum.RetrievalContext]: [],
      updateTime: expect.any(Date),
      ...overrides
    });

    it('should update data with required fields only', async () => {
      const req = createBaseRequest();
      const result = await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
      expectUpdateCall(createExpectedUpdateFields());
      expect(result).toBe('success');
    });

    it('should update data with all optional fields', async () => {
      const req = createBaseRequest({
        actualOutput: 'Actual output',
        context: ['Context 1', 'Context 2'],
        retrievalContext: ['Retrieval 1', 'Retrieval 2']
      });

      await handler_test(req as any);

      expectUpdateCall(
        createExpectedUpdateFields({
          [EvalDatasetDataKeyEnum.ActualOutput]: 'Actual output',
          [EvalDatasetDataKeyEnum.Context]: ['Context 1', 'Context 2'],
          [EvalDatasetDataKeyEnum.RetrievalContext]: ['Retrieval 1', 'Retrieval 2']
        })
      );
    });

    it('should trim whitespace from userInput and expectedOutput', async () => {
      const req = createBaseRequest({
        userInput: '  Test input  ',
        expectedOutput: '  Test output  '
      });

      await handler_test(req as any);
      expectUpdateCall(createExpectedUpdateFields());
    });

    it('should trim whitespace from actualOutput', async () => {
      const req = createBaseRequest({ actualOutput: '  Actual output  ' });
      await handler_test(req as any);
      expectUpdateCall(
        createExpectedUpdateFields({
          [EvalDatasetDataKeyEnum.ActualOutput]: 'Actual output'
        })
      );
    });

    it('should handle empty actualOutput', async () => {
      const req = createBaseRequest({ actualOutput: '' });
      await handler_test(req as any);
      expectUpdateCall(createExpectedUpdateFields());
    });

    it('should handle undefined actualOutput', async () => {
      const req = createBaseRequest();
      await handler_test(req as any);
      expectUpdateCall(createExpectedUpdateFields());
    });

    it('should handle empty context array', async () => {
      const req = createBaseRequest({ context: [] });
      await handler_test(req as any);
      expectUpdateCall(createExpectedUpdateFields());
    });

    it('should handle empty retrievalContext array', async () => {
      const req = createBaseRequest({ retrievalContext: [] });
      await handler_test(req as any);
      expectUpdateCall(createExpectedUpdateFields());
    });

    it('should handle qualityMetadata updates', async () => {
      const req = createBaseRequest({ qualityMetadata: { custom: 'value', score: 95 } });
      await handler_test(req as any);
      expectUpdateCall(
        createExpectedUpdateFields({
          'qualityMetadata.custom': 'value',
          'qualityMetadata.score': 95
        })
      );
    });

    it('should handle empty qualityMetadata object', async () => {
      const req = createBaseRequest({ qualityMetadata: {} });
      await handler_test(req as any);
      expectUpdateCall(createExpectedUpdateFields());
    });

    it('should propagate database update errors', async () => {
      const dbError = new Error('Database update failed');
      mockMongoSessionRun.mockRejectedValue(dbError);
      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toBe(dbError);
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
