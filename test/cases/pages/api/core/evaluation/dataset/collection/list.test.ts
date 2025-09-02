import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/collection/list';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';

vi.mock('@fastgpt/service/support/permission/user/auth');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    aggregate: vi.fn(),
    countDocuments: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq', () => ({
  evalDatasetDataSynthesizeQueue: {
    getJobs: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq', () => ({
  evalDatasetDataSynthesizeQueue: {
    getJobs: vi.fn().mockResolvedValue([])
  }
}));

const mockAuthUserPer = vi.mocked(authUserPer);
const mockMongoEvalDatasetCollection = vi.mocked(MongoEvalDatasetCollection);

describe('EvalDatasetCollection List API', () => {
  const validTeamId = '65f5b5b5b5b5b5b5b5b5b5b0';
  const validTmbId = '65f5b5b5b5b5b5b5b5b5b5b9';
  const mockCollections = [
    {
      _id: '65f5b5b5b5b5b5b5b5b5b5b1',
      name: 'Dataset 1',
      description: 'First dataset',
      createTime: new Date('2024-01-01'),
      updateTime: new Date('2024-01-02'),
      teamMember: {
        avatar: 'avatar1.jpg',
        name: 'User One'
      }
    },
    {
      _id: '65f5b5b5b5b5b5b5b5b5b5b2',
      name: 'Dataset 2',
      description: 'Second dataset',
      createTime: new Date('2024-01-03'),
      updateTime: new Date('2024-01-04'),
      teamMember: {
        avatar: 'avatar2.jpg',
        name: 'User Two'
      }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthUserPer.mockResolvedValue({
      teamId: validTeamId,
      tmbId: validTmbId
    });

    mockMongoEvalDatasetCollection.aggregate.mockResolvedValue(mockCollections);
    mockMongoEvalDatasetCollection.countDocuments.mockResolvedValue(2);
  });

  describe('Authentication and Authorization', () => {
    it('should call authUserPer with correct parameters', async () => {
      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockAuthUserPer).toHaveBeenCalledWith({
        req,
        authToken: true,
        authApiKey: true,
        per: ReadPermissionVal
      });
    });

    it('should propagate authentication errors', async () => {
      const authError = new Error('Authentication failed');
      mockAuthUserPer.mockRejectedValue(authError);

      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(authError);
    });
  });

  describe('Pagination', () => {
    it('should handle default pagination parameters', async () => {
      const req = {
        body: { pageSize: 20 }
      };

      const result = await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { teamId: new Types.ObjectId(validTeamId) } },
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
        body: { pageNum: 2, pageSize: 5 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { teamId: new Types.ObjectId(validTeamId) } },
          { $sort: { createTime: -1 } },
          { $skip: 5 },
          { $limit: 5 }
        ])
      );
    });

    it('should handle page number 1', async () => {
      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $skip: 0 }, { $limit: 10 }])
      );
    });
  });

  describe('Search Functionality', () => {
    it('should handle empty search key', async () => {
      const req = {
        body: { searchKey: '', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { teamId: new Types.ObjectId(validTeamId) } }])
      );
    });

    it('should handle whitespace-only search key', async () => {
      const req = {
        body: { searchKey: '   ', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { teamId: new Types.ObjectId(validTeamId) } }])
      );
    });

    it('should handle valid search key', async () => {
      const req = {
        body: { searchKey: 'Dataset 1', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        teamId: new Types.ObjectId(validTeamId),
        name: { $regex: new RegExp('Dataset 1', 'i') }
      };

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetCollection.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });

    it('should trim search key before processing', async () => {
      const req = {
        body: { searchKey: '  Dataset 1  ', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        teamId: new Types.ObjectId(validTeamId),
        name: { $regex: new RegExp('Dataset 1', 'i') }
      };

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );
    });

    it('should escape special regex characters in search key', async () => {
      const req = {
        body: { searchKey: 'Dataset[1]', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        teamId: new Types.ObjectId(validTeamId),
        name: { $regex: new RegExp('Dataset\\[1\\]', 'i') }
      };

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );
    });

    it('should handle non-string search key', async () => {
      const req = {
        body: { searchKey: 123, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { teamId: new Types.ObjectId(validTeamId) } }])
      );
    });
  });

  describe('MongoDB Pipeline', () => {
    it('should build correct aggregation pipeline', async () => {
      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith([
        { $match: { teamId: new Types.ObjectId(validTeamId) } },
        { $sort: { createTime: -1 } },
        { $skip: 0 },
        { $limit: 10 },
        {
          $lookup: {
            from: 'team_members',
            localField: 'tmbId',
            foreignField: '_id',
            as: 'teamMember'
          }
        },
        {
          $addFields: {
            teamMember: { $arrayElemAt: ['$teamMember', 0] }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description: 1,
            createTime: 1,
            updateTime: 1,
            teamMember: {
              avatar: 1,
              name: 1
            }
          }
        }
      ]);
    });

    it('should include search filter in pipeline when searchKey provided', async () => {
      const req = {
        body: { searchKey: 'test', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              teamId: new Types.ObjectId(validTeamId),
              name: { $regex: new RegExp('test', 'i') }
            }
          }
        ])
      );
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure', async () => {
      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result).toEqual({
        total: 2,
        list: [
          {
            _id: '65f5b5b5b5b5b5b5b5b5b5b1',
            name: 'Dataset 1',
            status: 'ready',
            description: 'First dataset',
            createTime: expect.any(Date),
            updateTime: expect.any(Date),
            creatorAvatar: 'avatar1.jpg',
            creatorName: 'User One'
          },
          {
            _id: '65f5b5b5b5b5b5b5b5b5b5b2',
            name: 'Dataset 2',
            status: 'ready',
            description: 'Second dataset',
            createTime: expect.any(Date),
            updateTime: expect.any(Date),
            creatorAvatar: 'avatar2.jpg',
            creatorName: 'User Two'
          }
        ]
      });
    });

    it('should handle collections without teamMember data', async () => {
      const collectionsWithoutTeamMember = [
        {
          _id: '65f5b5b5b5b5b5b5b5b5b5b1',
          name: 'Dataset 1',
          description: 'First dataset',
          createTime: new Date('2024-01-01'),
          updateTime: new Date('2024-01-02'),
          teamMember: null
        }
      ];

      mockMongoEvalDatasetCollection.aggregate.mockResolvedValue(collectionsWithoutTeamMember);
      mockMongoEvalDatasetCollection.countDocuments.mockResolvedValue(1);

      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result.list[0]).toEqual({
        _id: '65f5b5b5b5b5b5b5b5b5b5b1',
        name: 'Dataset 1',
        status: 'ready',
        description: 'First dataset',
        createTime: expect.any(Date),
        updateTime: expect.any(Date),
        creatorAvatar: undefined,
        creatorName: undefined
      });
    });

    it('should handle missing description', async () => {
      const collectionsWithoutDescription = [
        {
          _id: '65f5b5b5b5b5b5b5b5b5b5b1',
          name: 'Dataset 1',
          createTime: new Date('2024-01-01'),
          updateTime: new Date('2024-01-02'),
          teamMember: {
            avatar: 'avatar1.jpg',
            name: 'User One'
          }
        }
      ];

      mockMongoEvalDatasetCollection.aggregate.mockResolvedValue(collectionsWithoutDescription);
      mockMongoEvalDatasetCollection.countDocuments.mockResolvedValue(1);

      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result.list[0].description).toBe('');
    });

    it('should convert ObjectId to string', async () => {
      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      result.list.forEach((item) => {
        expect(typeof item._id).toBe('string');
      });
    });
  });

  describe('Empty Results', () => {
    it('should handle empty collection list', async () => {
      mockMongoEvalDatasetCollection.aggregate.mockResolvedValue([]);
      mockMongoEvalDatasetCollection.countDocuments.mockResolvedValue(0);

      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result).toEqual({
        total: 0,
        list: []
      });
    });

    it('should handle zero total count', async () => {
      mockMongoEvalDatasetCollection.aggregate.mockResolvedValue([]);
      mockMongoEvalDatasetCollection.countDocuments.mockResolvedValue(0);

      const req = {
        body: { searchKey: 'nonexistent', pageNum: 1, pageSize: 10 }
      };

      const result = await handler_test(req as any);

      expect(result.total).toBe(0);
      expect(result.list).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should propagate database aggregate errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetCollection.aggregate.mockRejectedValue(dbError);

      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should propagate database count errors', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetCollection.countDocuments.mockRejectedValue(dbError);

      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });

    it('should handle Promise.all rejection', async () => {
      const dbError = new Error('Database connection failed');
      mockMongoEvalDatasetCollection.aggregate.mockResolvedValue(mockCollections);
      mockMongoEvalDatasetCollection.countDocuments.mockRejectedValue(dbError);

      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await expect(handler_test(req as any)).rejects.toBe(dbError);
    });
  });

  describe('Team Isolation', () => {
    it('should filter results by team ID', async () => {
      const req = {
        body: { pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { teamId: new Types.ObjectId(validTeamId) } }])
      );

      expect(mockMongoEvalDatasetCollection.countDocuments).toHaveBeenCalledWith({
        teamId: new Types.ObjectId(validTeamId)
      });
    });

    it('should include team ID in search filter', async () => {
      const req = {
        body: { searchKey: 'test', pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      const expectedMatch = {
        teamId: new Types.ObjectId(validTeamId),
        name: { $regex: new RegExp('test', 'i') }
      };

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: expectedMatch }])
      );

      expect(mockMongoEvalDatasetCollection.countDocuments).toHaveBeenCalledWith(expectedMatch);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large page size', async () => {
      const req = {
        body: { pageNum: 1, pageSize: 1000 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $limit: 1000 }])
      );
    });

    it('should handle high page number', async () => {
      const req = {
        body: { pageNum: 100, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([{ $skip: 990 }])
      );
    });

    it('should handle complex search patterns', async () => {
      const complexSearchKey = 'Dataset-1_test@2024!';
      const req = {
        body: { searchKey: complexSearchKey, pageNum: 1, pageSize: 10 }
      };

      await handler_test(req as any);

      expect(mockMongoEvalDatasetCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              teamId: new Types.ObjectId(validTeamId),
              name: { $regex: expect.any(RegExp) }
            }
          }
        ])
      );
    });
  });
});
