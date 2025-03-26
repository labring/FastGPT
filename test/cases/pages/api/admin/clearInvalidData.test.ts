import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkInvalidImg, deleteImageAmount } from '@/pages/api/admin/clearInvalidData';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

// Mock the required exports
vi.mock('@fastgpt/service/common/file/image/schema', () => ({
  MongoImage: {
    find: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    findOne: vi.fn().mockReturnValue({
      lean: () => Promise.resolve(null)
    })
  },
  DatasetColCollectionName: 'dataset_collections'
}));

describe('checkInvalidImg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete invalid images without corresponding collections', async () => {
    const mockImages = [
      {
        _id: '1',
        teamId: 'team1',
        metadata: {
          relatedId: 'related1'
        },
        deleteOne: vi.fn()
      },
      {
        _id: '2',
        teamId: 'team2',
        metadata: {
          relatedId: 'related2'
        },
        deleteOne: vi.fn()
      }
    ];

    vi.mocked(MongoImage.find).mockResolvedValue(mockImages as any);

    vi.mocked(MongoDatasetCollection.findOne).mockImplementation((query) => ({
      lean: () => {
        if (query.teamId === 'team1') {
          return Promise.resolve(null);
        }
        return Promise.resolve({ _id: 'collection1' });
      }
    }));

    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-02');

    await checkInvalidImg(startDate, endDate);

    expect(MongoImage.find).toHaveBeenCalledWith(
      {
        createTime: {
          $gte: startDate,
          $lte: endDate
        },
        'metadata.relatedId': { $exists: true }
      },
      '_id teamId metadata'
    );

    expect(mockImages[0].deleteOne).toHaveBeenCalled();
    expect(mockImages[1].deleteOne).not.toHaveBeenCalled();
  });

  it('should handle empty image list', async () => {
    vi.mocked(MongoImage.find).mockResolvedValue([]);

    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-02');

    await checkInvalidImg(startDate, endDate);

    expect(MongoImage.find).toHaveBeenCalled();
    expect(MongoDatasetCollection.findOne).not.toHaveBeenCalled();
  });

  it('should handle errors when processing images', async () => {
    const mockImages = [
      {
        _id: '1',
        teamId: 'team1',
        metadata: {
          relatedId: 'related1'
        },
        deleteOne: vi.fn().mockRejectedValue(new Error('Delete failed'))
      }
    ];

    vi.mocked(MongoImage.find).mockResolvedValue(mockImages as any);
    vi.mocked(MongoDatasetCollection.findOne).mockImplementation(() => ({
      lean: () => Promise.resolve(null)
    }));

    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-02');

    await expect(checkInvalidImg(startDate, endDate)).resolves.not.toThrow();
  });

  it('should handle images without metadata', async () => {
    const mockImages = [
      {
        _id: '1',
        teamId: 'team1',
        metadata: undefined,
        deleteOne: vi.fn()
      }
    ];

    vi.mocked(MongoImage.find).mockResolvedValue(mockImages as any);
    vi.mocked(MongoDatasetCollection.findOne).mockImplementation(() => ({
      lean: () => Promise.resolve(null)
    }));

    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-02');

    await checkInvalidImg(startDate, endDate);

    expect(MongoDatasetCollection.findOne).toHaveBeenCalled();
  });
});
