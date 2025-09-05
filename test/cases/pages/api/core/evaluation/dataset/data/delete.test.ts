import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/delete';
import { authEvaluationDatasetDataUpdateById } from '@fastgpt/service/core/evaluation/common';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import {
  removeEvalDatasetDataQualityJobsRobust,
  checkEvalDatasetDataQualityJobActive
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';

vi.mock('@fastgpt/service/core/evaluation/common');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    findById: vi.fn(() => ({
      session: vi.fn()
    })),
    deleteOne: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataQualityMq');
vi.mock('@fastgpt/service/common/system/log');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn(() => ({
      session: vi.fn()
    }))
  },
  EvalDatasetCollectionName: 'eval_dataset_collections'
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

const mockAuthEvaluationDatasetDataUpdateById = vi.mocked(authEvaluationDatasetDataUpdateById);
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

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthEvaluationDatasetDataUpdateById.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      collectionId: validCollectionId
    });

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback(mockSession as any);
    });

    // Mock findById chain for existing data
    const mockDataDocument = {
      _id: validDataId,
      datasetId: validCollectionId,
      userInput: 'test input',
      expectedOutput: 'test output'
    };

    const mockFindByIdResult = {
      session: vi.fn().mockResolvedValue(mockDataDocument)
    };
    mockMongoEvalDatasetData.findById.mockReturnValue(mockFindByIdResult as any);

    // Mock findOne chain for collection
    const mockCollectionDocument = {
      _id: validCollectionId,
      name: 'Test Collection',
      teamId: validTeamId
    };

    const mockFindOneResult = {
      session: vi.fn().mockResolvedValue(mockCollectionDocument)
    };
    mockMongoEvalDatasetCollection.findOne.mockReturnValue(mockFindOneResult as any);

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

    it('should reject when dataId is empty string', async () => {
      const req = {
        query: { dataId: '' }
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

    it('should reject when dataId is whitespace only', async () => {
      const req = {
        query: { dataId: '   ' }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        'dataId is required and must be a string'
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataUpdateById with correct parameters', async () => {
      const req = {
        query: { dataId: validDataId }
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
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Data Validation', () => {
    it('should reject when data does not exist', async () => {
      mockMongoEvalDatasetData.findById.mockReturnValue({
        session: vi.fn().mockResolvedValue(null)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toEqual('evaluationDatasetDataNotFound');
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

      await expect(handler_test(req as any)).rejects.toEqual('evaluationDatasetCollectionNotFound');
    });

    it('should reject when collection belongs to different team', async () => {
      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockResolvedValue(null)
      } as any);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toEqual('evaluationDatasetCollectionNotFound');
    });
  });

  describe('Quality Job Management', () => {
    it('should check for active quality job', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalledWith(validDataId);
    });

    it('should remove active quality job if exists', async () => {
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
    it('should delete data using MongoDB session', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalledWith(
        { _id: validDataId },
        { session: mockSession }
      );
    });

    it('should return success when deletion completes', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      const result = await handler_test(req as any);

      expect(result).toBe('success');
    });
  });

  describe('Session Management', () => {
    it('should use MongoDB session for all operations', async () => {
      const req = {
        query: { dataId: validDataId }
      };

      await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Error Handling', () => {
    it('should propagate session errors', async () => {
      const sessionError = new Error('Session failed');
      mockMongoSessionRun.mockRejectedValue(sessionError);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Session failed');
    });

    it('should propagate delete errors', async () => {
      const deleteError = new Error('Delete failed');
      mockMongoEvalDatasetData.deleteOne.mockRejectedValue(deleteError);

      const req = {
        query: { dataId: validDataId }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Delete failed');
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
      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(validDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
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
      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(validDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
      expect(mockMongoEvalDatasetData.findById).toHaveBeenCalled();
      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalled();
      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalled();
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalled();
      expect(result).toBe('success');
    });
  });
});
