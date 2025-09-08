import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/collection/delete';
import { authEvaluationDatasetWrite } from '@fastgpt/service/core/evaluation/common';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { removeEvalDatasetSmartGenerateJobsRobust } from '@fastgpt/service/core/evaluation/dataset/smartGenerateMq';
import { removeEvalDatasetDataQualityJobsRobust } from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { removeEvalDatasetDataSynthesizeJobsRobust } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { addLog } from '@fastgpt/service/common/system/log';

vi.mock('@fastgpt/service/core/evaluation/common');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn(),
    deleteOne: vi.fn()
  },
  EvalDatasetCollectionName: 'eval_dataset_collections'
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    find: vi.fn(),
    deleteMany: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/smartGenerateMq', () => ({
  removeEvalDatasetSmartGenerateJobsRobust: vi.fn()
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataQualityMq', () => ({
  removeEvalDatasetDataQualityJobsRobust: vi.fn()
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq', () => ({
  removeEvalDatasetDataSynthesizeJobsRobust: vi.fn()
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

const mockAuthEvaluationDatasetWrite = vi.mocked(authEvaluationDatasetWrite);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockRemoveEvalDatasetSmartGenerateJobsRobust = vi.mocked(
  removeEvalDatasetSmartGenerateJobsRobust
);
const mockRemoveEvalDatasetDataQualityJobsRobust = vi.mocked(
  removeEvalDatasetDataQualityJobsRobust
);
const mockRemoveEvalDatasetDataSynthesizeJobsRobust = vi.mocked(
  removeEvalDatasetDataSynthesizeJobsRobust
);
const mockAddLog = vi.mocked(addLog);

describe('EvalDatasetCollection Delete API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b5';

  const mockSession = { id: 'session-123' };
  const mockCollection = {
    _id: validCollectionId,
    name: 'Test Collection',
    teamId: validTeamId,
    description: 'Test dataset collection'
  };

  const mockDatasetData = [
    { _id: '65f5b5b5b5b5b5b5b5b5b5b6' },
    { _id: '65f5b5b5b5b5b5b5b5b5b5b7' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthEvaluationDatasetWrite.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      datasetId: validCollectionId
    });

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback(mockSession as any);
    });

    mockMongoEvalDatasetCollection.findOne.mockReturnValue({
      session: vi.fn().mockResolvedValue(mockCollection)
    } as any);

    mockMongoEvalDatasetData.find.mockReturnValue({
      session: vi.fn().mockResolvedValue(mockDatasetData)
    } as any);

    mockMongoEvalDatasetData.deleteMany.mockResolvedValue({
      deletedCount: 2
    } as any);

    mockMongoEvalDatasetCollection.deleteOne.mockResolvedValue({
      deletedCount: 1
    } as any);

    mockRemoveEvalDatasetSmartGenerateJobsRobust.mockResolvedValue(undefined as any);
    mockRemoveEvalDatasetDataQualityJobsRobust.mockResolvedValue(undefined as any);
    mockRemoveEvalDatasetDataSynthesizeJobsRobust.mockResolvedValue(undefined as any);

    mockAddLog.info = vi.fn();
    mockAddLog.error = vi.fn();
  });

  describe('Parameter Validation', () => {
    it('should reject when collectionId is missing', async () => {
      const req = {
        query: {}
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'collectionId is required and must be a string'
      );
    });

    it('should reject when collectionId is null', async () => {
      const req = {
        query: { collectionId: null }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'collectionId is required and must be a string'
      );
    });

    it('should reject when collectionId is undefined', async () => {
      const req = {
        query: { collectionId: undefined }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'collectionId is required and must be a string'
      );
    });

    it('should reject when collectionId is not a string', async () => {
      const req = {
        query: { collectionId: 123 }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'collectionId is required and must be a string'
      );
    });

    it('should reject when collectionId is empty string', async () => {
      const req = {
        query: { collectionId: '' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'collectionId is required and must be a string'
      );
    });

    it('should reject when collectionId is whitespace only', async () => {
      const req = {
        query: { collectionId: '  ' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'collectionId is required and must be a string'
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetWrite with correct parameters', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockAuthEvaluationDatasetWrite).toHaveBeenCalledWith(validCollectionId, {
        req,
        authToken: true,
        authApiKey: true
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthEvaluationDatasetWrite.mockRejectedValue(authError);

      const req = {
        query: { collectionId: validCollectionId }
      };

      await expect(handler_test(req as any)).rejects.toBe(authError);
    });
  });

  describe('Collection Validation', () => {
    it('should verify collection exists and belongs to team', async () => {
      const req = {
        query: { collectionId: validCollectionId }
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
        query: { collectionId: validCollectionId }
      };

      await expect(handler_test(req as any)).rejects.toEqual('evaluationDatasetCollectionNotFound');
    });

    it('should reject when collection belongs to different team', async () => {
      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockResolvedValue(null)
      } as any);

      const req = {
        query: { collectionId: validCollectionId }
      };

      await expect(handler_test(req as any)).rejects.toEqual('evaluationDatasetCollectionNotFound');
    });
  });

  describe('Queue Cleanup', () => {
    it('should clean up smart generation queue tasks', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetSmartGenerateJobsRobust).toHaveBeenCalledWith(
        [validCollectionId],
        {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }
      );
      expect(mockAddLog.info).toHaveBeenCalledWith('Cleaning up smart generation queue tasks', {
        collectionId: validCollectionId
      });
      expect(mockAddLog.info).toHaveBeenCalledWith('Smart generation queue cleanup completed', {
        collectionId: validCollectionId
      });
    });

    it('should handle smart generation queue cleanup errors gracefully', async () => {
      const queueError = new Error('Smart generation cleanup failed');
      mockRemoveEvalDatasetSmartGenerateJobsRobust.mockRejectedValue(queueError);

      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);

      expect(mockAddLog.error).toHaveBeenCalledWith('Failed to clean up smart generation queue', {
        collectionId: validCollectionId,
        error: queueError
      });
      expect(result).toBe('success');
    });

    it('should clean up quality assessment queue tasks for all dataset data', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.find).toHaveBeenCalledWith(
        { datasetId: validCollectionId },
        { _id: 1 }
      );
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalledWith(
        ['65f5b5b5b5b5b5b5b5b5b5b6', '65f5b5b5b5b5b5b5b5b5b5b7'],
        {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }
      );
      expect(mockAddLog.info).toHaveBeenCalledWith('Quality assessment queue cleanup completed', {
        collectionId: validCollectionId,
        dataCount: 2
      });
    });

    it('should skip quality assessment cleanup when no data exists', async () => {
      mockMongoEvalDatasetData.find.mockReturnValue({
        session: vi.fn().mockResolvedValue([])
      } as any);

      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
      expect(mockAddLog.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Quality assessment queue cleanup completed'),
        expect.any(Object)
      );
    });

    it('should handle quality assessment queue cleanup errors gracefully', async () => {
      const queueError = new Error('Quality assessment cleanup failed');
      mockMongoEvalDatasetData.find.mockReturnValue({
        session: vi.fn().mockRejectedValue(queueError)
      } as any);

      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);

      expect(mockAddLog.error).toHaveBeenCalledWith('Failed to clean up quality assessment queue', {
        collectionId: validCollectionId,
        error: queueError
      });
      expect(result).toBe('success');
    });

    it('should clean up data synthesis queue tasks', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataSynthesizeJobsRobust).toHaveBeenCalledWith(
        [validCollectionId],
        {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }
      );
      expect(mockAddLog.info).toHaveBeenCalledWith('Cleaning up data synthesis queue tasks', {
        collectionId: validCollectionId
      });
      expect(mockAddLog.info).toHaveBeenCalledWith('Data synthesis queue cleanup completed', {
        collectionId: validCollectionId
      });
    });

    it('should handle data synthesis queue cleanup errors gracefully', async () => {
      const queueError = new Error('Data synthesis cleanup failed');
      mockRemoveEvalDatasetDataSynthesizeJobsRobust.mockRejectedValue(queueError);

      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);

      expect(mockAddLog.error).toHaveBeenCalledWith('Failed to clean up data synthesis queue', {
        collectionId: validCollectionId,
        error: queueError
      });
      expect(result).toBe('success');
    });
  });

  describe('Data Deletion', () => {
    it('should delete all associated dataset data', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.deleteMany).toHaveBeenCalledWith(
        { datasetId: validCollectionId },
        { session: mockSession }
      );
      expect(mockAddLog.info).toHaveBeenCalledWith('Evaluation dataset data deleted', {
        collectionId: validCollectionId,
        deletedCount: 2
      });
    });

    it('should delete the collection itself', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.deleteOne).toHaveBeenCalledWith(
        { _id: validCollectionId },
        { session: mockSession }
      );
    });

    it('should log successful completion with all details', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockAddLog.info).toHaveBeenCalledWith(
        'Starting evaluation dataset collection deletion',
        {
          collectionId: validCollectionId,
          teamId: validTeamId,
          tmbId: validTmbId,
          collectionName: mockCollection.name
        }
      );

      expect(mockAddLog.info).toHaveBeenCalledWith(
        'Evaluation dataset collection deleted successfully',
        {
          collectionId: validCollectionId,
          teamId: validTeamId,
          tmbId: validTmbId,
          collectionName: mockCollection.name,
          deletedDataCount: 2
        }
      );
    });
  });

  describe('Session Management', () => {
    it('should wrap operations in MongoDB session', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should use session for all database operations', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.findOne().session).toHaveBeenCalledWith(mockSession);
      expect(mockMongoEvalDatasetData.find().session).toHaveBeenCalledWith(mockSession);
      expect(mockMongoEvalDatasetData.deleteMany).toHaveBeenCalledWith(
        { datasetId: validCollectionId },
        { session: mockSession }
      );
      expect(mockMongoEvalDatasetCollection.deleteOne).toHaveBeenCalledWith(
        { _id: validCollectionId },
        { session: mockSession }
      );
    });

    it('should propagate session errors', async () => {
      const sessionError = new Error('Session failed');
      mockMongoSessionRun.mockRejectedValue(sessionError);

      const req = {
        query: { collectionId: validCollectionId }
      };

      await expect(handler_test(req as any)).rejects.toBe(sessionError);
    });
  });

  describe('Error Handling', () => {
    it('should propagate database findOne errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockRejectedValue(dbError)
      } as any);

      const req = {
        query: { collectionId: validCollectionId }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should propagate data deleteMany errors', async () => {
      const dbError = new Error('Database deletion failed');
      mockMongoEvalDatasetData.deleteMany.mockRejectedValue(dbError);

      const req = {
        query: { collectionId: validCollectionId }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should propagate collection deleteOne errors', async () => {
      const dbError = new Error('Collection deletion failed');
      mockMongoEvalDatasetCollection.deleteOne.mockRejectedValue(dbError);

      const req = {
        query: { collectionId: validCollectionId }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle valid ObjectId format for collectionId', async () => {
      const validObjectId = '507f1f77bcf86cd799439011';
      const req = {
        query: { collectionId: validObjectId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle collection with minimal fields', async () => {
      const minimalCollection = {
        _id: validCollectionId,
        name: 'Minimal Collection',
        teamId: validTeamId
      };

      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockResolvedValue(minimalCollection)
      } as any);

      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle collection with no associated data', async () => {
      mockMongoEvalDatasetData.find.mockReturnValue({
        session: vi.fn().mockResolvedValue([])
      } as any);
      mockMongoEvalDatasetData.deleteMany.mockResolvedValue({
        deletedCount: 0
      } as any);

      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(mockAddLog.info).toHaveBeenCalledWith('Evaluation dataset data deleted', {
        collectionId: validCollectionId,
        deletedCount: 0
      });
    });

    it('should handle large number of associated data records', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        _id: `data${i.toString().padStart(24, '0')}`
      }));

      mockMongoEvalDatasetData.find.mockReturnValue({
        session: vi.fn().mockResolvedValue(largeDataset)
      } as any);
      mockMongoEvalDatasetData.deleteMany.mockResolvedValue({
        deletedCount: 1000
      } as any);

      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalledWith(
        largeDataset.map((item) => item._id),
        {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }
      );
    });

    it('should handle special characters in collection name', async () => {
      const specialCollection = {
        _id: validCollectionId,
        name: 'Collection with "quotes" & <tags> & émojis 🚀',
        teamId: validTeamId
      };

      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockResolvedValue(specialCollection)
      } as any);

      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(mockAddLog.info).toHaveBeenCalledWith(
        'Evaluation dataset collection deleted successfully',
        {
          collectionId: validCollectionId,
          teamId: validTeamId,
          tmbId: validTmbId,
          collectionName: specialCollection.name,
          deletedDataCount: 2
        }
      );
    });
  });

  describe('Return Value', () => {
    it('should return success string', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(typeof result).toBe('string');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete deletion flow with all queue cleanups', async () => {
      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);

      // Verify complete flow
      expect(mockAuthEvaluationDatasetWrite).toHaveBeenCalled();
      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalled();
      expect(mockRemoveEvalDatasetSmartGenerateJobsRobust).toHaveBeenCalled();
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalled();
      expect(mockRemoveEvalDatasetDataSynthesizeJobsRobust).toHaveBeenCalled();
      expect(mockMongoEvalDatasetData.deleteMany).toHaveBeenCalled();
      expect(mockMongoEvalDatasetCollection.deleteOne).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should maintain transaction integrity on session failure', async () => {
      const sessionError = new Error('Session rollback');
      mockMongoEvalDatasetData.deleteMany.mockRejectedValue(sessionError);

      const req = {
        query: { collectionId: validCollectionId }
      };

      await expect(handler_test(req as any)).rejects.toBe(sessionError);

      // Verify session was used for all operations
      expect(mockMongoSessionRun).toHaveBeenCalled();
    });

    it('should continue deletion even when all queue cleanups fail', async () => {
      const smartGenError = new Error('Smart generation cleanup failed');
      const qualityError = new Error('Quality assessment cleanup failed');
      const synthesizeError = new Error('Data synthesis cleanup failed');

      mockRemoveEvalDatasetSmartGenerateJobsRobust.mockRejectedValue(smartGenError);
      mockMongoEvalDatasetData.find.mockReturnValue({
        session: vi.fn().mockRejectedValue(qualityError)
      } as any);
      mockRemoveEvalDatasetDataSynthesizeJobsRobust.mockRejectedValue(synthesizeError);

      const req = {
        query: { collectionId: validCollectionId }
      };

      const result = await handler_test(req as any);

      expect(mockAddLog.error).toHaveBeenCalledWith('Failed to clean up smart generation queue', {
        collectionId: validCollectionId,
        error: smartGenError
      });
      expect(mockAddLog.error).toHaveBeenCalledWith('Failed to clean up quality assessment queue', {
        collectionId: validCollectionId,
        error: qualityError
      });
      expect(mockAddLog.error).toHaveBeenCalledWith('Failed to clean up data synthesis queue', {
        collectionId: validCollectionId,
        error: synthesizeError
      });

      // Deletion should still proceed
      expect(mockMongoEvalDatasetData.deleteMany).toHaveBeenCalled();
      expect(mockMongoEvalDatasetCollection.deleteOne).toHaveBeenCalled();
      expect(result).toBe('success');
    });
  });
});
