import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/fileId';
import { authEvalDatasetCollectionFile } from '@fastgpt/service/support/permission/evaluation/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { addEvalDatasetDataQualityJob } from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';

vi.mock('@fastgpt/service/support/permission/evaluation/auth');
vi.mock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    insertMany: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findById: vi.fn()
  }
}));
vi.mock('@fastgpt/service/common/file/gridfs/controller', () => ({
  readFileContentFromMongo: vi.fn()
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataQualityMq', () => ({
  addEvalDatasetDataQualityJob: vi.fn()
}));

const mockAuthEvalDatasetCollectionFile = vi.mocked(authEvalDatasetCollectionFile);
const mockMongoSessionRun = vi.mocked(mongoSessionRun);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);
const mockReadFileContentFromMongo = vi.mocked(readFileContentFromMongo);
const mockAddEvalDatasetDataQualityJob = vi.mocked(addEvalDatasetDataQualityJob);

describe('EvalDatasetData FileId Import API', () => {
  const validTeamId = 'team123';
  const validTmbId = 'tmb123';
  const validFileId = 'file123';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b5';
  const mockInsertedRecords = [
    { _id: '65f5b5b5b5b5b5b5b5b5b5b6' },
    { _id: '65f5b5b5b5b5b5b5b5b5b5b7' }
  ];

  const validCSVContent = `user_input,expected_output,actual_output,context,retrieval_context,metadata
"What is AI?","Artificial Intelligence","AI is...","[""tech"",""science""]","[""AI overview""]","{""category"":""tech""}"
"Define ML","Machine Learning","","","","{}"`;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthEvalDatasetCollectionFile.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      file: {
        _id: validFileId,
        filename: 'test.csv',
        metadata: {
          teamId: validTeamId,
          tmbId: validTmbId
        }
      }
    } as any);

    mockMongoEvalDatasetCollection.findById.mockResolvedValue({
      _id: validCollectionId,
      teamId: validTeamId
    } as any);

    // Don't set default CSV content - let each test set its own
    mockReadFileContentFromMongo.mockResolvedValue({
      rawText: validCSVContent
    });

    mockMongoSessionRun.mockImplementation(async (callback) => {
      return callback({} as any);
    });

    mockMongoEvalDatasetData.insertMany.mockResolvedValue(mockInsertedRecords as any);
    mockAddEvalDatasetDataQualityJob.mockResolvedValue({} as any);
  });

  describe('Parameter Validation', () => {
    it('should reject when fileId is missing', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('fileId is required and must be a string');
    });

    it('should reject when fileId is not a string', async () => {
      const req = {
        body: {
          fileId: 123,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('fileId is required and must be a string');
    });

    it('should reject when collectionId is missing', async () => {
      const req = {
        body: {
          fileId: validFileId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('datasetCollectionId is required and must be a string');
    });

    it('should reject when collectionId is not a string', async () => {
      const req = {
        body: {
          fileId: validFileId,
          collectionId: 123,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('datasetCollectionId is required and must be a string');
    });

    it('should reject when enableQualityEvaluation is missing', async () => {
      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('enableQualityEvaluation is required and must be a boolean');
    });

    it('should reject when enableQualityEvaluation is not a boolean', async () => {
      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: 'true'
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('enableQualityEvaluation is required and must be a boolean');
    });

    it('should reject when enableQualityEvaluation is true but qualityEvaluationModel is missing', async () => {
      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: true
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(
        'qualityEvaluationModel is required when enableQualityEvaluation is true'
      );
    });

    it('should reject when enableQualityEvaluation is true but qualityEvaluationModel is not a string', async () => {
      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: true,
          qualityEvaluationModel: 123
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe(
        'qualityEvaluationModel is required when enableQualityEvaluation is true'
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvalCollectionFile with correct parameters', async () => {
      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockAuthEvalDatasetCollectionFile).toHaveBeenCalledWith({
        req,
        authToken: true,
        authApiKey: true,
        fileId: validFileId,
        per: WritePermissionVal
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('unAuthorization');
      mockAuthEvalDatasetCollectionFile.mockRejectedValue(authError);

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toThrow('unAuthorization');
    });

    it('should propagate file authentication errors', async () => {
      const fileAuthError = new Error('unAuthorization');
      mockAuthEvalDatasetCollectionFile.mockRejectedValue(fileAuthError);

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await expect(handler_test(req as any)).rejects.toThrow('unAuthorization');
    });
  });

  describe('File Validation', () => {
    it('should reject non-CSV files', async () => {
      mockAuthEvalDatasetCollectionFile.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId,
        file: {
          _id: validFileId,
          filename: 'test.txt',
          metadata: {}
        }
      } as any);

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('File must be a CSV file');
    });

    it('should handle files with uppercase CSV extension', async () => {
      mockAuthEvalDatasetCollectionFile.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId,
        file: {
          _id: validFileId,
          filename: 'test.CSV',
          metadata: {}
        }
      } as any);

      const uppercaseCSV = `user_input,expected_output
"What is AI?","Artificial Intelligence"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: uppercaseCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
    });

    it('should handle files without filename', async () => {
      mockAuthEvalDatasetCollectionFile.mockResolvedValue({
        teamId: validTeamId,
        tmbId: validTmbId,
        file: {
          _id: validFileId,
          filename: undefined,
          metadata: {}
        }
      } as any);

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('File must be a CSV file');
    });
  });

  describe('Dataset Collection Validation', () => {
    it('should reject when dataset collection does not exist', async () => {
      mockMongoEvalDatasetCollection.findById.mockResolvedValue(null);

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('Evaluation dataset collection not found');
    });

    it('should reject when dataset collection belongs to different team', async () => {
      mockMongoEvalDatasetCollection.findById.mockResolvedValue({
        _id: validCollectionId,
        teamId: 'different-team'
      } as any);

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('No permission to access this dataset collection');
    });
  });

  describe('CSV Parsing', () => {
    it('should parse valid CSV with all columns', async () => {
      // Override the mock to return the full CSV with all columns
      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: validCSVContent
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockReadFileContentFromMongo).toHaveBeenCalledWith({
        teamId: validTeamId,
        tmbId: validTmbId,
        bucketName: BucketNameEnum.evaluation,
        fileId: validFileId,
        getFormatText: false
      });

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI?',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Artificial Intelligence',
            [EvalDatasetDataKeyEnum.ActualOutput]: 'AI is...',
            [EvalDatasetDataKeyEnum.Context]: ['tech', 'science'],
            [EvalDatasetDataKeyEnum.RetrievalContext]: ['AI overview'],
            metadata: { category: 'tech' },
            createFrom: EvalDatasetDataCreateFromEnum.fileImport
          }),
          expect.objectContaining({
            teamId: validTeamId,
            tmbId: validTmbId,
            datasetId: validCollectionId,
            [EvalDatasetDataKeyEnum.UserInput]: 'Define ML',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Machine Learning',
            [EvalDatasetDataKeyEnum.ActualOutput]: '',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            metadata: {},
            createFrom: EvalDatasetDataCreateFromEnum.fileImport
          })
        ]),
        {
          session: {},
          ordered: false
        }
      );

      expect(result).toBe('success');
    });

    it('should parse CSV with only required columns', async () => {
      const minimalCSV = `user_input,expected_output
"What is AI?","Artificial Intelligence"
"Define ML","Machine Learning"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: minimalCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI?',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Artificial Intelligence',
            [EvalDatasetDataKeyEnum.ActualOutput]: '',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            metadata: {}
          })
        ]),
        expect.any(Object)
      );

      expect(result).toBe('success');
    });

    it('should reject CSV missing required columns', async () => {
      const invalidCSV = `question,answer
"What is AI?","Artificial Intelligence"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: invalidCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toMatch(/CSV parsing error: CSV file is missing required columns/);
    });

    it('should reject empty CSV file', async () => {
      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: ''
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toMatch(/CSV parsing error: CSV file is empty/);
    });

    it('should reject CSV with no data rows', async () => {
      const headerOnlyCSV = 'user_input,expected_output';

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: headerOnlyCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('CSV file contains no data rows');
    });

    it('should reject CSV with too many rows', async () => {
      const largeCSVHeader = 'user_input,expected_output\n';
      const largeCSVRows = Array.from(
        { length: 10001 },
        (_, i) => `"Question ${i}","Answer ${i}"`
      ).join('\n');
      const largeCSV = largeCSVHeader + largeCSVRows;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: largeCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('CSV file cannot contain more than 10,000 rows');
    });

    it('should handle CSV with inconsistent column count', async () => {
      const inconsistentCSV = `user_input,expected_output
"What is AI?","Artificial Intelligence"
"Define ML","Machine Learning","Extra column"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: inconsistentCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toMatch(/CSV parsing error: Row 3: Expected 2 columns, got 3/);
    });

    it('should handle CSV with quoted fields containing commas', async () => {
      const quotedCSV = `user_input,expected_output
"What is AI, really?","Artificial Intelligence, a branch of computer science"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: quotedCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI, really?',
            [EvalDatasetDataKeyEnum.ExpectedOutput]:
              'Artificial Intelligence, a branch of computer science'
          })
        ]),
        expect.any(Object)
      );

      expect(result).toBe('success');
    });

    it('should handle CSV with escaped quotes', async () => {
      const escapedQuotesCSV = `user_input,expected_output
"What is ""AI""?","It's ""Artificial Intelligence""."`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: escapedQuotesCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'What is "AI"?',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'It\'s "Artificial Intelligence".'
          })
        ]),
        expect.any(Object)
      );

      expect(result).toBe('success');
    });

    it('should handle CSV with enum column names', async () => {
      const enumCSV = `userInput,expectedOutput
"What is AI?","Artificial Intelligence"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: enumCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI?',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Artificial Intelligence'
          })
        ]),
        expect.any(Object)
      );

      expect(result).toBe('success');
    });
  });

  describe('Context and Metadata Parsing', () => {
    it('should parse JSON context arrays', async () => {
      const contextCSV = `user_input,expected_output,context
"What is AI?","Artificial Intelligence","[""tech"", ""science""]"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: contextCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.Context]: ['tech', 'science']
          })
        ]),
        expect.any(Object)
      );
    });

    it('should parse single string context', async () => {
      const contextCSV = `user_input,expected_output,context
"What is AI?","Artificial Intelligence","technology"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: contextCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.Context]: ['technology']
          })
        ]),
        expect.any(Object)
      );
    });

    it('should handle invalid JSON context gracefully', async () => {
      const contextCSV = `user_input,expected_output,context
"What is AI?","Artificial Intelligence","invalid json"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: contextCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.Context]: ['invalid json']
          })
        ]),
        expect.any(Object)
      );
    });

    it('should parse metadata objects', async () => {
      const metadataCSV = `user_input,expected_output,metadata
"What is AI?","Artificial Intelligence","{""category"": ""tech"", ""priority"": 1}"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: metadataCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            metadata: { category: 'tech', priority: 1 }
          })
        ]),
        expect.any(Object)
      );
    });

    it('should handle invalid JSON metadata gracefully', async () => {
      const metadataCSV = `user_input,expected_output,metadata
"What is AI?","Artificial Intelligence","invalid json"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: metadataCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            metadata: {}
          })
        ]),
        expect.any(Object)
      );
    });

    it('should filter out non-string items from context arrays', async () => {
      const contextCSV = `user_input,expected_output,context
"What is AI?","Artificial Intelligence","[""tech"", 123, ""science"", null, ""AI""]"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: contextCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.Context]: ['tech', 'science', 'AI']
          })
        ]),
        expect.any(Object)
      );
    });
  });

  describe('Quality Evaluation', () => {
    it('should not trigger quality evaluation when disabled', async () => {
      const simpleCSV = `user_input,expected_output
"What is AI?","Artificial Intelligence"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: simpleCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockAddEvalDatasetDataQualityJob).not.toHaveBeenCalled();
    });

    it('should trigger quality evaluation when enabled', async () => {
      const qualityEvaluationModel = 'gpt-4';
      // Override the mock to return the full CSV with all columns
      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: validCSVContent
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: true,
          qualityEvaluationModel
        }
      };

      await handler_test(req as any);

      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledTimes(2);
      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: '65f5b5b5b5b5b5b5b5b5b5b6',
        evalModel: qualityEvaluationModel
      });
      expect(mockAddEvalDatasetDataQualityJob).toHaveBeenCalledWith({
        dataId: '65f5b5b5b5b5b5b5b5b5b5b7',
        evalModel: qualityEvaluationModel
      });
    });

    it('should handle quality evaluation job failures gracefully', async () => {
      const qualityEvaluationModel = 'gpt-4';
      mockAddEvalDatasetDataQualityJob.mockRejectedValueOnce(new Error('Queue error'));

      const simpleCSV = `user_input,expected_output
"What is AI?","Artificial Intelligence"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: simpleCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: true,
          qualityEvaluationModel
        }
      };

      const result = await handler_test(req as any);

      // Should still succeed even if some quality evaluation jobs fail
      expect(result).toBe('success');
    });
  });

  describe('Database Operations', () => {
    it('should use session for database operations', async () => {
      const simpleCSV = `user_input,expected_output
"What is AI?","Artificial Intelligence"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: simpleCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      await handler_test(req as any);

      expect(mockMongoSessionRun).toHaveBeenCalledWith(expect.any(Function));
      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(expect.any(Array), {
        session: {},
        ordered: false
      });
    });

    it('should handle database insertion errors', async () => {
      const dbError = new Error('Database error');
      mockMongoSessionRun.mockRejectedValue(dbError);

      const simpleCSV = `user_input,expected_output
"What is AI?","Artificial Intelligence"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: simpleCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('CSV parsing error: Database error');
    });

    it('should propagate file reading errors', async () => {
      const fileError = new Error('File read error');
      mockReadFileContentFromMongo.mockRejectedValue(fileError);

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('CSV parsing error: File read error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle CSV with empty lines', async () => {
      const csvWithEmptyLines = `user_input,expected_output

"What is AI?","Artificial Intelligence"

"Define ML","Machine Learning"
`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: csvWithEmptyLines
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI?'
          }),
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'Define ML'
          })
        ]),
        expect.any(Object)
      );

      expect(result).toBe('success');
    });

    it('should handle special characters in CSV content', async () => {
      const specialCharCSV = `user_input,expected_output
"What is AI? 🤖","人工智能 (AI) is..."
"Définir ML","Machine Learning avec émojis 📊"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: specialCharCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI? 🤖',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: '人工智能 (AI) is...'
          })
        ]),
        expect.any(Object)
      );

      expect(result).toBe('success');
    });

    it('should handle CSV with special characters in fields', async () => {
      const specialCharCSV = `user_input,expected_output
"What is AI? (Define it)","Artificial Intelligence: a field of computer science"
"ML vs DL?","Machine Learning differs from Deep Learning"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: specialCharCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI? (Define it)',
            [EvalDatasetDataKeyEnum.ExpectedOutput]:
              'Artificial Intelligence: a field of computer science'
          }),
          expect.objectContaining({
            [EvalDatasetDataKeyEnum.UserInput]: 'ML vs DL?',
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 'Machine Learning differs from Deep Learning'
          })
        ]),
        expect.any(Object)
      );

      expect(result).toBe('success');
    });
  });

  describe('Return Values', () => {
    it('should return success string on successful import', async () => {
      const simpleCSV = `user_input,expected_output
"What is AI?","Artificial Intelligence"`;

      mockReadFileContentFromMongo.mockResolvedValue({
        rawText: simpleCSV
      });

      const req = {
        body: {
          fileId: validFileId,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBe('success');
      expect(typeof result).toBe('string');
    });

    it('should return error messages as strings', async () => {
      const req = {
        body: {
          fileId: 123,
          collectionId: validCollectionId,
          enableQualityEvaluation: false
        }
      };

      const result = await handler_test(req as any);
      expect(typeof result).toBe('string');
      expect(result).toBe('fileId is required and must be a string');
    });
  });
});
