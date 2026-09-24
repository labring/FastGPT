import { describe, expect, it } from 'vitest';
import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  createEmptyTagFilterValue,
  DatasetTagFilterFieldEnum,
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum,
  DatasetTagFilterVersionEnum,
  formatCollectionFilterMatchParam,
  getTagFilterOpsByCondition,
  intersectWorkflowTagOptions,
  isDatasetTagFilterValue,
  normalizeLegacyDatasetTagFilterValue,
  pruneTagFilterConditions,
  resolveDatasetTagFilterVersion,
  serializeDatasetTagFilterValue,
  type DatasetTagFilterValue
} from '@fastgpt/global/core/dataset/workflowTagFilter';

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
    expect(
      getTagFilterOpsByCondition({ tagType: DatasetCollectionTagTypeEnum.string }).map(
        (item) => item.value
      )
    ).toEqual([
      '$eq',
      '$ne',
      '$contains',
      '$notContains',
      '$startsWith',
      '$endsWith',
      '$regex',
      '$empty',
      '$notEmpty'
    ]);
  });

  it('accepts interface-only string conditions without offering them as options', () => {
    const value: DatasetTagFilterValue = {
      logic: DatasetTagFilterLogicEnum.AND,
      conditions: [
        {
          tag: 'title',
          tagType: DatasetCollectionTagTypeEnum.string,
          op: '$contains',
          value: 'guide'
        }
      ]
    };

    expect(isDatasetTagFilterValue(value)).toBe(true);
    expect(serializeDatasetTagFilterValue(value)).toBe(
      JSON.stringify({ tags: { $and: [{ title: { $contains: 'guide' } }] } })
    );

    expect(
      intersectWorkflowTagOptions([
        [{ tag: 'title', tagType: DatasetCollectionTagTypeEnum.string, options: [] }],
        [{ tag: 'title', tagType: DatasetCollectionTagTypeEnum.string, options: [] }]
      ])
    ).toEqual([]);
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
  it('resolves structured row references and preserves legacy strings without converting them', () => {
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

    const legacy = '{"tags":{"$and":["legacy"]}}';
    expect(formatCollectionFilterMatchParam({ value: legacy })).toBe(legacy);
    expect(formatCollectionFilterMatchParam({ value: undefined })).toBeUndefined();
  });

  it('resolves embedded $ref inside JSON strings', () => {
    const resolveReference = (ref: unknown) => (ref[1] === 'price' ? 42 : undefined);

    expect(
      formatCollectionFilterMatchParam({
        value: '{"tags":{"$and":[{"price":{"$gte":["$ref","node","price"]}}]}}',
        resolveReference
      })
    ).toBe(JSON.stringify({ tags: { $and: [{ price: { $gte: 42 } }] } }));

    // 无 resolveReference / 解不出值时原样保留
    const unresolved = '{"tags":{"$and":[{"price":{"$gte":["$ref","node","price"]}}]}}';
    expect(formatCollectionFilterMatchParam({ value: unresolved })).toBe(unresolved);
    expect(
      formatCollectionFilterMatchParam({ value: unresolved, resolveReference: () => undefined })
    ).toBe(unresolved);

    // 未解出的引用不能触发重新序列化，需保留调用方原始 JSON 文本
    const formattedUnresolved = `{
  "tags": { "${'$'}and": [{ "price": { "${'$'}gte": ["${'$'}ref", "node", "missing"] } }] }
}`;
    expect(
      formatCollectionFilterMatchParam({
        value: formattedUnresolved,
        resolveReference: () => undefined
      })
    ).toBe(formattedUnresolved);

    // 普通数组值不受影响
    const plain = '{"tags":{"$and":[{"category":{"$in":["a","b"]}}]}}';
    expect(formatCollectionFilterMatchParam({ value: plain, resolveReference })).toBe(plain);

    expect(
      formatCollectionFilterMatchParam({
        value: { tags: { $and: [{ price: { $gte: ['$ref', 'node', 'price'] } }] } },
        resolveReference
      })
    ).toBe(JSON.stringify({ tags: { $and: [{ price: { $gte: 42 } }] } }));

    // 历史非对象条件项原样保留，同时继续解析同数组中的合法条件
    expect(
      formatCollectionFilterMatchParam({
        value: { tags: { $and: ['legacy', { price: { $gte: ['$ref', 'node', 'price'] } }] } },
        resolveReference
      })
    ).toBe(JSON.stringify({ tags: { $and: ['legacy', { price: { $gte: 42 } }] } }));
  });

  it('only resolves $ref on tags conditions and passes every other value through', () => {
    const resolveReference = (ref: unknown) => (ref[1] === 'price' ? 42 : undefined);

    // $ref 只在 tags 条件值上解，其它位置不再全树递归
    const outsideTags = '{"collectionIds":[["$ref","node","price"]]}';
    expect(formatCollectionFilterMatchParam({ value: outsideTags, resolveReference })).toBe(
      outsideTags
    );

    // $or 与 $and 同等处理
    expect(
      formatCollectionFilterMatchParam({
        value: '{"tags":{"$or":[{"price":{"$lt":["$ref","node","price"]}}]}}',
        resolveReference
      })
    ).toBe(JSON.stringify({ tags: { $or: [{ price: { $lt: 42 } }] } }));

    // tags 形状不合法时不当作检索载荷，原样透传
    expect(formatCollectionFilterMatchParam({ value: { tags: { $xor: [] } } })).toBe(
      '{"tags":{"$xor":[]}}'
    );
    expect(formatCollectionFilterMatchParam({ value: '{"tags":{"$and":"not-array"}}' })).toBe(
      '{"tags":{"$and":"not-array"}}'
    );

    // 非检索载荷：字符串原样，对象保持 JSON 化
    expect(formatCollectionFilterMatchParam({ value: 'open' })).toBe('open');
    expect(formatCollectionFilterMatchParam({ value: { a: 1 } })).toBe('{"a":1}');

    // 无检索表达的原始值丢弃
    expect(formatCollectionFilterMatchParam({ value: 42 })).toBeUndefined();
    expect(formatCollectionFilterMatchParam({ value: true })).toBeUndefined();
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
