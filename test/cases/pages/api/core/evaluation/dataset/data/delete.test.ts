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
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

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
  const CONSTANTS = {
    validTeamId: 'team123',
    validTmbId: 'tmb123',
    validDataId: '65f5b5b5b5b5b5b5b5b5b5b5',
    validCollectionId: '65f5b5b5b5b5b5b5b5b5b5b6',
    mockSession: { id: 'session-123' },
    ERROR_CODES: {
      dataIdRequired: EvaluationErrEnum.datasetDataIdRequired,
      dataNotFound: EvaluationErrEnum.datasetDataNotFound,
      collectionNotFound: EvaluationErrEnum.datasetCollectionNotFound
    }
  };

  const createMockRequest = (dataId?: any) => ({ query: dataId !== undefined ? { dataId } : {} });

  const setupSuccessfulMocks = () => {
    mockAuthEvaluationDatasetDataUpdateById.mockResolvedValue({
      teamId: CONSTANTS.validTeamId,
      tmbId: CONSTANTS.validTmbId,
      collectionId: CONSTANTS.validCollectionId
    });

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback(CONSTANTS.mockSession as any);
    });

    const mockDataDocument = {
      _id: CONSTANTS.validDataId,
      evalDatasetCollectionId: CONSTANTS.validCollectionId,
      userInput: 'test input',
      expectedOutput: 'test output'
    };

    mockMongoEvalDatasetData.findById.mockReturnValue({
      session: vi.fn().mockResolvedValue(mockDataDocument)
    } as any);

    const mockCollectionDocument = {
      _id: CONSTANTS.validCollectionId,
      name: 'Test Collection',
      teamId: CONSTANTS.validTeamId
    };

    mockMongoEvalDatasetCollection.findOne.mockReturnValue({
      session: vi.fn().mockResolvedValue(mockCollectionDocument)
    } as any);

    mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);
    mockMongoEvalDatasetData.deleteOne.mockResolvedValue({ deletedCount: 1 } as any);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulMocks();
    mockAddLog.info = vi.fn();
    mockAddLog.error = vi.fn();
  });

  describe('Parameter Validation', () => {
    const invalidDataIds = [
      { value: undefined, description: 'missing' },
      { value: '', description: 'empty string' },
      { value: null, description: 'null' },
      { value: 123, description: 'not a string' },
      { value: '   ', description: 'whitespace only' }
    ];

    invalidDataIds.forEach(({ value, description }) => {
      it(`should reject when dataId is ${description}`, async () => {
        const req = createMockRequest(value);
        await expect(handler_test(req as any)).rejects.toEqual(
          CONSTANTS.ERROR_CODES.dataIdRequired
        );
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataUpdateById with correct parameters', async () => {
      const req = createMockRequest(CONSTANTS.validDataId);

      await handler_test(req as any);

      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(CONSTANTS.validDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(authError);

      const req = createMockRequest(CONSTANTS.validDataId);

      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Data Validation', () => {
    it('should reject when data does not exist', async () => {
      mockMongoEvalDatasetData.findById.mockReturnValue({
        session: vi.fn().mockResolvedValue(null)
      } as any);

      const req = createMockRequest(CONSTANTS.validDataId);

      await expect(handler_test(req as any)).rejects.toEqual(CONSTANTS.ERROR_CODES.dataNotFound);
    });

    it('should verify collection exists and belongs to team', async () => {
      const req = createMockRequest(CONSTANTS.validDataId);

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        _id: CONSTANTS.validCollectionId,
        teamId: CONSTANTS.validTeamId
      });
    });

    it('should reject when collection does not exist or belongs to different team', async () => {
      mockMongoEvalDatasetCollection.findOne.mockReturnValue({
        session: vi.fn().mockResolvedValue(null)
      } as any);

      const req = createMockRequest(CONSTANTS.validDataId);

      await expect(handler_test(req as any)).rejects.toEqual(
        CONSTANTS.ERROR_CODES.collectionNotFound
      );
    });
  });

  describe('Quality Job Management', () => {
    it('should check for active quality job', async () => {
      const req = createMockRequest(CONSTANTS.validDataId);

      await handler_test(req as any);

      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalledWith(CONSTANTS.validDataId);
    });

    it('should remove active quality job if exists', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);

      const req = createMockRequest(CONSTANTS.validDataId);

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalledWith(
        [CONSTANTS.validDataId],
        {
          forceCleanActiveJobs: true,
          retryDelay: 200
        }
      );
      expect(mockAddLog.info).toHaveBeenCalledWith(
        'Removing active quality evaluation job before deletion',
        { dataId: CONSTANTS.validDataId, teamId: CONSTANTS.validTeamId }
      );
      expect(mockAddLog.info).toHaveBeenCalledWith(
        'Quality evaluation job removed successfully before deletion',
        { dataId: CONSTANTS.validDataId, teamId: CONSTANTS.validTeamId }
      );
    });

    it('should continue deletion if quality job removal fails', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);
      const jobError = new Error('Failed to remove job');
      mockRemoveEvalDatasetDataQualityJobsRobust.mockRejectedValue(jobError);

      const req = createMockRequest(CONSTANTS.validDataId);

      const result = await handler_test(req as any);

      expect(mockAddLog.error).toHaveBeenCalledWith(
        'Failed to remove quality evaluation job before deletion',
        { dataId: CONSTANTS.validDataId, teamId: CONSTANTS.validTeamId, error: jobError }
      );
      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should not attempt to remove quality job when none is active', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);

      const req = createMockRequest(CONSTANTS.validDataId);

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
      const req = createMockRequest(CONSTANTS.validDataId);

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalledWith(
        { _id: CONSTANTS.validDataId },
        { session: CONSTANTS.mockSession }
      );
    });

    it('should return success when deletion completes', async () => {
      const req = createMockRequest(CONSTANTS.validDataId);

      const result = await handler_test(req as any);

      expect(result).toBe('success');
    });
  });

  describe('Session Management', () => {
    it('should use MongoDB session for all operations', async () => {
      const req = createMockRequest(CONSTANTS.validDataId);

      await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Error Handling', () => {
    it('should propagate session errors', async () => {
      const sessionError = new Error('Session failed');
      mockMongoSessionRun.mockRejectedValue(sessionError);

      const req = createMockRequest(CONSTANTS.validDataId);

      await expect(handler_test(req as any)).rejects.toThrow('Session failed');
    });

    it('should propagate delete errors', async () => {
      const deleteError = new Error('Delete failed');
      mockMongoEvalDatasetData.deleteOne.mockRejectedValue(deleteError);

      const req = createMockRequest(CONSTANTS.validDataId);

      await expect(handler_test(req as any)).rejects.toThrow('Delete failed');
    });
  });

  describe('Integration Scenarios', () => {
    const verifyCommonFlowCalls = (req: any) => {
      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(CONSTANTS.validDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
      expect(mockMongoEvalDatasetData.findById).toHaveBeenCalled();
      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalled();
      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalled();
      expect(mockMongoEvalDatasetData.deleteOne).toHaveBeenCalled();
    };

    it('should handle complete deletion flow with active quality job', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);

      const req = createMockRequest(CONSTANTS.validDataId);
      const result = await handler_test(req as any);

      verifyCommonFlowCalls(req);
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should handle complete deletion flow without active quality job', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);

      const req = createMockRequest(CONSTANTS.validDataId);
      const result = await handler_test(req as any);

      verifyCommonFlowCalls(req);
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
      expect(result).toBe('success');
    });
  });
});
