import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMongoDatasetCollectionFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionTagsFind = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    find: mockMongoDatasetCollectionFind
  }
}));

vi.mock('@fastgpt/service/core/dataset/tag/schemaV2', () => ({
  MongoDatasetCollectionTagsV2: {
    find: mockMongoDatasetCollectionTagsFind
  }
}));

import {
  checkValue,
  filterCollectionByKeyValueTags,
  filterCollectionByMetadata
} from '../../../../core/dataset/search/defaultRecall/collectionFilter';

/**
 * mock MongoDatasetCollection.find 的链式返回：同时支持 `.hint(...).lean()` 与 `.lean()`
 * （filterCollectionByKeyValueTags 用 hint 强制走 tags.tagId 索引）
 */
const mockFind = (data: unknown[]) => {
  const chain = {
    hint: () => chain,
    lean: vi.fn().mockResolvedValue(data)
  };
  return chain;
};

describe('filterCollectionByKeyValueTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(mockFind([]));
  });

  it('returns undefined when no conditions provided', async () => {
    const result = await filterCollectionByKeyValueTags({
      $and: [],
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });
    expect(result).toBeUndefined();
  });

  it('filters string tags by $eq', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([{ _id: 'tag-1', datasetId: 'ds-1', tag: 'product', tagType: 'string' }])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(
      mockFind([
        {
          _id: 'col-1',
          tags: [{ tagId: 'tag-1', value: 'Product A' }]
        },
        {
          _id: 'col-2',
          tags: [{ tagId: 'tag-1', value: 'Product B' }]
        }
      ])
    );

    const result = await filterCollectionByKeyValueTags({
      $and: [{ product: { $eq: 'Product A' } }],
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });

    expect(result).toEqual(['col-1']);
  });

  it('filters number tags by $gte', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([{ _id: 'tag-1', datasetId: 'ds-1', tag: 'version', tagType: 'number' }])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(
      mockFind([
        { _id: 'col-1', tags: [{ tagId: 'tag-1', value: 2 }] },
        { _id: 'col-2', tags: [{ tagId: 'tag-1', value: 1 }] }
      ])
    );

    const result = await filterCollectionByKeyValueTags({
      $and: [{ version: { $gte: 2 } }],
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });

    expect(result).toEqual(['col-1']);
  });

  it('filters datetime tags by $lt', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([{ _id: 'tag-1', datasetId: 'ds-1', tag: 'date', tagType: 'datetime' }])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(
      mockFind([
        { _id: 'col-1', tags: [{ tagId: 'tag-1', value: 1704067200000 }] },
        { _id: 'col-2', tags: [{ tagId: 'tag-1', value: 1704153600000 }] }
      ])
    );

    const result = await filterCollectionByKeyValueTags({
      $and: [{ date: { $lt: 1704153600000 } }],
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });

    expect(result).toEqual(['col-1']);
  });

  it('handles AND + OR combination', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'tag-a', datasetId: 'ds-1', tag: 'product', tagType: 'string' },
        { _id: 'tag-b', datasetId: 'ds-1', tag: 'version', tagType: 'number' },
        { _id: 'tag-c', datasetId: 'ds-1', tag: 'category', tagType: 'string' }
      ])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(
      mockFind([
        {
          _id: 'col-1',
          tags: [
            { tagId: 'tag-a', value: 'Product A' },
            { tagId: 'tag-b', value: 2 },
            { tagId: 'tag-c', value: 'warranty' }
          ]
        },
        {
          _id: 'col-2',
          tags: [
            { tagId: 'tag-a', value: 'Product A' },
            { tagId: 'tag-b', value: 2 },
            { tagId: 'tag-c', value: 'manual' }
          ]
        },
        {
          _id: 'col-3',
          tags: [
            { tagId: 'tag-a', value: 'Product A' },
            { tagId: 'tag-b', value: 1 }
          ]
        }
      ])
    );

    const result = await filterCollectionByKeyValueTags({
      $and: [{ product: { $eq: 'Product A' } }, { version: { $gte: 2 } }],
      $or: [{ category: { $eq: 'warranty' } }],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });

    expect(result).toEqual(['col-1']);
  });

  it('returns empty array when AND tag does not exist', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });

    const result = await filterCollectionByKeyValueTags({
      $and: [{ product: { $eq: 'Product A' } }],
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });

    expect(result).toEqual([]);
  });

  it('fails when OR tag does not exist', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([{ _id: 'tag-1', datasetId: 'ds-1', tag: 'product', tagType: 'string' }])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(
      mockFind([{ _id: 'col-1', tags: [{ tagId: 'tag-1', value: 'A' }] }])
    );

    const result = await filterCollectionByKeyValueTags({
      $and: [{ product: { $eq: 'A' } }],
      $or: [{ missing: { $eq: 'x' } }],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });

    // 该 OR 条件标签不存在 → 条件匹配失败，OR 不通过
    expect(result).toEqual([]);
  });

  it('$empty/$notEmpty only match existing tag entries', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([{ _id: 'tag-1', datasetId: 'ds-1', tag: 'product', tagType: 'string' }])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(
      mockFind([
        { _id: 'col-1', tags: [{ tagId: 'tag-1', value: 'A' }] },
        { _id: 'col-2', tags: ['old-string-tag'] },
        { _id: 'col-3', tags: [{ tagId: 'tag-1', value: '' }] }
      ])
    );

    const emptyResult = await filterCollectionByKeyValueTags({
      $and: [{ product: { $empty: true } }],
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });
    // 仅「存在标签条目且值为空」的 col-3 命中；无标签条目的 col-2 不命中
    expect(emptyResult).toEqual(['col-3']);

    const notEmptyResult = await filterCollectionByKeyValueTags({
      $and: [{ product: { $notEmpty: true } }],
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });
    expect(notEmptyResult).toEqual(['col-1']);
  });
});

describe('filterCollectionByMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).feConfigs = { isPlus: true };
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(mockFind([]));
  });

  afterEach(() => {
    (global as any).feConfigs = {};
  });

  it('routes new format to filterCollectionByKeyValueTags', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([{ _id: 'tag-1', datasetId: 'ds-1', tag: 'product', tagType: 'string' }])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(
      mockFind([{ _id: 'col-1', tags: [{ tagId: 'tag-1', value: 'Product A' }] }])
    );

    const result = await filterCollectionByMetadata({
      teamId: 'team-1',
      datasetIds: ['ds-1'],
      collectionFilterMatch: JSON.stringify({
        tags: {
          $and: [{ product: { $eq: 'Product A' } }]
        }
      })
    });

    expect(result).toEqual(['col-1']);
  });

  it('rewrites old format to default_tag conditions', async () => {
    mockMongoDatasetCollectionTagsFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { _id: 'default-tag-1', datasetId: 'ds-1', tag: 'default_tag', tagType: 'array' }
        ])
    });
    mockMongoDatasetCollectionFind.mockReturnValue(
      mockFind([{ _id: 'col-1', tags: [{ tagId: 'default-tag-1', value: ['Tag1'] }] }])
    );

    const result = await filterCollectionByMetadata({
      teamId: 'team-1',
      datasetIds: ['ds-1'],
      collectionFilterMatch: JSON.stringify({ tags: { $and: ['Tag1'] } })
    });

    expect(result).toEqual(['col-1']);
  });

  it('returns undefined when collectionFilterMatch is invalid JSON', async () => {
    const result = await filterCollectionByMetadata({
      teamId: 'team-1',
      datasetIds: ['ds-1'],
      collectionFilterMatch: 'not-json{ broken'
    });

    expect(result).toBeUndefined();
  });
});

describe('checkValue', () => {
  describe('string type', () => {
    it('$eq is case-sensitive', () => {
      expect(checkValue('$eq', 'Product A', 'product a', 'string')).toBe(false);
      expect(checkValue('$eq', 'Product A', 'Product A', 'string')).toBe(true);
    });

    it('$ne is case-sensitive', () => {
      expect(checkValue('$ne', 'Product A', 'product a', 'string')).toBe(true);
      expect(checkValue('$ne', 'Product A', 'Product B', 'string')).toBe(true);
      expect(checkValue('$ne', 'Product A', 'Product A', 'string')).toBe(false);
    });

    it('$contains checks substring ignoring case', () => {
      expect(checkValue('$contains', 'Foo', 'foobar', 'string')).toBe(true);
      expect(checkValue('$contains', 'xyz', 'foobar', 'string')).toBe(false);
    });

    it('$notContains negates substring check', () => {
      expect(checkValue('$notContains', 'xyz', 'foobar', 'string')).toBe(true);
      expect(checkValue('$notContains', 'Foo', 'foobar', 'string')).toBe(false);
    });

    it('$startsWith ignores case', () => {
      expect(checkValue('$startsWith', 'foo', 'FOOBAR', 'string')).toBe(true);
      expect(checkValue('$startsWith', 'bar', 'foobar', 'string')).toBe(false);
    });

    it('$endsWith ignores case', () => {
      expect(checkValue('$endsWith', 'bar', 'FOOBAR', 'string')).toBe(true);
      expect(checkValue('$endsWith', 'foo', 'foobar', 'string')).toBe(false);
    });

    it('$regex matches valid patterns', () => {
      expect(checkValue('$regex', '^foo', 'foobar', 'string')).toBe(true);
      expect(checkValue('$regex', '^bar', 'foobar', 'string')).toBe(false);
    });

    it('$regex returns false for invalid patterns', () => {
      expect(checkValue('$regex', '[invalid', 'foobar', 'string')).toBe(false);
    });

    it('returns false when stored value is null/undefined/empty', () => {
      expect(checkValue('$eq', 'x', null, 'string')).toBe(false);
      expect(checkValue('$contains', 'x', undefined, 'string')).toBe(false);
      expect(checkValue('$startsWith', 'x', '', 'string')).toBe(false);
    });
  });

  describe('number type', () => {
    it('compares with $eq/$ne/$gt/$lt/$gte/$lte', () => {
      expect(checkValue('$eq', 2, 2, 'number')).toBe(true);
      expect(checkValue('$ne', 2, 3, 'number')).toBe(true);
      expect(checkValue('$gt', 1, 2, 'number')).toBe(true);
      expect(checkValue('$lt', 3, 2, 'number')).toBe(true);
      expect(checkValue('$gte', 2, 2, 'number')).toBe(true);
      expect(checkValue('$lte', 2, 2, 'number')).toBe(true);
    });

    it('returns false for NaN stored or target', () => {
      expect(checkValue('$eq', 2, NaN, 'number')).toBe(false);
      expect(checkValue('$eq', NaN, 2, 'number')).toBe(false);
    });

    it('coerces string numbers', () => {
      expect(checkValue('$eq', '2', 2, 'number')).toBe(true);
      expect(checkValue('$eq', 2, '2', 'number')).toBe(true);
    });
  });

  describe('datetime type', () => {
    it('compares unix millisecond timestamps', () => {
      expect(checkValue('$eq', 1704067200000, 1704067200000, 'datetime')).toBe(true);
      expect(checkValue('$gt', 1704067200000, 1704153600000, 'datetime')).toBe(true);
      expect(checkValue('$lt', 1704153600000, 1704067200000, 'datetime')).toBe(true);
    });

    it('returns false for NaN stored or target', () => {
      expect(checkValue('$eq', 1704067200000, NaN, 'datetime')).toBe(false);
      expect(checkValue('$eq', NaN, 1704067200000, 'datetime')).toBe(false);
    });
  });

  describe('empty operators', () => {
    it('$empty treats null/undefined/empty string as empty', () => {
      expect(checkValue('$empty', true, null, 'string')).toBe(true);
      expect(checkValue('$empty', true, undefined, 'string')).toBe(true);
      expect(checkValue('$empty', true, '', 'string')).toBe(true);
      expect(checkValue('$empty', true, 'x', 'string')).toBe(false);
      expect(checkValue('$empty', true, 0, 'number')).toBe(false);
    });

    it('$notEmpty reverses empty logic', () => {
      expect(checkValue('$notEmpty', true, 'x', 'string')).toBe(true);
      expect(checkValue('$notEmpty', true, null, 'string')).toBe(false);
      expect(checkValue('$notEmpty', true, undefined, 'string')).toBe(false);
      expect(checkValue('$notEmpty', true, '', 'string')).toBe(false);
    });
  });

  it('returns false for unsupported operator or null target', () => {
    expect(checkValue('$unsupported' as any, 'x', 'x', 'string')).toBe(false);
    expect(checkValue('$eq', null, 'x', 'string')).toBe(false);
  });
});
