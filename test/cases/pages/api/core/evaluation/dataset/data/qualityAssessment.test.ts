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
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

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
vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: vi.fn()
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn()
  },
  EvalDatasetCollectionName: 'eval_dataset_collections'
}));

const mockAuthEvaluationDatasetDataUpdateById = vi.mocked(authEvaluationDatasetDataUpdateById);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockAddEvalDatasetDataQualityJob = vi.mocked(addEvalDatasetDataQualityJob);
const mockRemoveEvalDatasetDataQualityJobsRobust = vi.mocked(
  removeEvalDatasetDataQualityJobsRobust
);
const mockCheckEvalDatasetDataQualityJobActive = vi.mocked(checkEvalDatasetDataQualityJobActive);
const mockCheckTeamAIPoints = vi.mocked(checkTeamAIPoints);

describe('QualityAssessment API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validDataId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b6';
  const validEvaluationModel = 'gpt-4';

  const setupMocks = () => {
    global.llmModelMap = new Map([
      ['gpt-4', { model: 'gpt-4' }],
      ['gpt-3.5-turbo', { model: 'gpt-3.5-turbo' }]
    ]) as any;

    vi.clearAllMocks();

    mockAuthEvaluationDatasetDataUpdateById.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      collectionId: validCollectionId
    });

    const mockDatasetData = {
      _id: validDataId,
      evalDatasetCollectionId: validCollectionId,
      userInput: 'test input',
      expectedOutput: 'test output'
    };
    mockMongoEvalDatasetData.findById.mockResolvedValue(mockDatasetData as any);

    const mockCollection = {
      _id: validCollectionId,
      name: 'Test Collection',
      teamId: validTeamId,
      evaluationModel: validEvaluationModel
    };
    mockMongoEvalDatasetCollection.findOne.mockResolvedValue(mockCollection as any);

    mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);
    mockCheckTeamAIPoints.mockResolvedValue(undefined);
    mockAddEvalDatasetDataQualityJob.mockResolvedValue({} as any);
    mockMongoEvalDatasetData.findByIdAndUpdate.mockResolvedValue({} as any);
  };

  const createRequest = (dataId = validDataId, evaluationModel = validEvaluationModel) => ({
    body: { dataId, evaluationModel }
  });

  beforeEach(setupMocks);

  describe('Parameter Validation', () => {
    it('should return error when dataId is missing', async () => {
      const req = {
        body: {
          evaluationModel: validEvaluationModel
        }
      };

      mockAuthEvaluationDatasetDataUpdateById.mockRejectedValue(
        'dataId is required and must be a string'
      );

      await expect(handler_test(req as any)).rejects.toBe(
        'dataId is required and must be a string'
      );
    });

    it('should return error when dataId is not a string', async () => {
      const req = createRequest(123 as any, validEvaluationModel);

      await expect(handler_test(req as any)).rejects.toBe(EvaluationErrEnum.datasetDataIdRequired);
    });

    it('should return error when evaluationModel is invalid type', async () => {
      const req = createRequest(validDataId, 123 as any);

      await expect(handler_test(req as any)).rejects.toBe(EvaluationErrEnum.datasetModelNotFound);
    });

    it('should return error when no evaluation model available', async () => {
      const mockCollectionNoModel = {
        _id: validCollectionId,
        name: 'Test Collection',
        teamId: validTeamId,
        evaluationModel: ''
      };
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(mockCollectionNoModel as any);

      const req = createRequest(validDataId, '');

      await expect(handler_test(req as any)).rejects.toBe(EvaluationErrEnum.evalModelNameInvalid);
    });

    it('should return error when invalid evaluation model', async () => {
      global.llmModelMap.clear();

      const req = createRequest(validDataId, 'invalid-model');

      await expect(handler_test(req as any)).rejects.toBe(EvaluationErrEnum.datasetModelNotFound);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataUpdateById with correct parameters', async () => {
      const req = createRequest();

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
          evaluationModel: validEvaluationModel
        }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Data Validation', () => {
    it('should return error when dataset data not found', async () => {
      mockMongoEvalDatasetData.findById.mockResolvedValue(null);

      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(EvaluationErrEnum.datasetDataNotFound);
    });

    it('should verify collection exists and belongs to team', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        _id: validCollectionId,
        teamId: validTeamId
      });
    });

    it('should return error when collection not found', async () => {
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);

      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionNotFound
      );
    });

    it('should return error when collection belongs to different team', async () => {
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);

      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionNotFound
      );
    });
  });

  describe('Quality Assessment Job Management', () => {
    it('should check for active job before creating new one', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await handler_test(req as any);

      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalledWith(validDataId);
    });

    it('should reject when active job exists', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);

      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.evalDataQualityJobActiveCannotSetHighQuality
      );
    });

    it('should not remove job if none exists', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);

      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await handler_test(req as any);

      expect(mockRemoveEvalDatasetDataQualityJobsRobust).not.toHaveBeenCalled();
    });

    it('should add new quality assessment job', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await handler_test(req as any);

      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: validDataId,
        evaluationModel: validEvaluationModel
      });
    });

    it('should update dataset data with quality metadata', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.findByIdAndUpdate).toHaveBeenCalledWith(validDataId, {
        $set: {
          'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.queuing,
          'qualityMetadata.model': validEvaluationModel,
          'qualityMetadata.queueTime': expect.any(Date)
        }
      });
    });

    it('should return success when job is queued successfully', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: validEvaluationModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });
  });

  describe('Error Handling', () => {
    it('should reject with evalDataQualityJobActiveCannotSetHighQuality when active job exists', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);

      const req = createRequest();

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.evalDataQualityJobActiveCannotSetHighQuality
      );
    });

    it('should handle job addition errors and reject with quality assessment failed', async () => {
      const jobError = new Error('Failed to add job');
      mockAddEvalDatasetDataQualityJob.mockRejectedValue(jobError);

      const req = createRequest();

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.qualityAssessmentFailed
      );
    });

    it('should handle database update errors and reject with quality assessment failed', async () => {
      const dbError = new Error('Database update failed');
      mockMongoEvalDatasetData.findByIdAndUpdate.mockRejectedValue(dbError);

      const req = createRequest();

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.qualityAssessmentFailed
      );
    });

    it('should handle non-Error objects and reject with quality assessment failed', async () => {
      mockAddEvalDatasetDataQualityJob.mockRejectedValue('String error');

      const req = createRequest();

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.qualityAssessmentFailed
      );
    });

    it('should handle check job active errors and reject with quality assessment failed', async () => {
      const checkError = new Error('Failed to check job status');
      mockCheckEvalDatasetDataQualityJobActive.mockRejectedValue(checkError);

      const req = createRequest();

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.qualityAssessmentFailed
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string dataId', async () => {
      const req = {
        body: {
          dataId: '',
          evaluationModel: validEvaluationModel
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(EvaluationErrEnum.datasetDataIdRequired);
    });

    it('should handle empty string evaluationModel', async () => {
      const mockCollectionEmptyModel = {
        _id: validCollectionId,
        name: 'Test Collection',
        teamId: validTeamId,
        evaluationModel: ''
      };
      mockMongoEvalDatasetCollection.findOne.mockResolvedValue(mockCollectionEmptyModel as any);

      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: ''
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(EvaluationErrEnum.evalModelNameInvalid);
    });

    it('should handle null dataId', async () => {
      const req = {
        body: {
          dataId: null,
          evaluationModel: validEvaluationModel
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(EvaluationErrEnum.datasetDataIdRequired);
    });

    it('should handle undefined evaluationModel with collection fallback', async () => {
      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: undefined
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');

      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: validDataId,
        evaluationModel: validEvaluationModel // Should use collection's model
      });
    });

    it('should handle very long dataId', async () => {
      const longDataId = 'a'.repeat(1000);

      const req = {
        body: {
          dataId: longDataId,
          evaluationModel: validEvaluationModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle very long evaluationModel', async () => {
      const longEvaluationModel = 'gpt-4-' + 'a'.repeat(1000);
      global.llmModelMap.set(longEvaluationModel, { model: longEvaluationModel } as any);

      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: longEvaluationModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle special characters in evaluationModel', async () => {
      const specialEvaluationModel = 'gpt-4-特殊字符-🚀';
      global.llmModelMap.set(specialEvaluationModel, { model: specialEvaluationModel } as any);

      const req = {
        body: {
          dataId: validDataId,
          evaluationModel: specialEvaluationModel
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');

      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: validDataId,
        evaluationModel: specialEvaluationModel
      });
    });
  });

  describe('Integration Workflow', () => {
    it('should reject when active job exists in integration workflow', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(true);
      const req = createRequest();

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.evalDataQualityJobActiveCannotSetHighQuality
      );

      expect(mockAuthEvaluationDatasetDataUpdateById).toHaveBeenCalledWith(validDataId, {
        req,
        authToken: true,
        authApiKey: true
      });
      expect(mockCheckEvalDatasetDataQualityJobActive).toHaveBeenCalledWith(validDataId);
      // Should not proceed to add job or update database when active job exists
      expect(mockAddEvalDatasetDataQualityJob).not.toHaveBeenCalled();
      expect(mockMongoEvalDatasetData.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should execute complete workflow when no job exists', async () => {
      mockCheckEvalDatasetDataQualityJobActive.mockResolvedValue(false);
      const req = createRequest();

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
        evaluationModel: validEvaluationModel
      });
      expect(mockMongoEvalDatasetData.findByIdAndUpdate).toHaveBeenCalledWith(validDataId, {
        $set: {
          'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.queuing,
          'qualityMetadata.model': validEvaluationModel,
          'qualityMetadata.queueTime': expect.any(Date)
        }
      });
      expect(result).toBe('success');
    });
  });
});
