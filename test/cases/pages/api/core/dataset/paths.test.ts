import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getParents } from '@/pages/api/core/dataset/paths';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    findById: vi.fn()
  },
  DatasetCollectionName: 'datasets'
}));

describe('getParents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array if parentId is undefined', async () => {
    const result = await getParents(undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array if parent not found', async () => {
    vi.mocked(MongoDataset.findById).mockResolvedValueOnce(null);

    const result = await getParents('non-existent-id');
    expect(result).toEqual([]);
  });

  it('should return single parent path if no further parents', async () => {
    vi.mocked(MongoDataset.findById).mockResolvedValueOnce({
      name: 'Parent1',
      parentId: undefined
    });

    const result = await getParents('parent1-id');

    expect(result).toEqual([{ parentId: 'parent1-id', parentName: 'Parent1' }]);
  });

  it('should return full parent path for nested parents', async () => {
    vi.mocked(MongoDataset.findById)
      .mockResolvedValueOnce({
        name: 'Child',
        parentId: 'parent1-id'
      })
      .mockResolvedValueOnce({
        name: 'Parent1',
        parentId: 'parent2-id'
      })
      .mockResolvedValueOnce({
        name: 'Parent2',
        parentId: undefined
      });

    const result = await getParents('child-id');

    expect(result).toEqual([
      { parentId: 'parent2-id', parentName: 'Parent2' },
      { parentId: 'parent1-id', parentName: 'Parent1' },
      { parentId: 'child-id', parentName: 'Child' }
    ]);
  });

  it('should handle circular references gracefully', async () => {
    vi.mocked(MongoDataset.findById)
      .mockResolvedValueOnce({
        name: 'Node1',
        parentId: 'node2-id'
      })
      .mockResolvedValueOnce({
        name: 'Node2',
        parentId: 'node1-id' // Circular reference
      });

    const result = await getParents('node1-id');

    expect(result).toEqual([
      { parentId: 'node2-id', parentName: 'Node2' },
      { parentId: 'node1-id', parentName: 'Node1' }
    ]);
  });
});
