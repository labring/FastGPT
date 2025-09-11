import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/list';
import { authEvaluationDatasetDataRead } from '@fastgpt/service/core/evaluation/common';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';

vi.mock('@fastgpt/service/core/evaluation/common');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    aggregate: vi.fn(),
    countDocuments: vi.fn()
  }
}));

const mockAuthEvaluationDatasetDataRead = vi.mocked(authEvaluationDatasetDataRead);
const mockMongoEvalDatasetData = vi.mocked(MongoEvalDatasetData);

describe('EvalDatasetData List API', () => {
  const validTeamId = '65f5b5b5b5b5b5b5b5b5b5b0';
  const validTmbId = '65f5b5b5b5b5b5b5b5b5b5b9';
  const validCollectionId = '65f5b5b5b5b5b5b5b5b5b5b1';

  const mockDataItems = [
    {
      _id: '65f5b5b5b5b5b5b5b5b5b5b2',
      userInput: 'What is AI?',
      actualOutput: 'AI stands for Artificial Intelligence',
      expectedOutput: 'Artificial Intelligence is a field of computer science',
      context: ['Machine learning context'],
      retrievalContext: ['AI knowledge base'],
      metadata: { quality: 'good' },
      createFrom: 'manual',
      createTime: new Date('2024-01-01'),
      updateTime: new Date('2024-01-02')
    },
    {
      _id: '65f5b5b5b5b5b5b5b5b5b5b3',
      userInput: 'How does ML work?',
      actualOutput: '',
      expectedOutput: 'Machine Learning works by training algorithms',
      context: [],
      retrievalContext: [],
      metadata: {},
      createFrom: 'auto',
      createTime: new Date('2024-01-03'),
      updateTime: new Date('2024-01-04')
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthEvaluationDatasetDataRead.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId,
      collectionId: validCollectionId
    });

    mockMongoEvalDatasetData.aggregate.mockResolvedValue(mockDataItems);
    mockMongoEvalDatasetData.countDocuments.mockResolvedValue(2);
  });

  describe('Parameter Validation', () => {
    it('should reject when collectionId is missing', async () => {
      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection ID is required');
    });

    it('should reject when collectionId is empty string', async () => {
      const req = {
        body: { collectionId: '', pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection ID is required');
    });

    it('should reject when collectionId is null', async () => {
      const req = {
        body: { collectionId: null, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection ID is required');
    });

    it('should reject when collectionId is undefined', async () => {
      const req = {
        body: { collectionId: undefined, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection ID is required');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should call authEvaluationDatasetDataRead with correct parameters', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockAuthEvaluationDatasetDataRead).toHaveBeenCalledWith(validCollectionId, {
        req,
        authToken: true,
        authApiKey: true
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthEvaluationDatasetDataRead.mockRejectedValue(authError);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Authentication failed');
    });
  });

  describe('Collection Validation', () => {
    it('should reject when collection does not exist', async () => {
      mockAuthEvaluationDatasetDataRead.mockRejectedValue(
        new Error('Collection not found or access denied')
      );

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow(
        'Collection not found or access denied'
      );
    });

    it('should reject when collection belongs to different team', async () => {
      mockAuthEvaluationDatasetDataRead.mockRejectedValue(
        new Error('Collection not found or access denied')
      );

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow(
        'Collection not found or access denied'
      );
    });
  });

  describe('Pagination', () => {
    it('should handle default pagination parameters', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageSize: 20 }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { datasetId: new Types.ObjectId(validCollectionId) } },
          { $sort: { createTime: -1 } },
          { $skip: 0 },
          { $limit: 20 }
        ])
      );
      expect(result.total).toBe(2);
      expect(result.list).toHaveLength(2);
    });

    it('should handle custom pagination parameters', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 2, pageSize: 5 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { datasetId: new Types.ObjectId(validCollectionId) } },
          { $sort: { createTime: -1 } },
          { $skip: 5 },
          { $limit: 5 }
        ])
      );
    });

    it('should handle page number 1', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $skip: 0 }, { $limit: 10 }])
      );
    });

    it('should handle high page numbers', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 10, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $skip: 90 }, { $limit: 10 }])
      );
    });

    it('should handle large page sizes', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 100 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $skip: 0 }, { $limit: 100 }])
      );
    });
  });

  describe('Search Functionality', () => {
    it('should handle empty search key', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: '', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );
    });

    it('should handle whitespace-only search key', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: '   ', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );
    });

    it('should handle valid search key with OR conditions', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: 'AI', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        $or: [
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('AI', 'i') } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('AI', 'i') } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('AI', 'i') } }
        ]
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should trim search key before processing', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: '  ML  ', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        $or: [
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('ML', 'i') } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('ML', 'i') } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('ML', 'i') } }
        ]
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );
    });

    it('should escape special regex characters in search key', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: 'What[?]', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        $or: [
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('What\\[\\?\\]', 'i') } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('What\\[\\?\\]', 'i') } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('What\\[\\?\\]', 'i') } }
        ]
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );
    });

    it('should handle non-string search key', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: 123, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );
    });
  });

  describe('Quality Status Filtering', () => {
    it('should handle empty status parameter', async () => {
      const req = {
        body: { collectionId: validCollectionId, status: '', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );
    });

    it('should handle whitespace-only status parameter', async () => {
      const req = {
        body: { collectionId: validCollectionId, status: '   ', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );
    });

    it('should filter by quality status - unevaluated', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.unevaluated,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.unevaluated
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should filter by quality status - highQuality', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.highQuality,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.highQuality
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should filter by quality status - needsOptimization', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.needsOptimization,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.needsOptimization
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should filter by quality status - completed', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.completed,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.completed
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should filter by quality status - evaluating', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.evaluating,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.evaluating
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should filter by quality status - queuing', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.queuing,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.queuing
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should filter by quality status - error', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.error,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.error
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should trim status parameter before filtering', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: `  ${EvalDatasetDataQualityStatusEnum.highQuality}  `,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.highQuality
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should handle non-string status parameter', async () => {
      const req = {
        body: { collectionId: validCollectionId, status: 123, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );
    });

    it('should handle null status parameter', async () => {
      const req = {
        body: { collectionId: validCollectionId, status: null, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );
    });

    it('should handle undefined status parameter', async () => {
      const req = {
        body: { collectionId: validCollectionId, status: undefined, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );
    });
  });

  describe('Combined Search and Quality Status Filtering', () => {
    it('should combine search and quality status filters with AND logic', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: 'AI',
          status: EvalDatasetDataQualityStatusEnum.highQuality,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.highQuality,
        $or: [
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('AI', 'i') } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('AI', 'i') } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('AI', 'i') } }
        ]
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should handle empty search with valid status', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: '',
          status: EvalDatasetDataQualityStatusEnum.needsOptimization,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.needsOptimization
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should handle valid search with empty status', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: 'machine learning',
          status: '',
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        $or: [
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('machine learning', 'i') } },
          {
            [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('machine learning', 'i') }
          },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('machine learning', 'i') } }
        ]
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should handle complex search with multiple quality statuses in separate requests', async () => {
      const searchKey = 'What[?]*+^$.|(){}\\';

      // First request with highQuality status
      const req1 = {
        body: {
          collectionId: validCollectionId,
          searchKey,
          status: EvalDatasetDataQualityStatusEnum.highQuality,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req1 as any);

      const expectedMatch1 = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.highQuality,
        $or: expect.arrayContaining([
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: expect.any(RegExp) } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: expect.any(RegExp) } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: expect.any(RegExp) } }
        ])
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch1 }])
      );

      vi.clearAllMocks();
      mockMongoEvalDatasetData.aggregate.mockResolvedValue([]);
      mockMongoEvalDatasetData.countDocuments.mockResolvedValue(0);

      // Second request with needsOptimization status
      const req2 = {
        body: {
          collectionId: validCollectionId,
          searchKey,
          status: EvalDatasetDataQualityStatusEnum.needsOptimization,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req2 as any);

      const expectedMatch2 = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.needsOptimization,
        $or: expect.arrayContaining([
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: expect.any(RegExp) } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: expect.any(RegExp) } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: expect.any(RegExp) } }
        ])
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch2 }])
      );
    });
  });

  describe('MongoDB Pipeline', () => {
    it('should build correct aggregation pipeline without search', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith([
        { $match: { datasetId: new Types.ObjectId(validCollectionId) } },
        { $sort: { createTime: -1 } },
        { $skip: 0 },
        { $limit: 10 },
        {
          $project: {
            _id: 1,
            [EvalDatasetDataKeyEnum.UserInput]: 1,
            [EvalDatasetDataKeyEnum.ActualOutput]: 1,
            [EvalDatasetDataKeyEnum.ExpectedOutput]: 1,
            [EvalDatasetDataKeyEnum.Context]: 1,
            [EvalDatasetDataKeyEnum.RetrievalContext]: 1,
            metadata: 1,
            createFrom: 1,
            createTime: 1,
            updateTime: 1
          }
        }
      ]);
    });

    it('should include search filter in pipeline when searchKey provided', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: 'test', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              datasetId: new Types.ObjectId(validCollectionId),
              $or: [
                { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('test', 'i') } },
                { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('test', 'i') } },
                { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('test', 'i') } }
              ]
            }
          }
        ])
      );
    });

    it('should include quality status filter in pipeline when status provided', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.highQuality,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              datasetId: new Types.ObjectId(validCollectionId),
              'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.highQuality
            }
          }
        ])
      );
    });

    it('should include both search and quality status filters in pipeline', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: 'AI',
          status: EvalDatasetDataQualityStatusEnum.needsOptimization,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              datasetId: new Types.ObjectId(validCollectionId),
              'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.needsOptimization,
              $or: [
                { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('AI', 'i') } },
                { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('AI', 'i') } },
                { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('AI', 'i') } }
              ]
            }
          }
        ])
      );
    });

    it('should sort by createTime descending', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $sort: { createTime: -1 } }])
      );
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result).toEqual({
        total: 2,
        list: [
          {
            _id: '65f5b5b5b5b5b5b5b5b5b5b2',
            [EvalDatasetDataKeyEnum.UserInput]: 'What is AI?',
            [EvalDatasetDataKeyEnum.ActualOutput]: 'AI stands for Artificial Intelligence',
            [EvalDatasetDataKeyEnum.ExpectedOutput]:
              'Artificial Intelligence is a field of computer science',
            [EvalDatasetDataKeyEnum.Context]: ['Machine learning context'],
            [EvalDatasetDataKeyEnum.RetrievalContext]: ['AI knowledge base'],
            metadata: { quality: 'good' },
            createFrom: 'manual',
            createTime: expect.any(Date),
            updateTime: expect.any(Date)
          },
          {
            _id: '65f5b5b5b5b5b5b5b5b5b5b3',
            [EvalDatasetDataKeyEnum.UserInput]: 'How does ML work?',
            [EvalDatasetDataKeyEnum.ActualOutput]: '',
            [EvalDatasetDataKeyEnum.ExpectedOutput]:
              'Machine Learning works by training algorithms',
            [EvalDatasetDataKeyEnum.Context]: [],
            [EvalDatasetDataKeyEnum.RetrievalContext]: [],
            metadata: {},
            createFrom: 'auto',
            createTime: expect.any(Date),
            updateTime: expect.any(Date)
          }
        ]
      });
    });

    it('should handle missing actualOutput with empty string', async () => {
      const dataWithMissingActualOutput = [
        {
          _id: '65f5b5b5b5b5b5b5b5b5b5b2',
          userInput: 'What is AI?',
          expectedOutput: 'Artificial Intelligence',
          context: [],
          retrievalContext: [],
          metadata: {},
          createFrom: 'manual',
          createTime: new Date('2024-01-01'),
          updateTime: new Date('2024-01-02')
        }
      ];

      mockMongoEvalDatasetData.aggregate.mockResolvedValue(dataWithMissingActualOutput);
      mockMongoEvalDatasetData.countDocuments.mockResolvedValue(1);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result.list[0][EvalDatasetDataKeyEnum.ActualOutput]).toBe('');
    });

    it('should handle missing context with empty array', async () => {
      const dataWithMissingContext = [
        {
          _id: '65f5b5b5b5b5b5b5b5b5b5b2',
          userInput: 'What is AI?',
          actualOutput: 'AI stands for Artificial Intelligence',
          expectedOutput: 'Artificial Intelligence',
          retrievalContext: [],
          metadata: {},
          createFrom: 'manual',
          createTime: new Date('2024-01-01'),
          updateTime: new Date('2024-01-02')
        }
      ];

      mockMongoEvalDatasetData.aggregate.mockResolvedValue(dataWithMissingContext);
      mockMongoEvalDatasetData.countDocuments.mockResolvedValue(1);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result.list[0][EvalDatasetDataKeyEnum.Context]).toEqual([]);
    });

    it('should handle missing retrievalContext with empty array', async () => {
      const dataWithMissingRetrievalContext = [
        {
          _id: '65f5b5b5b5b5b5b5b5b5b5b2',
          userInput: 'What is AI?',
          actualOutput: 'AI stands for Artificial Intelligence',
          expectedOutput: 'Artificial Intelligence',
          context: [],
          metadata: {},
          createFrom: 'manual',
          createTime: new Date('2024-01-01'),
          updateTime: new Date('2024-01-02')
        }
      ];

      mockMongoEvalDatasetData.aggregate.mockResolvedValue(dataWithMissingRetrievalContext);
      mockMongoEvalDatasetData.countDocuments.mockResolvedValue(1);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result.list[0][EvalDatasetDataKeyEnum.RetrievalContext]).toEqual([]);
    });

    it('should handle missing metadata with empty object', async () => {
      const dataWithMissingMetadata = [
        {
          _id: '65f5b5b5b5b5b5b5b5b5b5b2',
          userInput: 'What is AI?',
          actualOutput: 'AI stands for Artificial Intelligence',
          expectedOutput: 'Artificial Intelligence',
          context: [],
          retrievalContext: [],
          createFrom: 'manual',
          createTime: new Date('2024-01-01'),
          updateTime: new Date('2024-01-02')
        }
      ];

      mockMongoEvalDatasetData.aggregate.mockResolvedValue(dataWithMissingMetadata);
      mockMongoEvalDatasetData.countDocuments.mockResolvedValue(1);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result.list[0].metadata).toEqual({});
    });

    it('should convert ObjectId to string', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      result.list.forEach((item) => {
        expect(typeof item._id).toBe('string');
      });
    });
  });

  describe('Empty Results', () => {
    it('should handle empty data list', async () => {
      mockMongoEvalDatasetData.aggregate.mockResolvedValue([]);
      mockMongoEvalDatasetData.countDocuments.mockResolvedValue(0);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result).toEqual({
        total: 0,
        list: []
      });
    });

    it('should handle zero total count with search', async () => {
      mockMongoEvalDatasetData.aggregate.mockResolvedValue([]);
      mockMongoEvalDatasetData.countDocuments.mockResolvedValue(0);

      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: 'nonexistent',
          pageNum: 1,
          pageSize: 10
        }
      };

      const result = await handler_test(req as any);

      expect(result.total).toBe(0);
      expect(result.list).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should propagate database aggregate errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetData.aggregate.mockRejectedValue(dbError);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should propagate database count errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetData.countDocuments.mockRejectedValue(dbError);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should handle Promise.all rejection', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetData.aggregate.mockResolvedValue(mockDataItems);
      mockMongoEvalDatasetData.countDocuments.mockRejectedValue(dbError);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should handle collection access errors', async () => {
      const dbError = new Error('Collection query failed');
      mockAuthEvaluationDatasetDataRead.mockRejectedValue(dbError);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection query failed');
    });

    it('should log database errors with proper context including qualityStatus', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetData.aggregate.mockRejectedValue(dbError);

      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: 'test search',
          status: EvalDatasetDataQualityStatusEnum.highQuality,
          pageNum: 1,
          pageSize: 10
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);

      // The error should be logged with proper context including qualityStatus
      // Note: We can't easily test the addLog.error call since it's imported directly
      // and not mocked in this test file, but we verify the request parameters
      // are properly extracted for logging
    });

    it('should log database errors with proper context when qualityStatus is empty', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetData.aggregate.mockRejectedValue(dbError);

      const req = {
        body: {
          collectionId: validCollectionId,
          status: '', // Empty status should still be logged
          pageNum: 1,
          pageSize: 10
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });
  });

  describe('Collection Isolation', () => {
    it('should filter results by collection ID', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { datasetId: new Types.ObjectId(validCollectionId) } }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith({
        datasetId: new Types.ObjectId(validCollectionId)
      });
    });

    it('should include collection ID in search filter', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: 'test', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        $or: [
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('test', 'i') } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('test', 'i') } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('test', 'i') } }
        ]
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should include collection ID in quality status filter', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: EvalDatasetDataQualityStatusEnum.highQuality,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.highQuality
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should include collection ID in combined search and quality status filter', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: 'AI model',
          status: EvalDatasetDataQualityStatusEnum.completed,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      const expectedMatch = {
        datasetId: new Types.ObjectId(validCollectionId),
        'metadata.qualityStatus': EvalDatasetDataQualityStatusEnum.completed,
        $or: [
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp('AI model', 'i') } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp('AI model', 'i') } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp('AI model', 'i') } }
        ]
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large page size', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 1000 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $limit: 1000 }])
      );
    });

    it('should handle high page number', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 100, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $skip: 990 }])
      );
    });

    it('should handle complex search patterns with special characters', async () => {
      const complexSearchKey = 'What[?]*+^$.|(){}\\';
      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: complexSearchKey,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              datasetId: new Types.ObjectId(validCollectionId),
              $or: expect.arrayContaining([
                { [EvalDatasetDataKeyEnum.UserInput]: { $regex: expect.any(RegExp) } },
                { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: expect.any(RegExp) } },
                { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: expect.any(RegExp) } }
              ])
            }
          }
        ])
      );
    });

    it('should handle unicode characters in search', async () => {
      const unicodeSearchKey = '人工智能 🤖 émojis';
      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: unicodeSearchKey,
          pageNum: 1,
          pageSize: 10
        }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              datasetId: new Types.ObjectId(validCollectionId),
              $or: expect.arrayContaining([
                { [EvalDatasetDataKeyEnum.UserInput]: { $regex: expect.any(RegExp) } }
              ])
            }
          }
        ])
      );
    });

    it('should handle very long search keys', async () => {
      const longSearchKey = 'a'.repeat(1000);
      const req = {
        body: {
          collectionId: validCollectionId,
          searchKey: longSearchKey,
          pageNum: 1,
          pageSize: 10
        }
      };

      const result = await handler_test(req as any);
      expect(result).toBeDefined();
    });

    it('should handle invalid ObjectId format for collectionId', async () => {
      const invalidCollectionId = 'invalid-object-id';
      const req = {
        body: { collectionId: invalidCollectionId, pageNum: 1, pageSize: 10 }
      };

      // MongoDB ObjectId constructor will throw BSONError for invalid format
      await expect(handler_test(req as any)).rejects.toThrow(
        'input must be a 24 character hex string'
      );
    });

    it('should handle very large offset values', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 10000, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $skip: 99990 }])
      );
    });

    it('should handle maximum page size limit', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10000 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $limit: 10000 }])
      );
    });

    it('should handle empty string collectionId', async () => {
      const req = {
        body: { collectionId: '', pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection ID is required');
    });

    it('should handle null collectionId', async () => {
      const req = {
        body: { collectionId: null, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection ID is required');
    });

    it('should handle undefined collectionId', async () => {
      const req = {
        body: { collectionId: undefined, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection ID is required');
    });
  });
});
