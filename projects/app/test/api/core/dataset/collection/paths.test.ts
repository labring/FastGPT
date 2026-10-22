import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDatasetCollectionPaths } from '@fastgpt/service/core/dataset/collection/paths';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    findOne: vi.fn()
  },
  DatasetColCollectionName: 'dataset_collections'
}));

describe('getDatasetCollectionPaths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array for empty parentId', async () => {
    const result = await getDatasetCollectionPaths({});
    expect(result).toEqual([]);
  });

  it('should return empty array if collection not found', async () => {
    vi.mocked(MongoDatasetCollection.findOne).mockResolvedValueOnce(null);

    const result = await getDatasetCollectionPaths({ parentId: 'nonexistent-id' });
    expect(result).toEqual([]);
  });

  it('should return single path for collection without parent', async () => {
    vi.mocked(MongoDatasetCollection.findOne).mockResolvedValueOnce({
      _id: 'col1',
      name: 'Collection 1',
      parentId: ''
    });

    const result = await getDatasetCollectionPaths({ parentId: 'col1' });
    expect(result).toEqual([{ parentId: 'col1', parentName: 'Collection 1' }]);
  });

  it('should return full path for nested collections', async () => {
    vi.mocked(MongoDatasetCollection.findOne)
      .mockResolvedValueOnce({
        _id: 'col3',
        name: 'Collection 3',
        parentId: 'col2'
      })
      .mockResolvedValueOnce({
        _id: 'col2',
        name: 'Collection 2',
        parentId: 'col1'
      })
      .mockResolvedValueOnce({
        _id: 'col1',
        name: 'Collection 1',
        parentId: ''
      });

    const result = await getDatasetCollectionPaths({ parentId: 'col3' });

    expect(result).toEqual([
      { parentId: 'col1', parentName: 'Collection 1' },
      { parentId: 'col2', parentName: 'Collection 2' },
      { parentId: 'col3', parentName: 'Collection 3' }
    ]);
  });

  it('should stop at the first repeated ancestor when data forms a cycle', async () => {
    // 互指的脏数据：持续返回同一组文档，没有环检测时会无限查询下去。
    // 这里在超出预期次数后直接抛错，让回归以失败而不是挂住的形式暴露。
    const docs: Record<string, { _id: string; name: string; parentId: string }> = {
      col1: { _id: 'col1', name: 'Collection 1', parentId: 'col2' },
      col2: { _id: 'col2', name: 'Collection 2', parentId: 'col1' }
    };
    let callCount = 0;
    vi.mocked(MongoDatasetCollection.findOne).mockImplementation((async (filter: {
      _id: string;
    }) => {
      callCount += 1;
      if (callCount > 5) throw new Error('cycle not detected');
      return docs[String(filter._id)] ?? null;
    }) as never);

    const result = await getDatasetCollectionPaths({ parentId: 'col1' });

    expect(callCount).toBe(2);
    expect(result).toEqual([
      { parentId: 'col2', parentName: 'Collection 2' },
      { parentId: 'col1', parentName: 'Collection 1' }
    ]);
  });
});
