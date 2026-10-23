import { describe, expect, it } from 'vitest';
import {
  getTagFilterAllowedValueTypes,
  isTagFilterAttrSelected,
  isTagFilterValueTypeCompatible
} from '@/components/core/dataset/DatasetTagFilterRows';
import { tagInputBaseStyles } from '@/pageComponents/dataset/detail/CollectionCard/TagValueInputs';
import {
  DatasetCollectionTagTypeEnum,
  DatasetTagFilterFieldEnum
} from '@fastgpt/global/core/dataset/constants';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

describe('getTagFilterAllowedValueTypes', () => {
  it('returns [string, number] for datetime tag', () => {
    const types = getTagFilterAllowedValueTypes({
      tagType: DatasetCollectionTagTypeEnum.datetime,
      op: '$gt'
    });
    expect(types).toEqual([WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.number]);
  });

  it('returns [string, number] for createTime attribute field', () => {
    const types = getTagFilterAllowedValueTypes({
      field: DatasetTagFilterFieldEnum.createTime,
      op: '$gte'
    });
    expect(types).toEqual([WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.number]);
  });

  it('returns [number] for number tag', () => {
    const types = getTagFilterAllowedValueTypes({
      tagType: DatasetCollectionTagTypeEnum.number,
      op: '$eq'
    });
    expect(types).toEqual([WorkflowIOValueTypeEnum.number]);
  });

  it('returns [arrayString] for array tag with $in/$is/$isNot/$notIn', () => {
    for (const op of ['$in', '$notIn', '$is', '$isNot']) {
      const types = getTagFilterAllowedValueTypes({
        tagType: DatasetCollectionTagTypeEnum.array,
        op
      });
      expect(types).toEqual([WorkflowIOValueTypeEnum.arrayString]);
    }
  });

  it('returns [string, arrayString] for array tag with $contains/$notContains', () => {
    for (const op of ['$contains', '$notContains']) {
      const types = getTagFilterAllowedValueTypes({
        tagType: DatasetCollectionTagTypeEnum.array,
        op
      });
      expect(types).toEqual([WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.arrayString]);
    }
  });

  it('returns [arrayString, string] for collectionId attribute field', () => {
    const types = getTagFilterAllowedValueTypes({
      field: DatasetTagFilterFieldEnum.collectionId,
      op: '$in'
    });
    expect(types).toEqual([WorkflowIOValueTypeEnum.arrayString, WorkflowIOValueTypeEnum.string]);
  });

  it('returns empty array for empty condition', () => {
    expect(getTagFilterAllowedValueTypes({})).toEqual([]);
  });
});

describe('isTagFilterValueTypeCompatible', () => {
  it('allows all types when allowedTypes is empty', () => {
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.boolean, [])).toBe(true);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.object, [])).toBe(true);
  });

  it('allows any itemValueType', () => {
    expect(
      isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.any, [WorkflowIOValueTypeEnum.number])
    ).toBe(true);
    expect(isTagFilterValueTypeCompatible(undefined, [WorkflowIOValueTypeEnum.number])).toBe(true);
  });

  it('strictly checks number compatibility', () => {
    const allowed = [WorkflowIOValueTypeEnum.number];
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.number, allowed)).toBe(true);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.string, allowed)).toBe(false);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.boolean, allowed)).toBe(false);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.object, allowed)).toBe(false);
  });

  it('checks datetime compatibility (accepts string and number)', () => {
    const allowed = [WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.number];
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.string, allowed)).toBe(true);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.number, allowed)).toBe(true);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.boolean, allowed)).toBe(false);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.object, allowed)).toBe(false);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.arrayString, allowed)).toBe(
      false
    );
  });

  it('checks array compatibility (accepts arrayString and arrayAny)', () => {
    const allowed = [WorkflowIOValueTypeEnum.arrayString];
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.arrayString, allowed)).toBe(true);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.arrayAny, allowed)).toBe(true);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.string, allowed)).toBe(false);
    expect(isTagFilterValueTypeCompatible(WorkflowIOValueTypeEnum.number, allowed)).toBe(false);
  });
});

describe('isTagFilterAttrSelected', () => {
  it('returns false when attribute or tag is not selected', () => {
    expect(isTagFilterAttrSelected({})).toBe(false);
    expect(
      isTagFilterAttrSelected({
        field: '',
        tag: '',
        tagType: undefined
      })
    ).toBe(false);
    expect(
      isTagFilterAttrSelected({
        tag: 'category'
      })
    ).toBe(false);
    expect(
      isTagFilterAttrSelected({
        field: DatasetTagFilterFieldEnum.createTime
      })
    ).toBe(false);
  });

  it('returns true when valid custom tag or system attribute is selected', () => {
    expect(
      isTagFilterAttrSelected({
        field: DatasetTagFilterFieldEnum.tag,
        tag: 'category',
        tagType: DatasetCollectionTagTypeEnum.array
      })
    ).toBe(true);

    expect(
      isTagFilterAttrSelected({
        field: DatasetTagFilterFieldEnum.createTime,
        tagType: DatasetCollectionTagTypeEnum.datetime
      })
    ).toBe(true);

    expect(
      isTagFilterAttrSelected({
        field: DatasetTagFilterFieldEnum.collectionId,
        tagType: DatasetCollectionTagTypeEnum.array
      })
    ).toBe(true);
  });
});

describe('tagInputBaseStyles', () => {
  it('preserves small font size for placeholder to avoid user agent default scaling', () => {
    expect(tagInputBaseStyles._placeholder).toEqual(
      expect.objectContaining({
        color: 'myGray.500',
        fontSize: 'sm'
      })
    );
    expect(tagInputBaseStyles.fontSize).toBe('sm');
  });
});
