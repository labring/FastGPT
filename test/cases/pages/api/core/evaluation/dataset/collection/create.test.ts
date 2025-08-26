import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/collection/create';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

vi.mock('@fastgpt/service/support/permission/user/auth');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn(),
    create: vi.fn()
  }
}));

const mockAuthUserPer = vi.mocked(authUserPer);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);

describe('EvalDatasetCollection Create API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const mockDatasetId = '65f5b5b5b5b5b5b5b5b5b5b5';

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthUserPer.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback({} as any);
    });

    mockMongoEvalDatasetCollection.create.mockResolvedValue([{ _id: mockDatasetId }] as any);
  });

  describe('Parameter Validation', () => {
    it('should reject when name is missing', async () => {
      const req = {
        body: { description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual({
        statusCode: 400,
        message: 'Name is required and must be a non-empty string'
      });
    });

    it('should reject when name is empty string', async () => {
      const req = {
        body: { name: '', description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual({
        statusCode: 400,
        message: 'Name is required and must be a non-empty string'
      });
    });

    it('should reject when name is only whitespace', async () => {
      const req = {
        body: { name: '   ', description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual({
        statusCode: 400,
        message: 'Name is required and must be a non-empty string'
      });
    });

    it('should reject when name is not a string', async () => {
      const req = {
        body: { name: 123, description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual({
        statusCode: 400,
        message: 'Name is required and must be a non-empty string'
      });
    });

    it('should reject when name exceeds 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const req = {
        body: { name: longName, description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual({
        statusCode: 400,
        message: 'Name must be less than 100 characters'
      });
    });

    it('should reject when description is not a string', async () => {
      const req = {
        body: { name: 'Test Dataset', description: 123 }
      };

      await expect(handler_test(req as any)).rejects.toEqual({
        statusCode: 400,
        message: 'Description must be a string'
      });
    });

    it('should reject when description exceeds 500 characters', async () => {
      const longDescription = 'a'.repeat(501);
      const req = {
        body: { name: 'Test Dataset', description: longDescription }
      };

      await expect(handler_test(req as any)).rejects.toEqual({
        statusCode: 400,
        message: 'Description must be less than 500 characters'
      });
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
    it('should call authUserPer with correct parameters', async () => {
      const req = {
        body: { name: 'Test Dataset', description: 'Test description' }
      };

      await handler_test(req as any);

      expect(mockAuthUserPer).toHaveBeenCalledWith({
        req,
        authToken: true,
        authApiKey: true,
        per: WritePermissionVal
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthUserPer.mockRejectedValue(authError);

      const req = {
        body: { name: 'Test Dataset', description: 'Test description' }
      };

      await expect(handler_test(req as any)).rejects.toBe(authError);
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

      await expect(handler_test(req as any)).rejects.toEqual({
        statusCode: 409,
        message: 'A dataset with this name already exists'
      });

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

    it('should handle exactly 500 character description', async () => {
      const exactDescription = 'a'.repeat(500);
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
});
