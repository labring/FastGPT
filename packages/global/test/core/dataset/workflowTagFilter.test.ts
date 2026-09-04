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
  serializeDatasetTagFilterValue
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
          field: DatasetTagFilterFieldEnum.createTime,
          op: '$gte',
          value: '2026-03-01T08:00:00'
        },
        {
          field: DatasetTagFilterFieldEnum.collectionId,
          op: '$in',
          value: 'id-1, id-2, id-1'
        },
        { tag: 'incomplete' }
      ]
    });

    expect(JSON.parse(result ?? '')).toEqual({
      tags: { $or: [{ status: { $in: ['open'] } }] },
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
});
