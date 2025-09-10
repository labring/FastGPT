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
    create: vi.fn(),
    countDocuments: vi.fn()
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
vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamEvalDatasetDataLimit: vi.fn(),
  checkTeamAIPoints: vi.fn()
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataQualityMq', () => ({
  addEvalDatasetDataQualityJob: vi.fn()
}));

import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  checkTeamEvalDatasetDataLimit,
  checkTeamAIPoints
} from '@fastgpt/service/support/permission/teamLimit';
import { addEvalDatasetDataQualityJob } from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';

const mockAuthEvaluationDatasetDataCreate = vi.mocked(authEvaluationDatasetDataCreate);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockCheckTeamEvalDatasetDataLimit = vi.mocked(checkTeamEvalDatasetDataLimit);
const mockCheckTeamAIPoints = vi.mocked(checkTeamAIPoints);
const mockAddEvalDatasetDataQualityJob = vi.mocked(addEvalDatasetDataQualityJob);

describe('EvalDatasetData Create API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const mockDataId = '65f5b5b5b5b5b5b5b5b5b5b6';

  // Helper function to create base request
  const createBaseRequest = (overrides = {}) => ({
    body: {
      collectionId: validCollectionId,
      userInput: 'Test input',
      expectedOutput: 'Test output',
      enableQualityEvaluation: false,
      ...overrides
    }
  });

  // Helper function for validation test cases
  const testValidation = (description: string, bodyOverrides: any, expectedError: string) => {
    it(description, async () => {
      const req = createBaseRequest(bodyOverrides);
      await expect(handler_test(req as any)).rejects.toEqual(expectedError);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global.llmModelMap
    global.llmModelMap = new Map([
      ['gpt-4', { name: 'GPT-4' }],
      ['gpt-3.5-turbo', { name: 'GPT-3.5 Turbo' }]
    ]) as any;

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
    mockMongoEvalDatasetData.countDocuments.mockResolvedValue(0);

    // Mock team limit checks to pass by default
    mockCheckTeamEvalDatasetDataLimit.mockResolvedValue(undefined);
    mockCheckTeamAIPoints.mockResolvedValue(undefined);
  });

  describe('Parameter Validation', () => {
    describe('collectionId validation', () => {
      testValidation(
        'should reject when collectionId is missing',
        { collectionId: undefined },
        'collectionId is required and must be a string'
      );

      testValidation(
        'should reject when collectionId is not a string',
        { collectionId: 123 },
        'collectionId is required and must be a string'
      );
    });

    describe('userInput validation', () => {
      testValidation(
        'should reject when userInput is missing',
        { userInput: undefined },
        'userInput is required and must be a non-empty string'
      );

      testValidation(
        'should reject when userInput is empty string',
        { userInput: '' },
        'userInput is required and must be a non-empty string'
      );

      testValidation(
        'should reject when userInput is only whitespace',
        { userInput: '   ' },
        'userInput is required and must be a non-empty string'
      );

      testValidation(
        'should reject when userInput is not a string',
        { userInput: 123 },
        'userInput is required and must be a non-empty string'
      );
    });

    describe('expectedOutput validation', () => {
      testValidation(
        'should reject when expectedOutput is missing',
        { expectedOutput: undefined },
        'expectedOutput is required and must be a non-empty string'
      );

      testValidation(
        'should reject when expectedOutput is empty string',
        { expectedOutput: '' },
        'expectedOutput is required and must be a non-empty string'
      );

      testValidation(
        'should reject when expectedOutput is only whitespace',
        { expectedOutput: '   ' },
        'expectedOutput is required and must be a non-empty string'
      );

      testValidation(
        'should reject when expectedOutput is not a string',
        { expectedOutput: 123 },
        'expectedOutput is required and must be a non-empty string'
      );
    });

    describe('Optional field validation', () => {
      testValidation(
        'should reject when actualOutput is not a string',
        { actualOutput: 123 },
        'actualOutput must be a string if provided'
      );

      testValidation(
        'should reject when context is not an array',
        { context: 'not an array' },
        'context must be an array of strings if provided'
      );

      testValidation(
        'should reject when context contains non-string items',
        { context: ['valid', 123, 'also valid'] },
        'context must be an array of strings if provided'
      );

      testValidation(
        'should reject when retrievalContext is not an array',
        { retrievalContext: 'not an array' },
        'retrievalContext must be an array of strings if provided'
      );

      testValidation(
        'should reject when retrievalContext contains non-string items',
        { retrievalContext: ['valid', 123, 'also valid'] },
        'retrievalContext must be an array of strings if provided'
      );
    });

    describe('Quality evaluation validation', () => {
      testValidation(
        'should reject when enableQualityEvaluation is missing',
        { enableQualityEvaluation: undefined },
        'enableQualityEvaluation is required and must be a boolean'
      );

      testValidation(
        'should reject when enableQualityEvaluation is not a boolean',
        { enableQualityEvaluation: 'true' },
        'enableQualityEvaluation is required and must be a boolean'
      );

      testValidation(
        'should reject when enableQualityEvaluation is true but evaluationModel is missing',
        { enableQualityEvaluation: true },
        'evaluationModel is required when enableQualityEvaluation is true'
      );

      testValidation(
        'should reject when enableQualityEvaluation is true but evaluationModel is not a string',
        { enableQualityEvaluation: true, evaluationModel: 123 },
        'evaluationModel is required when enableQualityEvaluation is true'
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataCreate with correct parameters', async () => {
      const req = createBaseRequest();
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

      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Collection Validation', () => {
    it('should reject when collection does not exist', async () => {
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);
      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toBe(
        'Dataset collection not found or access denied'
      );
    });

    it('should reject when collection belongs to different team', async () => {
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);
      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toBe(
        'Dataset collection not found or access denied'
      );
    });
  });

  // Helper functions for data creation tests
  const expectDataCreation = (expectedData: any) => {
    expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
    expect(mockMongoEvalDatasetData.create).toHaveBeenCalledWith([expectedData], {
      session: {},
      ordered: true
    });
  };

  const createExpectedDataObject = (overrides = {}) => ({
    teamId: validTeamId,
    tmbId: validTmbId,
    datasetId: validCollectionId,
    [EvalDatasetDataKeyEnum.UserInput]: 'Test input',
    [EvalDatasetDataKeyEnum.ActualOutput]: '',
    [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Test output',
    [EvalDatasetDataKeyEnum.Context]: [],
    [EvalDatasetDataKeyEnum.RetrievalContext]: [],
    metadata: { qualityStatus: 'unevaluated' },
    createFrom: EvalDatasetDataCreateFromEnum.manual,
    ...overrides
  });

  describe('Data Creation', () => {
    it('should create data with required fields only', async () => {
      const req = createBaseRequest();
      const result = await handler_test(req as any);

      expectDataCreation(createExpectedDataObject());
      expect(result).toBe(mockDataId);
    });

    it('should create data with all optional fields', async () => {
      const req = createBaseRequest({
        actualOutput: 'Actual output',
        context: ['Context 1', 'Context 2'],
        retrievalContext: ['Retrieval 1', 'Retrieval 2']
      });

      await handler_test(req as any);

      expectDataCreation(
        createExpectedDataObject({
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
      expectDataCreation(createExpectedDataObject());
    });

    it('should trim whitespace from actualOutput', async () => {
      const req = createBaseRequest({ actualOutput: '  Actual output  ' });
      await handler_test(req as any);
      expectDataCreation(
        createExpectedDataObject({
          [EvalDatasetDataKeyEnum.ActualOutput]: 'Actual output'
        })
      );
    });

    it('should handle empty actualOutput', async () => {
      const req = createBaseRequest({ actualOutput: '' });
      await handler_test(req as any);
      expectDataCreation(createExpectedDataObject());
    });

    it('should handle empty context array', async () => {
      const req = createBaseRequest({ context: [] });
      await handler_test(req as any);
      expectDataCreation(createExpectedDataObject());
    });

    it('should handle empty retrievalContext array', async () => {
      const req = createBaseRequest({ retrievalContext: [] });
      await handler_test(req as any);
      expectDataCreation(createExpectedDataObject());
    });

    it('should return data ID as string', async () => {
      const req = createBaseRequest();
      const result = await handler_test(req as any);
      expect(result).toBe(mockDataId);
      expect(typeof result).toBe('string');
    });

    it('should propagate database creation errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoSessionRun.mockRejectedValue(dbError);

      const req = createBaseRequest();
      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });
  });

  describe('Edge Cases', () => {
    const testEdgeCase = (description: string, bodyOverrides: any) => {
      it(description, async () => {
        const req = createBaseRequest(bodyOverrides);
        const result = await handler_test(req as any);
        expect(result).toBe(mockDataId);
      });
    };

    testEdgeCase('should handle very long userInput', { userInput: 'a'.repeat(10000) });

    testEdgeCase('should handle very long expectedOutput', { expectedOutput: 'a'.repeat(10000) });

    testEdgeCase('should handle special characters in inputs', {
      userInput: 'Test input with 特殊字符 and émojis 🚀',
      expectedOutput: 'Test output with 特殊字符 and émojis 🎯'
    });

    testEdgeCase('should handle newlines and tabs in inputs', {
      userInput: 'Test input\nwith\tnewlines\tand\ttabs',
      expectedOutput: 'Test output\nwith\tnewlines\tand\ttabs'
    });

    testEdgeCase('should handle large context arrays', {
      context: Array.from({ length: 100 }, (_, i) => `Context item ${i}`)
    });

    testEdgeCase('should handle large retrievalContext arrays', {
      retrievalContext: Array.from({ length: 100 }, (_, i) => `Retrieval item ${i}`)
    });
  });

  describe('Quality Evaluation', () => {
    it('should trigger quality evaluation when enabled', async () => {
      const req = createBaseRequest({
        enableQualityEvaluation: true,
        evaluationModel: 'gpt-4'
      });

      mockAddEvalDatasetDataQualityJob.mockResolvedValue(undefined);
      const result = await handler_test(req as any);

      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: mockDataId,
        evaluationModel: 'gpt-4'
      });
      expect(result).toBe(mockDataId);
    });

    it('should not trigger quality evaluation when disabled', async () => {
      const req = createBaseRequest();
      const result = await handler_test(req as any);

      expect(mockAddEvalDatasetDataQualityJob).not.toHaveBeenCalled();
      expect(result).toBe(mockDataId);
    });

    it('should not include qualityStatus in metadata when quality evaluation is enabled', async () => {
      const req = createBaseRequest({
        enableQualityEvaluation: true,
        evaluationModel: 'gpt-4'
      });

      mockAddEvalDatasetDataQualityJob.mockResolvedValue(undefined);
      await handler_test(req as any);

      expectDataCreation(createExpectedDataObject({ metadata: {} }));
    });
  });
});
