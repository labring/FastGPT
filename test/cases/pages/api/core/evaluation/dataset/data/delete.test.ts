import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/delete';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  removeEvalDatasetDataQualityJobsRobust,
  checkEvalDatasetDataQualityJobActive
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { addLog } from '@fastgpt/service/common/system/log';

vi.mock('@fastgpt/service/support/permission/user/auth');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    findById: vi.fn(),
    deleteOne: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataQualityMq');
vi.mock('@fastgpt/service/common/system/log');
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

const mockAuthUserPer = vi.mocked(authUserPer);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockRemoveEvalDatasetDataQualityJobsRobust = vi.mocked(
  removeEvalDatasetDataQualityJobsRobust
);
const mockCheckEvalDatasetDataQualityJobActive = vi.mocked(checkEvalDatasetDataQualityJobActive);
const mockAddLog = vi.mocked(addLog);

describe('EvalDatasetData Delete API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validDataId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b6';

  const mockSession = { id: 'session-123' };
  const mockExistingData = {
    _id: validDataId,
    datasetId: validCollectionId,
    userInput: 'Test input',
    expectedOutput: 'Test output'
  };

  const mockCollection = {
    _id: validCollectionId,
    teamId: validTeamId,
    name: 'Test Collection'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthUserPer.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback(mockSession as any);
    });

    mockMongoEvalDatasetData.findById.mockReturnValue({
      session: vi.fn().mockResolvedValue(mockExistingData)
    } as any);

    mockMongoEvalDatasetCollection.findOne.mockReturnValue({
      session: vi.fn().mockResolvedValue(mockCollection)
    } as any);

    mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);
    mockMongoEvalDatasetData.deleteOne.mockResolvedValue({ deletedCount: 1 } as any);

    mockAddLog.info = vi.fn();
    mockAddLog.error = vi.fn();
  });

  describe('Parameter Validation', () => {
    it('should reject when dataId is missing', async () => {
      const req = {
        query: {}
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });

    it('should reject when dataId is null', async () => {
      const req = {
        query: { dataId: null }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });

    it('should reject when dataId is undefined', async () => {
      const req = {
        query: { dataId: undefined }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });

    it('should reject when dataId is not a string', async () => {
      const req = {
        query: { dataId: 123 }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });

    it('should reject when dataId is empty string', async () => {
      const req = {
        query: { dataId: '' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authUserPer with correct parameters', async () => {
      const req = {
        query: { dataId: validDataId }
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
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toBe(authError);
    });
  });

  describe('Data Validation', () => {
    it('should verify data exists', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.findById).toHaveBeenCalledWith(validDataId);
    });

    it('should reject when data does not exist', async () => {
      mockMongoEvalDatasetData.findById.mockReturnValue({
        session: vi.fn().mockResolvedValue(null)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toEqual('Dataset data not found');
    });

    it('should verify collection exists and belongs to team', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        _id: validCollectionId,
        teamId: validTeamId
      });
    });

    it('should reject when collection does not exist', async () => {
      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockResolvedValue(null)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Access denied or dataset collection not found'
      );
    });

    it('should reject when collection belongs to different team', async () => {
      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockResolvedValue(null)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'Access denied or dataset collection not found'
      );
    });
  });

  describe('Quality Job Management', () => {
    it('should check for active quality evaluation jobs', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalledWith(validDataId);
    });

    it('should remove active quality job before deletion', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);

      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalledWith([validDataId]);
      expect(mockAddLog.info).toHaveBeenCalledWith(
        'Removing active quality evaluation job before deletion',
        {
          dataId: validDataId,
          teamId: validTeamId
        }
      );
      expect(mockAddLog.info).toHaveBeenCalledWith(
        'Quality evaluation job removed successfully before deletion',
        {
          dataId: validDataId,
          teamId: validTeamId
        }
      );
    });

    it('should continue deletion if quality job removal fails', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);
      const jobError = new Error('Failed to remove job');
      mockRemoveEvalDatasetDataQualityJobsRobust.mockRejectedValue(jobError);

      const req = {
        query: { dataId: validDataId }
      };

      const result = await handler_test(req as any);

      expect(mockAddLog.error).toHaveBeenCalledWith(
        'Failed to remove quality evaluation job before deletion',
        {
          dataId: validDataId,
          teamId: validTeamId,
          error: jobError
        }
      );
      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should not attempt to remove quality job when none is active', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);

      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
      expect(mockAddLog.info).not.toHaveBeenCalledWith(
        'Removing active quality evaluation job before deletion',
        expect.any(Object)
      );
    });
  });

  describe('Data Deletion', () => {
    it('should delete data with correct parameters', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalledWith(
        { _id: validDataId },
        { session: mockSession }
      );
      expect(result).toBe('success');
    });

    it('should log successful deletion', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockAddLog.info).toHaveBeenCalledWith('Evaluation dataset data deleted successfully', {
        dataId: validDataId,
        datasetId: validCollectionId,
        teamId: validTeamId
      });
    });

    it('should use MongoDB session for all operations', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.findById().session).toHaveBeenCalledWith(mockSession);
      expect(mockMongoEvalDatasetCollection.findOne().session).toHaveBeenCalledWith(mockSession);
      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalledWith(
        { _id: validDataId },
        { session: mockSession }
      );
    });

    it('should return success message', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(typeof result).toBe('string');
    });
  });

  describe('Session Management', () => {
    it('should wrap operations in MongoDB session', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should propagate session errors', async () => {
      const sessionError = new Error('Session failed');
      mockMongoSessionRun.mockRejectedValue(sessionError);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toBe(sessionError);
    });
  });

  describe('Error Handling', () => {
    it('should propagate database findById errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetData.findById.mockReturnValue({
        session: vi.fn().mockRejectedValue(dbError)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should propagate collection findOne errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockRejectedValue(dbError)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should propagate deleteOne errors', async () => {
      const dbError = new Error('Database deletion failed');
      mockMongoEvalDatasetData.deleteOne.mockRejectedValue(dbError);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should propagate quality job check errors', async () => {
      const jobError = new Error('Quality job check failed');
      mockCheckEvalDatasetDataQualityJobActive.mockRejectedValue(jobError);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toBe(jobError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle valid ObjectId format for dataId', async () => {
      const validObjectId = '507f1f77bcf86cd799439011';
      const req = {
        query: { dataId: validObjectId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle data with minimal fields', async () => {
      const minimalData = {
        _id: validDataId,
        datasetId: validCollectionId
      };

      mockMongoEvalDatasetData.findById.mockReturnValue({
        session: vi.fn().mockResolvedValue(minimalData)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle collection with minimal fields', async () => {
      const minimalCollection = {
        _id: validCollectionId,
        teamId: validTeamId
      };

      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockResolvedValue(minimalCollection)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle whitespace in dataId', async () => {
      const req = {
        query: { dataId: '  ' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });

    it('should handle array dataId', async () => {
      const req = {
        query: { dataId: [validDataId] }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });

    it('should handle object dataId', async () => {
      const req = {
        query: { dataId: { id: validDataId } }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete deletion flow with active quality job', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);

      const req = {
        query: { dataId: validDataId }
      };

      const result = await handler_test(req as any);

      // Verify complete flow
      expect(mockAuthUserPer).toHaveBeenCalled();
      expect(mockMongoEvalDatasetData.findById).toHaveBeenCalled();
      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalled();
      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalled();
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalled();
      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should handle complete deletion flow without active quality job', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);

      const req = {
        query: { dataId: validDataId }
      };

      const result = await handler_test(req as any);

      // Verify complete flow
      expect(mockAuthUserPer).toHaveBeenCalled();
      expect(mockMongoEvalDatasetData.findById).toHaveBeenCalled();
      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalled();
      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalled();
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should maintain transaction integrity on session failure', async () => {
      const sessionError = new Error('Session rollback');
      mockMongoEvalDatasetData.deleteOne.mockRejectedValue(sessionError);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toBe(sessionError);

      // Verify session was used for all operations
      expect(mockMongoSessionRun).toHaveBeenCalled();
    });
  });
});
