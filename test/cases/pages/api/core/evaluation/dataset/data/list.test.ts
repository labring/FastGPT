import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/data/list';
import { authEvaluationDatasetDataRead } from '@fastgpt/service/core/evaluation/common';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

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
    it.each([
      { collectionId: undefined, desc: 'missing' },
      { collectionId: '', desc: 'empty string' },
      { collectionId: null, desc: 'null' },
      { collectionId: undefined, desc: 'undefined' }
    ])('should reject when collectionId is $desc', async ({ collectionId }) => {
      const req = {
        body: { collectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.datasetCollectionIdRequired
      );
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
    it.each([
      {
        pageNum: undefined,
        pageSize: 20,
        expectedSkip: 0,
        expectedLimit: 20,
        desc: 'default page number'
      },
      { pageNum: 2, pageSize: 5, expectedSkip: 5, expectedLimit: 5, desc: 'custom pagination' },
      { pageNum: 10, pageSize: 10, expectedSkip: 90, expectedLimit: 10, desc: 'high page numbers' },
      { pageNum: 1, pageSize: 100, expectedSkip: 0, expectedLimit: 100, desc: 'large page sizes' }
    ])('should handle $desc', async ({ pageNum, pageSize, expectedSkip, expectedLimit }) => {
      const req = {
        body: { collectionId: validCollectionId, pageNum, pageSize }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { evalDatasetCollectionId: new Types.ObjectId(validCollectionId) } },
          { $sort: { createTime: -1 } },
          { $skip: expectedSkip },
          { $limit: expectedLimit }
        ])
      );

      if (pageNum === undefined) {
        expect(result.total).toBe(2);
        expect(result.list).toHaveLength(2);
      }
    });
  });

  describe('Search Functionality', () => {
    it.each([
      { searchKey: '', expectedHasOr: false, desc: 'empty' },
      { searchKey: '   ', expectedHasOr: false, desc: 'whitespace-only' },
      { searchKey: 123, expectedHasOr: false, desc: 'non-string' }
    ])('should handle $desc search key without OR conditions', async ({ searchKey }) => {
      const req = {
        body: { collectionId: validCollectionId, searchKey, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { evalDatasetCollectionId: new Types.ObjectId(validCollectionId) } }
        ])
      );
    });

    it.each([
      { searchKey: 'AI', expected: 'AI' },
      { searchKey: '  ML  ', expected: 'ML' }
    ])('should handle valid search key: $searchKey', async ({ searchKey, expected }) => {
      const req = {
        body: { collectionId: validCollectionId, searchKey, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
        $or: [
          { [EvalDatasetDataKeyEnum.UserInput]: { $regex: new RegExp(expected, 'i') } },
          { [EvalDatasetDataKeyEnum.ExpectedOutput]: { $regex: new RegExp(expected, 'i') } },
          { [EvalDatasetDataKeyEnum.ActualOutput]: { $regex: new RegExp(expected, 'i') } }
        ]
      };

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should escape special regex characters in search key', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: 'What[?]', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
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
  });

  describe('Quality Status Filtering', () => {
    it.each([
      { status: '', desc: 'empty' },
      { status: null, desc: 'null' },
      { status: undefined, desc: 'undefined' }
    ])('should handle $desc status parameter without filtering', async ({ status }) => {
      const req = {
        body: { collectionId: validCollectionId, status, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { evalDatasetCollectionId: new Types.ObjectId(validCollectionId) } }
        ])
      );
    });

    it.each([
      { status: '   ', desc: 'whitespace-only' },
      { status: 123, desc: 'non-string' }
    ])('should reject invalid $desc status parameter', async ({ status }) => {
      const req = {
        body: { collectionId: validCollectionId, status, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.evalDataQualityStatusInvalid
      );
    });

    it.each(Object.values(EvalDatasetDataQualityStatusEnum))(
      'should filter by quality status - %s',
      async (status) => {
        const req = {
          body: {
            collectionId: validCollectionId,
            status,
            pageNum: 1,
            pageSize: 10
          }
        };

        await handler_test(req as any);

        const expectedMatch = {
          evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
          'qualityMetadata.status': status
        };

        expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith(
          expect.arrayContaining([{ $match: expectedMatch }])
        );

        expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith(expectedMatch);
      }
    );

    it('should reject invalid quality status with spaces', async () => {
      const req = {
        body: {
          collectionId: validCollectionId,
          status: `  ${EvalDatasetDataQualityStatusEnum.highQuality}  `,
          pageNum: 1,
          pageSize: 10
        }
      };

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.evalDataQualityStatusInvalid
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
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.highQuality,
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
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.needsOptimization
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
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
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
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.highQuality,
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
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.needsOptimization,
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
        { $match: { evalDatasetCollectionId: new Types.ObjectId(validCollectionId) } },
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
            qualityMetadata: 1,
            synthesisMetadata: 1,
            qualityResult: 1,
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
              evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
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
              evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
              'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.highQuality
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
              evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
              'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.needsOptimization,
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
            qualityMetadata: { status: 'unevaluated' },
            synthesisMetadata: {},
            qualityResult: undefined,
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
            qualityMetadata: { status: 'unevaluated' },
            synthesisMetadata: {},
            qualityResult: undefined,
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

      expect(result.list[0].qualityMetadata).toEqual({ status: 'unevaluated' });
      expect(result.list[0].synthesisMetadata).toEqual({});
      expect(result.list[0].qualityResult).toEqual(undefined);
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
    it.each([
      {
        scenario: 'aggregate errors',
        setupMocks: (error: Error) => {
          mockMongoEvalDatasetData.aggregate.mockRejectedValue(error);
        }
      },
      {
        scenario: 'count errors',
        setupMocks: (error: Error) => {
          mockMongoEvalDatasetData.countDocuments.mockRejectedValue(error);
        }
      },
      {
        scenario: 'Promise.all rejection',
        setupMocks: (error: Error) => {
          mockMongoEvalDatasetData.aggregate.mockResolvedValue(mockDataItems);
          mockMongoEvalDatasetData.countDocuments.mockRejectedValue(error);
        }
      }
    ])('should handle database $scenario', async ({ setupMocks }) => {
      const dbError = new Error('Database connection failed');
      setupMocks(dbError);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.evalDatasetDataListError
      );
    });

    it('should handle collection access errors', async () => {
      const dbError = new Error('Collection query failed');
      mockAuthEvaluationDatasetDataRead.mockRejectedValue(dbError);

      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toThrow('Collection query failed');
    });

    it.each([
      {
        scenario: 'with qualityStatus',
        body: {
          collectionId: validCollectionId,
          searchKey: 'test search',
          status: EvalDatasetDataQualityStatusEnum.highQuality,
          pageNum: 1,
          pageSize: 10
        }
      },
      {
        scenario: 'with empty status',
        body: {
          collectionId: validCollectionId,
          status: '',
          pageNum: 1,
          pageSize: 10
        }
      }
    ])('should log database errors with proper context $scenario', async ({ body }) => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetData.aggregate.mockRejectedValue(dbError);

      const req = { body };

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.evalDatasetDataListError
      );
    });
  });

  describe('Collection Isolation', () => {
    it('should filter results by collection ID', async () => {
      const req = {
        body: { collectionId: validCollectionId, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetData.aggregate).toHaveBeenCalledWith([
        { $match: { evalDatasetCollectionId: new Types.ObjectId(validCollectionId) } },
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
            qualityMetadata: 1,
            synthesisMetadata: 1,
            qualityResult: 1,
            createFrom: 1,
            createTime: 1,
            updateTime: 1
          }
        }
      ]);

      expect(mockMongoEvalDatasetData.countDocuments).toHaveBeenCalledWith({
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId)
      });
    });

    it('should include collection ID in search filter', async () => {
      const req = {
        body: { collectionId: validCollectionId, searchKey: 'test', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
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
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.highQuality
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
        evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
        'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.completed,
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
              evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
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
              evalDatasetCollectionId: new Types.ObjectId(validCollectionId),
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

    it.each([
      { collectionId: '', desc: 'empty string' },
      { collectionId: null, desc: 'null' },
      { collectionId: undefined, desc: 'undefined' }
    ])('should handle $desc collectionId', async ({ collectionId }) => {
      const req = {
        body: { collectionId, pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(
        EvaluationErrEnum.datasetCollectionIdRequired
      );
    });
  });
});
