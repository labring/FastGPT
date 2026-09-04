import { describe, expect, it } from 'vitest';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  createEmptyTagFilterCondition,
  createEmptyTagFilterValue,
  DatasetTagFilterFieldEnum,
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum,
  formatCollectionFilterMatchParam,
  getTagFilterOpsByCondition,
  getTagFilterOpsByType,
  intersectWorkflowTagOptions,
  isDatasetTagFilterValue,
  isTagFilterOpWithoutValue,
  isWorkflowTagFilterTagType,
  pruneTagFilterConditions,
  serializeDatasetTagFilterValue
} from '@fastgpt/global/core/dataset/workflowTagFilter';

describe('isWorkflowTagFilterTagType', () => {
  it('accepts number datetime and array', () => {
    expect(isWorkflowTagFilterTagType(DatasetCollectionTagTypeEnum.number)).toBe(true);
    expect(isWorkflowTagFilterTagType(DatasetCollectionTagTypeEnum.datetime)).toBe(true);
    expect(isWorkflowTagFilterTagType(DatasetCollectionTagTypeEnum.array)).toBe(true);
  });

  it('rejects string and empty', () => {
    expect(isWorkflowTagFilterTagType(DatasetCollectionTagTypeEnum.string)).toBe(false);
    expect(isWorkflowTagFilterTagType(undefined)).toBe(false);
  });
});

describe('isDatasetTagFilterValue', () => {
  it('accepts AND/OR objects with conditions', () => {
    expect(isDatasetTagFilterValue(createEmptyTagFilterValue())).toBe(true);
    expect(
      isDatasetTagFilterValue({
        logic: DatasetTagFilterLogicEnum.OR,
        conditions: []
      })
    ).toBe(true);
  });

  it('rejects old JSON, malformed rows, arrays and primitives', () => {
    expect(isDatasetTagFilterValue({ tags: { $and: [] } })).toBe(false);
    expect(isDatasetTagFilterValue([])).toBe(false);
    expect(isDatasetTagFilterValue('{"logic":"AND","conditions":[]}')).toBe(false);
    expect(isDatasetTagFilterValue(null)).toBe(false);
    expect(isDatasetTagFilterValue({ logic: 'XOR', conditions: [] })).toBe(false);
    expect(isDatasetTagFilterValue({ logic: 'AND' })).toBe(false);
    expect(isDatasetTagFilterValue({ logic: 'AND', conditions: [null] })).toBe(false);
  });
});

describe('isTagFilterOpWithoutValue', () => {
  it('only matches empty operators', () => {
    expect(isTagFilterOpWithoutValue('$empty')).toBe(true);
    expect(isTagFilterOpWithoutValue('$notEmpty')).toBe(true);
    expect(isTagFilterOpWithoutValue('$eq')).toBe(false);
    expect(isTagFilterOpWithoutValue('')).toBe(false);
    expect(isTagFilterOpWithoutValue(undefined)).toBe(false);
  });
});

describe('getTagFilterOpsByType', () => {
  it('returns number operators including gte/lte', () => {
    expect(
      getTagFilterOpsByType(DatasetCollectionTagTypeEnum.number).map((item) => item.value)
    ).toEqual(['$eq', '$ne', '$gt', '$lt', '$gte', '$lte', '$empty', '$notEmpty']);
  });

  it('returns datetime operators without gte/lte', () => {
    expect(
      getTagFilterOpsByType(DatasetCollectionTagTypeEnum.datetime).map((item) => item.value)
    ).toEqual(['$eq', '$ne', '$gt', '$lt', '$empty', '$notEmpty']);
  });

  it('returns array operators', () => {
    expect(
      getTagFilterOpsByType(DatasetCollectionTagTypeEnum.array).map((item) => item.value)
    ).toEqual(['$is', '$isNot', '$in', '$notIn', '$empty', '$notEmpty']);
  });

  it('returns empty list when type is missing', () => {
    expect(getTagFilterOpsByType(undefined)).toEqual([]);
  });
});

describe('getTagFilterOpsByCondition', () => {
  it('only exposes operators supported by file attribute payloads', () => {
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
  });

  it('falls back to tag type operators', () => {
    expect(
      getTagFilterOpsByCondition({
        field: DatasetTagFilterFieldEnum.tag,
        tagType: DatasetCollectionTagTypeEnum.array
      }).map((item) => item.value)
    ).toEqual(getTagFilterOpsByType(DatasetCollectionTagTypeEnum.array).map((item) => item.value));
  });
});

describe('intersectWorkflowTagOptions', () => {
  it('returns empty when no datasets', () => {
    expect(intersectWorkflowTagOptions([])).toEqual([]);
  });

  it('hides string tags and keeps a single dataset intersection as itself', () => {
    expect(
      intersectWorkflowTagOptions([
        [
          { tag: 'title', tagType: DatasetCollectionTagTypeEnum.string, options: [] },
          { tag: 'price', tagType: DatasetCollectionTagTypeEnum.number, options: [] },
          { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['open'] }
        ]
      ])
    ).toEqual([
      { tag: 'price', tagType: DatasetCollectionTagTypeEnum.number, options: [] },
      { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['open'] }
    ]);
  });

  it('keeps only name+type pairs present in every dataset and unions array options', () => {
    expect(
      intersectWorkflowTagOptions([
        [
          { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['open', ''] },
          { tag: 'price', tagType: DatasetCollectionTagTypeEnum.number, options: [] },
          { tag: 'onlyA', tagType: DatasetCollectionTagTypeEnum.number, options: [] }
        ],
        [
          {
            tag: 'status',
            tagType: DatasetCollectionTagTypeEnum.array,
            options: ['closed', 'open']
          },
          { tag: 'price', tagType: DatasetCollectionTagTypeEnum.datetime, options: [] }
        ]
      ])
    ).toEqual([
      { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['open', 'closed'] }
    ]);
  });

  it('merges duplicate definitions inside one dataset', () => {
    expect(
      intersectWorkflowTagOptions([
        [
          { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['a'] },
          { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['b', 'a'] }
        ]
      ])
    ).toEqual([
      { tag: 'status', tagType: DatasetCollectionTagTypeEnum.array, options: ['a', 'b'] }
    ]);
  });
});

describe('serializeDatasetTagFilterValue', () => {
  it('returns undefined when every row is incomplete', () => {
    expect(serializeDatasetTagFilterValue(createEmptyTagFilterValue())).toBeUndefined();
    expect(
      serializeDatasetTagFilterValue({
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [{ tag: 'price', tagType: DatasetCollectionTagTypeEnum.number }]
      })
    ).toBeUndefined();
    expect(
      serializeDatasetTagFilterValue({
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [
          {
            tag: 'price',
            tagType: DatasetCollectionTagTypeEnum.number,
            op: '$eq',
            value: ''
          }
        ]
      })
    ).toBeUndefined();
  });

  it('serializes AND/OR tag conditions and skips empty-value ops payload', () => {
    expect(
      serializeDatasetTagFilterValue({
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [
          {
            tag: ' price ',
            tagType: DatasetCollectionTagTypeEnum.number,
            op: '$gte',
            value: 10
          },
          {
            tag: 'status',
            tagType: DatasetCollectionTagTypeEnum.array,
            op: '$empty'
          },
          createEmptyTagFilterCondition()
        ]
      })
    ).toBe(
      JSON.stringify({
        tags: {
          $and: [{ price: { $gte: 10 } }, { status: { $empty: true } }]
        }
      })
    );

    expect(
      serializeDatasetTagFilterValue({
        logic: DatasetTagFilterLogicEnum.OR,
        conditions: [
          {
            tag: 'status',
            tagType: DatasetCollectionTagTypeEnum.array,
            op: '$in',
            value: ['open']
          }
        ]
      })
    ).toBe(JSON.stringify({ tags: { $or: [{ status: { $in: ['open'] } }] } }));

    expect(
      serializeDatasetTagFilterValue({
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [
          {
            tag: 'price',
            tagType: DatasetCollectionTagTypeEnum.number,
            op: '$eq',
            value: 0
          }
        ]
      })
    ).toBe(JSON.stringify({ tags: { $and: [{ price: { $eq: 0 } }] } }));
  });

  it('serializes createTime range and collectionIds with tags', () => {
    const later = Date.parse('2026-03-02T12:00:00');
    const earlier = Date.parse('2026-03-01T08:00:00');
    expect(
      JSON.parse(
        serializeDatasetTagFilterValue({
          logic: DatasetTagFilterLogicEnum.AND,
          conditions: [
            {
              tag: 'price',
              tagType: DatasetCollectionTagTypeEnum.number,
              op: '$eq',
              value: 1
            },
            {
              field: DatasetTagFilterFieldEnum.createTime,
              tagType: DatasetCollectionTagTypeEnum.datetime,
              op: '$gte',
              value: earlier
            },
            {
              field: DatasetTagFilterFieldEnum.createTime,
              tagType: DatasetCollectionTagTypeEnum.datetime,
              op: '$gte',
              value: later
            },
            {
              field: DatasetTagFilterFieldEnum.createTime,
              tagType: DatasetCollectionTagTypeEnum.datetime,
              op: '$lte',
              value: later
            },
            {
              field: DatasetTagFilterFieldEnum.collectionId,
              tagType: DatasetCollectionTagTypeEnum.array,
              op: '$in',
              value: ['a', 'b']
            },
            {
              field: DatasetTagFilterFieldEnum.collectionId,
              tagType: DatasetCollectionTagTypeEnum.array,
              op: '$in',
              value: ['b', 'c']
            }
          ]
        }) ?? ''
      )
    ).toEqual({
      tags: { $and: [{ price: { $eq: 1 } }] },
      createTime: {
        $gte: formatTime2YMDHM(later),
        $lte: formatTime2YMDHM(later)
      },
      collectionIds: ['a', 'b', 'c']
    });
  });

  it('skips collectionId operators that the search payload cannot express', () => {
    expect(
      serializeDatasetTagFilterValue({
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [
          {
            field: DatasetTagFilterFieldEnum.collectionId,
            tagType: DatasetCollectionTagTypeEnum.array,
            op: '$isNot',
            value: ['id-1']
          },
          {
            field: DatasetTagFilterFieldEnum.collectionId,
            tagType: DatasetCollectionTagTypeEnum.array,
            op: '$notIn',
            value: ['id-2']
          }
        ]
      })
    ).toBeUndefined();
  });

  it('merges and deduplicates collectionIds independently of tag logic', () => {
    expect(
      JSON.parse(
        serializeDatasetTagFilterValue({
          logic: DatasetTagFilterLogicEnum.OR,
          conditions: [
            {
              field: DatasetTagFilterFieldEnum.collectionId,
              op: '$in',
              value: 'id1, id2'
            },
            {
              field: DatasetTagFilterFieldEnum.collectionId,
              op: '$in',
              value: ['id2', 'id3']
            }
          ]
        }) ?? ''
      )
    ).toEqual({ collectionIds: ['id1', 'id2', 'id3'] });
  });
});

describe('formatCollectionFilterMatchParam', () => {
  it('returns undefined for empty values', () => {
    const resolveReference = () => 'resolved';
    expect(
      formatCollectionFilterMatchParam({ value: undefined, resolveReference })
    ).toBeUndefined();
    expect(formatCollectionFilterMatchParam({ value: null, resolveReference })).toBeUndefined();
    expect(formatCollectionFilterMatchParam({ value: '', resolveReference })).toBeUndefined();
  });

  it('passes through old JSON strings and invalid JSON', () => {
    const oldJson = '{"tags":{"$and":["A"]}}';
    expect(
      formatCollectionFilterMatchParam({
        value: oldJson,
        resolveReference: () => undefined
      })
    ).toBe(oldJson);
    expect(
      formatCollectionFilterMatchParam({
        value: 'not-json{',
        resolveReference: () => undefined
      })
    ).toBe('not-json{');
    expect(
      formatCollectionFilterMatchParam({
        value: '{]',
        resolveReference: () => undefined
      })
    ).toBe('{]');
    expect(
      formatCollectionFilterMatchParam({
        value: '[1,2]',
        resolveReference: () => undefined
      })
    ).toBe('[1,2]');
  });

  it('serializes structured value and resolves row references', () => {
    const result = formatCollectionFilterMatchParam({
      value: {
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [
          {
            tag: 'price',
            tagType: DatasetCollectionTagTypeEnum.number,
            op: '$eq',
            valueMode: DatasetTagFilterValueModeEnum.reference,
            value: ['node-1', 'out']
          },
          {
            tag: 'price',
            tagType: DatasetCollectionTagTypeEnum.number,
            op: '$eq',
            valueMode: DatasetTagFilterValueModeEnum.reference,
            value: 'not-a-ref'
          }
        ]
      },
      resolveReference: (value) => (Array.isArray(value) ? 9 : value)
    });

    expect(result).toBe(JSON.stringify({ tags: { $and: [{ price: { $eq: 9 } }] } }));
  });

  it('parses a stringified structured value and stringifies leftover objects', () => {
    expect(
      formatCollectionFilterMatchParam({
        value: JSON.stringify({
          logic: 'AND',
          conditions: [
            {
              tag: 'price',
              op: '$eq',
              value: 3
            }
          ]
        }),
        resolveReference: () => undefined
      })
    ).toBe(JSON.stringify({ tags: { $and: [{ price: { $eq: 3 } }] } }));

    expect(
      formatCollectionFilterMatchParam({
        value: { tags: { $and: ['A'] } },
        resolveReference: () => undefined
      })
    ).toBe(JSON.stringify({ tags: { $and: ['A'] } }));

    expect(
      formatCollectionFilterMatchParam({
        value: 12,
        resolveReference: () => undefined
      })
    ).toBeUndefined();
  });
});

describe('pruneTagFilterConditions', () => {
  it('removes rows whose tag left the intersection and keeps at least one empty row', () => {
    const pruned = pruneTagFilterConditions(
      {
        logic: DatasetTagFilterLogicEnum.OR,
        conditions: [
          {
            tag: 'price',
            tagType: DatasetCollectionTagTypeEnum.number,
            op: '$eq',
            value: 1
          },
          {
            tag: 'gone',
            tagType: DatasetCollectionTagTypeEnum.number,
            op: '$eq',
            value: 2
          },
          createEmptyTagFilterCondition()
        ]
      },
      [{ tag: 'price', tagType: DatasetCollectionTagTypeEnum.number, options: [] }]
    );

    expect(pruned).toEqual({
      logic: DatasetTagFilterLogicEnum.OR,
      conditions: [
        {
          tag: 'price',
          tagType: DatasetCollectionTagTypeEnum.number,
          op: '$eq',
          value: 1
        },
        createEmptyTagFilterCondition()
      ]
    });

    expect(
      pruneTagFilterConditions(
        {
          logic: DatasetTagFilterLogicEnum.AND,
          conditions: [
            {
              tag: 'gone',
              tagType: DatasetCollectionTagTypeEnum.number,
              op: '$eq',
              value: 1
            }
          ]
        },
        []
      )
    ).toEqual(createEmptyTagFilterValue());

    expect(
      pruneTagFilterConditions(
        {
          logic: DatasetTagFilterLogicEnum.AND,
          conditions: [
            {
              tag: 'price',
              op: '$eq',
              value: 1
            }
          ]
        },
        [{ tag: 'price', tagType: DatasetCollectionTagTypeEnum.number, options: [] }]
      )
    ).toEqual(createEmptyTagFilterValue());
  });

  it('keeps file attributes and empty rows so new conditions are not pruned', () => {
    const value = {
      logic: DatasetTagFilterLogicEnum.AND,
      conditions: [
        createEmptyTagFilterCondition(),
        {
          field: DatasetTagFilterFieldEnum.createTime,
          tagType: DatasetCollectionTagTypeEnum.datetime,
          op: '$gte',
          value: 1
        },
        createEmptyTagFilterCondition()
      ]
    };
    expect(pruneTagFilterConditions(value, [])).toEqual(value);
  });
});
