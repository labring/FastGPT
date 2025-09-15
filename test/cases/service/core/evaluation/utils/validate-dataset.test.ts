import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  validateEvaluationParamsForCreate,
  validateEvaluationParamsForUpdate
} from '@fastgpt/service/core/evaluation/utils';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvaluatorSchema } from '@fastgpt/global/core/evaluation/type';

// Mock the dataset collection
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn()
  }
}));

// Mock target and evaluator validation to always return valid
vi.mock('@fastgpt/service/core/evaluation/target', () => ({
  validateTargetConfig: vi.fn().mockResolvedValue({ isValid: true, errors: [] })
}));

vi.mock('@fastgpt/service/core/evaluation/evaluator', () => ({
  validateEvaluatorConfig: vi.fn().mockResolvedValue({ isValid: true, errors: [] })
}));

describe('Dataset Existence Validation', () => {
  const teamId = new Types.ObjectId().toString();
  const validDatasetId = new Types.ObjectId().toString();

  const mockDataset = {
    _id: new Types.ObjectId(validDatasetId),
    teamId: new Types.ObjectId(teamId),
    name: 'Test Dataset',
    dataItems: [{ userInput: 'test input', expectedOutput: 'test output' }]
  };

  const validEvaluator: EvaluatorSchema = {
    metric: {
      _id: new Types.ObjectId().toString(),
      teamId: new Types.ObjectId().toString(),
      tmbId: new Types.ObjectId().toString(),
      name: 'Test Metric',
      type: EvalMetricTypeEnum.Custom,
      prompt: 'Test prompt',
      userInputRequired: true,
      actualOutputRequired: true,
      expectedOutputRequired: true,
      contextRequired: false,
      retrievalContextRequired: false,
      embeddingRequired: false,
      llmRequired: true,
      createTime: new Date(),
      updateTime: new Date()
    },
    runtimeConfig: {},
    weight: 1
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dataset ID Format Validation', () => {
    it('should reject invalid dataset ID format', async () => {
      const result = await validateEvaluationParamsForCreate(
        {
          name: 'Test Evaluation',
          datasetId: 'invalid-id-format',
          target: {
            type: 'workflow',
            config: {
              appId: new Types.ObjectId().toString(),
              versionId: new Types.ObjectId().toString()
            }
          },
          evaluators: [validEvaluator]
        },
        teamId
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: EvaluationErrEnum.evalDatasetIdRequired,
        message: 'Invalid dataset ID format',
        field: 'datasetId'
      });
    });

    it('should accept valid dataset ID format when dataset exists', async () => {
      // Mock dataset found
      const mockFindOne = MongoEvalDatasetCollection.findOne as any;
      mockFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockDataset)
      });

      const result = await validateEvaluationParamsForCreate(
        {
          name: 'Test Evaluation',
          datasetId: validDatasetId,
          target: {
            type: 'workflow',
            config: {
              appId: new Types.ObjectId().toString(),
              versionId: new Types.ObjectId().toString()
            }
          },
          evaluators: [validEvaluator]
        },
        teamId
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Verify dataset lookup was called with correct parameters
      expect(MongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(validDatasetId),
        teamId: new Types.ObjectId(teamId)
      });
    });
  });

  describe('Dataset Existence Validation', () => {
    it('should reject when dataset does not exist', async () => {
      // Mock dataset not found
      const mockFindOne = MongoEvalDatasetCollection.findOne as any;
      mockFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const result = await validateEvaluationParamsForCreate(
        {
          name: 'Test Evaluation',
          datasetId: validDatasetId,
          target: {
            type: 'workflow',
            config: {
              appId: new Types.ObjectId().toString(),
              versionId: new Types.ObjectId().toString()
            }
          },
          evaluators: [validEvaluator]
        },
        teamId
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: EvaluationErrEnum.datasetCollectionNotFound,
        message: 'Dataset not found or access denied',
        field: 'datasetId'
      });
    });

    it('should check dataset existence without teamId filter when teamId not provided', async () => {
      // Mock dataset found
      const mockFindOne = MongoEvalDatasetCollection.findOne as any;
      mockFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockDataset)
      });

      const result = await validateEvaluationParamsForCreate(
        {
          name: 'Test Evaluation',
          datasetId: validDatasetId,
          target: {
            type: 'workflow',
            config: {
              appId: new Types.ObjectId().toString(),
              versionId: new Types.ObjectId().toString()
            }
          },
          evaluators: [validEvaluator]
        }
        // No teamId provided
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Should search without teamId filter
      expect(MongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(validDatasetId)
      });
    });

    it('should enforce team-based access control', async () => {
      const differentTeamId = new Types.ObjectId().toString();

      // Mock dataset not found for this team
      const mockFindOne = MongoEvalDatasetCollection.findOne as any;
      mockFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null) // Not found for this team
      });

      const result = await validateEvaluationParamsForCreate(
        {
          name: 'Test Evaluation',
          datasetId: validDatasetId,
          target: {
            type: 'workflow',
            config: {
              appId: new Types.ObjectId().toString(),
              versionId: new Types.ObjectId().toString()
            }
          },
          evaluators: [validEvaluator]
        },
        differentTeamId
      );

      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe(EvaluationErrEnum.datasetCollectionNotFound);

      // Should search with the specified teamId
      expect(MongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(validDatasetId),
        teamId: new Types.ObjectId(differentTeamId)
      });
    });
  });

  describe('Update Mode Validation', () => {
    it('should validate dataset existence in update mode', async () => {
      // Mock dataset found
      const mockFindOne = MongoEvalDatasetCollection.findOne as any;
      mockFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockDataset)
      });

      const result = await validateEvaluationParamsForUpdate(
        {
          datasetId: validDatasetId
          // Only updating datasetId
        },
        teamId
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip dataset validation when datasetId not provided in update mode', async () => {
      const result = await validateEvaluationParamsForUpdate(
        {
          name: 'Updated Name'
          // No datasetId provided
        },
        teamId
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Should not call dataset validation when datasetId is not provided
      expect(MongoEvalDatasetCollection.findOne).not.toHaveBeenCalled();
    });

    it('should reject empty datasetId in update mode', async () => {
      const result = await validateEvaluationParamsForUpdate(
        {
          datasetId: ''
        },
        teamId
      );

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatchObject({
        code: EvaluationErrEnum.evalDatasetIdRequired,
        message: 'Dataset ID is required',
        field: 'datasetId'
      });
    });
  });

  describe('Database Error Handling', () => {
    it('should propagate database errors', async () => {
      // Mock database error
      const mockFindOne = MongoEvalDatasetCollection.findOne as any;
      mockFindOne.mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error('Database connection failed'))
      });

      await expect(
        validateEvaluationParamsForCreate(
          {
            name: 'Test Evaluation',
            datasetId: validDatasetId,
            target: {
              type: 'workflow',
              config: {
                appId: new Types.ObjectId().toString(),
                versionId: new Types.ObjectId().toString()
              }
            },
            evaluators: [validEvaluator]
          },
          teamId
        )
      ).rejects.toThrow('Database connection failed');
    });
  });
});
