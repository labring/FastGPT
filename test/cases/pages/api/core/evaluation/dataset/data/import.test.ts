import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/import';
import {
  authEvaluationDatasetDataWrite,
  authEvaluationDatasetCreate
} from '@fastgpt/service/core/evaluation/common';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import {
  checkTeamAIPoints,
  checkTeamEvalDatasetLimit
} from '@fastgpt/service/support/permission/teamLimit';
import { getDefaultEvaluationModel } from '@fastgpt/service/core/ai/model';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { addEvalDatasetDataQualityJob } from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';

vi.mock('@fastgpt/service/core/evaluation/common');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/common/file/multer');
vi.mock('@fastgpt/service/common/file/utils');
vi.mock('@fastgpt/service/support/permission/teamLimit');
vi.mock('@fastgpt/service/core/ai/model');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    insertMany: vi.fn()
  }
}));
vi.mock(
  '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema',
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      MongoEvalDatasetCollection: {
        findById: vi.fn(),
        findOne: vi.fn(),
        create: vi.fn()
      }
    };
  }
);
vi.mock('@fastgpt/service/core/evaluation/dataset/dataQualityMq', () => ({
  addEvalDatasetDataQualityJob: vi.fn()
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

const mockAuthEvaluationDatasetDataWrite = vi.mocked(authEvaluationDatasetDataWrite);
const mockAuthEvaluationDatasetCreate = vi.mocked(authEvaluationDatasetCreate);
const mockGetUploadModel = vi.mocked(getUploadModel);
const mockRemoveFilesByPaths = vi.mocked(removeFilesByPaths);
const mockCheckTeamAIPoints = vi.mocked(checkTeamAIPoints);
const mockCheckTeamEvalDatasetLimit = vi.mocked(checkTeamEvalDatasetLimit);
const mockGetDefaultEvaluationModel = vi.mocked(getDefaultEvaluationModel);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockAddEvalDatasetDataQualityJob = vi.mocked(addEvalDatasetDataQualityJob);

// Mock global.llmModelMap
beforeEach(() => {
  global.llmModelMap = new Map([
    ['gpt-4', { model: 'gpt-4' }],
    ['gpt-3.5-turbo', { model: 'gpt-3.5-turbo' }]
  ]) as any;
});

describe('EvalDatasetData Import API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const mockInsertedRecords = [
    { _id: '65f5b5b5b5b5b5b5b5b5b5b6' },
    { _id: '65f5b5b5b5b5b5b5b5b5b5b7' }
  ];

  const validCSVContent = `user_input,expected_output,actual_output,context,retrieval_context,metadata
"What is AI?","Artificial Intelligence","AI is...","[""tech"",""science""]","[""AI overview""]","{""category"":""tech""}"
"Define ML","Machine Learning","","","","{}"`;

  const mockFiles = [
    {
      fieldname: 'file',
      originalname: 'test1.csv',
      encoding: '7bit',
      mimetype: 'text/csv',
      filename: 'test1.csv',
      path: '/tmp/test1.csv',
      size: 1024
    },
    {
      fieldname: 'file',
      originalname: 'test2.csv',
      encoding: '7bit',
      mimetype: 'text/csv',
      filename: 'test2.csv',
      path: '/tmp/test2.csv',
      size: 2048
    }
  ];

  const mockUploadModel = {
    getUploadFiles: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset global.llmModelMap
    global.llmModelMap = new Map([
      ['gpt-4', { model: 'gpt-4' }],
      ['gpt-3.5-turbo', { model: 'gpt-3.5-turbo' }]
    ]) as any;

    // Mock file system
    const fs = require('fs');
    vi.spyOn(fs, 'readFileSync').mockReturnValue(validCSVContent);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isFile: () => true,
      isDirectory: () => false
    } as any);

    mockGetUploadModel.mockReturnValue(mockUploadModel as any);
    mockUploadModel.getUploadFiles.mockResolvedValue({
      files: mockFiles,
      data: {
        collectionId: validCollectionId,
        enableQualityEvaluation: false
      }
    });

    mockAuthEvaluationDatasetDataWrite.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      collectionId: validCollectionId
    });

    mockAuthEvaluationDatasetCreate.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback({} as any);
    });

    mockMongoEvalDatasetData.insertMany.mockResolvedValue(mockInsertedRecords as any);
    mockMongoEvalDatasetCollection.findById.mockResolvedValue({
      _id: validCollectionId,
      teamId: validTeamId,
      name: 'Test Collection'
    } as any);
    mockMongoEvalDatasetCollection.findOne.mockResolvedValue(null);
    mockMongoEvalDatasetCollection.create.mockResolvedValue([
      {
        _id: validCollectionId,
        teamId: validTeamId,
        name: 'New Collection'
      }
    ] as any);

    mockCheckTeamAIPoints.mockResolvedValue(undefined);
    mockCheckTeamEvalDatasetLimit.mockResolvedValue(undefined);
    mockGetDefaultEvaluationModel.mockReturnValue({ model: 'gpt-3.5-turbo' });
    mockRemoveFilesByPaths.mockResolvedValue(undefined);
    mockAddEvalDatasetDataQualityJob.mockResolvedValue({} as any);
  });

  describe('Parameter Validation', () => {
    it('should reject when no files are uploaded', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: [],
        data: { collectionId: validCollectionId, enableQualityEvaluation: false }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationFileIdRequired');
    });

    it('should reject when files are not CSV', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: [{ ...mockFiles[0], originalname: 'test.txt' }],
        data: { collectionId: validCollectionId, enableQualityEvaluation: false }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationFileMustBeCSV');
    });

    it('should reject when neither collectionId nor name provided', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: mockFiles,
        data: { enableQualityEvaluation: false }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('missingParams');
    });

    it('should reject when both collectionId and name provided', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: mockFiles,
        data: {
          collectionId: validCollectionId,
          name: 'Test Collection',
          enableQualityEvaluation: false
        }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('invalidParams');
    });

    it('should reject when enableQualityEvaluation is not boolean', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: mockFiles,
        data: {
          collectionId: validCollectionId,
          enableQualityEvaluation: 'true'
        }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe(
        'evaluationDatasetDataEnableQualityEvalRequired'
      );
    });

    it('should reject when quality evaluation enabled but no model provided', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: mockFiles,
        data: {
          collectionId: validCollectionId,
          enableQualityEvaluation: true
        }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe(
        'evaluationDatasetDataEvaluationModelRequiredForQuality'
      );
    });

    it('should reject when evaluation model not found in global map', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: mockFiles,
        data: {
          collectionId: validCollectionId,
          enableQualityEvaluation: true,
          evaluationModel: 'non-existent-model'
        }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe(
        'evaluationDatasetModelNotFound'
      );
    });
  });

  describe('Dual-Mode Operation', () => {
    describe('Mode 1: Existing Collection', () => {
      it('should use existing collection when collectionId provided', async () => {
        const req = { body: {} };
        const res = {};

        const result = await handler_test(req as any, res as any);

        expect(mockAuthEvaluationDatasetDataWrite).toHaveBeenCalledWith(validCollectionId, {
          req,
          authToken: true,
          authApiKey: true
        });
        expect(mockMongoEvalDatasetCollection.findById).toHaveBeenCalledWith(validCollectionId);
        expect(result).toBe('success');
      });

      it('should reject when collection not found', async () => {
        mockMongoEvalDatasetCollection.findById.mockResolvedValue(null);

        const req = { body: {} };
        const res = {};

        await expect(handler_test(req as any, res as any)).rejects.toBe(
          'evaluationDatasetCollectionNotFound'
        );
      });

      it('should reject when collection belongs to different team', async () => {
        mockMongoEvalDatasetCollection.findById.mockResolvedValue({
          _id: validCollectionId,
          teamId: 'different-team',
          name: 'Test Collection'
        });

        const req = { body: {} };
        const res = {};

        await expect(handler_test(req as any, res as any)).rejects.toBe(
          'evaluationInsufficientPermission'
        );
      });
    });

    describe('Mode 2: Create New Collection', () => {
      beforeEach(() => {
        mockUploadModel.getUploadFiles.mockResolvedValue({
          files: mockFiles,
          data: {
            name: 'New Collection',
            description: 'Test description',
            enableQualityEvaluation: false
          }
        });
      });

      it('should create new collection when name provided', async () => {
        const req = { body: {} };
        const res = {};

        const result = await handler_test(req as any, res as any);

        expect(mockAuthEvaluationDatasetCreate).toHaveBeenCalledWith({
          req,
          authToken: true,
          authApiKey: true
        });
        expect(mockCheckTeamEvalDatasetLimit).toHaveBeenCalledWith(validTeamId);
        expect(mockMongoEvalDatasetCollection.findOne).toHaveBeenCalledWith({
          teamId: validTeamId,
          name: 'New Collection'
        });
        expect(mockMongoEvalDatasetCollection.create).toHaveBeenCalled();
        expect(result).toBe('success');
      });

      it('should reject when collection name is empty', async () => {
        mockUploadModel.getUploadFiles.mockResolvedValue({
          files: mockFiles,
          data: {
            name: '',
            enableQualityEvaluation: false
          }
        });

        const req = { body: {} };
        const res = {};

        await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationNameRequired');
      });

      it('should reject when collection name already exists', async () => {
        mockMongoEvalDatasetCollection.findOne.mockResolvedValue({
          _id: 'existing-id',
          name: 'New Collection'
        });

        const req = { body: {} };
        const res = {};

        await expect(handler_test(req as any, res as any)).rejects.toBe(
          'evaluationDuplicateDatasetName'
        );
      });
    });
  });

  describe('Multiple File Upload', () => {
    it('should process multiple CSV files successfully', async () => {
      const multipleFiles = [
        { ...mockFiles[0], originalname: 'test1.csv' },
        { ...mockFiles[1], originalname: 'test2.csv' }
      ];

      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: multipleFiles,
        data: { collectionId: validCollectionId, enableQualityEvaluation: false }
      });

      const req = { body: {} };
      const res = {};

      const result = await handler_test(req as any, res as any);

      expect(result).toBe('success');
      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalled();
      expect(mockRemoveFilesByPaths).toHaveBeenCalledWith(['/tmp/test1.csv', '/tmp/test2.csv']);
    });

    it('should add importedFromFile metadata to records', async () => {
      const req = { body: {} };
      const res = {};

      await handler_test(req as any, res as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.Metadata]: expect.objectContaining({
              importedFromFile: 'test1.csv'
            })
          })
        ]),
        expect.any(Object)
      );
    });
  });

  describe('CSV Processing', () => {
    it('should parse valid CSV with all columns', async () => {
      const req = { body: {} };
      const res = {};

      const result = await handler_test(req as any, res as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            teamId: validTeamId,
            tmbId: validTmbId,
            evalDatasetCollectionId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI?',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Artificial Intelligence',
            [EvalDatasetDataKeyEnum.ActualOutput]: 'AI is...',
            [EvalDatasetDataKeyEnum.Context]: ['tech', 'science'],
            createFrom: EvalDatasetDataCreateFromEnum.fileImport
          })
        ]),
        expect.objectContaining({
          session: {},
          ordered: false
        })
      );

      expect(result).toBe('success');
    });

    it('should handle empty CSV gracefully', async () => {
      const fs = require('fs');
      fs.readFileSync.mockReturnValue('');

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationCSVNoDataRows');
    });
  });

  describe('Quality Evaluation', () => {
    it('should not trigger quality evaluation when disabled', async () => {
      const req = { body: {} };
      const res = {};

      await handler_test(req as any, res as any);

      expect(mockAddEvalDatasetDataQualityJob).not.toHaveBeenCalled();
    });

    it('should trigger quality evaluation when enabled', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: mockFiles,
        data: {
          collectionId: validCollectionId,
          enableQualityEvaluation: true,
          evaluationModel: 'gpt-4'
        }
      });

      const req = { body: {} };
      const res = {};

      await handler_test(req as any, res as any);

      expect(mockCheckTeamAIPoints).toHaveBeenCalledWith(validTeamId);
      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledTimes(2);
      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: '65f5b5b5b5b5b5b5b5b5b5b6',
        evaluationModel: 'gpt-4'
      });
    });
  });

  describe('Security - Directory Traversal Protection', () => {
    it('should reject files with directory traversal attempts', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: [{ ...mockFiles[0], path: '../../../etc/passwd' }],
        data: { collectionId: validCollectionId, enableQualityEvaluation: false }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationCSVParsingError');
    });

    it('should reject files with Windows-style directory traversal', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: [{ ...mockFiles[0], path: '..\\..\\windows\\system32\\config\\sam' }],
        data: { collectionId: validCollectionId, enableQualityEvaluation: false }
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationCSVParsingError');
    });

    it('should reject non-existent file paths', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: [{ ...mockFiles[0], path: '/non/existent/file.csv' }],
        data: { collectionId: validCollectionId, enableQualityEvaluation: false }
      });

      const fs = require('fs');
      fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationCSVParsingError');
    });

    it('should reject directory paths instead of files', async () => {
      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: [{ ...mockFiles[0], path: '/tmp/' }],
        data: { collectionId: validCollectionId, enableQualityEvaluation: false }
      });

      const fs = require('fs');
      fs.statSync = vi.fn().mockReturnValue({
        isFile: () => false,
        isDirectory: () => true
      });

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationCSVParsingError');
    });

    it('should allow legitimate file paths', async () => {
      const legitimateFiles = [
        { ...mockFiles[0], path: '/tmp/uploads/valid-file.csv' },
        { ...mockFiles[1], path: '/var/tmp/upload-123.csv' }
      ];

      mockUploadModel.getUploadFiles.mockResolvedValue({
        files: legitimateFiles,
        data: { collectionId: validCollectionId, enableQualityEvaluation: false }
      });

      const fs = require('fs');
      fs.statSync = vi.fn().mockReturnValue({
        isFile: () => true,
        isDirectory: () => false
      });
      fs.readFileSync.mockReturnValue(validCSVContent);

      const req = { body: {} };
      const res = {};

      const result = await handler_test(req as any, res as any);
      expect(result).toBe('success');
    });
  });

  describe('File Cleanup', () => {
    it('should always clean up uploaded files', async () => {
      const req = { body: {} };
      const res = {};

      await handler_test(req as any, res as any);

      expect(mockRemoveFilesByPaths).toHaveBeenCalledWith(['/tmp/test1.csv', '/tmp/test2.csv']);
    });

    it('should clean up files even when error occurs', async () => {
      mockMongoEvalDatasetData.insertMany.mockRejectedValue(new Error('Database error'));

      const req = { body: {} };
      const res = {};

      await expect(handler_test(req as any, res as any)).rejects.toBe('evaluationCSVParsingError');
      expect(mockRemoveFilesByPaths).toHaveBeenCalledWith(['/tmp/test1.csv', '/tmp/test2.csv']);
    });
  });

  describe('Return Values', () => {
    it('should return success string on successful import', async () => {
      const req = { body: {} };
      const res = {};

      const result = await handler_test(req as any, res as any);

      expect(result).toBe('success');
      expect(typeof result).toBe('string');
    });
  });
});
