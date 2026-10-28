import { describe, expect, it } from 'vitest';
import {
  DatasetCollectionTagTypeEnum,
  DatasetTagFilterFieldEnum,
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum,
  DatasetTagFilterVersionEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  createEmptyTagFilterValue,
  formatCollectionFilterMatchParam,
  getTagFilterOpsByCondition,
  intersectWorkflowTagOptions,
  isDatasetTagFilterOpen,
  isDatasetTagFilterValue,
  normalizeLegacyDatasetTagFilterValue,
  pruneTagFilterConditions,
  resolveDatasetTagFilterVersion,
  serializeDatasetTagFilterValue
} from '@fastgpt/global/core/dataset/search/tagFilter';
import { hasEffectiveDatasetTagFilter } from '@fastgpt/global/core/dataset/search/tagFilter/normalizer';

describe('dataset tag filter version', () => {
  it('uses structured only when explicitly marked and does not infer from the filter value', () => {
    expect(
      resolveDatasetTagFilterVersion({
        version: DatasetTagFilterVersionEnum.structured,
        filterValue: 'legacy config'
      })
    ).toBe(DatasetTagFilterVersionEnum.structured);
    expect(
      resolveDatasetTagFilterVersion({ version: undefined, filterValue: 'legacy config' })
    ).toBe(DatasetTagFilterVersionEnum.legacy);
    expect(resolveDatasetTagFilterVersion({ version: undefined, filterValue: undefined })).toBe(
      DatasetTagFilterVersionEnum.structured
    );
    expect(resolveDatasetTagFilterVersion({ version: 'invalid', filterValue: undefined })).toBe(
      DatasetTagFilterVersionEnum.legacy
    );
    expect(normalizeLegacyDatasetTagFilterValue('{"tags":{}}')).toBe('{"tags":{}}');
    expect(normalizeLegacyDatasetTagFilterValue(createEmptyTagFilterValue())).toBe('');
  });
});

describe('dataset tag filter options', () => {
  it('keeps supported tags shared by every dataset regardless of migration metadata', () => {
    expect(
      intersectWorkflowTagOptions([
        [
          {
            tag: 'default_tag',
            tagType: DatasetCollectionTagTypeEnum.array,
            options: ['legacy'],
            fromMigration: true
          },
          { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['open'] },
          { tag: 'title', tagType: DatasetCollectionTagTypeEnum.string, options: [] }
        ],
        [
          {
            tag: 'default_tag',
            tagType: DatasetCollectionTagTypeEnum.array,
            options: ['archived'],
            fromMigration: true
          },
          {
            tag: 'status',
            tagType: DatasetCollectionTagTypeEnum.array,
            options: ['closed', 'open']
          },
          { tag: 'only-second', tagType: DatasetCollectionTagTypeEnum.number, options: [] }
        ]
      ])
    ).toEqual([
      {
        tag: 'default_tag',
        tagType: DatasetCollectionTagTypeEnum.array,
        options: ['legacy', 'archived']
      },
      { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['open', 'closed'] }
    ]);
  });

  it('limits file attributes to operations supported by the search payload', () => {
    expect(
      getTagFilterOpsByCondition({ field: DatasetTagFilterFieldEnum.createTime }).map(
        (item) => item.value
      )
    ).toEqual(['$gte', '$lte']);
    expect(
      getTagFilterOpsByCondition({ field: DatasetTagFilterFieldEnum.collectionId }).map(
        (item) => item.value
      )
    ).toEqual(['$in']);
    expect(
      getTagFilterOpsByCondition({ tagType: DatasetCollectionTagTypeEnum.array }).map(
        (item) => item.value
      )
    ).toEqual([
      '$is',
      '$isNot',
      '$contains',
      '$notContains',
      '$in',
      '$notIn',
      '$empty',
      '$notEmpty'
    ]);
  });
});

describe('serializeDatasetTagFilterValue', () => {
  it('serializes tag logic and top-level file constraints while dropping incomplete rows', () => {
    const result = serializeDatasetTagFilterValue({
      logic: DatasetTagFilterLogicEnum.OR,
      conditions: [
        {
          tag: 'status',
          tagType: DatasetCollectionTagTypeEnum.array,
          op: '$in',
          value: ['open']
        },
        {
          tag: 'category',
          tagType: DatasetCollectionTagTypeEnum.array,
          op: '$contains',
          value: ['AI', 'dev']
        },
        {
          field: DatasetTagFilterFieldEnum.createTime,
          op: '$gte',
          value: '2026-03-01T08:00:00'
        },
        {
          field: DatasetTagFilterFieldEnum.collectionId,
          op: '$in',
          value: 'id-1, id-2, id-1'
        },
        { tag: 'incomplete' },
        {
          tag: 'emptyArray',
          tagType: DatasetCollectionTagTypeEnum.array,
          op: '$contains',
          value: []
        }
      ]
    });

    expect(JSON.parse(result ?? '')).toEqual({
      tags: {
        $or: [{ status: { $in: ['open'] } }, { category: { $contains: ['AI', 'dev'] } }]
      },
      createTime: { $gte: expect.any(String) },
      collectionIds: ['id-1', 'id-2']
    });
    expect(serializeDatasetTagFilterValue(createEmptyTagFilterValue())).toBeUndefined();
  });
});

describe('formatCollectionFilterMatchParam', () => {
  it('resolves structured row references and normalizes legacy strings to $fromMigration conditions', () => {
    expect(
      formatCollectionFilterMatchParam({
        value: {
          logic: DatasetTagFilterLogicEnum.AND,
          conditions: [
            {
              tag: 'price',
              tagType: DatasetCollectionTagTypeEnum.number,
              op: '$gte',
              valueMode: DatasetTagFilterValueModeEnum.reference,
              value: ['node', 'price']
            }
          ]
        },
        resolveReference: () => 10
      })
    ).toBe(JSON.stringify({ tags: { $and: [{ price: { $gte: 10 } }] } }));

    // 引用未解析时生成 null 条件以在匹配时拒绝，防止静默丢弃扩大检索范围
    expect(
      formatCollectionFilterMatchParam({
        value: {
          logic: DatasetTagFilterLogicEnum.AND,
          conditions: [
            {
              tag: 'price',
              tagType: DatasetCollectionTagTypeEnum.number,
              op: '$gte',
              valueMode: DatasetTagFilterValueModeEnum.reference,
              value: ['node', 'unresolved']
            }
          ]
        },
        resolveReference: () => undefined
      })
    ).toBe(JSON.stringify({ tags: { $and: [{ price: { $gte: null } }] } }));

    const legacy = '{"tags":{"$and":["legacy"]}}';
    expect(formatCollectionFilterMatchParam({ value: legacy })).toBe(
      JSON.stringify({ tags: { $and: [{ $fromMigration: { $contains: 'legacy' } }] } })
    );
    expect(formatCollectionFilterMatchParam({ value: undefined })).toBeUndefined();
  });

  it('resolves embedded $ref inside search payloads', () => {
    const resolveReference = (ref: unknown) =>
      Array.isArray(ref) && ref[1] === 'price' ? 42 : undefined;

    // JSON 字符串中的 tags $ref 解析，同时保留非 tags 引用
    const payload = JSON.stringify({
      tags: { $and: [{ price: { $gte: ['$ref', 'node', 'price'] } }] },
      collectionIds: [['$ref', 'node', 'price']]
    });
    expect(
      formatCollectionFilterMatchParam({
        value: payload,
        resolveReference: resolveReference as any
      })
    ).toBe(
      JSON.stringify({
        tags: { $and: [{ price: { $gte: 42 } }] },
        collectionIds: [['$ref', 'node', 'price']]
      })
    );

    // 对象形式中的 tags $ref 解析
    expect(
      formatCollectionFilterMatchParam({
        value: { tags: { $or: [{ price: { $lt: ['$ref', 'node', 'price'] } }] } },
        resolveReference: resolveReference as any
      })
    ).toBe(JSON.stringify({ tags: { $or: [{ price: { $lt: 42 } }] } }));

    // 未能解出引用时原样保留原始文本
    const unresolved = '{"tags":{"$and":[{"price":{"$gte":["$ref","node","missing"]}}]}}';
    expect(
      formatCollectionFilterMatchParam({
        value: unresolved,
        resolveReference: () => undefined
      })
    ).toBe(unresolved);
  });
});

describe('pruneTagFilterConditions', () => {
  it('removes unavailable tags but keeps attributes and a usable empty row', () => {
    const result = pruneTagFilterConditions(
      {
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [
          { tag: 'gone', tagType: DatasetCollectionTagTypeEnum.number, op: '$eq', value: 1 },
          { field: DatasetTagFilterFieldEnum.createTime, op: '$gte', value: 1 }
        ]
      },
      []
    );

    expect(result.conditions).toEqual([
      { field: DatasetTagFilterFieldEnum.createTime, op: '$gte', value: 1 }
    ]);
    expect(isDatasetTagFilterValue(result)).toBe(true);
  });

  it('keeps interface-only string rows the page cannot render', () => {
    const stringCondition = {
      tag: 'title',
      tagType: DatasetCollectionTagTypeEnum.string,
      op: '$eq',
      value: 'guide'
    };

    const result = pruneTagFilterConditions(
      {
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [
          stringCondition,
          { tag: 'gone', tagType: DatasetCollectionTagTypeEnum.number, op: '$eq', value: 1 }
        ]
      },
      []
    );

    expect(result.conditions).toEqual([stringCondition]);
  });
});

describe('hasEffectiveDatasetTagFilter', () => {
  it.each([
    undefined,
    null,
    '',
    '   ',
    '{"tags":{"$and":["legacy"]}}',
    {},
    createEmptyTagFilterValue()
  ])('keeps empty or non-structured configuration disabled: %j', (value) => {
    expect(hasEffectiveDatasetTagFilter(value)).toBe(false);
  });

  it.each([
    { condition: { op: '$empty' }, enabled: false },
    { condition: { tag: 'status', op: '$in', value: [] }, enabled: false },
    { condition: { tag: 'status', op: '$empty' }, enabled: true },
    { condition: { tag: 'price', op: '$gte', value: 0 }, enabled: true },
    { condition: { field: 'createTime', op: '$gte', value: Date.UTC(2026, 9, 21) }, enabled: true },
    { condition: { field: 'createTime', op: '$gte', value: 'invalid' }, enabled: false },
    {
      condition: { field: 'collectionId', op: '$in', valueMode: 'input', value: ['id'] },
      enabled: true
    },
    {
      condition: {
        field: 'collectionId',
        op: '$in',
        valueMode: 'reference',
        value: ['node', 'ids']
      },
      enabled: true
    },
    {
      condition: { field: 'collectionId', op: '$in', valueMode: 'reference', value: ['', 'ids'] },
      enabled: false
    },
    {
      condition: { tag: 'status', op: '$in', valueMode: 'reference', value: ['node'] },
      enabled: false
    }
  ])('checks structured conditions: $condition', ({ condition, enabled }) => {
    const filter = { logic: DatasetTagFilterLogicEnum.AND, conditions: [condition] };
    expect(hasEffectiveDatasetTagFilter(filter)).toBe(enabled);
  });

  it('handles open state correctly in serialization and helpers', () => {
    const activeFilter = {
      logic: DatasetTagFilterLogicEnum.AND,
      conditions: [{ tag: 'status', op: '$empty' }]
    };
    expect(serializeDatasetTagFilterValue(activeFilter)).toBeDefined();
    expect(hasEffectiveDatasetTagFilter(activeFilter)).toBe(true);
    expect(isDatasetTagFilterOpen(activeFilter)).toBe(true);

    const closedFilter = {
      ...activeFilter,
      open: false
    };
    expect(serializeDatasetTagFilterValue(closedFilter)).toBeUndefined();
    expect(formatCollectionFilterMatchParam({ value: closedFilter })).toBeUndefined();
    expect(hasEffectiveDatasetTagFilter(closedFilter)).toBe(false);
    expect(isDatasetTagFilterOpen(closedFilter)).toBe(false);

    const explicitOpenFilter = {
      ...activeFilter,
      open: true
    };
    expect(isDatasetTagFilterOpen(explicitOpenFilter)).toBe(true);

    // Empty filter with open: true is open in UI
    const emptyOpenFilter = {
      ...createEmptyTagFilterValue(),
      open: true
    };
    expect(isDatasetTagFilterOpen(emptyOpenFilter)).toBe(true);

    // Variable reference mode array values (empty or selected tuple) are open in UI
    expect(isDatasetTagFilterOpen([])).toBe(true);
    expect(isDatasetTagFilterOpen(['node-1', 'output'])).toBe(true);

    // Empty filter without open is closed by default
    expect(isDatasetTagFilterOpen(createEmptyTagFilterValue())).toBe(false);
    expect(isDatasetTagFilterOpen(undefined)).toBe(false);
  });
});
