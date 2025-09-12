import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/collection/update';
import { authEvaluationDatasetWrite } from '@fastgpt/service/core/evaluation/common';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

vi.mock('@fastgpt/service/core/evaluation/common');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn(),
    updateOne: vi.fn()
  },
  EvalDatasetCollectionName: 'eval_dataset_collections'
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getDefaultEvaluationModel: vi.fn()
}));

const mockAuthEvaluationDatasetWrite = vi.mocked(authEvaluationDatasetWrite);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockAddAuditLog = vi.mocked(addAuditLog);

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

  // Helper function to create test request objects
  const createRequest = (body: any) => ({ body });

  // Helper function to setup successful collection existence and no name conflict
  const setupSuccessfulUpdate = () => {
    mockMongoEvalDatasetCollection.findOne.mockReset();
    mockMongoEvalDatasetCollection.findOne
      .mockResolvedValueOnce(existingCollection as any)
      .mockResolvedValueOnce(null);
  };

  beforeEach(() => {
    vi.clearAllMocks();

    if (!global.llmModelMap) {
      global.llmModelMap = new Map();
    }

    mockAuthEvaluationDatasetWrite.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    setupSuccessfulUpdate();

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback({} as any);
    });

    mockMongoEvalDatasetCollection.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);
  });

  describe('Parameter Validation', () => {
    it('should reject when collectionId is missing', async () => {
      const req = createRequest({ name: 'Updated Name', description: 'Updated description' });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionIdRequired
      );
    });

    it('should reject when collectionId is empty string', async () => {
      const req = createRequest({
        collectionId: '',
        name: 'Updated Name',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionIdRequired
      );
    });

    it('should reject when collectionId is only whitespace', async () => {
      const req = createRequest({
        collectionId: '   ',
        name: 'Updated Name',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionIdRequired
      );
    });

    it('should reject when collectionId is not a string', async () => {
      const req = createRequest({
        collectionId: 123,
        name: 'Updated Name',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionIdRequired
      );
    });

    it('should succeed when name is missing (optional)', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).resolves.toEqual('success');
    });

    it('should reject when name is empty string', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: '',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(EvaluationErrEnum.evalNameRequired);
    });

    it('should reject when name is only whitespace', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: '   ',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(EvaluationErrEnum.evalNameRequired);
    });

    it('should reject when name is not a string', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 123,
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(EvaluationErrEnum.evalNameRequired);
    });

    it('should reject when name exceeds 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const req = createRequest({
        collectionId: mockCollectionId,
        name: longName,
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(EvaluationErrEnum.evalNameTooLong);
    });

    it('should reject when description is not a string', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 123
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.evalDescriptionInvalidType
      );
    });

    it('should reject when description exceeds 100 characters', async () => {
      const longDescription = 'a'.repeat(101);
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: longDescription
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.evalDescriptionTooLong
      );
    });

    it('should reject when evaluation model is not a string', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        evaluationModel: 123
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.evalModelNameInvalid
      );
    });

    it('should reject when evaluation model exceeds 100 characters', async () => {
      const longModel = 'a'.repeat(101);
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        evaluationModel: longModel
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.evalModelNameTooLong
      );
    });

    it('should reject invalid evaluation model', async () => {
      const invalidModel = 'invalid-model';
      vi.spyOn(global.llmModelMap, 'has').mockReturnValue(false);

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        evaluationModel: invalidModel
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetModelNotFound
      );

      expect(global.llmModelMap.has).toHaveBeenCalledWith(invalidModel);
    });

    it('should accept valid evaluation model', async () => {
      const validModel = 'gpt-4';
      vi.spyOn(global.llmModelMap, 'has').mockReturnValue(true);
      setupSuccessfulUpdate();

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        evaluationModel: validModel
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(global.llmModelMap.has).toHaveBeenCalledWith(validModel);
    });

    it('should accept valid parameters', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should accept valid name without description', async () => {
      const req = createRequest({ collectionId: mockCollectionId, name: 'Updated Name' });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should accept valid name with empty description', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: ''
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authUserPer with correct parameters', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      await handler_test(req as any);

      expect(mockAuthEvaluationDatasetWrite).toHaveBeenCalledWith(mockCollectionId, {
        req,
        authToken: true,
        authApiKey: true
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthEvaluationDatasetWrite.mockRejectedValue(authError);

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Collection Existence Validation', () => {
    it('should reject when collection does not exist', async () => {
      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne.mockResolvedValueOnce(null);

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionNotFound
      );

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        _id: mockCollectionId,
        teamId: validTeamId
      });
    });

    it('should reject when collection belongs to different team', async () => {
      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne.mockResolvedValueOnce(null);

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionNotFound
      );
    });

    it('should proceed when collection exists and belongs to team', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

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

      mockMongoEvalDatasetCollection.findOne.mockReset();
      mockMongoEvalDatasetCollection.findOne
        .mockResolvedValueOnce(existingCollection as any)
        .mockResolvedValueOnce(conflictingCollection as any);

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.evalDuplicateDatasetName
      );

      expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
        teamId: validTeamId,
        name: 'Updated Name',
        _id: { $ne: mockCollectionId }
      });
    });

    it('should allow keeping the same name for the same collection', async () => {
      setupSuccessfulUpdate();

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Old Dataset Name',
        description: 'Updated description'
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should check name with trimmed whitespace', async () => {
      setupSuccessfulUpdate();

      const req = createRequest({
        collectionId: mockCollectionId,
        name: '  Updated Name  ',
        description: 'Updated description'
      });

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
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

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
      const req = createRequest({
        collectionId: mockCollectionId,
        name: '  Updated Name  ',
        description: '  Updated description  '
      });

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
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: ''
      });

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
      const req = createRequest({ collectionId: mockCollectionId, name: 'Updated Name' });

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
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(typeof result).toBe('string');
    });

    it('should propagate database update errors', async () => {
      setupSuccessfulUpdate();
      const dbError = new Error('Database connection failed');
      mockMongoSessionRun.mockRejectedValue(dbError);

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionUpdateFailed
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle exactly 100 character name', async () => {
      const exactName = 'a'.repeat(100);
      const req = createRequest({
        collectionId: mockCollectionId,
        name: exactName,
        description: 'Updated description'
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle exactly 100 character description', async () => {
      const exactDescription = 'a'.repeat(100);
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        description: exactDescription
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle special characters in name', async () => {
      const specialName = 'Updated-Dataset_2024@Company!';
      const req = createRequest({
        collectionId: mockCollectionId,
        name: specialName,
        description: 'Updated description'
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle ObjectId string format for collectionId', async () => {
      const objectIdString = '507f1f77bcf86cd799439011';
      const req = createRequest({
        collectionId: objectIdString,
        name: 'Updated Name',
        description: 'Updated description'
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle very long valid ObjectId', async () => {
      const longValidId = '507f1f77bcf86cd799439011';
      const req = createRequest({
        collectionId: longValidId,
        name: 'Updated Name',
        description: 'Updated description'
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle exactly 100 character evaluation model', async () => {
      const exactModel = 'a'.repeat(100);
      vi.spyOn(global.llmModelMap, 'has').mockReturnValue(true);

      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        evaluationModel: exactModel
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(global.llmModelMap.has).toHaveBeenCalledWith(exactModel);
    });

    it('should handle empty evaluation model string', async () => {
      const req = createRequest({
        collectionId: mockCollectionId,
        name: 'Updated Name',
        evaluationModel: ''
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });
  });

  describe('Audit Logging', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockAuthEvaluationDatasetWrite.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId
      });
      setupSuccessfulUpdate();
      mockMongoEvalDatasetCollection.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);
    });

    it('should create audit log with correct parameters', async () => {
      const datasetName = 'Updated Dataset';
      const req = createRequest({
        collectionId: mockCollectionId,
        name: datasetName,
        description: 'Updated description'
      });

      const result = await handler_test(req as any);
      expect(result).toBe('success');

      expect(mockAddAuditLog).toHaveBeenCalledWith({
        tmbId: validTmbId,
        teamId: validTeamId,
        event: expect.any(String),
        params: {
          collectionName: datasetName.trim()
        }
      });
    });

    it('should NOT create audit log when update fails', async () => {
      const datasetName = 'Updated Dataset';
      const dbError = new Error('Database error');
      mockMongoSessionRun.mockRejectedValue(dbError);

      const req = createRequest({
        collectionId: mockCollectionId,
        name: datasetName,
        description: 'Updated description'
      });

      await expect(handler_test(req as any)).rejects.toEqual(
        EvaluationErrEnum.datasetCollectionUpdateFailed
      );

      expect(mockAddAuditLog).not.toHaveBeenCalled();
    });
  });
});
