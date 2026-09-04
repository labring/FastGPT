import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const collectionFindMock = vi.hoisted(() => vi.fn());
const tagFindMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: { find: collectionFindMock }
}));
vi.mock('@fastgpt/service/core/dataset/tag/schemaV2', () => ({
  MongoDatasetCollectionTagsV2: { find: tagFindMock }
}));

import {
  checkValue,
  filterCollectionByKeyValueTags,
  filterCollectionByMetadata
} from '../../../../core/dataset/search/defaultRecall/collectionFilter';

const findResult = (data: unknown[]) => {
  const chain = { hint: () => chain, lean: vi.fn().mockResolvedValue(data) };
  return chain;
};

const mockTagsAndCollections = ({
  tags = [],
  collections = []
}: {
  tags?: any[];
  collections?: any[];
}) => {
  tagFindMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(tags) });
  collectionFindMock.mockReturnValue(findResult(collections));
};

const filterTags = (params: { $and?: any[]; $or?: any[] }) =>
  filterCollectionByKeyValueTags({
    $and: params.$and ?? [],
    $or: params.$or ?? [],
    teamId: 'team-1',
    datasetIds: ['dataset-1']
  });

describe('filterCollectionByKeyValueTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTagsAndCollections({});
  });

  it('returns undefined without conditions', async () => {
    await expect(filterTags({})).resolves.toBeUndefined();
  });

  it.each([
    ['string', '$eq', 'Product A', 'Product A'],
    ['number', '$gte', 2, 2],
    ['datetime', '$lt', 1704153600000, 1704067200000]
  ])('filters %s tag values', async (tagType, op, target, stored) => {
    mockTagsAndCollections({
      tags: [{ _id: 'tag-1', datasetId: 'dataset-1', tag: 'field', tagType }],
      collections: [
        { _id: 'match', tags: [{ tagId: 'tag-1', value: stored }] },
        { _id: 'missing', tags: [] }
      ]
    });

    await expect(filterTags({ $and: [{ field: { [op]: target } }] })).resolves.toEqual(['match']);
  });

  it('requires every AND condition and one OR condition', async () => {
    mockTagsAndCollections({
      tags: [
        { _id: 'product', datasetId: 'dataset-1', tag: 'product', tagType: 'string' },
        { _id: 'version', datasetId: 'dataset-1', tag: 'version', tagType: 'number' },
        { _id: 'category', datasetId: 'dataset-1', tag: 'category', tagType: 'string' }
      ],
      collections: [
        {
          _id: 'match',
          tags: [
            { tagId: 'product', value: 'A' },
            { tagId: 'version', value: 2 },
            { tagId: 'category', value: 'manual' }
          ]
        },
        {
          _id: 'or-miss',
          tags: [
            { tagId: 'product', value: 'A' },
            { tagId: 'version', value: 2 }
          ]
        }
      ]
    });

    await expect(
      filterTags({
        $and: [{ product: { $eq: 'A' } }, { version: { $gte: 2 } }],
        $or: [{ category: { $eq: 'manual' } }]
      })
    ).resolves.toEqual(['match']);
  });

  it('matches empty values only when the collection contains that tag', async () => {
    mockTagsAndCollections({
      tags: [{ _id: 'tag-1', datasetId: 'dataset-1', tag: 'field', tagType: 'string' }],
      collections: [
        { _id: 'empty', tags: [{ tagId: 'tag-1', value: '' }] },
        { _id: 'absent', tags: [] }
      ]
    });

    await expect(filterTags({ $and: [{ field: { $empty: true } }] })).resolves.toEqual(['empty']);
  });

  it('rejects missing tags and treats migration metadata as unrelated to structured filtering', async () => {
    await expect(filterTags({ $and: [{ missing: { $eq: 'A' } }] })).resolves.toEqual([]);

    mockTagsAndCollections({
      tags: [
        {
          _id: 'carrier',
          datasetId: 'dataset-1',
          tag: 'default_tag',
          tagType: 'array',
          fromMigration: true
        }
      ],
      collections: [{ _id: 'legacy', tags: [{ tagId: 'carrier', value: ['A'] }] }]
    });
    await expect(filterTags({ $and: [{ default_tag: { $contains: 'A' } }] })).resolves.toEqual([
      'legacy'
    ]);
  });
});

describe('filterCollectionByMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).feConfigs = { isPlus: true };
    mockTagsAndCollections({
      tags: [{ _id: 'tag-1', datasetId: 'dataset-1', tag: 'field', tagType: 'string' }],
      collections: [{ _id: 'match', tags: [{ tagId: 'tag-1', value: 'A' }] }]
    });
  });
  afterEach(() => {
    (global as any).feConfigs = {};
  });

  it('accepts structured conditions and rejects legacy or malformed configurations', async () => {
    await expect(
      filterCollectionByMetadata({
        teamId: 'team-1',
        datasetIds: ['dataset-1'],
        collectionFilterMatch: JSON.stringify({ tags: { $and: [{ field: { $eq: 'A' } }] } })
      })
    ).resolves.toEqual(['match']);

    for (const value of [
      JSON.stringify({ tags: { $and: ['legacy'] } }),
      JSON.stringify({ tags: { $or: [null] } }),
      'not-json{'
    ]) {
      await expect(
        filterCollectionByMetadata({
          teamId: 'team-1',
          datasetIds: ['dataset-1'],
          collectionFilterMatch: value
        })
      ).rejects.toBeTruthy();
    }
  });
});

describe('checkValue', () => {
  it.each([
    ['$eq', 'Product A', 'Product A', 'string', true],
    ['$contains', 'foo', 'FOOBAR', 'string', true],
    ['$gte', 2, '2', 'number', true],
    ['$lt', 2, 1, 'datetime', true],
    ['$is', ['a', 'b'], ['b', 'a'], 'array', true],
    ['$in', ['a', 'b', 'c'], ['a', 'b'], 'array', true],
    ['$empty', true, undefined, 'array', true],
    ['$unsupported', 'x', 'x', 'string', false]
  ])('compares %s for %s values', (op, target, stored, tagType, expected) => {
    expect(checkValue(op as any, target, stored as any, tagType)).toBe(expected);
  });

  it('rejects invalid value shapes and unsafe regex patterns', () => {
    expect(checkValue('$eq', null, 'x', 'string')).toBe(false);
    expect(checkValue('$eq', 2, Number.NaN, 'number')).toBe(false);
    expect(checkValue('$is', ['a'], 'not-array', 'array')).toBe(false);
    expect(checkValue('$regex', 'foo', 'foobar', 'string')).toBe(true);
    expect(checkValue('$regex', '[invalid', 'foobar', 'string')).toBe(false);
    expect(checkValue('$regex', '(a+)+$', 'aaaaab', 'string')).toBe(false);
    expect(checkValue('$regex', '(a|aa)+$', 'aaaaab', 'string')).toBe(false);
    expect(checkValue('$regex', 'a'.repeat(65), 'aaaaa', 'string')).toBe(false);
    expect(checkValue('$regex', 'a', 'x'.repeat(257), 'string')).toBe(false);
  });
});
