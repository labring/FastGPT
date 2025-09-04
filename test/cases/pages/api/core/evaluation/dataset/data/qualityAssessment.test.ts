import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/qualityAssessment';
import { authEvaluationDatasetDataUpdateById } from '@fastgpt/service/core/evaluation/common';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  addEvalDatasetDataQualityJob,
  removeEvalDatasetDataQualityJobsRobust,
  checkEvalDatasetDataQualityJobActive
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { EvalDatasetDataQualityStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationDatasetDataUpdateById: vi.fn()
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataQualityMq', () => ({
  addEvalDatasetDataQualityJob: vi.fn(),
  removeEvalDatasetDataQualityJobsRobust: vi.fn(),
  checkEvalDatasetDataQualityJobActive: vi.fn()
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn()
  }
}));

const mockAuthEvaluationDatasetDataUpdateById = vi.mocked(authEvaluationDatasetDataUpdateById);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockAddEvalDatasetDataQualityJob = vi.mocked(addEvalDatasetDataQualityJob);
const mockRemoveEvalDatasetDataQualityJobsRobust = vi.mocked(
  removeEvalDatasetDataQualityJobsRobust
);
const mockCheckEvalDatasetDataQualityJobActive = vi.mocked(checkEvalDatasetDataQualityJobActive);

describe('QualityAssessment API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validDataId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b6';
  const validEvalModel = 'gpt-4';

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthEvaluationDatasetDataUpdateById.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      collectionId: validCollectionId
    });

    // Mock dataset data document
    const mockDatasetData = {
      _id: validDataId,
      datasetId: validCollectionId,
      userInput: 'test input',
      expectedOutput: 'test output'
    };
    mockMongoEvalDatasetData.findById.mockResolvedValue(mockDatasetData as any);

    // Mock collection document
    const mockCollection = {
      _id: validCollectionId,
      name: 'Test Collection',
      teamId: validTeamId
    };
    mockMongoEvalDatasetCollection.findOne.mockResolvedValue(mockCollection as any);

    mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);
    mockAddEvalDatasetDataQualityJob.mockResolvedValue({} as any);
    mockMongoEvalDatasetData.findByIdAndUpdate.mockResolvedValue({} as any);
  });

  describe('Parameter Validation', () => {
    it('should return error when dataId is missing', async () => {
      const req = {
        body: {
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('dataId is required and must be a string');
    });

    it('should return error when dataId is not a string', async () => {
      const req = {
        body: {
          dataId: 123,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('dataId is required and must be a string');
    });

    it('should return error when evalModel is missing', async () => {
      const req = {
        body: {
          dataId: validDataId
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('evalModel is required and must be a string');
    });

    it('should return error when evalModel is not a string', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evalModel: 123
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('evalModel is required and must be a string');
    });

    it('should return error when both dataId and evalModel are missing', async () => {
      const req = {
        body: {}
      };

      const result = await handler_test(req as any);
      expect(result).toBe('dataId is required and must be a string');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataUpdateById with correct parameters', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
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
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Data Validation', () => {
    it('should return error when dataset data not found', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        new Error('Dataset data not found')
      );

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Dataset data not found');
    });

    it('should return error when collection not found', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        new Error('Dataset collection not found or access denied')
      );

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await expect(handler_test(req as any)).rejects.toThrow(
        'Dataset collection not found or access denied'
      );
    });

    it('should return error when collection belongs to different team', async () => {
      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        new Error('Dataset collection not found or access denied')
      );

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await expect(handler_test(req as any)).rejects.toThrow(
        'Dataset collection not found or access denied'
      );
    });
  });

  describe('Quality Assessment Job Management', () => {
    it('should check for active job before creating new one', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await handler_test(req as any);

      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalledWith(validDataId);
    });

    it('should remove active job if one exists', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalledWith([validDataId]);
    });

    it('should not remove job if none exists', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
    });

    it('should add new quality assessment job', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await handler_test(req as any);

      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: validDataId,
        evalModel: validEvalModel
      });
    });

    it('should update dataset data with quality metadata', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.findByIdAndUpdate).toHaveBeenCalledWith(validDataId, {
        $set: {
          'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.queuing,
          'metadata.qualityModel': validEvalModel,
          'metadata.qualityQueueTime': expect.any(Date)
        }
      });
    });

    it('should return success when job is queued successfully', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });
  });

  describe('Error Handling', () => {
    it('should handle job removal errors and return error message', async () => {
      const jobError = new Error('Failed to remove job');
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);
      mockRemoveEvalDatasetDataQualityJobsRobust.mockRejectedValue(jobError);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('Failed to remove job');
    });

    it('should handle job addition errors and return error message', async () => {
      const jobError = new Error('Failed to add job');
      mockAddEvalDatasetDataQualityJob.mockRejectedValue(jobError);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('Failed to add job');
    });

    it('should handle database update errors and return error message', async () => {
      const dbError = new Error('Database update failed');
      mockMongoEvalDatasetData.findByIdAndUpdate.mockRejectedValue(dbError);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('Database update failed');
    });

    it('should handle non-Error objects and return generic message', async () => {
      mockAddEvalDatasetDataQualityJob.mockRejectedValue('String error');

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('Failed to queue quality assessment job');
    });

    it('should handle check job active errors and return error message', async () => {
      const checkError = new Error('Failed to check job status');
      mockCheckEvalDatasetDataQualityJobActive.mockRejectedValue(checkError);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('Failed to check job status');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string dataId', async () => {
      const req = {
        body: {
          dataId: '',
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('dataId is required and must be a string');
    });

    it('should handle empty string evalModel', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evalModel: ''
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('evalModel is required and must be a string');
    });

    it('should handle null dataId', async () => {
      const req = {
        body: {
          dataId: null,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('dataId is required and must be a string');
    });

    it('should handle undefined evalModel', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evalModel: undefined
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('evalModel is required and must be a string');
    });

    it('should handle very long dataId', async () => {
      const longDataId = 'a'.repeat(1000);

      const req = {
        body: {
          dataId: longDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle very long evalModel', async () => {
      const longEvalModel = 'gpt-4-' + 'a'.repeat(1000);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: longEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle special characters in evalModel', async () => {
      const specialEvalModel = 'gpt-4-特殊字符-🚀';

      const req = {
        body: {
          dataId: validDataId,
          evalModel: specialEvalModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');

      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: validDataId,
        evalModel: specialEvalModel
      });
    });
  });

  describe('Integration Workflow', () => {
    it('should execute complete workflow when job exists', async () => {
      // Reset all mocks and set up specific behavior for this test
      vi.clearAllMocks();

      // Set up all necessary mocks for this test
      mockAuthEvaluationDatasetDataUpdateById.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId,
        collectionId: validCollectionId
      });

      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);
      mockRemoveEvalDatasetDataQualityJobsRobust.mockResolvedValue(undefined);
      mockAddEvalDatasetDataQualityJob.mockResolvedValue({} as any);
      mockMongoEvalDatasetData.findByIdAndUpdate.mockResolvedValue({} as any);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);

      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(validDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalledWith(validDataId);
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).toHaveBeenCalledWith([validDataId]);
      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: validDataId,
        evalModel: validEvalModel
      });
      expect(mockMongoEvalDatasetData.findByIdAndUpdate).toHaveBeenCalledWith(validDataId, {
        $set: {
          'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.queuing,
          'metadata.qualityModel': validEvalModel,
          'metadata.qualityQueueTime': expect.any(Date)
        }
      });
      expect(result).toBe('success');
    });

    it('should execute complete workflow when no job exists', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);

      const req = {
        body: {
          dataId: validDataId,
          evalModel: validEvalModel
        }
      };

      const result = await handler_test(req as any);

      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(validDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalledWith(validDataId);
      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: validDataId,
        evalModel: validEvalModel
      });
      expect(mockMongoEvalDatasetData.findByIdAndUpdate).toHaveBeenCalledWith(validDataId, {
        $set: {
          'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.queuing,
          'metadata.qualityModel': validEvalModel,
          'metadata.qualityQueueTime': expect.any(Date)
        }
      });
      expect(result).toBe('success');
    });
  });
});
