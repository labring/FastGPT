import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/collection/create';
import { authEvaluationDatasetCreate } from '@fastgpt/service/core/evaluation/common';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';

vi.mock('@fastgpt/service/core/evaluation/common');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn()
  },
  EvalDatasetCollectionName: 'eval_dataset_collections'
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));
vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamEvalDatasetLimit: vi.fn(),
  checkTeamAIPoints: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getDefaultEvaluationModel: vi.fn()
}));

import {
  checkTeamEvalDatasetLimit,
  checkTeamAIPoints
} from '@fastgpt/service/support/permission/teamLimit';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';

const mockAuthEvaluationDatasetCreate = vi.mocked(authEvaluationDatasetCreate);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockCheckTeamEvalDatasetLimit = vi.mocked(checkTeamEvalDatasetLimit);
const mockCheckTeamAIPoints = vi.mocked(checkTeamAIPoints);
const mockAddAuditLog = vi.mocked(addAuditLog);

describe('EvalDatasetCollection Create API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const mockDatasetId = '65f5b5b5b5b5b5b5b5b5b5b5';

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthEvaluationDatasetCreate.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback({} as any);
    });

    mockMongoEvalDatasetCollection.create.mockResolvedValue([{ _id: mockDatasetId }] as any);
    mockMongoEvalDatasetCollection.countDocuments.mockResolvedValue(0);

    // Mock team limit checks to pass by default
    mockCheckTeamEvalDatasetLimit.mockResolvedValue(undefined);
    mockCheckTeamAIPoints.mockResolvedValue(undefined);
  });

  describe('Parameter Validation', () => {
    it('should reject when name is missing', async () => {
      const req = {
        body: { description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name is required and must be a non-empty string'
      );
    });

    it('should reject when name is empty string', async () => {
      const req = {
        body: { name: '', description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name is required and must be a non-empty string'
      );
    });

    it('should reject when name is only whitespace', async () => {
      const req = {
        body: { name: '   ', description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name is required and must be a non-empty string'
      );
    });

    it('should reject when name is not a string', async () => {
      const req = {
        body: { name: 123, description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name is required and must be a non-empty string'
      );
    });

    it('should reject when name exceeds 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const req = {
        body: { name: longName, description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name must be less than 100 characters'
      );
    });

    it('should reject when description is not a string', async () => {
      const req = {
        body: { name: 'Test Dataset', description: 123 }
      };

      await expect(handler_test(req as any)).rejects.toEqual('Description must be a string');
    });

    it('should reject when description exceeds 100 characters', async () => {
      const longDescription = 'a'.repeat(101);
      const req = {
        body: { name: 'Test Dataset', description: longDescription }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Description must be less than 100 characters'
      );
    });

    it('should accept valid name without description', async () => {
      const req = {
        body: { name: 'Test Dataset' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
    });

    it('should accept valid name with empty description', async () => {
      const req = {
        body: { name: 'Test Dataset', description: '' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetCreate with correct parameters', async () => {
      const req = {
        body: { name: 'Test Dataset', description: 'Test description' }
      };

      await handler_test(req as any);

      expect(mockAuthEvaluationDatasetCreate).toHaveBeenCalledWith({
        req,
        authToken: true,
        authApiKey: true
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthEvaluationDatasetCreate.mockRejectedValue(authError);

      const req = {
        body: { name: 'Test Dataset', description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Name Uniqueness Validation', () => {
    it('should reject when dataset name already exists in team', async () => {
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue({
        _id: 'existing-dataset-id',
        name: 'Test Dataset',
        teamId: validTeamId
      } as any);

      const req = {
        body: { name: 'Test Dataset', description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'A dataset with this name already exists'
      );

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        teamId: validTeamId,
        name: 'Test Dataset'
      });
    });

    it('should check name with trimmed whitespace', async () => {
      const req = {
        body: { name: '  Test Dataset  ', description: 'Test description' }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        teamId: validTeamId,
        name: 'Test Dataset'
      });
    });
  });

  describe('Dataset Creation', () => {
    it('should create dataset with correct parameters', async () => {
      const req = {
        body: { name: 'Test Dataset', description: 'Test description' }
      };

      const result = await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
      expect(mockMongoEvalDatasetCollection.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            name: 'Test Dataset',
            description: 'Test description'
          }
        ],
        { session: {}, ordered: true }
      );
      expect(result).toBe(mockDatasetId);
    });

    it('should trim name and description before saving', async () => {
      const req = {
        body: { name: '  Test Dataset  ', description: '  Test description  ' }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            name: 'Test Dataset',
            description: 'Test description'
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should handle empty description correctly', async () => {
      const req = {
        body: { name: 'Test Dataset', description: '' }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            name: 'Test Dataset',
            description: ''
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should handle missing description correctly', async () => {
      const req = {
        body: { name: 'Test Dataset' }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.create).toHaveBeenCalledWith(
        [
          {
            teamId: validTeamId,
            tmbId: validTmbId,
            name: 'Test Dataset',
            description: ''
          }
        ],
        { session: {}, ordered: true }
      );
    });

    it('should return dataset ID as string', async () => {
      const req = {
        body: { name: 'Test Dataset', description: 'Test description' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
      expect(typeof result).toBe('string');
    });

    it('should propagate database creation errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoSessionRun.mockRejectedValue(dbError);

      const req = {
        body: { name: 'Test Dataset', description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle exactly 100 character name', async () => {
      const exactName = 'a'.repeat(100);
      const req = {
        body: { name: exactName, description: 'Test description' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
    });

    it('should handle exactly 100 character description', async () => {
      const exactDescription = 'a'.repeat(100);
      const req = {
        body: { name: 'Test Dataset', description: exactDescription }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
    });

    it('should handle special characters in name', async () => {
      const specialName = 'Test-Dataset_2024@Company!';
      const req = {
        body: { name: specialName, description: 'Test description' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
    });
  });

  describe('Evaluation Model Validation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockAuthEvaluationDatasetCreate.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId
      });
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);
      mockMongoEvalDatasetCollection.create.mockResolvedValue([{ _id: mockDatasetId }] as any);
      mockCheckTeamEvalDatasetLimit.mockResolvedValue(undefined);
      mockCheckTeamAIPoints.mockResolvedValue(undefined);
    });

    it('should reject invalid evaluation model', async () => {
      const invalidModel = 'invalid-model';

      // Mock global.llmModelMap.has to return false for invalid model
      vi.spyOn(global.llmModelMap, 'has').mockReturnValue(false);

      const req = {
        body: { name: 'Test Dataset', evaluationModel: invalidModel }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        expect.stringContaining('Invalid evaluation model')
      );

      expect(global.llmModelMap.has).toHaveBeenCalledWith(invalidModel);
    });

    it('should accept valid evaluation model', async () => {
      const validModel = 'gpt-4';

      // Mock global.llmModelMap.has to return true for valid model
      vi.spyOn(global.llmModelMap, 'has').mockReturnValue(true);

      const req = {
        body: { name: 'Test Dataset', evaluationModel: validModel }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
      expect(global.llmModelMap.has).toHaveBeenCalledWith(validModel);
    });

    it('should use default evaluation model when none provided', async () => {
      const defaultModel = 'gpt-3.5-turbo';
      const { getDefaultEvaluationModel } = await import('@fastgpt/service/core/ai/model');
      vi.mocked(getDefaultEvaluationModel).mockReturnValue({ model: defaultModel } as any);

      const req = {
        body: { name: 'Test Dataset' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
      expect(getDefaultEvaluationModel).toHaveBeenCalled();
    });
  });

  describe('Team Limit Checks', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockAuthEvaluationDatasetCreate.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId
      });
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);
      mockMongoEvalDatasetCollection.create.mockResolvedValue([{ _id: mockDatasetId }] as any);
    });

    it('should propagate team eval dataset limit errors', async () => {
      const limitError = new Error('Team evaluation dataset limit exceeded');
      mockCheckTeamEvalDatasetLimit.mockRejectedValue(limitError);

      const req = {
        body: { name: 'Test Dataset' }
      };

      await expect(handler_test(req as any)).rejects.toThrow(
        'Team evaluation dataset limit exceeded'
      );
      expect(mockCheckTeamEvalDatasetLimit).toHaveBeenCalledWith(validTeamId);
    });

    it('should propagate team AI points errors', async () => {
      const pointsError = new Error('Insufficient AI points');
      mockCheckTeamAIPoints.mockRejectedValue(pointsError);

      const req = {
        body: { name: 'Test Dataset' }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Insufficient AI points');
      expect(mockCheckTeamAIPoints).toHaveBeenCalledWith(validTeamId);
    });

    it('should call both team limit checks successfully', async () => {
      mockCheckTeamEvalDatasetLimit.mockResolvedValue(undefined);
      mockCheckTeamAIPoints.mockResolvedValue(undefined);

      const req = {
        body: { name: 'Test Dataset' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
      expect(mockCheckTeamEvalDatasetLimit).toHaveBeenCalledWith(validTeamId);
      expect(mockCheckTeamAIPoints).toHaveBeenCalledWith(validTeamId);
    });
  });

  describe('Audit Logging', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockAuthEvaluationDatasetCreate.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId
      });
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);
      mockMongoEvalDatasetCollection.create.mockResolvedValue([{ _id: mockDatasetId }] as any);
      mockCheckTeamEvalDatasetLimit.mockResolvedValue(undefined);
      mockCheckTeamAIPoints.mockResolvedValue(undefined);
    });

    it('should create audit log with correct parameters', async () => {
      const datasetName = 'Test Dataset';
      const req = {
        body: { name: datasetName }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);

      // Check that audit log was called with correct parameters
      expect(mockAddAuditLog).toHaveBeenCalledWith({
        tmbId: validTmbId,
        teamId: validTeamId,
        event: expect.any(String), // AuditEventEnum.CREATE_EVALUATION_DATASET_COLLECTION
        params: {
          collectionName: datasetName.trim()
        }
      });
    });

    it('should NOT create audit log when dataset creation fails', async () => {
      const datasetName = 'Test Dataset';
      const dbError = new Error('Database error');

      mockMongoSessionRun.mockRejectedValue(dbError);

      const req = {
        body: { name: datasetName }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Database error');

      // Audit log should NOT be called if creation fails
      expect(mockAddAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockAuthEvaluationDatasetCreate.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId
      });
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);
      mockMongoEvalDatasetCollection.create.mockResolvedValue([{ _id: mockDatasetId }] as any);
      mockCheckTeamEvalDatasetLimit.mockResolvedValue(undefined);
      mockCheckTeamAIPoints.mockResolvedValue(undefined);
    });

    it('should reject when evaluation model is not a string', async () => {
      const req = {
        body: { name: 'Test Dataset', evaluationModel: 123 }
      };

      await expect(handler_test(req as any)).rejects.toEqual('Evaluation model must be a string');
    });

    it('should reject when evaluation model exceeds 100 characters', async () => {
      const longModel = 'a'.repeat(101);
      const req = {
        body: { name: 'Test Dataset', evaluationModel: longModel }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Evaluation model must be less than 100 characters'
      );
    });

    it('should handle exactly 100 character evaluation model', async () => {
      const exactLengthModel = 'a'.repeat(100);

      // Mock global.llmModelMap.has to return true for valid model
      vi.spyOn(global.llmModelMap, 'has').mockReturnValue(true);

      const req = {
        body: { name: 'Test Dataset', evaluationModel: exactLengthModel }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(mockDatasetId);
      expect(global.llmModelMap.has).toHaveBeenCalledWith(exactLengthModel);
    });
  });
});
