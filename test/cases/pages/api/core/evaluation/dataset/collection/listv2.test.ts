import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler_test } from '@/pages/api/core/evaluation/dataset/collection/listv2';
import { buildEvalDatasetCollectionFilter } from '@fastgpt/service/core/evaluation/dataset/utils';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { Types } from '@fastgpt/service/common/mongo';

vi.mock('@fastgpt/service/core/evaluation/dataset/utils');
vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  EvalDatasetCollectionName: 'eval_dataset_collections',
  MongoEvalDatasetCollection: {
    aggregate: vi.fn(),
    countDocuments: vi.fn()
  }
}));

describe('EvalDatasetCollection ListV2 API', () => {
  const mockReq = {
    body: {
      pageSize: 10,
      pageNum: 1
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should return collection list with minimal data', async () => {
      if (!handler_test) {
        throw new Error('handler_test is not available');
      }

      // Mock the filter function
      vi.mocked(buildEvalDatasetCollectionFilter).mockResolvedValue({
        finalFilter: { teamId: new Types.ObjectId() },
        teamId: 'test-team-id',
        tmbId: 'test-tmb-id',
        isOwner: false,
        myRoles: [],
        accessibleIds: []
      });

      // Mock database responses
      const mockCollections = [
        {
          _id: new Types.ObjectId(),
          name: 'Test Collection',
          createTime: new Date()
        }
      ];

      vi.mocked(MongoEvalDatasetCollection.aggregate).mockResolvedValue(mockCollections);
      vi.mocked(MongoEvalDatasetCollection.countDocuments).mockResolvedValue(1);

      const result = await handler_test(mockReq as any);

      expect(result).toHaveProperty('list');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.list)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.total).toBe(1);

      // Check that each item has only the minimal fields
      if (result.list.length > 0) {
        const firstItem = result.list[0];
        expect(firstItem).toHaveProperty('_id');
        expect(firstItem).toHaveProperty('name');
        expect(firstItem).toHaveProperty('createTime');

        // Ensure it only has the 3 expected fields
        expect(Object.keys(firstItem)).toEqual(['_id', 'name', 'createTime']);
      }
    });

    it('should work without pagination parameters', async () => {
      if (!handler_test) {
        throw new Error('handler_test is not available');
      }

      const reqWithoutPagination = {
        body: {
          searchKey: ''
        }
      };

      // Mock the filter function
      vi.mocked(buildEvalDatasetCollectionFilter).mockResolvedValue({
        finalFilter: { teamId: new Types.ObjectId() },
        teamId: 'test-team-id',
        tmbId: 'test-tmb-id',
        isOwner: false,
        myRoles: [],
        accessibleIds: []
      });

      const mockCollections = [];
      vi.mocked(MongoEvalDatasetCollection.aggregate).mockResolvedValue(mockCollections);
      vi.mocked(MongoEvalDatasetCollection.countDocuments).mockResolvedValue(0);

      const result = await handler_test(reqWithoutPagination as any);

      expect(result).toHaveProperty('list');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.list)).toBe(true);
      expect(typeof result.total).toBe('number');
    });
  });
});
