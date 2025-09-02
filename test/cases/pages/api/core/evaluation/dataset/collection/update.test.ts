import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/collection/update';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

vi.mock('@fastgpt/service/support/permission/user/auth');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn(),
    updateOne: vi.fn()
  }
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

const mockAuthUserPer = vi.mocked(authUserPer);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);

describe('EvalDatasetCollection Update API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const mockCollectionId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const existingCollection = {
    _id: mockCollectionId,
    teamId: validTeamId,
    name: 'Old Dataset Name',
    description: 'Old description'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthUserPer.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    // Default setup: collection exists, no name conflict
    mockMongoEvalDatasetCollection.findOne
      .mockResolvedValueOnce(existingCollection as any) // First call: existence check
      .mockResolvedValueOnce(null); // Second call: name conflict check

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback({} as any);
    });

    mockMongoEvalDatasetCollection.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);
  });

  describe('Parameter Validation', () => {
    it('should reject when collectionId is missing', async () => {
      const req = {
        body: { name: 'Updated Name', description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Collection ID is required and must be a non-empty string'
      );
    });

    it('should reject when collectionId is empty string', async () => {
      const req = {
        body: { collectionId: '', name: 'Updated Name', description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Collection ID is required and must be a non-empty string'
      );
    });

    it('should reject when collectionId is only whitespace', async () => {
      const req = {
        body: { collectionId: '   ', name: 'Updated Name', description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Collection ID is required and must be a non-empty string'
      );
    });

    it('should reject when collectionId is not a string', async () => {
      const req = {
        body: { collectionId: 123, name: 'Updated Name', description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Collection ID is required and must be a non-empty string'
      );
    });

    it('should reject when name is missing', async () => {
      const req = {
        body: { collectionId: mockCollectionId, description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name is required and must be a non-empty string'
      );
    });

    it('should reject when name is empty string', async () => {
      const req = {
        body: { collectionId: mockCollectionId, name: '', description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name is required and must be a non-empty string'
      );
    });

    it('should reject when name is only whitespace', async () => {
      const req = {
        body: { collectionId: mockCollectionId, name: '   ', description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name is required and must be a non-empty string'
      );
    });

    it('should reject when name is not a string', async () => {
      const req = {
        body: { collectionId: mockCollectionId, name: 123, description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name is required and must be a non-empty string'
      );
    });

    it('should reject when name exceeds 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const req = {
        body: { collectionId: mockCollectionId, name: longName, description: 'Updated description' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Name must be less than 100 characters'
      );
    });

    it('should reject when description is not a string', async () => {
      const req = {
        body: { collectionId: mockCollectionId, name: 'Updated Name', description: 123 }
      };

      await expect(handler_test(req as any)).rejects.toEqual('Description must be a string');
    });

    it('should reject when description exceeds 100 characters', async () => {
      const longDescription = 'a'.repeat(101);
      const req = {
        body: { collectionId: mockCollectionId, name: 'Updated Name', description: longDescription }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Description must be less than 100 characters'
      );
    });

    it('should accept valid parameters', async () => {
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should accept valid name without description', async () => {
      const req = {
        body: { collectionId: mockCollectionId, name: 'Updated Name' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should accept valid name with empty description', async () => {
      const req = {
        body: { collectionId: mockCollectionId, name: 'Updated Name', description: '' }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authUserPer with correct parameters', async () => {
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
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
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(authError);
    });
  });

  describe('Collection Existence Validation', () => {
    it('should reject when collection does not exist', async () => {
      // Reset mock and set up for this specific test
      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne.mockResolvedValueOnce(null);

      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual('Dataset collection not found');

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        _id: mockCollectionId,
        teamId: validTeamId
      });
    });

    it('should reject when collection belongs to different team', async () => {
      // Reset mock and set up for this specific test
      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne.mockResolvedValueOnce(null);

      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual('Dataset collection not found');
    });

    it('should proceed when collection exists and belongs to team', async () => {
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });
  });

  describe('Name Uniqueness Validation', () => {
    it('should reject when updated name conflicts with another collection in team', async () => {
      const conflictingCollection = {
        _id: 'different-id',
        name: 'Updated Name',
        teamId: validTeamId
      };

      // Reset mock and set up for this specific test
      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne
        .mockResolvedValueOnce(existingCollection as any) // First call for existence check
        .mockResolvedValueOnce(conflictingCollection as any); // Second call for name conflict check

      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'A dataset with this name already exists'
      );

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        teamId: validTeamId,
        name: 'Updated Name',
        _id: { $ne: mockCollectionId }
      });
    });

    it('should allow keeping the same name for the same collection', async () => {
      // Reset the mock to set up specific behavior for this test
      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne
        .mockResolvedValueOnce(existingCollection as any) // First call for existence check
        .mockResolvedValueOnce(null); // Second call for name conflict check returns null

      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Old Dataset Name',
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should check name with trimmed whitespace', async () => {
      // Reset the mock to set up specific behavior for this test
      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne
        .mockResolvedValueOnce(existingCollection as any)
        .mockResolvedValueOnce(null);

      const req = {
        body: {
          collectionId: mockCollectionId,
          name: '  Updated Name  ',
          description: 'Updated description'
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        teamId: validTeamId,
        name: 'Updated Name',
        _id: { $ne: mockCollectionId }
      });
    });
  });

  describe('Collection Update', () => {
    it('should update collection with correct parameters', async () => {
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
      expect(mockMongoEvalDatasetCollection.updateOne).toHaveBeenCalledWith(
        { _id: mockCollectionId, teamId: validTeamId, tmbId: validTmbId },
        {
          $set: {
            name: 'Updated Name',
            description: 'Updated description',
            updateTime: expect.any(Date)
          }
        },
        { session: {} }
      );
      expect(result).toBe('success');
    });

    it('should trim name and description before saving', async () => {
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: '  Updated Name  ',
          description: '  Updated description  '
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.updateOne).toHaveBeenCalledWith(
        { _id: mockCollectionId, teamId: validTeamId, tmbId: validTmbId },
        {
          $set: {
            name: 'Updated Name',
            description: 'Updated description',
            updateTime: expect.any(Date)
          }
        },
        { session: {} }
      );
    });

    it('should handle empty description correctly', async () => {
      const req = {
        body: { collectionId: mockCollectionId, name: 'Updated Name', description: '' }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.updateOne).toHaveBeenCalledWith(
        { _id: mockCollectionId, teamId: validTeamId, tmbId: validTmbId },
        {
          $set: {
            name: 'Updated Name',
            description: '',
            updateTime: expect.any(Date)
          }
        },
        { session: {} }
      );
    });

    it('should handle missing description correctly', async () => {
      const req = {
        body: { collectionId: mockCollectionId, name: 'Updated Name' }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.updateOne).toHaveBeenCalledWith(
        { _id: mockCollectionId, teamId: validTeamId, tmbId: validTmbId },
        {
          $set: {
            name: 'Updated Name',
            description: '',
            updateTime: expect.any(Date)
          }
        },
        { session: {} }
      );
    });

    it('should return success string', async () => {
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(typeof result).toBe('string');
    });

    it('should propagate database update errors', async () => {
      // Reset the mock to set up specific behavior for this test
      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne
        .mockResolvedValueOnce(existingCollection as any) // First call: existence check
        .mockResolvedValueOnce(null); // Second call: name conflict check

      const dbError = new Error('Database connection failed');
      mockMongoSessionRun.mockRejectedValue(dbError);

      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual('Failed to update dataset collection');
    });
  });

  describe('Edge Cases', () => {
    it('should handle exactly 100 character name', async () => {
      const exactName = 'a'.repeat(100);
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: exactName,
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle exactly 100 character description', async () => {
      const exactDescription = 'a'.repeat(100);
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: 'Updated Name',
          description: exactDescription
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle special characters in name', async () => {
      const specialName = 'Updated-Dataset_2024@Company!';
      const req = {
        body: {
          collectionId: mockCollectionId,
          name: specialName,
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle ObjectId string format for collectionId', async () => {
      const objectIdString = '507f1f77bcf86cd799439011';
      const req = {
        body: {
          collectionId: objectIdString,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle very long valid ObjectId', async () => {
      const longValidId = '507f1f77bcf86cd799439011';
      const req = {
        body: {
          collectionId: longValidId,
          name: 'Updated Name',
          description: 'Updated description'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });
  });
});
