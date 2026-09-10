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

  it('matches absent tags on $empty and excludes them on $notEmpty', async () => {
    mockTagsAndCollections({
      tags: [{ _id: 'tag-1', datasetId: 'dataset-1', tag: 'field', tagType: 'string' }],
      collections: [
        { _id: 'empty', tags: [{ tagId: 'tag-1', value: '' }] },
        { _id: 'absent', tags: [] },
        { _id: 'filled', tags: [{ tagId: 'tag-1', value: 'hello' }] }
      ]
    });

    await expect(filterTags({ $and: [{ field: { $empty: true } }] })).resolves.toEqual([
      'empty',
      'absent'
    ]);
    await expect(filterTags({ $and: [{ field: { $notEmpty: true } }] })).resolves.toEqual([
      'filled'
    ]);
  });

  it('matches absent tags on negative operators: array $isNot, number $ne, datetime $ne', async () => {
    const timeTarget = '2026-09-11 12:00:00';
    const timeMatch = new Date(timeTarget).getTime();
    const timeDiff = timeMatch + 1000;

    mockTagsAndCollections({
      tags: [
        { _id: 'tag-arr', datasetId: 'dataset-1', tag: 'multi', tagType: 'array' },
        { _id: 'tag-num', datasetId: 'dataset-1', tag: 'count', tagType: 'number' },
        { _id: 'tag-time', datasetId: 'dataset-1', tag: 'date', tagType: 'datetime' }
      ],
      collections: [
        {
          _id: 'col-target',
          tags: [
            { tagId: 'tag-arr', value: ['A'] },
            { tagId: 'tag-num', value: 10 },
            { tagId: 'tag-time', value: timeMatch }
          ]
        },
        {
          _id: 'col-diff',
          tags: [
            { tagId: 'tag-arr', value: ['B'] },
            { tagId: 'tag-num', value: 20 },
            { tagId: 'tag-time', value: timeDiff }
          ]
        },
        { _id: 'col-absent', tags: [] }
      ]
    });

    // 多选 $isNot：未打标集合与打标但值不同的集合均应命中
    await expect(filterTags({ $and: [{ multi: { $isNot: ['A'] } }] })).resolves.toEqual([
      'col-diff',
      'col-absent'
    ]);

    // 数字 $ne：未打标集合与打标但值不同的集合均应命中
    await expect(filterTags({ $and: [{ count: { $ne: 10 } }] })).resolves.toEqual([
      'col-diff',
      'col-absent'
    ]);

    // 时间 $ne：未打标集合与打标但时间不同的集合均应命中
    await expect(filterTags({ $and: [{ date: { $ne: timeTarget } }] })).resolves.toEqual([
      'col-diff',
      'col-absent'
    ]);
  });

  it('only prefilters positive tags in MongoDB query and retains absent collections for negative condition', async () => {
    mockTagsAndCollections({
      tags: [
        { _id: 'cat-id', datasetId: 'dataset-1', tag: 'category', tagType: 'string' },
        { _id: 'status-id', datasetId: 'dataset-1', tag: 'status', tagType: 'string' }
      ],
      collections: [
        {
          _id: 'c1',
          tags: [
            { tagId: 'cat-id', value: 'tech' },
            { tagId: 'status-id', value: 'active' }
          ]
        },
        {
          _id: 'c2',
          tags: [{ tagId: 'cat-id', value: 'tech' }] // 未配置 status 标签
        },
        {
          _id: 'c3',
          tags: [
            { tagId: 'cat-id', value: 'tech' },
            { tagId: 'status-id', value: 'abandon' }
          ]
        }
      ]
    });

    const res = await filterTags({
      $and: [{ category: { $eq: 'tech' } }, { status: { $ne: 'abandon' } }]
    });
    expect(res).toEqual(['c1', 'c2']);

    // 验证 MongoDB find 仅按肯定条件的 tagId 粗筛，没有强制 status-id
    expect(collectionFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        'tags.tagId': { $all: ['cat-id'] }
      }),
      expect.any(String),
      expect.any(Object)
    );
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
    ['$eq', '2026-09-11 11:35:00', new Date('2026-09-11 11:35:00').getTime(), 'datetime', true],
    ['$gt', '2026-09-11 11:35:00', new Date('2026-09-11 11:36:00').getTime(), 'datetime', true],
    ['$lt', '2026-09-11 11:35:00', new Date('2026-09-11 11:34:00').getTime(), 'datetime', true],
    [
      '$eq',
      '2026-09-11T11:35:00.000Z',
      new Date('2026-09-11T11:35:00.000Z').getTime(),
      'datetime',
      true
    ],
    ['$is', ['a', 'b'], ['b', 'a'], 'array', true],
    ['$in', ['a', 'b', 'c'], ['a', 'b'], 'array', true],
    ['$contains', 'a', ['a', 'b'], 'array', true],
    ['$contains', 'c', ['a', 'b'], 'array', false],
    ['$contains', ['a', 'b'], ['a', 'b', 'c'], 'array', true],
    ['$contains', ['a', 'c'], ['a', 'b'], 'array', false],
    ['$contains', [], ['a', 'b'], 'array', false],
    ['$notContains', 'c', ['a', 'b'], 'array', true],
    ['$notContains', 'a', ['a', 'b'], 'array', false],
    ['$notContains', ['c', 'd'], ['a', 'b'], 'array', true],
    ['$notContains', ['b', 'c'], ['a', 'b'], 'array', false],
    ['$notContains', [], ['a', 'b'], 'array', false],
    ['$empty', true, undefined, 'array', true],
    ['$unsupported', 'x', 'x', 'string', false]
  ])('compares %s for %s values', (op, target, stored, tagType, expected) => {
    expect(checkValue(op as any, target, stored as any, tagType)).toBe(expected);
  });

  it('rejects invalid value shapes and unsafe regex patterns', () => {
    expect(checkValue('$eq', null, 'x', 'string')).toBe(false);
    expect(checkValue('$eq', 2, Number.NaN, 'number')).toBe(false);
    expect(checkValue('$eq', 'not-a-date', 1789097700000, 'datetime')).toBe(false);
    expect(checkValue('$is', ['a'], 'not-array', 'array')).toBe(false);
    expect(checkValue('$regex', 'foo', 'foobar', 'string')).toBe(true);
    expect(checkValue('$regex', '[invalid', 'foobar', 'string')).toBe(false);
    expect(checkValue('$regex', '(a+)+$', 'aaaaab', 'string')).toBe(false);
    expect(checkValue('$regex', '(a|aa)+$', 'aaaaab', 'string')).toBe(false);
    expect(checkValue('$regex', 'a'.repeat(65), 'aaaaa', 'string')).toBe(false);
    expect(checkValue('$regex', 'a', 'x'.repeat(257), 'string')).toBe(false);
  });
});
